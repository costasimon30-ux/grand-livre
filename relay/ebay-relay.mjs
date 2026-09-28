/* Grand Livre — relais de recherche eBay pour la collection Pop.

   À déployer comme Cloudflare Worker (offre gratuite). L'application ne peut
   pas interroger eBay directement : la clé secrète ne doit jamais se trouver
   dans une page web, et eBay n'accepte pas les appels venus d'un navigateur.
   Ce relais garde la clé, pose la question à eBay et ne renvoie que l'essentiel.

   Variables à définir dans Cloudflare (Settings → Variables and Secrets) :
     EBAY_CLIENT_ID      App ID du jeu de clés « Production » eBay (secret)
     EBAY_CLIENT_SECRET  Cert ID du même jeu de clés (secret)
     ALLOWED_ORIGIN      adresse de l'application, ex. https://mon-compte.github.io
                         (sans elle, n'importe quel site pourrait user le quota)
     EBAY_MARKETPLACE    facultatif, EBAY_US par défaut (EBAY_FR, EBAY_GB…)

   Appel : GET https://<relais>/?q=1362
   Réponse : {"results":[{"number":"1362","name":"Spider-Man","title":"…","image":"https://…"}]} */

const TOKEN_URL = 'https://api.ebay.com/identity/v1/oauth2/token';
const SEARCH_URL = 'https://api.ebay.com/buy/browse/v1/item_summary/search';
const MAX_RESULTS = 12;

let cachedToken = {value: null, expiresAt: 0};

async function appToken(env) {
  if (cachedToken.value && Date.now() < cachedToken.expiresAt - 60000) return cachedToken.value;
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: 'Basic ' + btoa(env.EBAY_CLIENT_ID + ':' + env.EBAY_CLIENT_SECRET),
    },
    body: 'grant_type=client_credentials&scope=' + encodeURIComponent('https://api.ebay.com/oauth/api_scope'),
  });
  if (!res.ok) throw new Error('eBay a refusé les identifiants (' + res.status + ')');
  const json = await res.json();
  cachedToken = {value: json.access_token, expiresAt: Date.now() + json.expires_in * 1000};
  return cachedToken.value;
}

/* Mots d'annonce qui ne font pas partie du nom de la figurine. */
const NOISE = /\b(funko|pop!?|vinyl|figures?|figurines?|bobble[- ]?heads?|brand new|new|nib|nrfb|mint|in hand|in stock|with protector|w\/ ?protector|protector|box|boxed|sealed|official|authentic|rare|vaulted|free shipping|lot|damaged)\b/gi;

export function parseListing(title, query) {
  let number = '';
  const hash = title.match(/#\s?(\d{1,5})\b/);
  if (hash) number = hash[1];
  else if (/^\d{1,5}$/.test(query) && new RegExp('\\b' + query + '\\b').test(title)) number = query;
  const name = title
    .replace(/#\s?\d{1,5}\b/g, ' ')
    .replace(number ? new RegExp('\\b' + number + '\\b', 'g') : /$^/, ' ')
    .replace(NOISE, ' ')
    .replace(/[|•*~]+/g, ' ')
    .replace(/\(\s*\)|\[\s*\]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[\s\-–:,.!]+|[\s\-–:,.!]+$/g, '')
    .trim();
  return {number, name};
}

export function summarize(items, query) {
  const numeric = /^\d{1,5}$/.test(query);
  const seen = new Set();
  const results = [];
  for (const item of items || []) {
    const title = String(item.title || '');
    const image = (item.image && item.image.imageUrl) || (item.thumbnailImages && item.thumbnailImages[0] && item.thumbnailImages[0].imageUrl) || '';
    const {number, name} = parseListing(title, query);
    if (!name) continue;
    /* on cherche un numéro : les annonces d'autres numéros sont du bruit */
    if (numeric && number && number !== query) continue;
    const key = number + '|' + name.toLowerCase().replace(/[^a-z0-9]+/g, '');
    if (seen.has(key)) continue;
    seen.add(key);
    results.push({number, name, title, image: /^https:\/\//.test(image) ? image : ''});
    if (results.length >= MAX_RESULTS) break;
  }
  if (numeric) results.sort((a, b) => (b.number === query) - (a.number === query));
  return results;
}

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}
function reply(status, body, origin, extra) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {'Content-Type': 'application/json; charset=utf-8', ...corsHeaders(origin), ...(extra || {})},
  });
}

export default {
  async fetch(request, env, ctx) {
    const origin = request.headers.get('Origin') || '';
    const allowed = (env.ALLOWED_ORIGIN || '').split(',').map((s) => s.trim().replace(/\/$/, '')).filter(Boolean);
    if (allowed.length && !allowed.includes(origin)) return reply(403, {error: 'Origine non autorisée.'}, allowed[0]);
    const allowOrigin = allowed.length ? origin : '*';
    if (request.method === 'OPTIONS') return new Response(null, {status: 204, headers: corsHeaders(allowOrigin)});
    if (request.method !== 'GET') return reply(405, {error: 'Méthode non prise en charge.'}, allowOrigin);
    if (!env.EBAY_CLIENT_ID || !env.EBAY_CLIENT_SECRET) return reply(500, {error: 'Clés eBay absentes du relais.'}, allowOrigin);

    const url = new URL(request.url);
    const query = (url.searchParams.get('q') || '').trim().replace(/^#/, '').slice(0, 60);
    if (query.length < 2) return reply(400, {error: 'Recherche trop courte.'}, allowOrigin);

    /* même recherche dans l'heure : on répond depuis le cache, sans rappeler eBay */
    const cache = typeof caches !== 'undefined' ? caches.default : null;
    const cacheKey = new Request(url.origin + '/?q=' + encodeURIComponent(query.toLowerCase()) + '&m=' + (env.EBAY_MARKETPLACE || 'EBAY_US'));
    if (cache) {
      const hit = await cache.match(cacheKey);
      if (hit) return reply(200, await hit.json(), allowOrigin);
    }

    try {
      const token = await appToken(env);
      const search = new URL(SEARCH_URL);
      search.searchParams.set('q', 'funko pop ' + query);
      search.searchParams.set('limit', '50');
      const res = await fetch(search, {
        headers: {Authorization: 'Bearer ' + token, 'X-EBAY-C-MARKETPLACE-ID': env.EBAY_MARKETPLACE || 'EBAY_US'},
      });
      if (!res.ok) return reply(502, {error: 'eBay a répondu ' + res.status + '.'}, allowOrigin);
      const data = await res.json();
      const body = {results: summarize(data.itemSummaries, query)};
      if (cache) {
        const stored = new Response(JSON.stringify(body), {headers: {'Content-Type': 'application/json', 'Cache-Control': 'max-age=3600'}});
        const save = cache.put(cacheKey, stored);
        if (ctx && ctx.waitUntil) ctx.waitUntil(save);
      }
      return reply(200, body, allowOrigin);
    } catch (err) {
      return reply(502, {error: String((err && err.message) || err)}, allowOrigin);
    }
  },
};
