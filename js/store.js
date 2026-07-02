// ===== store.js — persistent state, SR scheduler, adaptive staircase, level profile =====
import { now, todayKey, clamp } from './util.js';
import { LEVELS, levelOf } from './levels.js';

const KEY = 'readfast.v2';
const DAY = 86400000;

const DEFAULT = {
  settings: { lang: 'en', theme: 'auto', level: { en: null, zh: null } },
  // per-language reading profile
  prof: {
    en: { err: [], pace: {}, ceiling: {}, coverage: null },
    zh: { err: [], pace: {}, ceiling: {}, coverage: null },
  },
  sr: {},            // deckId -> { itemKey -> {ease,interval,due,reps,lapses} }
  rt: { en: {}, zh: {} }, // word-recognition latency samples per freq band
  hard: { en: {}, zh: {} }, // itemKey -> miss/slow count (재출제 가중치)
  sessions: [],      // {ts, drill, lang, ...}
  streak: { count: 0, last: null, freezes: 2 },
  seen: {},          // passageId -> count (avoid repeats / mark used)
  myTexts: [],       // user-imported texts
};

let state = load();
migrate();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return structuredClone(DEFAULT);
    const s = JSON.parse(raw);
    return deepDefaults(s, DEFAULT);
  } catch { return structuredClone(DEFAULT); }
}
function deepDefaults(s, d) {
  if (Array.isArray(d)) return Array.isArray(s) ? s : structuredClone(d);
  if (d && typeof d === 'object') {
    const out = { ...structuredClone(d), ...(s || {}) };
    for (const k of Object.keys(d)) out[k] = deepDefaults(s ? s[k] : undefined, d[k]);
    return out;
  }
  return s === undefined ? d : s;
}
// 레벨 개념 도입 전 사용자 이관: 훈련 이력이 있으면(=최고난도 기본값 시절 사용자) 과부하 레벨로 유지
function migrate() {
  let dirty = false;
  for (const lang of ['en', 'zh']) {
    if (!state.settings.level[lang] && state.prof[lang].err.length > 0) {
      state.settings.level[lang] = 'overload'; dirty = true;
    }
  }
  if (dirty) save();
}
export function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {} }
export function getState() { return state; }

// 진행 기록만 초기화 — 내 글·설정(레벨/테마 포함)은 보존
export function resetProgress() {
  const keep = { settings: state.settings, myTexts: state.myTexts };
  state = structuredClone(DEFAULT);
  state.settings = keep.settings;
  state.myTexts = keep.myTexts;
  save();
}
// 전체 초기화 — 내 글 포함 전부 삭제 (설정 화면에서 별도 확인)
export function resetEverything() { state = structuredClone(DEFAULT); save(); }

/* ---- settings ---- */
export function getSetting(k) { return state.settings[k]; }
export function setSetting(k, v) { state.settings[k] = v; save(); }

/* ---- level profile ---- */
export function getLevel(lang) { return state.settings.level[lang] || null; }
export function setLevel(lang, lv) {
  if (lv !== null && !LEVELS[lv]) return;
  state.settings.level[lang] = lv; save();
}

/* ---- ERR history ---- */
// rec: {ts, tier, units, wpm, comp, err, mode}
export function addErr(lang, rec) {
  state.prof[lang].err.push({ ts: now(), ...rec });
  if (rec.mode !== 'gist' && rec.comp >= 0.8) {
    const cur = state.prof[lang].ceiling[rec.tier] || 0;
    if (rec.wpm > cur) state.prof[lang].ceiling[rec.tier] = Math.round(rec.wpm);
  }
  save();
}
export function errSeries(lang, mode) {
  return state.prof[lang].err.filter(r => !mode || r.mode === mode);
}
export function ceiling(lang, tier) { return state.prof[lang].ceiling[tier] || null; }

/* ---- adaptive pace staircase (comprehension-gated, smoothed) ---- */
// 시작 페이스는 레벨 프로필에서 파생 — 초급자가 200 WPM에서 연속 실패로 시작하지 않게.
function basePace(lang) {
  const lv = levelOf(getLevel(lang) || 'builder');
  return lv.base[lang];
}
export function getPace(lang, tier) {
  const p = state.prof[lang].pace[tier];
  return p ? p.pace : basePace(lang);
}
// 기준선 측정 결과로 해당 티어 페이스를 시딩 (이해 유지된 실측 속도의 90%에서 출발)
export function seedPace(lang, tier, wpm) {
  const slot = state.prof[lang].pace[tier] || (state.prof[lang].pace[tier] = { pace: basePace(lang), run: [] });
  slot.pace = clamp(Math.round(wpm * 0.9), 80, lang === 'zh' ? 600 : 500);
  save();
}
// comp in 0..1; returns {pace, dir}
export function updatePace(lang, tier, comp) {
  const slot = state.prof[lang].pace[tier] || (state.prof[lang].pace[tier] = { pace: basePace(lang), run: [] });
  slot.run.push(comp); if (slot.run.length > 3) slot.run.shift();
  const avg = slot.run.reduce((s, x) => s + x, 0) / slot.run.length;
  let dir = 'hold';
  // 2-down/1-up style: need 2 good before stepping up; step down immediately on a clear miss
  if (comp < 0.6) { slot.pace = Math.round(slot.pace * 0.88); dir = 'down'; slot.run = []; }
  else if (avg >= 0.85 && slot.run.length >= 2) { slot.pace = Math.round(slot.pace * 1.07); dir = 'up'; slot.run = []; }
  else if (comp < 0.75) { slot.pace = Math.round(slot.pace * 0.94); dir = 'down'; }
  const ceil = state.prof[lang].ceiling[tier];
  if (ceil) slot.pace = Math.min(slot.pace, Math.round(ceil * 1.15));
  // steady-mode pacer is comprehension-gated; cap near the app's own realistic science
  // (myth territory is 600-1000+ WPM "with full comprehension"). Overload mode pushes beyond, explicitly labeled.
  slot.pace = clamp(slot.pace, 80, lang === 'zh' ? 600 : 500);
  save();
  return { pace: slot.pace, dir };
}

/* ---- SR scheduler (SM-2 lite, day-based with in-session requeue) ---- */
export function srCard(deck, key) {
  const d = state.sr[deck] || (state.sr[deck] = {});
  return d[key] || (d[key] = { ease: 2.5, interval: 0, due: 0, reps: 0, lapses: 0 });
}
// only cards already studied (reps>0) count as "due for review"
export function srDueList(deck, keys) {
  const t = now();
  return keys.filter(k => { const c = srCard(deck, k); return c.reps > 0 && c.due <= t; });
}
// 덱에 이미 기록된 키 전부(예: 정복 모드에서 표시한 미지 단어 큐)
export function srKeys(deck) { return Object.keys(state.sr[deck] || {}); }
export function srNewCount(deck, keys) {
  const d = state.sr[deck] || {};
  return keys.filter(k => !d[k] || d[k].reps === 0).length;
}
// grade: 0 again, 1 hard, 2 good, 3 easy
export function srReview(deck, key, grade) {
  const c = srCard(deck, key);
  if (grade === 0) {
    c.reps = 0; c.lapses++; c.ease = Math.max(1.3, c.ease - 0.2); c.interval = 0;
    c.due = now() + 60000; // re-show in ~1 min this session
  } else {
    c.reps++;
    c.ease = clamp(c.ease + (grade === 1 ? -0.15 : grade === 3 ? 0.15 : 0), 1.3, 2.8);
    if (c.reps === 1) c.interval = grade === 3 ? 3 : 1;
    else if (c.reps === 2) c.interval = grade === 3 ? 7 : 3;
    else c.interval = Math.round(c.interval * c.ease * (grade === 1 ? 0.7 : 1));
    c.due = now() + c.interval * DAY;
  }
  save();
  return c;
}

/* ---- word-recognition latency (RT) per frequency band ---- */
export function addRT(lang, band, ms, correct) {
  const b = state.rt[lang][band] || (state.rt[lang][band] = []);
  if (correct) { b.push(ms); if (b.length > 60) b.shift(); }
  save();
}
export function rtBands(lang) { return state.rt[lang]; }

/* ---- 오답·느린 항목 가중치 (틀리거나 느린 글자가 다음에 더 자주 나오게) ---- */
export function bumpHard(lang, key) {
  state.hard[lang][key] = (state.hard[lang][key] || 0) + 1;
  save();
}
export function easeHard(lang, key) {
  if (state.hard[lang][key]) {
    state.hard[lang][key]--;
    if (state.hard[lang][key] <= 0) delete state.hard[lang][key];
    save();
  }
}
export function hardKeys(lang) {
  return Object.entries(state.hard[lang]).sort((a, b) => b[1] - a[1]).map(([k]) => k);
}

/* ---- sessions / streak ---- */
export function logSession(rec) {
  state.sessions.push({ ts: now(), ...rec });
  if (state.sessions.length > 500) state.sessions.shift();
  touchStreak();
  save();
}
export function touchStreak() {
  const tk = todayKey();
  const s = state.streak;
  if (s.last === tk) return;
  const yest = new Date(Date.now() - DAY).toISOString().slice(0, 10);
  if (s.last === yest) s.count++;
  else if (s.last && s.last < yest) {
    if (s.freezes > 0) { s.freezes--; s.count++; } else s.count = 1;
  } else s.count = 1;
  s.last = tk;
}
export function sessionsToday() {
  const tk = todayKey();
  return state.sessions.filter(x => new Date(x.ts).toISOString().slice(0, 10) === tk);
}

/* ---- passage seen tracking ---- */
export function markSeen(id) { state.seen[id] = (state.seen[id] || 0) + 1; save(); }
export function seenCount(id) { return state.seen[id] || 0; }

/* ---- my texts ---- */
export function addMyText(t) { state.myTexts.unshift({ id: 't' + now(), ts: now(), ...t }); save(); }
export function myTexts() { return state.myTexts; }
export function removeMyText(id) { state.myTexts = state.myTexts.filter(t => t.id !== id); save(); }

/* ---- data export / import (설정 화면) ---- */
export function exportJSON() { return JSON.stringify(state, null, 1); }
export function importJSON(text) {
  const s = JSON.parse(text); // throws on invalid
  if (!s || typeof s !== 'object' || !s.prof) throw new Error('형식이 다릅니다');
  state = deepDefaults(s, DEFAULT);
  save();
}
