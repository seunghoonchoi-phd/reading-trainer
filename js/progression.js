// ===== progression.js — 도장깨기: 위→아래 순차 정복 경로 =====
// "클리어"는 출석이 아니라 측정된 성취(기준 통과)다. 판정은 기존 훈련 기록에서
// 소급 파생되므로 별도 저장이 없고, 이미 달성한 사용자는 자동으로 체크된다.
// 읽기 단계(ERR·반복·정복)는 현재 레벨의 티어 창 기준으로 판정 — 레벨을 올리면
// 그 단계들은 새 난이도에서 다시 깨야 한다(레벨마다 새 도장).
import * as store from './store.js';
import * as content from './content.js';
import { levelOf, LEVEL_ORDER, LEVELS } from './levels.js';

// ---- 판정 유틸 ----
const sess = (lang, pred) => store.getState().sessions.filter(s => s.lang === lang && pred(s));
const count = (lang, pred) => sess(lang, pred).length;

function maturedCards(lang) {
  const deck = store.getState().sr['vocab-' + lang] || {};
  return Object.values(deck).filter(c => c.reps >= 2).length;
}
function errPasses(lang) {
  const win = content.tiersFor(lang);
  const top = win[win.length - 1];
  const rows = store.errSeries(lang, 'full').filter(r => r.comp >= 0.8 && win.includes(r.tier));
  return { n: rows.length, top: rows.filter(r => r.tier === top).length };
}

// ---- 단계 정의 (위에서 아래로 — 커버리지 → 속도 → 전략 → 최종 관문) ----
// 각 단계: { drillId, gate: '클리어 조건 설명', check(lang) -> {cur, goal, unit} }
const STAGE_DEFS = {
  vocab: {
    drillId: 'vocab', gate: '어휘 카드 25장 성숙(2회 이상 복습) + 어휘판단 정확도 85% 이상 1회',
    check(lang) {
      const cards = Math.min(maturedCards(lang), 25);
      const ld = count(lang, s => s.drill === 'vocab-ld' && s.acc >= 0.85) > 0 ? 1 : 0;
      return { cur: cards + ld, goal: 26, detail: `카드 ${cards}/25 · 어휘판단 ${ld}/1` };
    },
  },
  zhchar: {
    drillId: 'zhchar', gate: '글자 인지속도 12문제 중 10개 이상 정답 1회',
    check() {
      const best = Math.max(0, ...sess('zh', s => s.drill === 'zhchar-naming').map(s => s.correct || 0));
      return { cur: Math.min(best, 10), goal: 10, detail: `최고 ${best}/12 정답 (10 이상이면 정복)` };
    },
  },
  zhseg: {
    drillId: 'zhseg', gate: '단어 분할 평균 경계 정확도 85% 이상 1회',
    check() {
      const best = Math.max(0, ...sess('zh', s => s.drill === 'zhseg').map(s => Math.round((s.acc || 0) * 100)));
      return { cur: Math.min(best, 85), goal: 85, detail: `최고 ${best}% (85% 이상이면 정복)` };
    },
  },
  chunk: {
    drillId: 'chunk', gate: '비계 1→2→3단계를 각각 이해 유지로 통과 (점진 자립)',
    check(lang) {
      const done = [1, 2, 3].filter(n => count(lang, s => s.drill === 'chunk' && s.scaffold === n && s.pass) > 0);
      return { cur: done.length, goal: 3, detail: `비계 ${done.length ? done.join('·') : '없음'} 통과 / 1·2·3 전부` };
    },
  },
  sentence: {
    drillId: 'sentence', gate: '문장 검증 6문제 중 5개 이상 정답 2회',
    check(lang) {
      const n = count(lang, s => s.drill === 'sentence' && (s.acc || 0) >= 5 / 6);
      return { cur: Math.min(n, 2), goal: 2, detail: `${n}/2회` };
    },
  },
  err: {
    drillId: 'err', gate: '내 레벨 난이도에서 이해 80% 이상 정독 3회 — 그중 1회는 레벨 최상단 난이도로 (점진 상승)',
    check(lang) {
      const p = errPasses(lang);
      const cur = Math.min(p.n, 3) + (p.top > 0 ? 1 : 0);
      return { cur, goal: 4, detail: `통과 ${Math.min(p.n, 3)}/3 · 최상단 ${p.top > 0 ? 1 : 0}/1` };
    },
  },
  repeated: {
    drillId: 'repeated', gate: '반복읽기 후 새 지문(전이)에서 이해를 유지해 ERR 점수 획득 1회',
    check(lang) {
      const n = count(lang, s => s.drill === 'repeated' && s.transfer && (s.err || 0) > 0);
      return { cur: Math.min(n, 1), goal: 1, detail: n ? '전이 성공' : '아직 없음' };
    },
  },
  conquer: {
    drillId: 'conquer', gate: '정복 모드 전 과정(1차 독해→반복→전이)에서 "정복 ✓" 판정 1회',
    check(lang) {
      const n = count(lang, s => s.drill === 'conquer' && s.credited);
      return { cur: Math.min(n, 1), goal: 1, detail: n ? '정복 판정 획득' : '아직 없음' };
    },
  },
  context: {
    drillId: 'context', gate: '문맥 추론 75% 이상 2회',
    check(lang) {
      const n = count(lang, s => s.drill === 'context' && (s.acc || 0) >= 0.75);
      return { cur: Math.min(n, 2), goal: 2, detail: `${n}/2회` };
    },
  },
  modes: {
    drillId: 'modes', gate: '훑기(요지 정답)·찾기(성공)·정독(이해 80%+) 세 모드 각 1회',
    check(lang) {
      const g = count(lang, s => s.drill === 'modes-gist' && s.correct) > 0 ? 1 : 0;
      const sc = count(lang, s => s.drill === 'modes-scan' && s.correct) > 0 ? 1 : 0;
      const m = count(lang, s => s.drill === 'modes-mastery' && (s.comp || 0) >= 0.8) > 0 ? 1 : 0;
      return { cur: g + sc + m, goal: 3, detail: `훑기 ${g} · 찾기 ${sc} · 정독 ${m}` };
    },
  },
  preview: {
    drillId: 'preview', gate: '첫 문장만 보고 논지 예측 성공 2회',
    check(lang) {
      const n = count(lang, s => s.drill === 'preview' && s.correct);
      return { cur: Math.min(n, 2), goal: 2, detail: `${n}/2회` };
    },
  },
  retrieval: {
    drillId: 'retrieval', gate: '덮고 떠올린 뒤 인출 퀴즈 70% 이상 2회',
    check(lang) {
      const n = count(lang, s => s.drill === 'retrieval' && (s.comp || 0) >= 0.7);
      return { cur: Math.min(n, 2), goal: 2, detail: `${n}/2회` };
    },
  },
  triage: {
    drillId: 'triage', gate: '최종 관문 — 논문 3-패스를 3패스(재구성·비판)까지 완주 1회',
    check(lang) {
      const n = count(lang, s => s.drill === 'triage' && s.completed);
      return { cur: Math.min(n, 1), goal: 1, detail: n ? '완주' : '아직 없음' };
    },
  },
};

// 스킬 사다리: 단어 → (중국어: 글자·단어경계) → 구 → 문장 → 지문 유창성 → 갭 전략 → 목적 전략 → 최종 관문
const ORDER = {
  en: ['vocab', 'chunk', 'sentence', 'err', 'repeated', 'conquer', 'context', 'modes', 'preview', 'retrieval', 'triage'],
  zh: ['vocab', 'zhchar', 'zhseg', 'sentence', 'err', 'repeated', 'conquer', 'context', 'modes', 'preview', 'retrieval', 'triage'],
};

// 도장 원장 키는 레벨별로 분리한다 — 읽기 단계(err·repeated·conquer 등)는 레벨을 올리면
// 새 난이도에서 다시 깨야 하므로, 같은 stage라도 레벨이 다르면 다른 도장으로 본다.
function clearKey(lang, stageKey) { return (store.getLevel(lang) || 'builder') + ':' + stageKey; }

// 세션 기록에서 소급 파생한 '이번 판정' (durable 원장을 섞기 전 순수 판정값)
function rawStageResult(lang, key) {
  const p = STAGE_DEFS[key].check(lang);
  return { ...p, sessionCleared: p.cur >= p.goal };
}

// 최초 1회: 지금 세션 기록으로 cleared로 판정되는 모든 단계를 durable 원장에 스냅샷.
// 이후엔 append-only이므로 sessions[]가 FIFO로 밀려도 도장이 풀리지 않는다.
// (A1 마이그레이션 — 구버전 데이터 무손실: 판정된 것만 기록, 삭제 없음)
export function seedClears(lang) {
  if (store.clearsSeeded(lang)) return;
  for (const key of ORDER[lang]) {
    const r = rawStageResult(lang, key);
    if (r.sessionCleared) store.markCleared(lang, clearKey(lang, key));
  }
  store.markClearsSeeded(lang);
}

// path(lang) -> { stages: [{key, drillId, gate, cur, goal, detail, cleared, unlocked, idx}],
//                clearedCount, total, conquered, nextLevel }
export function path(lang) {
  // 매 판정 시 최초 스냅샷을 보장 (boot에서 놓쳐도 안전) + 새 클리어 append
  seedClears(lang);
  const stages = [];
  let prevCleared = true;
  for (const key of ORDER[lang]) {
    const def = STAGE_DEFS[key];
    const r = rawStageResult(lang, key);
    // 새로 세션 판정을 통과했으면 durable 원장에 append (한 번 깬 도장을 못박음)
    if (r.sessionCleared) store.markCleared(lang, clearKey(lang, key));
    // 클리어 = durable 원장에 있음 OR 이번 세션 판정 통과 (둘 중 하나면 클리어 — 도장 안 풀림)
    const cleared = store.isCleared(lang, clearKey(lang, key)) || r.sessionCleared;
    stages.push({ key, drillId: def.drillId, gate: def.gate, cur: r.cur, goal: r.goal, detail: r.detail, cleared, unlocked: prevCleared || cleared, idx: stages.length + 1 });
    prevCleared = prevCleared && cleared;
  }
  const clearedCount = stages.filter(s => s.cleared).length;
  const lvKey = store.getLevel(lang) || 'builder';
  const nextKey = LEVEL_ORDER[LEVEL_ORDER.indexOf(lvKey) + 1] || null;
  return {
    stages, clearedCount, total: stages.length,
    conquered: clearedCount === stages.length,
    level: lvKey, nextLevel: nextKey,
  };
}

// 지금 도전 중인 단계(첫 미클리어)의 드릴 id — 없으면 null(전부 정복)
export function activeStage(lang) {
  const p = path(lang);
  const s = p.stages.find(x => !x.cleared);
  return s ? s : null;
}
export function unlockedDrillIds(lang) {
  return path(lang).stages.filter(s => s.unlocked).map(s => s.drillId);
}
