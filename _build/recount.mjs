// Recompute unit_count for every passage using the SAME rule as the app (util.countUnits):
//   zh -> Han characters only; en -> whitespace-separated tokens.
import fs from 'node:fs';
import path from 'node:path';

const appDir = process.argv[2];
const pPath = path.join(appDir, 'data', 'passages.json');
const passages = JSON.parse(fs.readFileSync(pPath, 'utf8'));

function countUnits(text, lang) {
  if (lang === 'zh') return (text.match(/[㐀-鿿]/g) || []).length;
  return (text.trim().match(/\S+/g) || []).length;
}

let fixed = 0;
for (const p of passages) {
  const correct = countUnits(p.text, p.lang);
  if (p.unit_count !== correct) { p.unit_count = correct; fixed++; }
}
fs.writeFileSync(pPath, JSON.stringify(passages, null, 0), 'utf8');
console.log(`recounted ${passages.length} passages, corrected ${fixed}`);
