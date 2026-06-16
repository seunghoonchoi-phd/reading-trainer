// One-off: split a workflow .output into the app's data/*.json files.
// Usage: node build_data.mjs <output-file> <app-dir>
import fs from 'node:fs';
import path from 'node:path';

const [, , outPath, appDir] = process.argv;
const raw = fs.readFileSync(outPath, 'utf8');
const obj = JSON.parse(raw);
const r = obj.result || obj;

const dataDir = path.join(appDir, 'data');
fs.mkdirSync(dataDir, { recursive: true });

function write(name, val) {
  fs.writeFileSync(path.join(dataDir, name), JSON.stringify(val, null, 0), 'utf8');
}

const passages = r.passages || [];
write('passages.json', passages);
write('vocab_en.json', r.vocabEn || {});
write('vocab_zh.json', r.vocabZh || {});
write('seg_zh.json', r.segZh || {});

// report
const byLangTier = {};
for (const p of passages) {
  const k = `${p.lang}${p.tier}`;
  byLangTier[k] = (byLangTier[k] || 0) + 1;
}
console.log('passages:', passages.length, JSON.stringify(byLangTier));
console.log('vocabEn words:', (r.vocabEn?.words || []).length, 'pseudo:', (r.vocabEn?.pseudowords || []).length);
console.log('vocabZh items:', (r.vocabZh?.items || []).length, 'pseudo:', (r.vocabZh?.pseudochars || []).length);
console.log('segZh sentences:', (r.segZh?.sentences || []).length);
