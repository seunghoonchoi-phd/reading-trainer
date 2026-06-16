// Merge a hard-corpus workflow .output (passages + vocab adds) into data files.
// Also merges any _build/zh5.json / _build/zh6.json arrays if present.
import fs from 'node:fs';
import path from 'node:path';

const [, , outPath, appDir] = process.argv;
const dataDir = path.join(appDir, 'data');
const read = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const write = (name, val) => fs.writeFileSync(path.join(dataDir, name), JSON.stringify(val, null, 0), 'utf8');

let passages = read(path.join(dataDir, 'passages.json'));
const vocabEn = read(path.join(dataDir, 'vocab_en.json'));
const vocabZh = read(path.join(dataDir, 'vocab_zh.json'));

let addP = [];
let vEnAdd = null, vZhAdd = null;
if (outPath && fs.existsSync(outPath)) {
  const r = (read(outPath).result) || {};
  addP = addP.concat(r.passages || []);
  vEnAdd = r.vocabEnAdd; vZhAdd = r.vocabZhAdd;
}
for (const f of ['zh5.json', 'zh6.json']) {
  const fp = path.join(appDir, '_build', f);
  if (fs.existsSync(fp)) { try { const a = read(fp); if (Array.isArray(a)) addP = addP.concat(a); } catch (e) { console.error(f, 'parse fail', e.message); } }
}

// normalize lang/tier from id prefix and append, dedupe by id
passages = passages.concat(addP);
for (const p of passages) { const m = /^(en|zh)(\d)-/.exec(p.id || ''); if (m) { p.lang = m[1]; p.tier = parseInt(m[2], 10); } }
const seen = new Set();
passages = passages.filter(p => (seen.has(p.id) ? false : (seen.add(p.id), true)));
write('passages.json', passages);

// merge vocab
function mergeVocab(base, add, key, listName, pseudoName) {
  if (!add) return base;
  const have = new Set(base[listName].map(x => String(x[key]).toLowerCase()));
  for (const it of (add[listName] || add.words || add.items || [])) {
    const k = String(it[key]).toLowerCase();
    if (!have.has(k)) { base[listName].push(it); have.add(k); }
  }
  const ps = add[pseudoName] || [];
  base[pseudoName] = [...new Set([...(base[pseudoName] || []), ...ps])];
  return base;
}
if (vEnAdd) mergeVocab(vocabEn, vEnAdd, 'word', 'words', 'pseudowords');
if (vZhAdd) mergeVocab(vocabZh, vZhAdd, 'hanzi', 'items', 'pseudochars');
write('vocab_en.json', vocabEn);
write('vocab_zh.json', vocabZh);

const dist = {};
for (const p of passages) { const k = `${p.lang}${p.tier}`; dist[k] = (dist[k] || 0) + 1; }
console.log('passages:', passages.length, JSON.stringify(dist, Object.keys(dist).sort()));
console.log('vocabEn words:', vocabEn.words.length, '| vocabZh items:', vocabZh.items.length);
