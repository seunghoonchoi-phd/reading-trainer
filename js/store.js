// ===== store.js — persistent state, SR scheduler, adaptive staircase =====
import { now, todayKey, clamp } from './util.js';

const KEY = 'readfast.v2';
const DAY = 86400000;

const DEFAULT = {
  settings: { lang: 'en', theme: 'auto' },
  // per-language reading profile
  prof: {
    en: { err: [], pace: {}, ceiling: {}, coverage: null },
    zh: { err: [], pace: {}, ceiling: {}, coverage: null },
  },
  sr: {},            // deckId -> { itemKey -> {ease,interval,due,reps,lapses} }
  rt: { en: {}, zh: {} }, // word-recognition latency samples per freq band
  sessions: [],      // {ts, drill, lang, ...}
  streak: { count: 0, last: null, freezes: 2 },
  seen: {},          // passageId -> count (avoid repeats / mark used)
  myTexts: [],       // user-imported texts
};

let state = load();

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
export function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {} }
export function getState() { return state; }
export function resetAll() { state = structuredClone(DEFAULT); save(); }

/* ---- settings ---- */
export function getSetting(k) { return state.settings[k]; }
export function setSetting(k, v) { state.settings[k] = v; save(); }

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
// baseline starting pace by language (WPM / CPM). Conservative, below "normal".
const BASE = { en: 200, zh: 230 };
export function getPace(lang, tier) {
  const p = state.prof[lang].pace[tier];
  return p ? p.pace : BASE[lang];
}
// comp in 0..1; returns {pace, dir}
export function updatePace(lang, tier, comp) {
  const slot = state.prof[lang].pace[tier] || (state.prof[lang].pace[tier] = { pace: BASE[lang], run: [] });
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
