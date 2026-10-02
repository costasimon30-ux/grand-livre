# Construit pop-catalog.json, le catalogue de Pop embarqué dans Grand Livre.
#
# Deux sources ouvertes (licence MIT), fusionnées :
#   1. funkodex-catalog (© 2026 Chris Ahrendt) — https://github.com/celticht32/funkodex-catalog
#      ~19 800 Pop avec numéro, code-barres (UPC) et année de sortie ;
#      fichier funkodex_base_catalog.json.
#   2. funko-pop-data (© 2020 Kenny Chan) — https://github.com/kennymkchan/funko-pop-data
#      ~10 500 Pop avec photo, sans numéro, arrêté en 2021 ; fichier funko_pop.json.
#      Il complète les photos manquantes de la source 1 et ajoute les Pop qu'elle n'a pas.
#
# Avis de licence des deux sources : licenses/pop-catalog-sources.txt
#
# Usage : python3 tools/build-pop-catalog.py funkodex_base_catalog.json funko_pop.json pop-catalog.json
#
# Format de sortie : {"version":2, "source", "imageBase", "items":[...]}, chaque Pop étant
#   [nom, licence, image, numéro, année, note, upc]
# (champs vides en fin de ligne retirés). Les trois premiers champs gardent le sens du
# format 1, que les anciennes versions de l'app savent encore lire.
import json, re, sys, unicodedata

PREFIX = 'https://images.hobbydb.com/processed_uploads/catalog_item_photo/catalog_item_photo/image/'
SOURCE = ('funkodex-catalog (MIT, © 2026 Chris Ahrendt, https://github.com/celticht32/funkodex-catalog, '
          'données de juin 2026) et funko-pop-data (MIT, © 2020 Kenny Chan, '
          'https://github.com/kennymkchan/funko-pop-data, données de janvier 2021)')


def norm(s):
    s = unicodedata.normalize('NFD', (s or '').lower())
    s = ''.join(c for c in s if not unicodedata.combining(c))
    return re.sub(r'[^a-z0-9]+', ' ', s).strip()


def image_path(url):
    url = (url or '').strip()
    return url[len(PREFIX):] if url.startswith(PREFIX) else ''


def licence(x):
    for k in ('pcSeries', 'franchiseSuggestion'):
        v = (x.get(k) or '').strip()
        if v:
            return v
    cat = (x.get('category') or '').strip()
    return cat[5:] if cat.startswith('Pop! ') else cat


def number(x):
    n = (x.get('funkoNumber') or '').strip().lstrip('#')
    return n if re.fullmatch(r'\d{1,4}', n) else ''


def year(x):
    y = (x.get('releaseDate') or '')[:4]
    return y if re.fullmatch(r'20(0\d|1\d|2\d)', y) else ''


def note(x):
    parts = []
    if x.get('isChase'):
        parts.append('Chase')
    shop = (x.get('exclusiveRetailer') or '').strip()
    if shop and shop.lower() != 'exclusive':
        parts.append('Exclusivité ' + shop)
    elif shop or x.get('isExclusive'):
        parts.append('Exclusivité')
    return ' · '.join(parts)[:120]


def upc(x):
    u = (x.get('upc') or '').strip()
    return u if re.fullmatch(r'\d{12,13}', u) else ''


# Quelques fiches d'accessoires (boîtes de protection, présentoirs) traînent dans les sources.
NOT_A_POP = re.compile(r'protector|display case|hard stack|pop protector', re.I)


def clip(s, n):
    s = re.sub(r'\s+', ' ', (s or '').strip())
    return s if len(s) <= n else s[:n - 1].rstrip() + '…'


def main(funkodex_path, kenny_path, out_path):
    funkodex = json.load(open(funkodex_path, encoding='utf-8'))
    kenny = json.load(open(kenny_path, encoding='utf-8'))

    # Source 2 : Pop! Vinyl uniquement, comme avant, avec licence et photo.
    old, old_img = [], {}
    for x in kenny:
        series = x.get('series') or []
        if 'Pop! Vinyl' not in series:
            continue
        title = (x.get('title') or '').strip()
        if not title or NOT_A_POP.search(title):
            continue
        cat = next((s[5:] for s in series if s.startswith('Pop! ') and s != 'Pop! Vinyl'), '')
        img = image_path(x.get('imageName'))
        old.append((title, cat, img))
        if img:
            old_img.setdefault(norm(title), img)

    items, seen, titles = [], set(), set()
    for x in funkodex:
        title = clip(x.get('title'), 80)
        if not title or NOT_A_POP.search(title):
            continue
        num = number(x)
        key = (norm(title), num)
        if key in seen:
            continue
        seen.add(key)
        titles.add(norm(title))
        img = image_path(x.get('imageUrl')) or old_img.get(norm(title), '')
        items.append([title, clip(licence(x), 60), img, num, year(x), note(x), upc(x)])

    added = 0
    for title, cat, img in old:
        n = norm(title)
        if n in titles:
            continue
        titles.add(n)
        items.append([clip(title, 80), clip(cat, 60), img, '', '', '', ''])
        added += 1

    for row in items:
        while row and row[-1] == '':
            row.pop()
    items.sort(key=lambda r: (norm(r[0]), r[3] if len(r) > 3 else ''))

    out = {'version': 2, 'source': SOURCE, 'imageBase': PREFIX, 'items': items}
    json.dump(out, open(out_path, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))

    def has(i):
        return sum(1 for r in items if len(r) > i and r[i])
    print('%d Pop (dont %d venues de funko-pop-data seul) · %d avec numéro · %d avec photo · %d avec code-barres'
          % (len(items), added, has(3), has(2), has(6)))


if __name__ == '__main__':
    if len(sys.argv) != 4:
        sys.exit(__doc__ or 'usage: build-pop-catalog.py funkodex.json funko_pop.json pop-catalog.json')
    main(*sys.argv[1:])
