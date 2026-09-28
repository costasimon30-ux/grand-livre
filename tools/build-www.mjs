// Prépare le dossier www/ que Capacitor embarque dans l'app iOS : une copie
// des fichiers du site, rien de plus. Lancé par `npm run build`.
import {cpSync, mkdirSync, rmSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'www');
const files = ['index.html', 'manifest.json', 'sw.js', 'pop-catalog.json', 'icon-180.png', 'icon-192.png', 'icon-512.png'];

rmSync(out, {recursive: true, force: true});
mkdirSync(out);
for (const f of files) cpSync(join(root, f), join(out, f));
console.log('www/ prêt : ' + files.length + ' fichiers.');
