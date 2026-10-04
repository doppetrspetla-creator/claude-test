// Sestavení buildu pro WordPress plugin: vygeneruje sw.js (seznam souborů + verze podle obsahu)
// a zabalí viewfinder-light-build.zip.   Použití: node build.mjs [cesta/k/vystupu.zip]
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { execFileSync } from 'child_process';

const root = path.dirname(new URL(import.meta.url).pathname);
const out = path.resolve(process.argv[2] || path.join(root, 'viewfinder-light-build.zip'));
const list = dir => fs.readdirSync(path.join(root, dir)).map(f => dir + '/' + f);
// soubory, které service worker uloží do cache (index.html se ukládá zvlášť při ověření přístupu)
const files = ['style.css', 'sim.js', 'usermodels.js', 'view3d.js', 'app.js', 'manifest.json', 'vendor/three-bundle.js', 'vendor/import-bundle.js',
  ...list('icons'), ...list('models').filter(f => f.endsWith('.glb.js')), ...list('textures')];
const h = crypto.createHash('sha256');
for (const f of ['index.html', ...files]) h.update(f).update(fs.readFileSync(path.join(root, f)));
const version = h.digest('hex').slice(0, 12);
const sw = fs.readFileSync(path.join(root, 'sw.template.js'), 'utf8')
  .replace("const VERSION = '__VERSION__';", `const VERSION = '${version}';`).replace('const FILES = __FILES__;', 'const FILES = ' + JSON.stringify(files) + ';');
if (sw.includes('__VERSION__') || sw.includes('__FILES__')) throw new Error('sw.js: nenahrazené zástupné značky');
fs.writeFileSync(path.join(root, 'sw.js'), sw);
if (fs.existsSync(out)) fs.unlinkSync(out);
execFileSync('zip', ['-qr', out, 'index.html', 'sw.js', ...files], { cwd: root });
console.log('verze', version, '·', files.length + 2, 'souborů →', out, (fs.statSync(out).size / 1e6).toFixed(1) + ' MB');
