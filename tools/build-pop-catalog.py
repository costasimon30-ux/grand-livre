# Builds pop-catalog.json from kennymkchan/funko-pop-data (MIT, © 2020 Kenny Chan).
import json, sys
PREFIX = 'https://images.hobbydb.com/processed_uploads/catalog_item_photo/catalog_item_photo/image/'
src = json.load(open(sys.argv[1]))
items, seen = [], set()
for x in src:
    series = x.get('series') or []
    if 'Pop! Vinyl' not in series: continue
    title = (x.get('title') or '').strip()
    if not title: continue
    cat = next((s[5:] for s in series if s.startswith('Pop! ') and s != 'Pop! Vinyl'), '')
    img = x.get('imageName') or ''
    img = img[len(PREFIX):] if img.startswith(PREFIX) else ''
    key = (title.lower(), cat.lower())
    if key in seen: continue
    seen.add(key)
    items.append([title, cat, img])
items.sort(key=lambda r: r[0].lower())
out = {'source': 'https://github.com/kennymkchan/funko-pop-data (MIT, © 2020 Kenny Chan), données arrêtées en janvier 2021',
       'imageBase': PREFIX, 'items': items}
json.dump(out, open(sys.argv[2], 'w'), ensure_ascii=False, separators=(',', ':'))
print(len(items))
