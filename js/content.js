// ===== content.js — corpus loading, selection, tokenization, auto-cloze =====
import { countUnits, shuffle, sample } from './util.js';
import * as store from './store.js';
import { difficultyFromLegacyLevel, normalizeDifficulty } from './levels.js';

// ---- seed fallback so the app runs before data/*.json is generated ----
const SEED = {
  passages: [
    {
      id: 'en2-seed1', title: 'The Lighthouse Keeper', topic: '이야기', lang: 'en', tier: 2,
      text: "For thirty years, Aldous tended the lighthouse on the rocky cape. Every evening he climbed the spiral stairs to light the great lamp, and every morning he climbed them again to put it out. Ships passed in the dark, guided by his steady beam. He rarely saw the sailors he saved, yet he knew them by the grateful blasts of their horns. When the new electric beacon arrived, it needed no keeper at all. Aldous packed his small case and walked down the cape road, pausing once to look back at the tower that had been his whole life.",
      unit_count: 104,
      questions: [
        { type: 'main_idea', q: '이 글의 중심 내용은?', options: ['등대지기의 헌신적 삶과 기술 변화로 인한 퇴장', '전기 등대의 기술적 우수성', '폭풍 속 난파선 구조 작전', '뱃사람들의 항해 일지'], answer: 0, explanation: '30년간 등대를 지킨 삶과, 전기 등대 도입으로 떠나는 결말이 중심입니다.' },
        { type: 'inference', q: 'Aldous가 구한 선원들을 거의 보지 못했지만 그들을 알 수 있었던 이유는?', options: ['편지를 주고받아서', '감사의 뱃고동 소리로', '항구에서 만나서', '신문 기사로'], answer: 1, explanation: '"grateful blasts of their horns"로 그들을 알았다고 했습니다.' },
        { type: 'detail', q: '새로 도착한 것은 무엇인가?', options: ['새 선장', '전기 등대(beacon)', '나선 계단', '구조선'], answer: 1, explanation: '"the new electric beacon arrived"' },
        { type: 'detail', q: 'Aldous는 언제 나선 계단을 올랐는가?', options: ['매일 저녁과 아침', '폭풍이 올 때만', '매주 한 번', '배가 항구에 들어올 때만'], answer: 0, explanation: '매일 저녁 불을 켜고 매일 아침 끄기 위해 계단을 올랐습니다.' },
      ],
      gist: { q: '한 문장 요지로 가장 알맞은 것은?', options: ['기술 변화가 한 등대지기의 평생 직업을 끝냈다', '등대는 항해에 불필요하다', '전기는 위험하다', '바다는 위험하다'], answer: 0 },
      scan: { q: 'Aldous가 등대를 지킨 기간(연수)은?', answer: 'thirty years' },
    },
    {
      id: 'zh2-seed1', title: '老茶馆', topic: '生活', lang: 'zh', tier: 2,
      text: '城南有一家老茶馆，已经开了快一百年。每天早上，附近的老人都来这里喝茶、下棋、聊天。茶馆的桌子很旧，可是擦得很干净。老板姓周，大家都叫他周师傅。他记得每位常客爱喝什么茶，客人一进门，他就把茶泡好了。年轻人觉得这里太安静，但老人们说，正是这份安静让他们觉得舒服。',
      unit_count: 110,
      questions: [
        { type: 'main_idea', q: '这段话主要在说什么？', options: ['一家有人情味的老茶馆', '怎样泡好一杯茶', '城南的交通问题', '年轻人的爱好'], answer: 0, explanation: '全文围绕老茶馆和常客、老板的关系展开。' },
        { type: 'inference', q: '从"客人一进门，他就把茶泡好了"可以看出周师傅怎样？', options: ['动作很慢', '熟悉并关心常客', '不喜欢说话', '生意不好'], answer: 1, explanation: '记得每人爱喝的茶，说明他熟悉且关心常客。' },
        { type: 'detail', q: '老板姓什么？', options: ['张', '李', '周', '王'], answer: 2, explanation: '"老板姓周"。' },
        { type: 'detail', q: '附近的老人每天早上来茶馆做什么？', options: ['喝茶、下棋、聊天', '工作和开会', '唱歌和跳舞', '买桌子'], answer: 0, explanation: '文章说老人每天早上来这里喝茶、下棋、聊天。' },
      ],
      gist: { q: '最合适的一句话概括是？', options: ['老茶馆因安静和人情味受老人喜爱', '茶馆要装修', '年轻人爱喝茶', '下棋很难'], answer: 0 },
      scan: { q: '这家茶馆开了大约多少年？', answer: '一百年' },
    },
  ],
  vocabEn: {
    words: [
      { word: 'however', band: 2, pos: 'adv', gloss_ko: '그러나, 하지만', example: 'It was late; however, she kept working.' },
      { word: 'therefore', band: 3, pos: 'adv', gloss_ko: '그러므로', example: 'He was ill and therefore stayed home.' },
      { word: 'significant', band: 3, pos: 'adj', gloss_ko: '중요한, 상당한', example: 'There was a significant rise in prices.' },
      { word: 'although', band: 2, pos: 'conj', gloss_ko: '비록 ~일지라도', example: 'Although tired, she smiled.' },
      { word: 'consequence', band: 4, pos: 'n', gloss_ko: '결과', example: 'He faced the consequence of his choice.' },
      { word: 'approach', band: 3, pos: 'n/v', gloss_ko: '접근(법); 다가가다', example: 'We need a new approach.' },
      { word: 'sufficient', band: 4, pos: 'adj', gloss_ko: '충분한', example: 'We have sufficient time.' },
      { word: 'nevertheless', band: 4, pos: 'adv', gloss_ko: '그럼에도 불구하고', example: 'It rained; nevertheless, we went.' },
    ],
    pseudowords: ['blorn', 'treck', 'spund', 'frelt', 'glorp', 'dwarn', 'plonk', 'shmate'],
  },
  vocabZh: {
    items: [
      { hanzi: '的', pinyin: 'de', gloss_ko: '~의 (조사)', hsk: 1, freq_band: 1, transparent: false },
      { hanzi: '时间', pinyin: 'shíjiān', gloss_ko: '시간', hsk: 2, freq_band: 1, transparent: false },
      { hanzi: '河', pinyin: 'hé', gloss_ko: '강, 하천', hsk: 3, freq_band: 2, transparent: true, semantic_radical: '氵', radical_meaning_ko: '물 (water)' },
      { hanzi: '想', pinyin: 'xiǎng', gloss_ko: '생각하다, ~하고 싶다', hsk: 1, freq_band: 1, transparent: false },
      { hanzi: '钱', pinyin: 'qián', gloss_ko: '돈', hsk: 2, freq_band: 1, transparent: true, semantic_radical: '钅', radical_meaning_ko: '쇠/금속 (metal)' },
    ],
    pseudochars: ['夊', '隺', '丌'],
  },
  segZh: {
    sentences: [
      { text: '我昨天去图书馆借了三本书', gold_words: ['我', '昨天', '去', '图书馆', '借', '了', '三', '本', '书'], tier: 2 },
      { text: '这个问题很难回答', gold_words: ['这个', '问题', '很', '难', '回答'], tier: 2 },
      { text: '他正在学习中文', gold_words: ['他', '正在', '学习', '中文'], tier: 1 },
    ],
  },
};

const CONTENT_STATE_KEY = '__readfastContentStateV1';
const CONTENT_STATE = globalThis[CONTENT_STATE_KEY] ||= { data: null, koreanTranslationCache: new Map() };
const TRANSLATION_CHUNK_LIMIT = 3600;
// Bump when registered passage data changes. It bypasses a CDN copy that can outlive a new deploy.
const CONTENT_REVISION = '20260713-35';

async function tryFetch(path) {
  const url = `${path}${path.includes('?') ? '&' : '?'}v=${CONTENT_REVISION}`;
  try { const r = await fetch(url, { cache: 'no-store' }); if (r.ok) return await r.json(); } catch {}
  return null;
}

export async function loadContent() {
  if (CONTENT_STATE.data) return CONTENT_STATE.data;
  const [passages, vocabEn, vocabZh, segZh, koreanTranslations] = await Promise.all([
    tryFetch('data/passages.json'),
    tryFetch('data/vocab_en.json'),
    tryFetch('data/vocab_zh.json'),
    tryFetch('data/seg_zh.json'),
    tryFetch('data/korean_translations.json'),
  ]);
  CONTENT_STATE.data = {
    passages: Array.isArray(passages) ? passages : [],
    vocabEn: vocabEn || { words: [], pseudowords: [] },
    vocabZh: vocabZh || { items: [], pseudochars: [] },
    segZh: segZh || { sentences: [] },
    koreanTranslations: koreanTranslations || {},
    isSeed: false,
  };
  return CONTENT_STATE.data;
}
export const data = () => CONTENT_STATE.data;
const catalog = () => CONTENT_STATE.data?.passages || [];

export function koreanTranslationTextFor(passage) {
  const key = passage?.id;
  return key ? (CONTENT_STATE.data?.koreanTranslations?.[key] || null) : null;
}

function splitForTranslation(text) {
  const paragraphs = String(text || '').split(/(\n\s*\n)/);
  const chunks = [];
  let buffer = '';
  const push = () => {
    if (buffer) chunks.push(buffer);
    buffer = '';
  };
  for (const part of paragraphs) {
    if ((buffer + part).length <= TRANSLATION_CHUNK_LIMIT) {
      buffer += part;
      continue;
    }
    push();
    for (let index = 0; index < part.length; index += TRANSLATION_CHUNK_LIMIT) {
      chunks.push(part.slice(index, index + TRANSLATION_CHUNK_LIMIT));
    }
  }
  push();
  return chunks.filter(Boolean);
}

async function translateChunkToKorean(text, lang) {
  const url = new URL('https://translate.googleapis.com/translate_a/single');
  url.searchParams.set('client', 'gtx');
  url.searchParams.set('sl', lang === 'zh' ? 'zh-CN' : 'en');
  url.searchParams.set('tl', 'ko');
  url.searchParams.set('dt', 't');
  url.searchParams.set('q', text);
  const response = await fetch(url.toString(), { cache: 'no-store' });
  if (!response.ok) throw new Error(`TRANSLATION_HTTP_${response.status}`);
  const payload = await response.json();
  const translated = Array.isArray(payload?.[0])
    ? payload[0].map(part => part?.[0] || '').join('')
    : '';
  if (!translated.trim()) throw new Error('TRANSLATION_EMPTY');
  return translated;
}

export async function koreanTranslationFor(passage) {
  const text = String(passage?.text || '').trim();
  if (!text) throw new Error('TRANSLATION_NO_TEXT');
  const key = passage?.id || `${passage?.lang || 'en'}:${text}`;
  const bundled = koreanTranslationTextFor(passage);
  if (bundled) return bundled;
  if (CONTENT_STATE.koreanTranslationCache.has(key)) return CONTENT_STATE.koreanTranslationCache.get(key);
  const task = (async () => {
    const pieces = splitForTranslation(text);
    const translated = [];
    for (const piece of pieces) translated.push(await translateChunkToKorean(piece, passage?.lang));
    return translated.join('');
  })();
  CONTENT_STATE.koreanTranslationCache.set(key, task);
  try {
    return await task;
  } catch (error) {
    CONTENT_STATE.koreanTranslationCache.delete(key);
    throw error;
  }
}

/* ---- selection ---- */
export function passagesFor(lang, tier) {
  return catalog().filter(p => p.lang === lang && (tier == null || p.tier === tier));
}

export function allTiers(lang) {
  return [...new Set(catalog().filter(p => p.lang === lang).map(p => p.tier))].sort((a, b) => a - b);
}
// Public app difficulty maps 1:1 to passage tier. Legacy preference is a
// compatibility fallback only and never counts as proficiency evidence.
export function tiersFor(lang) {
  const all = allTiers(lang);
  const difficulty = store.getDifficulty(lang) || difficultyFromLegacyLevel(store.getLevel(lang));
  return difficulty && all.includes(difficulty) ? [difficulty] : all;
}

function domainFilter(pool, domain = null, difficulty = null) {
  if (domain) {
    const exact = pool.filter(p => (p.domain || 'general') === domain);
    if (exact.length) return exact;
    return pool.filter(p => (p.domain || 'general') === 'general');
  }
  if (normalizeDifficulty(difficulty) === 6) return pool;
  const general = pool.filter(p => (p.domain || 'general') === 'general');
  return general.length ? general : pool;
}
// 덜 본 지문 우선 (markSeen 이력 연동 — 같은 지문 반복 노출을 늦춤)
function freshest(pool) {
  if (!pool.length) return null;
  const min = Math.min(...pool.map(p => store.seenCount(p.id)));
  const fresh = pool.filter(p => store.seenCount(p.id) === min);
  return shuffle(fresh)[0];
}
export function pickUnseenPassage(lang, { tier = null, difficulty = null, excludeIds = [], domain = null } = {}) {
  if (!CONTENT_STATE.data || !['en', 'zh'].includes(lang)) return null;
  const requested = normalizeDifficulty(tier) || normalizeDifficulty(difficulty) || store.getDifficulty(lang);
  const eligible = requested ? [requested] : tiersFor(lang);
  const excluded = new Set(excludeIds || []);
  let pool = CONTENT_STATE.data.passages.filter(p => (
    p.lang === lang
    && eligible.includes(p.tier)
    && !excluded.has(p.id)
    && store.seenCount(p.id) === 0
  ));
  pool = domainFilter(pool, domain, requested);
  return pool.length ? shuffle(pool)[0] : null;
}

export function pickPassage(lang, tier, exclude = []) {
  const excludeIds = Array.isArray(exclude) ? exclude : (exclude?.excludeIds || []);
  const domain = Array.isArray(exclude) ? null : (exclude?.domain || null);
  const unseen = pickUnseenPassage(lang, { tier, excludeIds, domain });
  if (unseen) return unseen;

  const requested = normalizeDifficulty(tier);
  const eligible = requested ? [requested] : tiersFor(lang);
  const excluded = new Set(excludeIds);
  let pool = catalog().filter(p => p.lang === lang && eligible.includes(p.tier) && !excluded.has(p.id));
  if (!pool.length) pool = catalog().filter(p => p.lang === lang && eligible.includes(p.tier));
  if (!pool.length) pool = passagesFor(lang);
  return freshest(domainFilter(pool, domain, requested || store.getDifficulty(lang)));
}
// content-word set for narrow-reading overlap (en: 4+ letter non-stopwords; zh: Han chars)
function contentWords(text, lang) {
  if (lang === 'zh') return new Set(Array.from(text).filter(c => /[㐀-鿿]/.test(c)));
  return new Set((text.toLowerCase().match(/[a-z]{4,}/g) || []).filter(w => !STOP_EN.has(w)));
}
// a "related" passage = same tier, sharing the MOST content words (narrow-reading proxy for transfer)
export function relatedPassage(p, options = []) {
  const legacy = Array.isArray(options);
  const excludeIds = legacy ? options : (options.excludeIds || []);
  const unseenOnly = legacy ? false : options.unseenOnly !== false;
  const domain = legacy ? (p.domain || null) : (options.domain || p.domain || null);
  const excluded = new Set([p.id, ...excludeIds]);
  let pool = passagesFor(p.lang, p.tier).filter(x => !excluded.has(x.id));
  if (unseenOnly) pool = pool.filter(x => store.seenCount(x.id) === 0);
  pool = domainFilter(pool, domain, p.tier);
  if (!pool.length) return legacy ? pickPassage(p.lang, p.tier, [p.id, ...excludeIds]) : null;
  const base = contentWords(p.text, p.lang);
  let best = null, bestScore = -1;
  for (const c of pool) {
    const cw = contentWords(c.text, p.lang);
    let shared = 0; cw.forEach(w => { if (base.has(w)) shared++; });
    const score = shared / Math.max(1, Math.min(base.size, cw.size));
    if (score > bestScore) { bestScore = score; best = c; }
  }
  return best || shuffle(pool)[0];
}

/* ---- tokenization for the moving pacer ---- */
// returns array of {text, units} chunks
export function pacerChunks(text, lang, size) {
  if (lang === 'zh') {
    const chars = Array.from(text);
    const out = [];
    for (let i = 0; i < chars.length; i += size) {
      const seg = chars.slice(i, i + size).join('');
      out.push({ text: seg, units: (seg.match(/[㐀-鿿]/g) || []).length });
    }
    return out.filter(c => c.text.length);
  }
  const words = text.trim().split(/(\s+)/); // keep spaces
  const tokens = [];
  let buf = [], wc = 0;
  for (const w of words) {
    buf.push(w);
    if (/\S/.test(w)) { wc++; }
    if (wc >= size) { tokens.push({ text: buf.join(''), units: wc }); buf = []; wc = 0; }
  }
  if (buf.length) tokens.push({ text: buf.join(''), units: wc });
  return tokens;
}

export function splitParagraphs(text) {
  return text.split(/\n{2,}|\n/).map(s => s.trim()).filter(Boolean);
}
export function splitSentences(text, lang) {
  if (lang === 'zh') return text.split(/(?<=[。！？；])/).map(s => s.trim()).filter(Boolean);
  return text.split(/(?<=[.!?])\s+/).map(s => s.trim()).filter(Boolean);
}

/* ---- auto comprehension for arbitrary (user) text: cloze/maze ----
   Not a validated item bank — used as an honest self-check for imported text. */
const STOP_EN = new Set(['the','a','an','and','or','but','of','to','in','on','at','for','with','as','by','is','are','was','were','be','been','it','its','this','that','these','those','he','she','they','we','you','i','his','her','their','our','your','from','not','no','so','if','than','then','there','here','which','who','whom','what','when','where','how','will','would','can','could','may','might','do','does','did','have','has','had']);

export function autoCloze(text, lang, k = 4) {
  const sents = splitSentences(text, lang).filter(s => countUnits(s, lang) >= (lang === 'zh' ? 6 : 6));
  if (sents.length < 2) return [];
  const chosen = sample(sents, Math.min(k, sents.length));
  const items = [];
  if (lang === 'zh') {
    const allWords = Array.from(text.replace(/\s/g, '')).filter(c => /[㐀-鿿]/.test(c));
    for (const s of chosen) {
      const chars = Array.from(s).filter(c => /[㐀-鿿]/.test(c));
      if (chars.length < 4) continue;
      const idx = 2 + Math.floor(Math.random() * (chars.length - 3));
      const ans = chars[idx];
      const blanked = s.replace(ans, '◯');
      const distract = shuffle(allWords.filter(c => c !== ans)).slice(0, 3);
      const opts = shuffle([ans, ...distract]);
      items.push({ q: blanked, options: opts, answer: opts.indexOf(ans), explanation: '원문의 글자: ' + ans });
    }
  } else {
    const allWords = (text.toLowerCase().match(/[a-z]{4,}/g) || []).filter(w => !STOP_EN.has(w));
    for (const s of chosen) {
      const words = s.split(/\b/).filter(w => /[A-Za-z]{4,}/.test(w) && !STOP_EN.has(w.toLowerCase()));
      if (!words.length) continue;
      const ans = words[Math.floor(Math.random() * words.length)];
      const blanked = s.replace(new RegExp('\\b' + ans.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b'), '_____');
      const distract = shuffle([...new Set(allWords)].filter(w => w !== ans.toLowerCase() && Math.abs(w.length - ans.length) <= 3)).slice(0, 3);
      if (distract.length < 3) continue;
      const opts = shuffle([ans, ...distract]);
      items.push({ q: blanked, options: opts, answer: opts.indexOf(ans), explanation: '원문의 단어: ' + ans });
    }
  }
  return items.slice(0, k);
}
