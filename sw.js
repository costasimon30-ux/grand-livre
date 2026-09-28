/* Grand Livre — service worker.
   Rend l'application utilisable sans réseau après une première ouverture.

   Principe : chaque fichier de l'application est redemandé au réseau quand il
   est là, pour avoir toujours la dernière version déployée, et servi depuis le
   cache quand il n'y est pas. Pas de numéro de version à changer à la main :
   le cache se met à jour tout seul à chaque ouverture en ligne. Si le réseau
   traîne (métro, magasin), on n'attend pas plus de 3 secondes avant de
   répondre avec la copie du cache.

   Deux exceptions :
   - le catalogue de Pop, gros et figé, est servi depuis le cache et rafraîchi
     en arrière-plan ;
   - les appels à l'API GitHub ne sont jamais mis en cache : des données
     financières périmées seraient pires que pas de données du tout. */

var CACHE_NAME = 'grand-livre-v2';
var SHELL = ['./', './index.html', './manifest.json', './icon-180.png', './icon-192.png', './icon-512.png'];
var NETWORK_TIMEOUT = 3000;

self.addEventListener('install', function(event){
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache){
      /* addAll échoue en bloc si un seul fichier manque : on tolère les absents */
      return Promise.all(SHELL.map(function(url){
        return cache.add(new Request(url, {cache:'reload'})).catch(function(){ return null; });
      }));
    }).then(function(){ return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function(event){
  event.waitUntil(
    caches.keys().then(function(names){
      return Promise.all(names.filter(function(n){ return n !== CACHE_NAME; })
                             .map(function(n){ return caches.delete(n); }));
    }).then(function(){ return self.clients.claim(); })
  );
});

function remember(req, res){
  if(res && res.status === 200){
    var copy = res.clone();
    caches.open(CACHE_NAME).then(function(c){ c.put(req, copy); });
  }
  return res;
}

/* Réseau d'abord ; le cache si le réseau échoue ou tarde trop. */
function networkFirst(req, fallbackUrl){
  var fromCache = function(){
    return caches.match(req).then(function(cached){
      return cached || (fallbackUrl ? caches.match(fallbackUrl) : null);
    });
  };
  return new Promise(function(resolve){
    var done = false;
    function finish(res){ if(!done && res){ done = true; resolve(res); } }
    var timer = setTimeout(function(){ fromCache().then(finish); }, NETWORK_TIMEOUT);
    fetch(req).then(function(res){
      clearTimeout(timer);
      finish(remember(req, res));
    }).catch(function(){
      clearTimeout(timer);
      fromCache().then(function(cached){
        if(!done){ done = true; resolve(cached || Response.error()); }
      });
    });
  });
}

/* Le cache d'abord, mis à jour en arrière-plan pour la fois suivante. */
function cacheFirst(req){
  return caches.match(req).then(function(cached){
    var networked = fetch(req).then(function(res){ return remember(req, res); })
      .catch(function(){ return cached || Response.error(); });
    return cached || networked;
  });
}

self.addEventListener('fetch', function(event){
  var req = event.request;
  if(req.method !== 'GET') return;

  var url;
  try { url = new URL(req.url); } catch(e){ return; }

  /* Les données passent toujours par le réseau, jamais par le cache. */
  if(url.hostname === 'api.github.com') return;

  var sameOrigin = url.origin === self.location.origin;
  var isFont = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  var isNavigation = req.mode === 'navigate' || (sameOrigin && req.destination === 'document');

  if(isNavigation){ event.respondWith(networkFirst(req, './index.html')); return; }
  if(sameOrigin && /\/pop-catalog\.json$/.test(url.pathname)){ event.respondWith(cacheFirst(req)); return; }
  if(sameOrigin){ event.respondWith(networkFirst(req)); return; }
  if(isFont){ event.respondWith(cacheFirst(req)); }
});
