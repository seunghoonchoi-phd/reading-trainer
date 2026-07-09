// ===== levels.js — app difficulty 1–6 plus legacy compatibility =====
// Public difficulty is an app reading-load scale, not an external proficiency certificate.

export const DIFFICULTY_ORDER = Object.freeze([1, 2, 3, 4, 5, 6]);

export const DIFFICULTIES = Object.freeze({
  1: Object.freeze({
    tier: 1,
    description: Object.freeze({ ko: '짧고 익숙한 글', en: 'Short & familiar' }),
    base: Object.freeze({ en: 110, zh: 140 }),
    bands: Object.freeze([1, 2]),
  }),
  2: Object.freeze({
    tier: 2,
    description: Object.freeze({ ko: '쉬운 설명문', en: 'Clear explanatory' }),
    base: Object.freeze({ en: 135, zh: 165 }),
    bands: Object.freeze([1, 3]),
  }),
  3: Object.freeze({
    tier: 3,
    description: Object.freeze({ ko: '보통 설명문', en: 'Standard explanatory' }),
    base: Object.freeze({ en: 160, zh: 190 }),
    bands: Object.freeze([2, 4]),
  }),
  4: Object.freeze({
    tier: 4,
    description: Object.freeze({ ko: '긴 문장과 추론', en: 'Dense & inferential' }),
    base: Object.freeze({ en: 180, zh: 215 }),
    bands: Object.freeze([3, 5]),
  }),
  5: Object.freeze({
    tier: 5,
    description: Object.freeze({ ko: '전문 어휘와 긴 글', en: 'Technical & extended' }),
    base: Object.freeze({ en: 195, zh: 235 }),
    bands: Object.freeze([4, 6]),
  }),
  6: Object.freeze({
    tier: 6,
    description: Object.freeze({ ko: '고난도·전문 글', en: 'Advanced & specialist' }),
    base: Object.freeze({ en: 210, zh: 255 }),
    bands: Object.freeze([5, 6]),
  }),
});

export function normalizeDifficulty(value) {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 && n <= 6 ? n : null;
}

export function difficultyOf(value) {
  return DIFFICULTIES[normalizeDifficulty(value) || 3];
}

export function difficultyLabel(value, locale = 'ko') {
  const n = normalizeDifficulty(value) || 3;
  const description = DIFFICULTIES[n].description[locale] || DIFFICULTIES[n].description.ko;
  return `${n} · ${description}`;
}

export const LEGACY_LEVEL_TO_DIFFICULTY = Object.freeze({
  starter: 1,
  beginner: 1,
  builder: 3,
  intermediate: 3,
  advanced: 5,
  overload: 6,
});

export function difficultyFromLegacyLevel(key) {
  return LEGACY_LEVEL_TO_DIFFICULTY[key] || null;
}

// Internal compatibility only. New UI and program logic use DIFFICULTIES.
export const LEVEL_ORDER = Object.freeze(['starter', 'builder', 'advanced', 'overload']);
export const LEVELS = Object.freeze({
  starter: Object.freeze({ label: '기초', sub: Object.freeze({ en: '난이도 1~2', zh: '난이도 1~2' }), desc: '짧고 익숙한 글부터 연습', tiers: Object.freeze([1, 2]), base: DIFFICULTIES[1].base, bands: Object.freeze([1, 3]) }),
  builder: Object.freeze({ label: '보통', sub: Object.freeze({ en: '난이도 2~4', zh: '난이도 2~4' }), desc: '보통 설명문을 중심으로 연습', tiers: Object.freeze([2, 3, 4]), base: DIFFICULTIES[3].base, bands: Object.freeze([2, 4]) }),
  advanced: Object.freeze({ label: '어려움', sub: Object.freeze({ en: '난이도 4~5', zh: '난이도 4~5' }), desc: '긴 문장과 전문 어휘가 있는 글 연습', tiers: Object.freeze([4, 5]), base: DIFFICULTIES[5].base, bands: Object.freeze([3, 5]) }),
  overload: Object.freeze({ label: '고난도', sub: Object.freeze({ en: '난이도 5~6', zh: '난이도 5~6' }), desc: '고난도·전문 글 연습', tiers: Object.freeze([5, 6]), base: DIFFICULTIES[6].base, bands: Object.freeze([4, 6]) }),
});

export function levelOf(key) {
  if (LEVELS[key]) return LEVELS[key];
  const mapped = difficultyFromLegacyLevel(key);
  if (mapped && mapped <= 2) return LEVELS.starter;
  if (mapped && mapped <= 4) return LEVELS.builder;
  if (mapped === 5) return LEVELS.advanced;
  if (mapped === 6) return LEVELS.overload;
  return LEVELS.builder;
}

function windowFor(value) {
  const difficulty = normalizeDifficulty(value);
  if (difficulty) return [difficulty];
  return levelOf(value).tiers;
}

export function defaultTier(levelOrDifficulty, available) {
  const win = windowFor(levelOrDifficulty).filter(t => available.includes(t));
  const pool = win.length ? win : available;
  if (!pool.length) return null;
  if (levelOrDifficulty === 'overload' || normalizeDifficulty(levelOrDifficulty) === 6) return pool[pool.length - 1];
  return pool[Math.floor((pool.length - 1) / 2)];
}

export function hardestTier(levelOrDifficulty, available) {
  const win = windowFor(levelOrDifficulty).filter(t => available.includes(t));
  const pool = win.length ? win : available;
  return pool.length ? pool[pool.length - 1] : null;
}

export function inBand(levelOrDifficulty, band) {
  const difficulty = normalizeDifficulty(levelOrDifficulty);
  const [lo, hi] = difficulty ? difficultyOf(difficulty).bands : levelOf(levelOrDifficulty).bands;
  return band >= lo && band <= hi;
}

// Deprecated compatibility hook for the old onboarding screen. It is a neutral
// preference suggestion only; v3 proficiency recommendations require 3 benchmarks.
export function recommendLevel() { return 'builder'; }
