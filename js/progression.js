// ===== progression.js — compatibility view over the repeating four-step cycle =====
// Legacy clears remain in storage but never drive v3 mastery or recommendations.
import * as store from './store.js';
import { buildDailyPlan, cycleStatus } from './program.js';

const DEFINITIONS = Object.freeze({
  baseline: Object.freeze({ drillId: 'err', gate: '처음 보는 글로 기준선 2회 측정' }),
  weakness: Object.freeze({ drillId: 'chunk', gate: '가장 약한 읽기 기술을 2회 집중 훈련' }),
  transfer: Object.freeze({ drillId: 'repeated', gate: '보조 없이 처음 보는 다른 글로 전이 1회 확인' }),
  reassessment: Object.freeze({ drillId: 'err', gate: '한 주 뒤 처음 보는 글로 2회 재측정' }),
});

export const ALL_DRILL_IDS = Object.freeze([
  'vocab', 'zhchar', 'zhseg', 'chunk', 'sentence', 'err', 'repeated',
  'conquer', 'context', 'modes', 'preview', 'retrieval', 'triage',
]);

// Kept so older boot code can call it safely. No legacy stamp is created.
export function seedClears() { return false; }

export function path(lang, at = Date.now()) {
  const cycle = cycleStatus(lang, at);
  const focus = buildDailyPlan(lang, at).find(item => item.slot === 'focus');
  const stages = cycle.stages.map((stage, index) => {
    const definition = DEFINITIONS[stage.id];
    const drillId = stage.id === 'weakness' ? focus.drillId : definition.drillId;
    return Object.freeze({
      key: stage.id,
      drillId,
      gate: definition.gate,
      cur: stage.done,
      goal: stage.goal,
      detail: `${stage.done}/${stage.goal}`,
      cleared: stage.status === 'done',
      unlocked: true,
      locked: false,
      status: stage.status,
      idx: index + 1,
    });
  });
  return Object.freeze({
    stages: Object.freeze(stages),
    clearedCount: stages.filter(stage => stage.cleared).length,
    total: stages.length,
    conquered: false,
    level: store.getLevel(lang) || 'builder',
    difficulty: store.getDifficulty(lang),
    nextLevel: null,
    phase: cycle.phase,
    cycleStartedAt: cycle.cycleStartedAt,
    nextReassessmentAt: cycle.nextReassessmentAt,
  });
}

export function activeStage(lang, at = Date.now()) {
  return path(lang, at).stages.find(stage => stage.status === 'active' || stage.status === 'scheduled') || null;
}

export function unlockedDrillIds() { return ALL_DRILL_IDS.slice(); }
