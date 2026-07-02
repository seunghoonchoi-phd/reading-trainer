// ===== levels.js — 사용자 수준(레벨) 프로필: 티어 창·시작 페이스·어휘 밴드를 한 곳에서 파생 =====
// 레벨은 언어별로 저장된다(settings.level = { en, zh }). null이면 온보딩 대상.

export const LEVEL_ORDER = ['starter', 'builder', 'advanced', 'overload'];

export const LEVELS = {
  starter: {
    label: '입문',
    sub: { en: 'A2–B1', zh: 'HSK3–4' },
    desc: '문장은 읽지만 아직 느리고, 모르는 단어가 자주 나오는 단계',
    tiers: [1, 2],          // 기본 노출 난이도 창
    base: { en: 120, zh: 150 },  // 페이서 시작 속도 (WPM / 자·분)
    bands: [1, 3],          // 어휘 훈련 빈도 밴드 창 [lo, hi]
  },
  builder: {
    label: '중급',
    sub: { en: 'B1–B2', zh: 'HSK4–5' },
    desc: '일상 글은 무리 없이 읽지만, 긴 글·낯선 주제에서 속도가 떨어지는 단계',
    tiers: [2, 3, 4],
    base: { en: 160, zh: 190 },
    bands: [2, 4],
  },
  advanced: {
    label: '상급',
    sub: { en: 'C1', zh: 'HSK5–6' },
    desc: '대부분의 글을 읽어내고, 이제 속도·정확도의 상한을 올리고 싶은 단계',
    tiers: [4, 5],
    base: { en: 190, zh: 230 },
    bands: [3, 5],
  },
  overload: {
    label: '최상급·과부하',
    sub: { en: 'C2+', zh: 'HSK6+' },
    desc: '한계 바로 위 최고난도 자료로 과부하 → 회복하며 강화하는 단계',
    tiers: [5, 6],
    base: { en: 200, zh: 230 },
    bands: [4, 6],
  },
};

export function levelOf(key) { return LEVELS[key] || LEVELS.builder; }

// 드릴 기본 티어: 레벨 창의 중앙(과부하는 최상단 — 현 동작 유지)
export function defaultTier(levelKey, available) {
  const lv = levelOf(levelKey);
  const win = lv.tiers.filter(t => available.includes(t));
  const pool = win.length ? win : available;
  if (!pool.length) return null;
  if (levelKey === 'overload') return pool[pool.length - 1];
  return pool[Math.floor((pool.length - 1) / 2)];
}

// 정복 모드 기본 티어: 창의 최상단(“어려운 글을 정복”이 드릴 정체성)
export function hardestTier(levelKey, available) {
  const lv = levelOf(levelKey);
  const win = lv.tiers.filter(t => available.includes(t));
  const pool = win.length ? win : available;
  return pool.length ? pool[pool.length - 1] : null;
}

export function inBand(levelKey, band) {
  const [lo, hi] = levelOf(levelKey).bands;
  return band >= lo && band <= hi;
}

// 기준선 ERR 결과로 레벨 추천 (티어 3 지문 기준)
export function recommendLevel(comp, wpm, lang) {
  if (comp < 0.5) return 'starter';
  if (comp < 0.75) return 'builder';
  const fast = wpm >= (lang === 'zh' ? 260 : 220);
  return fast ? 'overload' : 'advanced';
}
