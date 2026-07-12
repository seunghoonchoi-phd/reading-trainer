import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];
const fail = message => failures.push(message);
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8').replace(/^\uFEFF/, '');
const exists = relative => fs.existsSync(path.join(root, relative));
const posix = value => value.split(path.sep).join('/');

function walk(relative, predicate) {
  const absolute = path.join(root, relative);
  const rows = [];
  for (const entry of fs.readdirSync(absolute, { withFileTypes: true })) {
    const child = path.join(relative, entry.name);
    if (entry.isDirectory()) rows.push(...walk(child, predicate));
    else if (predicate(child)) rows.push(posix(child));
  }
  return rows;
}

const sw = read('sw.js');
const assetMatch = sw.match(/const PRECACHE_ASSETS = (\[[\s\S]*?\n\]);/);
if (!assetMatch) fail('sw.js must expose a JSON-compatible PRECACHE_ASSETS array.');

let assets = [];
if (assetMatch) {
  try { assets = JSON.parse(assetMatch[1]); }
  catch (error) { fail(`PRECACHE_ASSETS is not valid JSON: ${error.message}`); }
}

const duplicates = assets.filter((asset, index) => assets.indexOf(asset) !== index);
if (duplicates.length) fail(`Duplicate precache entries: ${[...new Set(duplicates)].join(', ')}`);

for (const asset of assets) {
  if (typeof asset !== 'string' || !asset.startsWith('./')) {
    fail(`Precache entry must be a same-origin relative path: ${String(asset)}`);
    continue;
  }
  if (asset === './') continue;
  const relative = asset.slice(2);
  if (!exists(relative)) fail(`Missing precache asset: ${relative}`);
}

const archivedAssets = new Set([
  'js/drills/vocab.js',
]);
const requiredAssets = [
  'index.html',
  'css/styles.css',
  'manifest.webmanifest',
  'icon.svg',
  'og.png',
  ...walk('js', file => file.endsWith('.js') && !archivedAssets.has(posix(file))),
  ...walk('data', file => file.endsWith('.json')),
  ...walk('icons', file => /\.(?:png|svg)$/i.test(file)),
];
const precached = new Set(assets.map(asset => asset.replace(/^\.\//, '')));
for (const relative of requiredAssets) {
  if (!precached.has(relative)) fail(`Static app asset is not precached: ${relative}`);
}

if (!sw.includes("request.method !== 'GET'")) fail('Service worker must ignore non-GET requests.');
if (!sw.includes('url.origin !== self.location.origin')) fail('Service worker must ignore cross-origin requests.');
if (!/const RUNTIME_LIMIT = \d+;/.test(sw) || !sw.includes('trimCache(RUNTIME, RUNTIME_LIMIT)')) {
  fail('Service worker runtime cache must have an enforced numeric limit.');
}

const index = read('index.html');
const externalScript = [...index.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["']/gi)]
  .map(match => match[1])
  .filter(src => /^(?:https?:)?\/\//i.test(src));
if (externalScript.length) fail(`Third-party scripts are forbidden in the app shell: ${externalScript.join(', ')}`);
if (/goatcounter|data-goatcounter|gc\.zgo\.at/i.test(index)) fail('GoatCounter must not load inside the reading app.');
const externalStyles = [...index.matchAll(/<link\b[^>]*>/gi)]
  .map(match => match[0])
  .filter(tag => /\brel=["']stylesheet["']/i.test(tag))
  .map(tag => tag.match(/\bhref=["']([^"']+)["']/i)?.[1])
  .filter(href => href && /^(?:https?:)?\/\//i.test(href));
if (externalStyles.length) fail(`Third-party stylesheets are forbidden in the offline app shell: ${externalStyles.join(', ')}`);

for (const match of index.matchAll(/\b(?:src|href)=["']([^"'#]+)["']/gi)) {
  const reference = match[1];
  if (/^(?:https?:|data:|mailto:|tel:|\/\/)/i.test(reference)) continue;
  const relative = reference.replace(/^\.\//, '').split('?')[0];
  if (relative && !exists(relative)) fail(`index.html references a missing local asset: ${relative}`);
}

for (const file of walk('js', item => item.endsWith('.js') && !archivedAssets.has(posix(item)))) {
  const source = read(file);
  const specs = [
    ...source.matchAll(/\b(?:import|export)\s+(?:[^'";]*?\s+from\s+)?["']([^"']+)["']/g),
    ...source.matchAll(/\bimport\(\s*["']([^"']+)["']\s*\)/g),
  ].map(match => match[1]).filter(specifier => specifier.startsWith('.'));
  for (const specifier of specs) {
    const target = posix(path.normalize(path.join(path.dirname(file), specifier.split('?')[0])));
    if (!exists(target)) fail(`${file} imports a missing module: ${specifier}`);
  }
}

const app = read('js/app.js');
const styles = read('css/styles.css');
const assessment = read('js/drills/err.js');
for (const className of [
  'result-metric__label', 'result-metric__value', 'result-metric__note',
  'breakdown-row__label', 'breakdown-row__track', 'breakdown-row__fill', 'breakdown-row__value',
]) {
  if (!app.includes(className)) fail(`Rendered progress markup must use the CSS contract class: ${className}`);
  if (!styles.includes(`.${className}`)) fail(`CSS must define the progress markup contract class: ${className}`);
}
if (app.includes('result-pair__')) fail('Progress cards must not use the obsolete result-pair child classes.');
if (/\.result-grid\s*,\s*\.result-pair\s*\{/.test(styles)) fail('Only the result grid, not each result card, may create the outer metric columns.');
if (!styles.includes('@media (min-width: 900px)')) fail('The desktop tab bar breakpoint must leave tablet widths in the mobile layout.');
if (!app.includes('setDrillActive') || !styles.includes('body.drill-mode .tabbar')) fail('Active drills must enter a focused layout without global navigation.');
if (!assessment.includes('row check-row') || !styles.includes('.check-row')) fail('The optional pacer checkbox must have a full-row 44px touch target.');

try {
  const manifest = JSON.parse(read('manifest.webmanifest'));
  if (manifest.orientation === 'portrait' || manifest.orientation === 'portrait-primary') {
    fail('The web manifest must not force portrait orientation.');
  }
  if (!manifest.start_url || !manifest.scope) fail('The web manifest must define start_url and scope.');
} catch (error) {
  fail(`manifest.webmanifest is invalid JSON: ${error.message}`);
}

if (failures.length) {
  console.error(`Asset checks failed (${failures.length}):`);
  failures.forEach(message => console.error(`- ${message}`));
  process.exitCode = 1;
} else {
  console.log(`Asset checks passed: ${assets.length} precached files, ${requiredAssets.length} required files.`);
}
