// ===== metrics.js — pure v3 measurement policy =====
// Rate and comprehension stay separate. Legacy ERR (rate × comprehension) is
// intentionally absent from every v3 headline and recommendation.

const asTime = value => {
  const ms = Date.parse(value || '');
  return Number.isFinite(ms) ? ms : 0;
};

const byCompletedAt = (a, b) => asTime(a.completedAt) - asTime(b.completedAt);

export function comprehensionOf(attempt) {
  if (Number.isFinite(attempt?.correct) && Number.isFinite(attempt?.total) && attempt.total > 0) {
    return attempt.correct / attempt.total;
  }
  return Number.isFinite(attempt?.comprehension) ? attempt.comprehension : null;
}

export function hasValidMeasuredTiming(attempt) {
  if (!attempt || !['en', 'zh'].includes(attempt.lang)) return false;
  if (!Number.isInteger(attempt.units) || attempt.units <= 0) return false;
  if (!Number.isFinite(attempt.elapsedMs) || attempt.elapsedMs <= 0) return false;
  if (!Number.isFinite(attempt.rate) || attempt.rate <= 0) return false;
  const maximumRate = attempt.lang === 'zh' ? 900 : 800;
  const minimumMs = Math.max(3000, (attempt.units / maximumRate) * 60000);
  if (attempt.elapsedMs < minimumMs) return false;
  const derivedRate = attempt.units / (attempt.elapsedMs / 60000);
  const tolerance = Math.max(2, derivedRate * 0.02);
  return Math.abs(attempt.rate - derivedRate) <= tolerance;
}

export function isBenchmarkAttempt(attempt) {
  return !!attempt
    && attempt.benchmark === true
    && attempt.submode === 'accuracy'
    && attempt.novelAtStart === true
    && attempt.assisted === false
    && attempt.completed === true
    && attempt.timingValid !== false
    && hasValidMeasuredTiming(attempt)
    && Number.isInteger(attempt.tier)
    && attempt.tier >= 1 && attempt.tier <= 6
    && Number.isInteger(attempt.difficulty)
    && attempt.difficulty >= 1 && attempt.difficulty <= 6
    && (attempt.tier === attempt.difficulty || attempt.assessmentFallback === true)
    && Number.isInteger(attempt.total)
    && attempt.total >= 4
    && Number.isInteger(attempt.correct)
    && attempt.correct >= 0
    && attempt.correct <= attempt.total;
}

export function isMaintainedAttempt(attempt) {
  const comprehension = comprehensionOf(attempt);
  return isBenchmarkAttempt(attempt)
    && Number.isFinite(attempt.rate)
    && attempt.rate > 0
    && comprehension != null
    && comprehension >= 0.8;
}

export function isColdTransferAttempt(attempt) {
  return !!attempt
    && attempt.completed === true
    && attempt.timingValid !== false
    && attempt.novelAtStart === true
    && attempt.assisted === false
    && typeof attempt.sourcePassageId === 'string'
    && attempt.sourcePassageId.length > 0
    && typeof attempt.transferPassageId === 'string'
    && attempt.transferPassageId.length > 0
    && attempt.sourcePassageId !== attempt.transferPassageId
    && hasValidMeasuredTiming(attempt)
    && Number.isInteger(attempt.tier)
    && attempt.tier >= 1 && attempt.tier <= 6
    && Number.isInteger(attempt.difficulty)
    && attempt.difficulty >= 1 && attempt.difficulty <= 6
    && (attempt.tier === attempt.difficulty || attempt.assessmentFallback === true)
    && Number.isInteger(attempt.total)
    && attempt.total >= 4;
}

export function median(values) {
  const rows = values.filter(Number.isFinite).slice().sort((a, b) => a - b);
  if (!rows.length) return null;
  const mid = Math.floor(rows.length / 2);
  return rows.length % 2 ? rows[mid] : (rows[mid - 1] + rows[mid]) / 2;
}

export function mean(values) {
  const rows = values.filter(Number.isFinite);
  return rows.length ? rows.reduce((sum, value) => sum + value, 0) / rows.length : null;
}

function recent(attempts, limit) {
  return attempts.slice().sort(byCompletedAt).slice(-Math.max(1, limit));
}

export function maintainedRate(attempts, { lang = null, limit = 10 } = {}) {
  const qualified = (attempts || []).filter(attempt => (
    (!lang || attempt.lang === lang) && isMaintainedAttempt(attempt)
  ));
  const rows = recent(qualified, limit);
  const value = median(rows.map(attempt => attempt.rate));
  return Object.freeze({
    rate: value,
    medianRate: value,
    count: rows.length,
    sampleSize: rows.length,
    language: lang,
    threshold: 0.8,
    attempts: Object.freeze(rows.map(attempt => attempt.attemptId)),
  });
}

export const comprehensionMaintainedSpeed = maintainedRate;

export function speedAndComprehension(attempts, { lang = null, submode = 'accuracy', limit = 10 } = {}) {
  const eligible = (attempts || []).filter(attempt => (
    attempt.completed === true
    && attempt.timingValid !== false
    && (!lang || attempt.lang === lang)
    && attempt.submode === submode
  ));
  const rows = recent(eligible, limit);
  const rateRows = rows.filter(attempt => Number.isFinite(attempt.rate) && attempt.rate > 0);
  const comprehensionRows = rows.map(comprehensionOf).filter(value => value != null);
  return Object.freeze({
    submode,
    count: rows.length,
    rateCount: rateRows.length,
    comprehensionCount: comprehensionRows.length,
    medianRate: median(rateRows.map(attempt => attempt.rate)),
    meanComprehension: mean(comprehensionRows),
  });
}

export function questionTypeAccuracy(attempts, { lang = null, submode = 'accuracy', limit = 50 } = {}) {
  const rows = recent((attempts || []).filter(attempt => (
    attempt.completed === true
    && (!lang || attempt.lang === lang)
    && (!submode || attempt.submode === submode)
  )), limit);
  const totals = {};
  for (const attempt of rows) {
    for (const [type, result] of Object.entries(attempt.questionTypes || {})) {
      if (!totals[type]) totals[type] = { correct: 0, total: 0 };
      totals[type].correct += result.correct;
      totals[type].total += result.total;
    }
  }
  return Object.freeze(Object.fromEntries(Object.entries(totals).map(([type, result]) => [type, Object.freeze({
    ...result,
    accuracy: result.total ? result.correct / result.total : null,
  })])));
}

export function weakestQuestionType(attempts, options) {
  const rows = Object.entries(questionTypeAccuracy(attempts, options))
    .filter(([, value]) => value.total > 0)
    .sort((a, b) => a[1].accuracy - b[1].accuracy || b[1].total - a[1].total || a[0].localeCompare(b[0]));
  return rows.length ? rows[0][0] : null;
}

export function recommendAdjustment(attempts, { lang = null } = {}) {
  const eligible = (attempts || []).filter(attempt => (
    (!lang || attempt.lang === lang) && isBenchmarkAttempt(attempt)
  )).slice().sort(byCompletedAt);
  const latestTier = eligible.length ? eligible[eligible.length - 1].tier : null;
  const rows = recent(eligible.filter(attempt => attempt.tier === latestTier), 2);
  if (!rows.length) return Object.freeze({ action: 'hold', axis: null, factor: 1, reason: 'insufficient-data' });

  const latest = rows[rows.length - 1];
  const latestComp = comprehensionOf(latest);
  const highFatigue = Number.isFinite(latest.fatigue) && latest.fatigue >= 4;
  if (highFatigue || latestComp < 0.6) {
    return Object.freeze({ action: 'decrease', axis: 'rate', factor: 0.95, reason: highFatigue ? 'high-fatigue' : 'comprehension-below-60' });
  }

  const twoMaintained = rows.length === 2 && rows.every(attempt => (
    comprehensionOf(attempt) >= 0.8 && Number.isFinite(attempt.fatigue) && attempt.fatigue <= 3
  ));
  if (twoMaintained) {
    return Object.freeze({ action: 'increase', axis: 'rate', factor: 1.05, reason: 'two-maintained-low-fatigue' });
  }

  return Object.freeze({ action: 'hold', axis: null, factor: 1, reason: latestComp >= 0.6 && latestComp < 0.8 ? 'comprehension-60-to-79' : 'one-good-result' });
}

export function provisionalDifficultyRecommendation(attempts, { lang = null } = {}) {
  const eligible = (attempts || []).filter(attempt => (
    (!lang || attempt.lang === lang) && isBenchmarkAttempt(attempt)
  )).slice().sort(byCompletedAt);
  const latestTier = eligible.length ? eligible[eligible.length - 1].tier : null;
  const rows = recent(eligible.filter(attempt => attempt.tier === latestTier), 3);
  if (rows.length < 3) {
    return Object.freeze({ ready: false, difficulty: null, confidence: 'insufficient', reason: 'need-three-benchmarks', sampleSize: rows.length });
  }

  const base = Math.max(1, Math.min(6, Math.round(median(rows.map(attempt => attempt.tier || 3)))));
  const comprehensions = rows.map(comprehensionOf);
  const maintained = comprehensions.filter(value => value >= 0.8).length;
  const average = mean(comprehensions);
  const lowFatigue = rows.every(attempt => Number.isFinite(attempt.fatigue) && attempt.fatigue <= 3);
  let difficulty = base;
  let reason = 'mixed-results-hold';
  if (maintained === 3 && lowFatigue) {
    difficulty = Math.min(6, base + 1);
    reason = difficulty === base ? 'top-difficulty-maintained' : 'three-maintained';
  } else if (maintained < 2 && average < 0.6) {
    reason = 'comprehension-below-60-rate-only';
  } else if (maintained >= 2) {
    reason = 'two-of-three-maintained';
  }
  return Object.freeze({ ready: true, difficulty, confidence: 'provisional', reason, sampleSize: 3 });
}
