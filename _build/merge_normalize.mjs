// Merge zh4.json into passages.json and normalize lang/tier from id prefix.
import fs from 'node:fs';
import path from 'node:path';

const appDir = process.argv[2];
const dataDir = path.join(appDir, 'data');
const pPath = path.join(dataDir, 'passages.json');

let passages = JSON.parse(fs.readFileSync(pPath, 'utf8'));

const zh4Path = path.join(appDir, '_build', 'zh4.json');
if (fs.existsSync(zh4Path)) {
  try {
    const zh4 = JSON.parse(fs.readFileSync(zh4Path, 'utf8'));
    if (Array.isArray(zh4)) passages = passages.concat(zh4);
  } catch (e) { console.error('zh4 parse failed:', e.message); }
}

// normalize lang/tier from id prefix like "en4-..." / "zh1-..."
for (const p of passages) {
  const m = /^(en|zh)(\d)-/.exec(p.id || '');
  if (m) { p.lang = m[1]; p.tier = parseInt(m[2], 10); }
}

// dedupe by id (keep first occurrence)
const seen = new Set();
passages = passages.filter(p => (seen.has(p.id) ? false : (seen.add(p.id), true)));

fs.writeFileSync(pPath, JSON.stringify(passages, null, 0), 'utf8');

const dist = {};
for (const p of passages) { const k = `${p.lang}${p.tier}`; dist[k] = (dist[k] || 0) + 1; }
console.log('total:', passages.length);
console.log('dist:', JSON.stringify(dist, Object.keys(dist).sort()));
