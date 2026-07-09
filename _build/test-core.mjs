import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

class MemoryStorage {
  constructor() { this.map = new Map(); this.failWrites = false; }
  getItem(key) { return this.map.has(key) ? this.map.get(key) : null; }
  setItem(key, value) {
    if (this.failWrites) throw new Error('quota');
    this.map.set(key, String(value));
  }
  removeItem(key) { this.map.delete(key); }
  clear() { this.map.clear(); }
}

const storage = new MemoryStorage();
globalThis.localStorage = storage;

const fixtures = {
  'data/passages.json': JSON.parse(await readFile(new URL('../data/passages.json', import.meta.url), 'utf8')),
  'data/vocab_en.json': JSON.parse(await readFile(new URL('../data/vocab_en.json', import.meta.url), 'utf8')),
  'data/vocab_zh.json': JSON.parse(await readFile(new URL('../data/vocab_zh.json', import.meta.url), 'utf8')),
  'data/seg_zh.json': JSON.parse(await readFile(new URL('../data/seg_zh.json', import.meta.url), 'utf8')),
};
globalThis.fetch = async path => ({ ok: !!fixtures[path], json: async () => structuredClone(fixtures[path]) });

const store = await import('../js/store.js');
const metrics = await import('../js/metrics.js');
const content = await import('../js/content.js');
const program = await import('../js/program.js');
const levels = await import('../js/levels.js');

let assertions = 0;
function check(condition, message) { assert.ok(condition, message); assertions++; }
function equal(actual, expected, message) { assert.equal(actual, expected, message); assertions++; }
function throwsCode(fn, code) {
  assert.throws(fn, error => error?.code === code, `expected ${code}`);
  assertions++;
}

function iso(day, minute = 0) { return new Date(Date.UTC(2026, 0, day, 1, minute)).toISOString(); }
function attempt(overrides = {}) {
  const completedAt = overrides.completedAt || iso(1, 2);
  return {
    schemaVersion: 3,
    attemptId: overrides.attemptId || `test-${Math.random().toString(36).slice(2)}`,
    lang: 'en', difficulty: 3, tier: 3,
    drill: 'err', submode: 'accuracy',
    startedAt: overrides.startedAt || new Date(Date.parse(completedAt) - 60000).toISOString(),
    completedAt,
    benchmark: true, novelAtStart: true, assisted: false, timingValid: true, completed: true,
    sourcePassageId: 'en3-a', transferPassageId: null,
    units: 100, elapsedMs: 60000, rate: 100,
    correct: 4, total: 5,
    questionTypes: { main_idea: { correct: 1, total: 1 }, inference: { correct: 1, total: 1 }, detail: { correct: 2, total: 3 } },
    fatigue: 2,
    ...overrides,
  };
}

// Migration preserves legacy data and treats old level as a preference only.
const oversizedLegacyText = '가'.repeat(100001);
store.importJSON(JSON.stringify({
  settings: { lang: 'en', theme: 'dark', level: { en: 'beginner', zh: 'overload' } },
  prof: { en: { err: [{ wpm: 999 }], pace: {}, ceiling: {}, coverage: null }, zh: { err: [], pace: {}, ceiling: {}, coverage: null } },
  sessions: [{ ts: Date.now(), lang: 'en', drill: 'legacy' }],
  clears: { en: { old: { at: iso(1) } }, zh: {} },
  myTexts: [{ id: 'legacy-long', ts: 1, lang: 'en', title: 'legacy', text: oversizedLegacyText }],
}));
equal(store.getState().schemaVersion, 3, 'schema migrated');
equal(store.getDifficulty('en'), 1, 'beginner preference maps to 1');
equal(store.getDifficulty('zh'), 6, 'overload preference maps to 6');
equal(store.getDifficultySource('en'), 'legacy-preference', 'legacy source retained');
equal(store.myTexts()[0].text.length, 100001, 'existing oversized user text preserved');
equal(store.getState().sessions.length, 1, 'legacy sessions preserved');
equal(store.getState().prof.en.err.length, 1, 'legacy ERR preserved');
store.setDifficulty('en', 4, 'manual');
store.importJSON(store.exportJSON());
equal(store.getDifficulty('en'), 4, 'legacy preference migration runs only once');
equal(store.getDifficultySource('en'), 'manual', 'manual difficulty source survives reload');

equal(levels.difficultyFromLegacyLevel('starter'), 1, 'starter maps to 1');
equal(levels.difficultyFromLegacyLevel('intermediate'), 3, 'intermediate maps to 3');
equal(levels.difficultyFromLegacyLevel('advanced'), 5, 'advanced maps to 5');
equal(levels.DIFFICULTIES[6].description.en, 'Advanced & specialist', 'public English label');

// addAttempt attaches identifiers, deep-copies input, freezes output, and keeps unknown question types.
store.resetProgress();
const source = attempt({ attemptId: undefined, schemaVersion: undefined, completedAt: undefined, startedAt: new Date(Date.now() - 1000).toISOString(), questionTypes: { rhetoric: { correct: 1, total: 2 } } });
delete source.attemptId; delete source.schemaVersion; delete source.completedAt;
const saved = store.addAttempt(source);
equal(saved.schemaVersion, 3, 'schema attached');
check(typeof saved.attemptId === 'string' && saved.attemptId.length > 0, 'attempt id attached');
check(typeof saved.completedAt === 'string', 'completion time attached');
check(Object.isFrozen(saved) && Object.isFrozen(saved.questionTypes), 'returned attempt deeply frozen');
check(Object.isFrozen(store.getState().attempts), 'ledger array rejects in-place mutation');
source.questionTypes.rhetoric.correct = 0;
equal(store.attemptsFor('en')[0].questionTypes.rhetoric.correct, 1, 'saved row immutable from caller mutation');
const inferredInput = attempt({ attemptId: 'inferred-time', benchmark: false, submode: 'repeat', correct: null, total: 0, questionTypes: {}, elapsedMs: 45000 });
delete inferredInput.startedAt; delete inferredInput.completedAt;
const inferred = store.addAttempt(inferredInput);
equal(Date.parse(inferred.completedAt) - Date.parse(inferred.startedAt), 45000, 'missing start inferred from elapsed time');
equal(inferred.total, null, 'questionless null/zero normalized to null/null');

const beforeFailure = store.attemptsFor().length;
storage.failWrites = true;
throwsCode(() => store.addAttempt(attempt({ attemptId: 'quota-fail' })), 'STORAGE_WRITE_FAILED');
storage.failWrites = false;
equal(store.attemptsFor().length, beforeFailure, 'failed write rolled back');
const themeBeforeFailure = store.getSetting('theme');
storage.failWrites = true;
equal(store.setSetting('theme', 'light'), false, 'failed setting write is reported');
storage.failWrites = false;
equal(store.getSetting('theme'), themeBeforeFailure, 'failed setting write rolled back');

// Import validation rejects malformed rows and trims the oldest attempts only.
const stateForImport = JSON.parse(store.exportJSON());
stateForImport.attempts = Array.from({ length: 1002 }, (_, index) => attempt({
  attemptId: `cap-${index}`,
  completedAt: new Date(Date.UTC(2025, 0, 1, 0, index)).toISOString(),
  startedAt: new Date(Date.UTC(2025, 0, 1, 0, index) - 1000).toISOString(),
}));
store.importJSON(JSON.stringify(stateForImport));
equal(store.attemptsFor().length, 1000, 'attempt cap enforced');
equal(store.attemptsFor()[0].attemptId, 'cap-2', 'oldest attempts trimmed first');
const malformed = JSON.parse(store.exportJSON());
malformed.attempts[0].lang = 'ko';
throwsCode(() => store.importJSON(JSON.stringify(malformed)), 'ATTEMPT_INVALID');
equal(store.attemptsFor()[0].attemptId, 'cap-2', 'invalid import leaves state unchanged');
const malformedSettings = JSON.parse(store.exportJSON());
malformedSettings.settings.theme = 'sepia';
throwsCode(() => store.importJSON(JSON.stringify(malformedSettings)), 'IMPORT_INVALID');
const oversizedImport = JSON.parse(store.exportJSON());
oversizedImport.myTexts = [{ text: 'x'.repeat(1000001) }];
throwsCode(() => store.importJSON(JSON.stringify(oversizedImport)), 'IMPORT_INVALID');
const normalizedImport = JSON.parse(store.exportJSON());
normalizedImport.myTexts = [{ text: 'Imported text with enough words to derive safe metadata.' }];
store.importJSON(JSON.stringify(normalizedImport));
check(store.myTexts()[0].id.startsWith('imported-text-'), 'import supplies a stable text id');
equal(store.myTexts()[0].lang, 'en', 'import detects a missing text language');
check(store.myTexts()[0].unit_count > 0, 'import derives missing unit count');

// New user-text writes are bounded while legacy oversized text remains importable.
store.resetEverything();
const textRow = store.addMyText({ lang: 'en', title: 'ok', text: 'This is a valid user text with enough characters.' });
check(Object.isFrozen(textRow), 'saved user text frozen');
throwsCode(() => store.addMyText({ lang: 'en', text: 'too short' }), 'MY_TEXT_TOO_SHORT');
throwsCode(() => store.addMyText({ lang: 'en', text: 'x'.repeat(100001) }), 'MY_TEXT_TOO_LARGE');
storage.failWrites = true;
throwsCode(() => store.addMyText({ lang: 'en', text: 'This write is long enough but storage will fail.' }), 'STORAGE_WRITE_FAILED');
storage.failWrites = false;
equal(store.myTexts().length, 1, 'failed user-text write rolled back');
const withNearLimit = JSON.parse(store.exportJSON());
withNearLimit.myTexts = [{ id: 'legacy-near-limit', ts: 1, lang: 'en', text: 'x'.repeat(999990) }];
store.importJSON(JSON.stringify(withNearLimit));
throwsCode(() => store.addMyText({ lang: 'en', text: 'y'.repeat(20) }), 'MY_TEXT_TOTAL_LIMIT');

// Local date uses the device calendar date rather than UTC; interrupted attempts do not touch streaks.
const localMidnight = new Date(2026, 0, 2, 0, 30);
equal(store.localDateKey(localMidnight), '2026-01-02', 'local calendar key');
if (localMidnight.toISOString().slice(0, 10) !== '2026-01-02') assertions++;
store.resetEverything();
store.addAttempt(attempt({ attemptId: 'interrupted', completedAt: iso(2), startedAt: iso(2, -1), completed: false }));
equal(store.streakFor('en', iso(2)).count, 0, 'interrupted attempt excluded from streak');
store.addAttempt(attempt({ attemptId: 'day-2', completedAt: iso(2), startedAt: iso(2, -1) }));
equal(store.streakFor('en', iso(2)).count, 1, 'completed attempt starts streak');
store.addAttempt(attempt({ attemptId: 'day-4', completedAt: iso(4), startedAt: iso(4, -1) }));
equal(store.streakFor('en', iso(4)).count, 1, 'long gap does not use a freeze');
equal(store.streakFor('en', iso(10)).count, 0, 'stale streak is not displayed as current');
equal(store.streakFor('zh', iso(4)).count, 0, 'language streaks separated');

// Content selection honors exposure, exclusions, tier, and domain, never faking unseen fallback.
await content.loadContent();
store.resetEverything();
store.setDifficulty('en', 1);
const first = content.pickUnseenPassage('en', { tier: 1 });
check(first && first.lang === 'en' && first.tier === 1, 'unseen picker returns requested tier');
store.markSeen(first.id);
const second = content.pickUnseenPassage('en', { tier: 1, excludeIds: [first.id] });
check(second && second.id !== first.id, 'unseen picker excludes prior passage');
for (const passage of content.passagesFor('en', 1)) store.markSeen(passage.id);
equal(content.pickUnseenPassage('en', { tier: 1 }), null, 'no unseen candidate returns null');

store.resetEverything();
const relatedBase = content.passagesFor('en', 4).find(passage => (passage.domain || 'general') === 'general');
const related = content.relatedPassage(relatedBase, { unseenOnly: true, domain: 'general' });
check(related && related.id !== relatedBase.id && (related.domain || 'general') === 'general', 'related unseen passage keeps domain');
for (const passage of content.passagesFor('en', 4).filter(row => row.id !== relatedBase.id && (row.domain || 'general') === 'general')) store.markSeen(passage.id);
equal(content.relatedPassage(relatedBase, { unseenOnly: true, domain: 'general' }), null, 'related unseen exhaustion returns null');

// Measurement stays denominator-independent and separates languages and timing errors.
const rows = [
  attempt({ attemptId: 'm1', units: 100, rate: 100, correct: 4, total: 5, completedAt: iso(1) }),
  attempt({ attemptId: 'm2', units: 200, rate: 200, correct: 4, total: 4, completedAt: iso(2) }),
  attempt({ attemptId: 'm3', units: 300, rate: 300, correct: 3, total: 5, completedAt: iso(3) }),
  attempt({ attemptId: 'bad-time', units: 999, rate: 999, correct: 5, total: 5, timingValid: false, completedAt: iso(4) }),
  attempt({ attemptId: 'zh', lang: 'zh', units: 500, rate: 500, correct: 5, total: 5, completedAt: iso(5) }),
];
equal(metrics.maintainedRate(rows, { lang: 'en' }).rate, 150, 'maintained rate is median of >=80% valid EN attempts');
equal(metrics.maintainedRate(rows, { lang: 'en' }).count, 2, 'invalid timing and <80% excluded');
equal(metrics.speedAndComprehension(rows, { lang: 'en', submode: 'accuracy' }).medianRate, 200, 'speed reported separately');
equal(metrics.speedAndComprehension(rows, { lang: 'en', submode: 'accuracy' }).meanComprehension, (0.8 + 1 + 0.6) / 3, 'comprehension reported separately');
equal(metrics.questionTypeAccuracy([attempt({ questionTypes: { rhetoric: { correct: 1, total: 2 } } })]).rhetoric.total, 2, 'unknown question type preserved');
equal(metrics.isColdTransferAttempt(attempt({ benchmark: false, sourcePassageId: 'same', transferPassageId: 'same' })), false, 'same passage is never cold transfer');
equal(metrics.isColdTransferAttempt(attempt({ benchmark: false, sourcePassageId: 'a', transferPassageId: 'b', novelAtStart: false })), false, 'previously seen passage is never cold transfer');
equal(metrics.recommendAdjustment(rows.slice(0, 2), { lang: 'en' }).action, 'increase', 'two >=80% low-fatigue results raise rate 5%');
equal(metrics.recommendAdjustment([attempt({ correct: 3, total: 5 })]).action, 'hold', '60–79% holds');
equal(metrics.recommendAdjustment([attempt({ correct: 2, total: 4 })]).action, 'decrease', '<60% lowers one axis');
equal(metrics.recommendAdjustment([attempt({ correct: 5, total: 5, fatigue: 4 })]).axis, 'rate', 'high fatigue lowers rate axis only');
equal(metrics.recommendAdjustment([
  attempt({ fatigue: null }),
  attempt({ fatigue: null, completedAt: iso(2) }),
]).action, 'hold', 'missing fatigue never counts as low fatigue for a pace increase');
equal(metrics.isBenchmarkAttempt(attempt({ units: null, elapsedMs: null, rate: 500 })), false, 'benchmark requires measured units and elapsed time');
equal(metrics.isBenchmarkAttempt(attempt({ units: 100, elapsedMs: 1000, rate: 6000 })), false, 'benchmark rejects an impossible completion time');
equal(metrics.isBenchmarkAttempt(attempt({ units: 100, elapsedMs: 60000, rate: 500 })), false, 'benchmark rejects a rate inconsistent with units and time');
equal(metrics.isBenchmarkAttempt(attempt({ difficulty: 3, tier: 6, assessmentFallback: false })), false, 'benchmark rejects an unexplained tier mismatch');
equal(metrics.isBenchmarkAttempt(attempt({ difficulty: 3, tier: 6, assessmentFallback: true })), true, 'benchmark permits an explicitly recorded assessment fallback');
equal(metrics.provisionalDifficultyRecommendation(rows.slice(0, 2), { lang: 'en' }).ready, false, 'two benchmarks are insufficient for difficulty');
const placement = metrics.provisionalDifficultyRecommendation([
  attempt({ difficulty: 3, correct: 4, total: 5 }),
  attempt({ difficulty: 3, correct: 4, total: 5, completedAt: iso(2) }),
  attempt({ difficulty: 3, correct: 5, total: 5, completedAt: iso(3) }),
], { lang: 'en' });
equal(placement.ready, true, 'three benchmarks ready');
equal(placement.confidence, 'provisional', 'difficulty remains provisional');
const lowPlacement = metrics.provisionalDifficultyRecommendation([
  attempt({ difficulty: 3, tier: 3, correct: 1, total: 5 }),
  attempt({ difficulty: 3, tier: 3, correct: 2, total: 5, completedAt: iso(2) }),
  attempt({ difficulty: 3, tier: 3, correct: 1, total: 5, completedAt: iso(3) }),
], { lang: 'en' });
equal(lowPlacement.difficulty, 3, 'low comprehension lowers rate only, not app difficulty');
const missingFatiguePlacement = metrics.provisionalDifficultyRecommendation([
  attempt({ difficulty: 3, tier: 3, correct: 5, total: 5, fatigue: null }),
  attempt({ difficulty: 3, tier: 3, correct: 5, total: 5, fatigue: null, completedAt: iso(2) }),
  attempt({ difficulty: 3, tier: 3, correct: 5, total: 5, fatigue: null, completedAt: iso(3) }),
], { lang: 'en' });
equal(missingFatiguePlacement.difficulty, 3, 'missing fatigue never promotes app difficulty');

store.resetEverything();
store.setDifficulty('en', 3, 'manual');
store.seedPace('en', 3, 200);
equal(store.updatePace('en', 3, 0.8, 2).dir, 'hold', 'one maintained result holds pace');
equal(store.updatePace('en', 3, 0.8, 3).dir, 'up', 'two maintained low-fatigue results raise pace');
equal(store.updatePace('en', 3, 0.7, 2).dir, 'hold', '60-79 percent holds pace');
equal(store.updatePace('en', 3, 0.5, 2).dir, 'down', 'below 60 percent lowers pace');
equal(store.updatePace('en', 3, 0.9, 4).dir, 'down', 'high fatigue lowers pace even with high comprehension');

const legacyPaceState = JSON.parse(store.exportJSON());
legacyPaceState.prof.en.pace[3] = { pace: 200, run: [0.9] };
store.importJSON(JSON.stringify(legacyPaceState));
store.seedPace('en', 3, 200);
equal(store.updatePace('en', 3, 0.8, 2).dir, 'hold', 'legacy pace sample cannot combine with one v3 result');
equal(store.getState().prof.en.pace[3].run.length, 1, 'first v3 seed clears the legacy adjustment run');

store.resetEverything();
const invalidImported = attempt({ attemptId: 'invalid-imported-benchmark', units: null, elapsedMs: null, rate: 500 });
delete invalidImported.timingValid;
const invalidImportState = JSON.parse(store.exportJSON());
invalidImportState.attempts = [invalidImported];
store.importJSON(JSON.stringify(invalidImportState));
equal(store.attemptsFor('en')[0].timingValid, false, 'import does not invent timing validity');
equal(metrics.isBenchmarkAttempt(store.attemptsFor('en')[0]), false, 'invalid imported benchmark cannot affect metrics');
equal(program.cycleStatus('en', iso(2)).stages[0].done, 0, 'invalid imported benchmark cannot advance the program');

// Four-step cycle is ordered, unlocked, weekly, and language-specific.
store.resetEverything();
const mainIdeaWeak = { main_idea: { correct: 0, total: 1 }, inference: { correct: 1, total: 1 }, detail: { correct: 3, total: 3 } };
store.addAttempt(attempt({ attemptId: 'b1', completedAt: iso(1), questionTypes: mainIdeaWeak }));
store.addAttempt(attempt({ attemptId: 'b2', completedAt: iso(1, 5), questionTypes: mainIdeaWeak }));
let cycle = program.cycleStatus('en', iso(2));
equal(cycle.phase, 'weakness', 'two baseline benchmarks complete phase 1');
check(cycle.stages.every(stage => stage.locked === false), 'all four stages unlocked');
const weaknessFocus = program.buildDailyPlan('en', iso(2)).find(item => item.slot === 'focus');
equal(weaknessFocus.drillId, 'modes', 'main-idea weakness prescribes purpose reading');
equal(weaknessFocus.targetSubmode, 'gist', 'main-idea weakness opens gist directly');
store.addAttempt(attempt({
  attemptId: 'wrong-weakness', benchmark: false, programStage: 'weakness', targeted: true,
  targetDrill: 'modes', targetSubmode: 'gist', weaknessType: 'main_idea', drill: 'modes', submode: 'locate',
  correct: 1, total: 1, questionTypes: { locate: { correct: 1, total: 1 } }, completedAt: iso(2),
}));
equal(program.cycleStatus('en', iso(2, 1)).stages[1].done, 0, 'off-target submode does not complete weakness practice');
store.addAttempt(attempt({
  attemptId: 'w1', benchmark: false, programStage: 'weakness', targeted: true,
  targetDrill: 'modes', targetSubmode: 'gist', weaknessType: 'main_idea', drill: 'modes', submode: 'gist',
  correct: 1, total: 1, questionTypes: { main_idea: { correct: 1, total: 1 } }, completedAt: iso(2, 2),
}));
store.addAttempt(attempt({
  attemptId: 'w2', benchmark: false, programStage: 'weakness', targeted: true,
  targetDrill: 'modes', targetSubmode: 'gist', weaknessType: 'main_idea', drill: 'modes', submode: 'gist',
  correct: 1, total: 1, questionTypes: { main_idea: { correct: 1, total: 1 } }, completedAt: iso(2, 5),
}));
equal(program.cycleStatus('en', iso(3)).phase, 'transfer', 'two targeted practices complete phase 2');
store.addAttempt(attempt({
  attemptId: 't1', benchmark: false, programStage: 'transfer', sourcePassageId: 'source-a', transferPassageId: 'transfer-b',
  novelAtStart: true, assisted: false, correct: 3, total: 5, completedAt: iso(3),
}));
cycle = program.cycleStatus('en', iso(4));
equal(cycle.phase, 'reassessment', 'valid cold transfer completes phase 3');
equal(cycle.stages[3].status, 'scheduled', 'weekly reassessment waits until due');
const due = Date.parse(cycle.nextReassessmentAt);
store.addAttempt(attempt({ attemptId: 'r1', programStage: 'reassessment', completedAt: new Date(due + 1000).toISOString(), startedAt: new Date(due).toISOString() }));
equal(program.cycleStatus('en', due + 1500).stages[3].done, 1, 'first weekly reassessment counted');
store.addAttempt(attempt({ attemptId: 'r2', programStage: 'reassessment', completedAt: new Date(due + 2000).toISOString(), startedAt: new Date(due + 1500).toISOString() }));
equal(program.cycleStatus('en', due + 3000).phase, 'baseline', 'completed cycle repeats from baseline');
store.addAttempt(attempt({ attemptId: 'zh-b1', lang: 'zh', completedAt: new Date(due + 4000).toISOString(), startedAt: new Date(due + 3000).toISOString() }));
equal(program.cycleStatus('zh', due + 5000).stages[0].done, 1, 'ZH benchmark counted separately');
equal(program.cycleStatus('en', due + 5000).stages[0].done, 0, 'EN cycle unaffected by ZH');
equal(program.buildDailyPlan('en', due + 5000).reduce((sum, item) => sum + item.minutes, 0), 10, 'daily plan totals 10 minutes');
equal(program.difficultyRecommendation('zh').ready, false, 'language-specific difficulty evidence');

storage.setItem('readfast.v2', '{broken-json');
const corruptStore = await import('../js/store.js?corrupt-load-check=1');
equal(storage.getItem('readfast.v2'), '{broken-json', 'corrupt legacy payload is not overwritten during load');
const loadIssue = corruptStore.getLoadIssue();
equal(loadIssue.code, 'STORAGE_CORRUPT', 'corrupt payload exposes a recovery issue');
equal(storage.getItem(loadIssue.recoveryKey), '{broken-json', 'corrupt payload is copied to a separate recovery key');
equal(corruptStore.setDifficulty('en', 1, 'manual'), false, 'writes stay blocked before explicit recovery');
equal(storage.getItem('readfast.v2'), '{broken-json', 'blocked write preserves the corrupt source');
equal(corruptStore.startFreshAfterCorruption(), true, 'explicit recovery can start a fresh state');
equal(JSON.parse(storage.getItem('readfast.v2')).schemaVersion, 3, 'fresh state is written only after explicit recovery');
equal(storage.getItem(loadIssue.recoveryKey), '{broken-json', 'recovery copy remains after starting fresh');

const semanticCorruptPayloads = [
  '[]',
  '"broken-shape"',
  '123',
  JSON.stringify({ schemaVersion: 4, settings: { lang: 'en' } }),
  JSON.stringify({ schemaVersion: 3, settings: { lang: 'ko' } }),
];
for (let index = 0; index < semanticCorruptPayloads.length; index++) {
  const payload = semanticCorruptPayloads[index];
  storage.setItem('readfast.v2', payload);
  const semanticStore = await import(`../js/store.js?semantic-corrupt-${index}`);
  equal(semanticStore.getLoadIssue()?.code, 'STORAGE_CORRUPT', `semantic corruption ${index + 1} opens recovery`);
  equal(storage.getItem('readfast.v2'), payload, `semantic corruption ${index + 1} is not overwritten`);
  equal(semanticStore.setDifficulty('en', 2, 'manual'), false, `semantic corruption ${index + 1} blocks writes`);
  equal(semanticStore.startFreshAfterCorruption(), true, `semantic corruption ${index + 1} requires explicit fresh start`);
}

console.log(`core tests passed: ${assertions} assertions`);
