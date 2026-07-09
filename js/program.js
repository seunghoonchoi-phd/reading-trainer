// ===== program.js — repeating four-step training cycle =====
import * as store from './store.js';
import {
  isBenchmarkAttempt,
  isColdTransferAttempt,
  provisionalDifficultyRecommendation,
  weakestQuestionType,
} from './metrics.js';

const GOALS = Object.freeze({ baseline: 2, weakness: 2, transfer: 1, reassessment: 2 });
const ORDER = Object.freeze(['baseline', 'weakness', 'transfer', 'reassessment']);

function timestamp(value = Date.now()) {
  const ms = value instanceof Date ? value.getTime() : (typeof value === 'string' ? Date.parse(value) : Number(value));
  return Number.isFinite(ms) ? ms : Date.now();
}

function addLocalDays(iso, days) {
  const date = new Date(iso);
  date.setDate(date.getDate() + days);
  return date.toISOString();
}

function emptyCycle() {
  return { phase: 'baseline', cycleStartedAt: null, nextReassessmentAt: null, done: { baseline: 0, weakness: 0, transfer: 0, reassessment: 0 } };
}

function isWeaknessPractice(attempt) {
  return attempt.completed === true
    && attempt.programStage === 'weakness'
    && attempt.targeted === true
    && typeof attempt.targetDrill === 'string'
    && attempt.targetDrill === attempt.drill
    && (!attempt.targetSubmode || attempt.targetSubmode === attempt.submode)
    && !isBenchmarkAttempt(attempt)
    && !isColdTransferAttempt(attempt);
}

export function qualifiesStageAttempt(attempt, stageId, { nextReassessmentAt = null } = {}) {
  if (!attempt || attempt.completed !== true) return false;
  if (stageId === 'baseline') {
    return isBenchmarkAttempt(attempt)
      && !attempt.transferPassageId
      && attempt.programStage !== 'reassessment';
  }
  if (stageId === 'weakness') return isWeaknessPractice(attempt);
  if (stageId === 'transfer') return isColdTransferAttempt(attempt);
  if (stageId === 'reassessment') {
    const due = Date.parse(nextReassessmentAt || '');
    const completedAt = Date.parse(attempt.completedAt || '');
    return Number.isFinite(due)
      && Number.isFinite(completedAt)
      && completedAt >= due
      && attempt.programStage === 'reassessment'
      && isBenchmarkAttempt(attempt)
      && !attempt.transferPassageId;
  }
  return false;
}

function advanceCycle(attempts, at) {
  let cycle = emptyCycle();
  for (const attempt of attempts) {
    const completedAt = Date.parse(attempt.completedAt || '');
    if (!Number.isFinite(completedAt) || completedAt > at || attempt.completed !== true) continue;

    if (cycle.phase === 'baseline') {
      if (qualifiesStageAttempt(attempt, 'baseline')) {
        if (!cycle.cycleStartedAt) cycle.cycleStartedAt = attempt.completedAt;
        cycle.done.baseline = Math.min(GOALS.baseline, cycle.done.baseline + 1);
        if (cycle.done.baseline >= GOALS.baseline) cycle.phase = 'weakness';
      }
      continue;
    }

    if (cycle.phase === 'weakness') {
      if (qualifiesStageAttempt(attempt, 'weakness')) {
        cycle.done.weakness = Math.min(GOALS.weakness, cycle.done.weakness + 1);
        if (cycle.done.weakness >= GOALS.weakness) cycle.phase = 'transfer';
      }
      continue;
    }

    if (cycle.phase === 'transfer') {
      if (qualifiesStageAttempt(attempt, 'transfer')) {
        cycle.done.transfer = 1;
        cycle.phase = 'reassessment';
        cycle.nextReassessmentAt = addLocalDays(cycle.cycleStartedAt || attempt.completedAt, 7);
      }
      continue;
    }

    if (cycle.phase === 'reassessment') {
      if (qualifiesStageAttempt(attempt, 'reassessment', { nextReassessmentAt: cycle.nextReassessmentAt })) {
        cycle.done.reassessment = Math.min(GOALS.reassessment, cycle.done.reassessment + 1);
        if (cycle.done.reassessment >= GOALS.reassessment) cycle = emptyCycle();
      }
    }
  }
  return cycle;
}

export function cycleStatus(lang, at = Date.now()) {
  const atMs = timestamp(at);
  const attempts = store.attemptsFor(lang).slice().sort((a, b) => Date.parse(a.completedAt) - Date.parse(b.completedAt));
  const cycle = advanceCycle(attempts, atMs);
  const phaseIndex = ORDER.indexOf(cycle.phase);
  const dueMs = Date.parse(cycle.nextReassessmentAt || '');
  const stages = ORDER.map((id, index) => {
    const done = cycle.done[id];
    let status = 'pending';
    if (done >= GOALS[id]) status = 'done';
    else if (index === phaseIndex) status = id === 'reassessment' && Number.isFinite(dueMs) && atMs < dueMs ? 'scheduled' : 'active';
    return Object.freeze({ id, status, done, goal: GOALS[id], locked: false });
  });
  return Object.freeze({
    phase: cycle.phase,
    cycleStartedAt: cycle.cycleStartedAt,
    stages: Object.freeze(stages),
    nextReassessmentAt: cycle.nextReassessmentAt,
    locked: false,
  });
}

function weaknessPrescription(lang, cycle = null) {
  const startedAt = Date.parse(cycle?.cycleStartedAt || '');
  const currentBaseline = store.attemptsFor(lang).filter(attempt => (
    qualifiesStageAttempt(attempt, 'baseline')
    && (!Number.isFinite(startedAt) || Date.parse(attempt.completedAt) >= startedAt)
  )).slice(-GOALS.baseline);
  const weakest = weakestQuestionType(currentBaseline, { lang, submode: 'accuracy' });
  if (weakest === 'main_idea') return Object.freeze({ drillId: 'modes', targetSubmode: 'gist', weaknessType: weakest });
  if (weakest === 'inference') return Object.freeze({ drillId: 'context', targetSubmode: null, weaknessType: weakest });
  if (weakest === 'detail') return Object.freeze({ drillId: 'retrieval', targetSubmode: null, weaknessType: weakest });
  return Object.freeze({ drillId: lang === 'zh' ? 'zhseg' : 'chunk', targetSubmode: null, weaknessType: 'reading_support' });
}

export function buildDailyPlan(lang, at = Date.now()) {
  const status = cycleStatus(lang, at);
  const reassessmentStage = status.stages.find(stage => stage.id === 'reassessment');
  const waiting = status.phase === 'reassessment' && reassessmentStage?.status === 'scheduled';
  const planPhase = waiting ? 'maintenance' : status.phase;
  const weakness = weaknessPrescription(lang, status);
  const focusPrescription = waiting || status.phase === 'weakness'
    ? weakness
    : status.phase === 'transfer'
      ? Object.freeze({ drillId: 'repeated', targetSubmode: null, weaknessType: null })
      : Object.freeze({ drillId: 'err', targetSubmode: null, weaknessType: null });
  const prepare = status.phase === 'transfer' ? 'retrieval' : 'vocab';
  const transfer = 'retrieval';
  const focusStage = waiting ? null : status.phase;
  return Object.freeze([
    Object.freeze({ slot: 'prepare', drillId: prepare, minutes: 2, reasonKey: `prepare.${planPhase}`, completionStage: null, programStage: null, locked: false }),
    Object.freeze({
      slot: 'focus', drillId: focusPrescription.drillId, minutes: 5, reasonKey: `focus.${planPhase}`,
      completionStage: focusStage, programStage: focusStage, targeted: focusStage === 'weakness',
      targetDrill: focusStage === 'weakness' ? focusPrescription.drillId : null,
      targetSubmode: focusStage === 'weakness' ? focusPrescription.targetSubmode : null,
      weaknessType: focusStage === 'weakness' ? focusPrescription.weaknessType : null,
      locked: false,
    }),
    Object.freeze({ slot: 'transfer', drillId: transfer, minutes: 3, reasonKey: `transfer.${planPhase}`, completionStage: null, programStage: null, locked: false }),
  ]);
}

export function difficultyRecommendation(lang) {
  return provisionalDifficultyRecommendation(store.attemptsFor(lang), { lang });
}

export const PROGRAM_STAGE_ORDER = ORDER;
