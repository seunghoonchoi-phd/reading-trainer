// ===== store.js — v3 persistent state with immutable attempts =====
import { now, clamp } from './util.js';
import {
  LEVELS,
  difficultyFromLegacyLevel,
  difficultyOf,
  normalizeDifficulty,
} from './levels.js';

const KEY = 'readfast.v2';
const CORRUPT_BACKUP_PREFIX = 'readfast.v2.corrupt-backup';
const DAY = 86400000;
export const SCHEMA_VERSION = 3;
export const MAX_ATTEMPTS = 1000;
export const MY_TEXT_MAX_CHARS = 100000;
export const MY_TEXT_TOTAL_MAX_CHARS = 1000000;

const DEFAULT = {
  schemaVersion: SCHEMA_VERSION,
  settings: {
    lang: 'en',
    theme: 'auto',
    level: { en: null, zh: null },
    difficulty: { en: null, zh: null },
    difficultySource: { en: null, zh: null },
  },
  prof: {
    en: { err: [], pace: {}, ceiling: {}, coverage: null },
    zh: { err: [], pace: {}, ceiling: {}, coverage: null },
  },
  sr: {},
  rt: { en: {}, zh: {} },
  hard: { en: {}, zh: {} },
  sessions: [],
  attempts: [],
  clears: { en: {}, zh: {} },
  streak: { count: 0, last: null, freezes: 2 }, // legacy display data, preserved
  streaks: { en: { count: 0, last: null }, zh: { count: 0, last: null } },
  seen: {},
  myTexts: [],
  migrations: { difficultyV3: { en: false, zh: false } },
};

let lastSaveError = null;
let loadIssue = null;
let corruptSourceText = null;
let writeBlocked = false;

function appError(code, message, cause) {
  const error = new Error(message, cause ? { cause } : undefined);
  error.code = code;
  return error;
}

function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function storedEnvelopeIssue(value) {
  if (!isPlainObject(value)) return '저장 데이터의 최상위 값이 객체가 아닙니다.';
  if (value.schemaVersion != null && (!Number.isInteger(value.schemaVersion) || value.schemaVersion < 1 || value.schemaVersion > SCHEMA_VERSION)) {
    return value.schemaVersion > SCHEMA_VERSION
      ? '이 앱보다 새로운 저장 데이터 버전입니다.'
      : '저장 데이터 버전 값이 올바르지 않습니다.';
  }
  const objectFields = ['settings', 'prof', 'sr', 'rt', 'hard', 'clears', 'streak', 'streaks', 'seen', 'migrations'];
  for (const field of objectFields) if (value[field] != null && !isPlainObject(value[field])) return `${field} 형식이 올바르지 않습니다.`;
  const arrayFields = ['sessions', 'attempts', 'myTexts'];
  for (const field of arrayFields) if (value[field] != null && !Array.isArray(value[field])) return `${field} 형식이 올바르지 않습니다.`;
  const settings = value.settings;
  if (settings) {
    if (settings.lang != null && !['en', 'zh'].includes(settings.lang)) return 'settings.lang 값이 올바르지 않습니다.';
    if (settings.theme != null && !['auto', 'light', 'dark'].includes(settings.theme)) return 'settings.theme 값이 올바르지 않습니다.';
    for (const field of ['level', 'difficulty', 'difficultySource']) {
      if (settings[field] != null && !isPlainObject(settings[field])) return `settings.${field} 형식이 올바르지 않습니다.`;
    }
    for (const lang of ['en', 'zh']) {
      const level = settings.level?.[lang];
      if (level != null && !LEVELS[level] && !difficultyFromLegacyLevel(level)) return `settings.level.${lang} 값이 올바르지 않습니다.`;
      const difficulty = settings.difficulty?.[lang];
      if (difficulty != null && !normalizeDifficulty(difficulty)) return `settings.difficulty.${lang} 값이 올바르지 않습니다.`;
      const source = settings.difficultySource?.[lang];
      if (source != null && typeof source !== 'string') return `settings.difficultySource.${lang} 값이 올바르지 않습니다.`;
    }
  }
  if (value.sessions?.some(row => !isPlainObject(row))) return 'sessions에 잘못된 행이 있습니다.';
  if (value.myTexts?.some(row => !isPlainObject(row) || typeof row.text !== 'string')) return 'myTexts에 잘못된 글이 있습니다.';
  if (value.attempts?.some(row => !isPlainObject(row))) return 'attempts에 잘못된 행이 있습니다.';
  return null;
}

function deepDefaults(source, defaults) {
  if (Array.isArray(defaults)) return Array.isArray(source) ? structuredClone(source) : structuredClone(defaults);
  if (isPlainObject(defaults)) {
    const src = isPlainObject(source) ? source : {};
    const out = { ...structuredClone(defaults), ...structuredClone(src) };
    for (const key of Object.keys(defaults)) out[key] = deepDefaults(src[key], defaults[key]);
    return out;
  }
  return source === undefined ? defaults : source;
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function immutableClone(value) {
  return deepFreeze(structuredClone(value));
}

function readStored() {
  let raw;
  try {
    raw = localStorage.getItem(KEY);
  } catch (error) {
    lastSaveError = error;
    return { value: null, failed: true };
  }
  if (!raw) return { value: null, failed: false };
  try {
    const parsed = JSON.parse(raw);
    const envelopeIssue = storedEnvelopeIssue(parsed);
    if (envelopeIssue) throw appError('STORAGE_CORRUPT', envelopeIssue);
    return { value: parsed, failed: false };
  } catch (cause) {
    corruptSourceText = raw;
    let recoveryKey = null;
    try {
      for (let index = 0; index < localStorage.length; index++) {
        const existingKey = localStorage.key(index);
        if (existingKey?.startsWith(CORRUPT_BACKUP_PREFIX) && localStorage.getItem(existingKey) === raw) {
          recoveryKey = existingKey;
          break;
        }
      }
      if (!recoveryKey) {
        recoveryKey = CORRUPT_BACKUP_PREFIX;
        let suffix = 0;
        while (localStorage.getItem(recoveryKey) != null) {
          suffix++;
          recoveryKey = `${CORRUPT_BACKUP_PREFIX}.${Date.now()}-${suffix}`;
        }
        localStorage.setItem(recoveryKey, raw);
      }
    } catch {
      recoveryKey = null;
    }
    loadIssue = deepFreeze({
      code: 'STORAGE_CORRUPT',
      message: '기존 저장 데이터의 구조나 버전을 안전하게 읽을 수 없습니다.',
      recoveryKey,
      rawAvailable: true,
    });
    lastSaveError = appError('STORAGE_CORRUPT', loadIssue.message, cause);
    return { value: null, failed: true, corruptRaw: raw };
  }
}

function migrateState(raw) {
  const source = isPlainObject(raw) ? raw : {};
  const next = deepDefaults(source, DEFAULT);
  let dirty = next.schemaVersion !== SCHEMA_VERSION;
  next.schemaVersion = SCHEMA_VERSION;

  if (!Array.isArray(next.attempts)) { next.attempts = []; dirty = true; }
  if (next.attempts.length > MAX_ATTEMPTS) {
    next.attempts = next.attempts.slice().sort((a, b) => Date.parse(a.completedAt || 0) - Date.parse(b.completedAt || 0)).slice(-MAX_ATTEMPTS);
    dirty = true;
  }
  next.attempts = Object.freeze(next.attempts.map(row => deepFreeze(row)));

  for (const lang of ['en', 'zh']) {
    const alreadyMigrated = source?.migrations?.difficultyV3?.[lang] === true;
    const current = normalizeDifficulty(next.settings.difficulty[lang]);
    if (!alreadyMigrated) {
      if (current) {
        next.settings.difficulty[lang] = current;
        if (!next.settings.difficultySource[lang]) next.settings.difficultySource[lang] = 'manual';
      } else {
        const mapped = difficultyFromLegacyLevel(next.settings.level[lang]);
        next.settings.difficulty[lang] = mapped;
        next.settings.difficultySource[lang] = mapped ? 'legacy-preference' : null;
      }
      next.migrations.difficultyV3[lang] = true;
      dirty = true;
    } else {
      next.settings.difficulty[lang] = current;
    }
    next.streaks[lang] = deriveAttemptStreak(next.attempts, lang);
  }
  return { state: next, dirty };
}

const stored = readStored();
writeBlocked = stored.corruptRaw != null;
const hydrated = migrateState(stored.value);
let state = hydrated.state;
if (hydrated.dirty && !stored.failed) save();

export function save() {
  if (writeBlocked) {
    if (!lastSaveError) lastSaveError = appError('STORAGE_CORRUPT', '손상된 기존 데이터를 먼저 백업하거나 초기화해야 합니다.');
    return false;
  }
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    lastSaveError = null;
    return true;
  } catch (error) {
    lastSaveError = error;
    return false;
  }
}

export function getLastSaveError() { return lastSaveError; }
export function getState() { return state; }
export function getLoadIssue() { return loadIssue ? immutableClone(loadIssue) : null; }
export function getCorruptBackupText() { return corruptSourceText; }

function requireSaved(code = 'STORAGE_WRITE_FAILED') {
  if (!save()) throw appError(code, '브라우저 저장공간에 기록하지 못했습니다.', lastSaveError);
}

function freshState() {
  const next = structuredClone(DEFAULT);
  next.migrations.difficultyV3 = { en: true, zh: true };
  next.attempts = Object.freeze([]);
  return next;
}

export function startFreshAfterCorruption() {
  if (!loadIssue || loadIssue.code !== 'STORAGE_CORRUPT') return false;
  const previous = state;
  const previousIssue = loadIssue;
  const previousBlocked = writeBlocked;
  state = freshState();
  writeBlocked = false;
  loadIssue = null;
  try {
    requireSaved();
  } catch (error) {
    state = previous;
    loadIssue = previousIssue;
    writeBlocked = previousBlocked;
    throw error;
  }
  return true;
}

export function resetProgress() {
  const previous = state;
  const next = freshState();
  next.settings = structuredClone(state.settings);
  next.myTexts = structuredClone(state.myTexts);
  state = next;
  try { requireSaved(); } catch (error) { state = previous; throw error; }
  return true;
}

export function resetEverything() {
  const previous = state;
  state = freshState();
  try { requireSaved(); } catch (error) { state = previous; throw error; }
  return true;
}

/* ---- settings and difficulty ---- */
export function getSetting(key) { return state.settings[key]; }
export function setSetting(key, value) {
  const hadKey = Object.prototype.hasOwnProperty.call(state.settings, key);
  const previous = hadKey ? structuredClone(state.settings[key]) : undefined;
  state.settings[key] = structuredClone(value);
  if (save()) return true;
  if (hadKey) state.settings[key] = previous;
  else delete state.settings[key];
  return false;
}
export function getLevel(lang) { return state.settings.level[lang] || null; }
export function setLevel(lang, level) {
  if (!['en', 'zh'].includes(lang) || (level !== null && !LEVELS[level])) return false;
  const previous = {
    level: state.settings.level[lang],
    difficulty: state.settings.difficulty[lang],
    source: state.settings.difficultySource[lang],
  };
  state.settings.level[lang] = level;
  const mapped = difficultyFromLegacyLevel(level);
  if (mapped) {
    state.settings.difficulty[lang] = mapped;
    state.settings.difficultySource[lang] = 'legacy-preference';
  }
  if (save()) return true;
  state.settings.level[lang] = previous.level;
  state.settings.difficulty[lang] = previous.difficulty;
  state.settings.difficultySource[lang] = previous.source;
  return false;
}
export function getDifficulty(lang) { return normalizeDifficulty(state.settings.difficulty[lang]); }
export function getDifficultySource(lang) { return state.settings.difficultySource[lang] || null; }
export function setDifficulty(lang, difficulty, source = 'manual') {
  if (!['en', 'zh'].includes(lang)) return false;
  const normalized = difficulty === null ? null : normalizeDifficulty(difficulty);
  if (difficulty !== null && !normalized) return false;
  const previous = {
    difficulty: state.settings.difficulty[lang],
    source: state.settings.difficultySource[lang],
  };
  state.settings.difficulty[lang] = normalized;
  state.settings.difficultySource[lang] = normalized ? String(source || 'manual') : null;
  if (save()) return true;
  state.settings.difficulty[lang] = previous.difficulty;
  state.settings.difficultySource[lang] = previous.source;
  return false;
}

/* ---- legacy ERR history (read-only for v3 recommendations) ---- */
export function addErr(lang, rec) {
  state.prof[lang].err.push({ ts: now(), ...rec });
  if (rec.mode !== 'gist' && rec.comp >= 0.8) {
    const current = state.prof[lang].ceiling[rec.tier] || 0;
    if (rec.wpm > current) state.prof[lang].ceiling[rec.tier] = Math.round(rec.wpm);
  }
  return save();
}
export function errSeries(lang, mode) { return state.prof[lang].err.filter(row => !mode || row.mode === mode); }
export function ceiling(lang, tier) { return state.prof[lang].ceiling[tier] || null; }
export function smoothedComp(lang, tier, currentComp) {
  const prior = state.prof[lang].err.filter(row => row.mode === 'full' && row.tier === tier).slice(-2).map(row => row.comp);
  return prior.length < 2 ? currentComp : prior.concat(currentComp).reduce((sum, value) => sum + value, 0) / 3;
}

function basePace(lang) {
  const difficulty = getDifficulty(lang) || difficultyFromLegacyLevel(getLevel(lang)) || 3;
  return difficultyOf(difficulty).base[lang];
}
export function getPace(lang, tier) {
  const pace = state.prof[lang].pace[tier];
  return pace ? pace.pace : basePace(lang);
}
export function seedPace(lang, tier, rate) {
  const existed = Object.prototype.hasOwnProperty.call(state.prof[lang].pace, tier);
  const previous = existed ? structuredClone(state.prof[lang].pace[tier]) : null;
  const slot = state.prof[lang].pace[tier] || (state.prof[lang].pace[tier] = { pace: basePace(lang), run: [] });
  slot.pace = clamp(Math.round(rate * 0.9), 80, lang === 'zh' ? 600 : 500);
  slot.run = [];
  if (save()) return true;
  if (existed) state.prof[lang].pace[tier] = previous;
  else delete state.prof[lang].pace[tier];
  return false;
}
export function updatePace(lang, tier, comprehension, fatigue = null) {
  const existed = Object.prototype.hasOwnProperty.call(state.prof[lang].pace, tier);
  const previous = existed ? structuredClone(state.prof[lang].pace[tier]) : null;
  const slot = state.prof[lang].pace[tier] || (state.prof[lang].pace[tier] = { pace: basePace(lang), run: [] });
  slot.run = (slot.run || []).map(sample => (
    typeof sample === 'number' ? { comprehension: sample, fatigue: null } : sample
  )).filter(sample => sample && Number.isFinite(sample.comprehension));
  slot.run.push({ comprehension, fatigue: Number.isFinite(fatigue) ? fatigue : null });
  if (slot.run.length > 3) slot.run.shift();
  let dir = 'hold';
  const highFatigue = Number.isFinite(fatigue) && fatigue >= 4;
  const lastTwo = slot.run.slice(-2);
  const twoMaintained = lastTwo.length === 2 && lastTwo.every(sample => (
    sample.comprehension >= 0.8 && Number.isFinite(sample.fatigue) && sample.fatigue <= 3
  ));
  if (comprehension < 0.6 || highFatigue) {
    slot.pace = Math.round(slot.pace * 0.95);
    dir = 'down';
    slot.run = [];
  } else if (twoMaintained) {
    slot.pace = Math.round(slot.pace * 1.05);
    dir = 'up';
    slot.run = [];
  }
  const upper = lang === 'zh' ? 600 : 500;
  slot.pace = clamp(slot.pace, 80, upper);
  if (save()) return { pace: slot.pace, dir, saved: true };
  if (existed) state.prof[lang].pace[tier] = previous;
  else delete state.prof[lang].pace[tier];
  return { pace: previous?.pace || basePace(lang), dir: 'hold', saved: false, error: lastSaveError };
}

/* ---- spaced review and recognition latency ---- */
export function srCard(deck, key) {
  const cards = state.sr[deck] || (state.sr[deck] = {});
  return cards[key] || (cards[key] = { ease: 2.5, interval: 0, due: 0, reps: 0, lapses: 0 });
}
export function srDueList(deck, keys) {
  const at = now();
  return keys.filter(key => { const card = srCard(deck, key); return card.reps > 0 && card.due <= at; });
}
export function srKeys(deck) { return Object.keys(state.sr[deck] || {}); }
export function dueCardCount(lang) {
  const at = now();
  let total = 0;
  for (const deck of ['vocab-' + lang, 'conquer-vocab-' + lang]) {
    for (const card of Object.values(state.sr[deck] || {})) if (card && card.reps > 0 && card.due <= at) total++;
  }
  return total;
}
export function srNewCount(deck, keys) {
  const cards = state.sr[deck] || {};
  return keys.filter(key => !cards[key] || cards[key].reps === 0).length;
}
export function srReview(deck, key, grade) {
  const card = srCard(deck, key);
  if (grade === 0) {
    card.reps = 0; card.lapses++; card.ease = Math.max(1.3, card.ease - 0.2); card.interval = 0; card.due = now() + 60000;
  } else {
    card.reps++;
    card.ease = clamp(card.ease + (grade === 1 ? -0.15 : grade === 3 ? 0.15 : 0), 1.3, 2.8);
    if (card.reps === 1) card.interval = grade === 3 ? 3 : 1;
    else if (card.reps === 2) card.interval = grade === 3 ? 7 : 3;
    else card.interval = Math.round(card.interval * card.ease * (grade === 1 ? 0.7 : 1));
    card.due = now() + card.interval * DAY;
  }
  save();
  return card;
}
export function addRT(lang, band, ms, correct) {
  const rows = state.rt[lang][band] || (state.rt[lang][band] = []);
  if (correct) { rows.push(ms); if (rows.length > 60) rows.shift(); }
  return save();
}
export function rtBands(lang) { return state.rt[lang]; }
export function bumpHard(lang, key) { state.hard[lang][key] = (state.hard[lang][key] || 0) + 1; return save(); }
export function easeHard(lang, key) {
  if (!state.hard[lang][key]) return true;
  state.hard[lang][key]--;
  if (state.hard[lang][key] <= 0) delete state.hard[lang][key];
  return save();
}
export function hardKeys(lang) { return Object.entries(state.hard[lang]).sort((a, b) => b[1] - a[1]).map(([key]) => key); }

/* ---- local dates and language-specific streaks ---- */
export function localDateKey(value = now()) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw appError('INVALID_DATE', '날짜 형식이 올바르지 않습니다.');
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
function previousLocalDateKey(key) {
  const [year, month, day] = key.split('-').map(Number);
  return localDateKey(new Date(year, month - 1, day - 1, 12));
}
function deriveAttemptStreak(attempts, lang, at = now()) {
  const days = [...new Set((attempts || [])
    .filter(row => row.lang === lang && row.completed === true && Number.isFinite(Date.parse(row.completedAt || '')))
    .map(row => localDateKey(row.completedAt)))]
    .sort();
  if (!days.length) return { count: 0, last: null };
  const today = localDateKey(at);
  const yesterday = previousLocalDateKey(today);
  const last = days[days.length - 1];
  if (last !== today && last !== yesterday) return { count: 0, last };
  let count = 1;
  for (let index = days.length - 1; index > 0; index--) {
    if (days[index - 1] !== previousLocalDateKey(days[index])) break;
    count++;
  }
  return { count, last };
}
function touchAttemptStreak(lang, completedAt) {
  const key = localDateKey(completedAt);
  const streak = state.streaks[lang];
  if (streak.last === key) return;
  streak.count = streak.last === previousLocalDateKey(key) ? streak.count + 1 : 1;
  streak.last = key;
}
export function streakFor(lang, at = now()) { return immutableClone(deriveAttemptStreak(state.attempts, lang, at)); }
export function touchStreak() {
  const key = localDateKey();
  const legacy = state.streak;
  if (legacy.last === key) return;
  legacy.count = legacy.last === previousLocalDateKey(key) ? legacy.count + 1 : 1;
  legacy.last = key;
}

/* ---- legacy sessions: preserved, but excluded from v3 mastery ---- */
export function logSession(rec) {
  state.sessions.push({ ts: now(), ...rec });
  if (state.sessions.length > 500) state.sessions.shift();
  return save();
}
export function sessionsToday(lang = null, at = now()) {
  const key = localDateKey(at);
  return state.sessions.filter(row => (!lang || row.lang === lang) && localDateKey(row.ts) === key);
}

/* ---- immutable v3 attempts ---- */
function validateQuestionTypes(value) {
  if (value == null) return {};
  if (!isPlainObject(value)) throw appError('ATTEMPT_INVALID', '문항 유형 결과 형식이 올바르지 않습니다.');
  const output = {};
  for (const [type, result] of Object.entries(value)) {
    if (!type || !isPlainObject(result) || !Number.isInteger(result.correct) || !Number.isInteger(result.total)
      || result.correct < 0 || result.total < 0 || result.correct > result.total) {
      throw appError('ATTEMPT_INVALID', `문항 유형 결과가 올바르지 않습니다: ${type || '(빈 유형)'}`);
    }
    output[type] = { correct: result.correct, total: result.total };
  }
  return output;
}

function newAttemptId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `a-${now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeAttempt(record, { importMode = false } = {}) {
  if (!isPlainObject(record)) throw appError('ATTEMPT_INVALID', '훈련 기록이 객체가 아닙니다.');
  const row = structuredClone(record);
  if (!row.attemptId && !importMode) row.attemptId = newAttemptId();
  if (typeof row.attemptId !== 'string' || !row.attemptId.trim()) throw appError('ATTEMPT_INVALID', 'attemptId가 필요합니다.');
  if (row.schemaVersion == null && !importMode) row.schemaVersion = SCHEMA_VERSION;
  if (row.schemaVersion !== SCHEMA_VERSION) throw appError('ATTEMPT_INVALID', '지원하지 않는 attempt 스키마입니다.');
  if (!['en', 'zh'].includes(row.lang)) throw appError('ATTEMPT_INVALID', '언어는 en 또는 zh여야 합니다.');
  row.difficulty = normalizeDifficulty(row.difficulty);
  if (!row.difficulty) throw appError('ATTEMPT_INVALID', '앱 난이도 1~6이 필요합니다.');
  if (row.tier == null) row.tier = row.difficulty;
  if (!normalizeDifficulty(row.tier)) throw appError('ATTEMPT_INVALID', '지문 tier는 1~6이어야 합니다.');
  row.tier = Number(row.tier);
  if (typeof row.drill !== 'string' || !row.drill.trim()) throw appError('ATTEMPT_INVALID', 'drill이 필요합니다.');
  if (typeof row.submode !== 'string' || !row.submode.trim()) throw appError('ATTEMPT_INVALID', 'submode가 필요합니다.');

  if (!row.completedAt && !importMode) row.completedAt = new Date().toISOString();
  if (!row.startedAt && !importMode) {
    const finished = Date.parse(row.completedAt || '');
    const elapsed = Number.isFinite(row.elapsedMs) && row.elapsedMs > 0 ? row.elapsedMs : 0;
    row.startedAt = new Date(finished - elapsed).toISOString();
  }
  const started = Date.parse(row.startedAt || '');
  const completedAt = Date.parse(row.completedAt || '');
  if (!Number.isFinite(started) || !Number.isFinite(completedAt) || completedAt < started) throw appError('ATTEMPT_INVALID', '시작·완료 시각이 올바르지 않습니다.');
  row.startedAt = new Date(started).toISOString();
  row.completedAt = new Date(completedAt).toISOString();

  if (row.completed == null && typeof row.completion === 'boolean') row.completed = row.completion;
  if (row.completed == null) row.completed = true;
  if (typeof row.completed !== 'boolean') throw appError('ATTEMPT_INVALID', 'completed는 boolean이어야 합니다.');
  delete row.completion;
  if (row.benchmark == null) row.benchmark = false;
  if (typeof row.benchmark !== 'boolean') throw appError('ATTEMPT_INVALID', 'benchmark는 boolean이어야 합니다.');
  if (row.novelAtStart == null) row.novelAtStart = false;
  if (typeof row.novelAtStart !== 'boolean') throw appError('ATTEMPT_INVALID', 'novelAtStart는 boolean이어야 합니다.');
  if (row.assisted == null) row.assisted = true;
  if (typeof row.assisted !== 'boolean') throw appError('ATTEMPT_INVALID', 'assisted는 boolean이어야 합니다.');
  if (row.timingValid == null) row.timingValid = importMode ? false : true;
  if (typeof row.timingValid !== 'boolean') throw appError('ATTEMPT_INVALID', 'timingValid는 boolean이어야 합니다.');

  for (const field of ['sourcePassageId', 'transferPassageId']) {
    if (row[field] == null || row[field] === '') row[field] = null;
    else if (typeof row[field] !== 'string') throw appError('ATTEMPT_INVALID', `${field}는 문자열이어야 합니다.`);
  }
  for (const field of ['units', 'elapsedMs', 'rate']) {
    if (row[field] == null) { row[field] = null; continue; }
    if (!Number.isFinite(row[field]) || row[field] < 0 || (field !== 'units' && row[field] === 0)) throw appError('ATTEMPT_INVALID', `${field} 값이 올바르지 않습니다.`);
  }
  if (row.units != null && !Number.isInteger(row.units)) throw appError('ATTEMPT_INVALID', 'units는 정수여야 합니다.');

  if (row.correct == null && (row.total == null || row.total === 0)) { row.correct = null; row.total = null; }
  else if (!Number.isInteger(row.correct) || !Number.isInteger(row.total) || row.correct < 0 || row.total < 0 || row.correct > row.total) {
    throw appError('ATTEMPT_INVALID', 'correct/total 값이 올바르지 않습니다.');
  }
  row.questionTypes = validateQuestionTypes(row.questionTypes);
  row.comprehension = row.total > 0 ? row.correct / row.total : null;
  if (row.fatigue == null) row.fatigue = null;
  else if (!Number.isInteger(row.fatigue) || row.fatigue < 1 || row.fatigue > 5) throw appError('ATTEMPT_INVALID', '피로도는 1~5여야 합니다.');
  if (row.programStage != null && !['baseline', 'weakness', 'transfer', 'reassessment'].includes(row.programStage)) {
    throw appError('ATTEMPT_INVALID', 'programStage가 올바르지 않습니다.');
  }
  if (row.targeted != null && typeof row.targeted !== 'boolean') throw appError('ATTEMPT_INVALID', 'targeted는 boolean이어야 합니다.');
  if (row.assessmentFallback != null && typeof row.assessmentFallback !== 'boolean') throw appError('ATTEMPT_INVALID', 'assessmentFallback은 boolean이어야 합니다.');
  for (const field of ['targetDrill', 'targetSubmode', 'weaknessType']) {
    if (row[field] == null || row[field] === '') row[field] = null;
    else if (typeof row[field] !== 'string' || row[field].length > 64) throw appError('ATTEMPT_INVALID', `${field} 값이 올바르지 않습니다.`);
  }
  return deepFreeze(row);
}

export function addAttempt(record) {
  const row = normalizeAttempt(record);
  if (state.attempts.some(existing => existing.attemptId === row.attemptId)) throw appError('ATTEMPT_DUPLICATE', '같은 attemptId가 이미 있습니다.');
  const previousAttempts = state.attempts;
  const previousStreak = structuredClone(state.streaks[row.lang]);
  state.attempts = Object.freeze([...state.attempts, row].slice(-MAX_ATTEMPTS));
  if (row.completed) state.streaks[row.lang] = deriveAttemptStreak(state.attempts, row.lang);
  if (!save()) {
    state.attempts = previousAttempts;
    state.streaks[row.lang] = previousStreak;
    throw appError('STORAGE_WRITE_FAILED', '훈련 기록을 저장하지 못했습니다.', lastSaveError);
  }
  return immutableClone(row);
}

export function attemptsFor(lang = null, { completed = null } = {}) {
  const rows = state.attempts.filter(row => (!lang || row.lang === lang) && (completed == null || row.completed === completed));
  return immutableClone(rows);
}
export const getAttempts = attemptsFor;
export function attemptsToday(lang, at = now()) {
  const key = localDateKey(at);
  return attemptsFor(lang, { completed: true }).filter(row => localDateKey(row.completedAt) === key);
}

/* ---- durable legacy clears ---- */
export function clearsFor(lang) { return (state.clears && state.clears[lang]) || {}; }
export function isCleared(lang, stageKey) { return !!state.clears?.[lang]?.[stageKey]; }
export function markCleared(lang, stageKey) {
  if (!state.clears[lang]) state.clears[lang] = {};
  if (state.clears[lang][stageKey]) return false;
  state.clears[lang][stageKey] = { at: new Date().toISOString() };
  save();
  return true;
}
export function clearsSeeded(lang) { return !!state.clears?.[lang]?.__seeded; }
export function markClearsSeeded(lang) {
  if (!state.clears[lang]) state.clears[lang] = {};
  if (!state.clears[lang].__seeded) { state.clears[lang].__seeded = { at: new Date().toISOString() }; save(); }
}

/* ---- passage exposure ---- */
export function markSeen(id) {
  const existed = Object.prototype.hasOwnProperty.call(state.seen, id);
  const previous = state.seen[id];
  state.seen[id] = (state.seen[id] || 0) + 1;
  if (save()) return true;
  if (existed) state.seen[id] = previous;
  else delete state.seen[id];
  return false;
}
export function seenCount(id) { return state.seen[id] || 0; }

/* ---- user texts with non-destructive migration and bounded new writes ---- */
export function addMyText(input) {
  if (!isPlainObject(input) || typeof input.text !== 'string') throw appError('MY_TEXT_INVALID', '글 본문이 필요합니다.');
  const length = input.text.trim().length;
  if (length < 20) throw appError('MY_TEXT_TOO_SHORT', '글은 공백을 제외하고 20자 이상이어야 합니다.');
  if (input.text.length > MY_TEXT_MAX_CHARS) throw appError('MY_TEXT_TOO_LARGE', '한 글은 100,000자까지 저장할 수 있습니다.');
  const currentTotal = state.myTexts.reduce((sum, item) => sum + (typeof item.text === 'string' ? item.text.length : 0), 0);
  if (currentTotal + input.text.length > MY_TEXT_TOTAL_MAX_CHARS) throw appError('MY_TEXT_TOTAL_LIMIT', '내 글 본문 합계는 1,000,000자까지 저장할 수 있습니다.');
  const row = deepFreeze({ ...structuredClone(input), id: `t${now()}-${Math.random().toString(36).slice(2, 7)}`, ts: now() });
  const previous = state.myTexts.slice();
  state.myTexts.unshift(row);
  if (!save()) { state.myTexts = previous; throw appError('STORAGE_WRITE_FAILED', '내 글을 저장하지 못했습니다.', lastSaveError); }
  return immutableClone(row);
}
export function myTexts() { return immutableClone(state.myTexts); }
export function removeMyText(id) {
  if (typeof id !== 'string' || !id) throw appError('MY_TEXT_INVALID', '지울 글의 id가 필요합니다.');
  const previous = state.myTexts;
  state.myTexts = state.myTexts.filter(item => item.id !== id);
  if (!save()) { state.myTexts = previous; throw appError('STORAGE_WRITE_FAILED', '내 글 변경을 저장하지 못했습니다.', lastSaveError); }
  return true;
}

/* ---- export/import validation ---- */
function validateImport(parsed) {
  if (!isPlainObject(parsed)) throw appError('IMPORT_INVALID', '가져올 데이터가 객체가 아닙니다.');
  if (parsed.schemaVersion != null && (!Number.isInteger(parsed.schemaVersion) || parsed.schemaVersion > SCHEMA_VERSION)) {
    throw appError('IMPORT_UNSUPPORTED_VERSION', '이 앱보다 새로운 데이터 형식입니다.');
  }
  if (parsed.settings != null && !isPlainObject(parsed.settings)) throw appError('IMPORT_INVALID', 'settings 형식이 올바르지 않습니다.');
  if (parsed.settings) {
    const settings = parsed.settings;
    if (settings.lang != null && !['en', 'zh'].includes(settings.lang)) throw appError('IMPORT_INVALID', 'settings.lang 값이 올바르지 않습니다.');
    if (settings.theme != null && !['auto', 'light', 'dark'].includes(settings.theme)) throw appError('IMPORT_INVALID', 'settings.theme 값이 올바르지 않습니다.');
    if (settings.level != null) {
      if (!isPlainObject(settings.level)) throw appError('IMPORT_INVALID', 'settings.level 형식이 올바르지 않습니다.');
      for (const lang of ['en', 'zh']) {
        const value = settings.level[lang];
        if (value != null && !LEVELS[value] && !difficultyFromLegacyLevel(value)) throw appError('IMPORT_INVALID', 'settings.level 값이 올바르지 않습니다.');
      }
    }
    if (settings.difficulty != null) {
      if (!isPlainObject(settings.difficulty)) throw appError('IMPORT_INVALID', 'settings.difficulty 형식이 올바르지 않습니다.');
      for (const lang of ['en', 'zh']) if (settings.difficulty[lang] != null && !normalizeDifficulty(settings.difficulty[lang])) throw appError('IMPORT_INVALID', 'settings.difficulty 값이 올바르지 않습니다.');
    }
    if (settings.difficultySource != null) {
      if (!isPlainObject(settings.difficultySource)) throw appError('IMPORT_INVALID', 'settings.difficultySource 형식이 올바르지 않습니다.');
      for (const lang of ['en', 'zh']) if (settings.difficultySource[lang] != null && typeof settings.difficultySource[lang] !== 'string') throw appError('IMPORT_INVALID', 'settings.difficultySource 값이 올바르지 않습니다.');
    }
    const numericSettings = {
      readerFontSize: [16, 30],
      readerLineHeight: [1.4, 2.2],
      readerWidth: [42, 82],
      gistSeconds: [20, 180],
    };
    for (const [key, bounds] of Object.entries(numericSettings)) {
      if (settings[key] != null && (!Number.isFinite(settings[key]) || settings[key] < bounds[0] || settings[key] > bounds[1])) {
        throw appError('IMPORT_INVALID', 'settings.' + key + ' 값이 올바르지 않습니다.');
      }
    }
    for (const key of ['reduceMotion', 'timerVisible']) {
      if (settings[key] != null && typeof settings[key] !== 'boolean') throw appError('IMPORT_INVALID', 'settings.' + key + ' 값이 올바르지 않습니다.');
    }
  }
  for (const field of ['sessions', 'attempts', 'myTexts']) if (parsed[field] != null && !Array.isArray(parsed[field])) throw appError('IMPORT_INVALID', `${field}는 배열이어야 합니다.`);
  for (const field of ['prof', 'sr', 'rt', 'hard', 'clears', 'seen']) if (parsed[field] != null && !isPlainObject(parsed[field])) throw appError('IMPORT_INVALID', `${field} 형식이 올바르지 않습니다.`);
  if (parsed.sessions?.some(row => !isPlainObject(row))) throw appError('IMPORT_INVALID', 'sessions에 잘못된 행이 있습니다.');
  if (parsed.myTexts?.some(row => !isPlainObject(row) || typeof row.text !== 'string')) throw appError('IMPORT_INVALID', 'myTexts에 잘못된 글이 있습니다.');
  const importedTextTotal = (parsed.myTexts || []).reduce((sum, row) => sum + row.text.length, 0);
  if (importedTextTotal > MY_TEXT_TOTAL_MAX_CHARS) throw appError('IMPORT_INVALID', '가져온 글 본문 합계가 1,000,000자를 넘습니다.');
  if (parsed.seen && Object.values(parsed.seen).some(value => !Number.isInteger(value) || value < 0)) throw appError('IMPORT_INVALID', 'seen 횟수가 올바르지 않습니다.');

  const attempts = (parsed.attempts || []).map(row => normalizeAttempt(row, { importMode: true }));
  const ids = new Set();
  for (const row of attempts) {
    if (ids.has(row.attemptId)) throw appError('IMPORT_INVALID', '중복 attemptId가 있습니다.');
    ids.add(row.attemptId);
  }
  const output = structuredClone(parsed);
  output.attempts = attempts.slice().sort((a, b) => Date.parse(a.completedAt) - Date.parse(b.completedAt)).slice(-MAX_ATTEMPTS);
  if (output.myTexts) {
    const ids = new Set();
    output.myTexts = output.myTexts.map((row, index) => {
      const text = row.text;
      const detectedLang = /[㐀-鿿]/.test(text) ? 'zh' : 'en';
      const textLang = ['en', 'zh'].includes(row.lang) ? row.lang : detectedLang;
      let id = typeof row.id === 'string' && row.id.trim() ? row.id.trim() : 'imported-text-' + index;
      while (ids.has(id)) id += '-' + (index + 1);
      ids.add(id);
      const title = typeof row.title === 'string' && row.title.trim() ? row.title.trim() : text.trim().slice(0, 36);
      const unitCount = Number.isInteger(row.unit_count) && row.unit_count > 0
        ? row.unit_count
        : (textLang === 'zh' ? (text.match(/[㐀-鿿]/g) || []).length : (text.trim().match(/\S+/g) || []).length);
      const ts = Number.isFinite(row.ts) && row.ts >= 0 ? row.ts : now();
      return { ...row, id, title, lang: textLang, unit_count: unitCount, ts };
    });
  }
  return output;
}

export function exportJSON() { return JSON.stringify(state, null, 1); }
export function importJSON(text) {
  if (typeof text !== 'string' || text.length > 20000000) throw appError('IMPORT_INVALID', '가져올 데이터가 너무 크거나 문자열이 아닙니다.');
  let parsed;
  try { parsed = JSON.parse(text); } catch (cause) { throw appError('IMPORT_INVALID_JSON', 'JSON 형식이 올바르지 않습니다.', cause); }
  const validated = validateImport(parsed);
  const next = migrateState(validated).state;
  const previous = state;
  state = next;
  if (!save()) { state = previous; throw appError('STORAGE_WRITE_FAILED', '가져온 데이터를 저장하지 못했습니다.', lastSaveError); }
  return immutableClone({ schemaVersion: state.schemaVersion, attempts: state.attempts.length, myTexts: state.myTexts.length });
}
