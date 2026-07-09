// ===== drills/shared.js — common drill UI =====
import { h, mount, letterFor, shuffle, createTimer } from '../util.js';
import * as content from '../content.js';
import * as store from '../store.js';
import { t, getUILang } from '../i18n.js';
import { defaultTier, hardestTier } from '../levels.js';
import { isBenchmarkAttempt } from '../metrics.js';

/* ---- 활성 드릴 정리 훅: 한 화면에 여러 타이머·Promise가 있어도 모두 취소 ---- */
const teardowns = new Set();
export function setTeardown(fn) {
  let active = true;
  const wrapped = () => {
    if (!active) return;
    active = false;
    try { fn(); } catch {}
  };
  teardowns.add(wrapped);
  return () => { active = false; teardowns.delete(wrapped); };
}
export function runTeardown() {
  const pending = [...teardowns];
  teardowns.clear();
  pending.forEach(fn => fn());
}

// setTimeout도 화면 생명주기에 묶는다. 취소되면 콜백은 실행되지 않는다.
export function schedule(fn, ms) {
  let unregister = () => {};
  const id = setTimeout(() => { unregister(); fn(); }, ms);
  unregister = setTeardown(() => clearTimeout(id));
  return () => {
    clearTimeout(id);
    unregister();
  };
}

export function createDrillTimer(onTick) {
  const controller = new AbortController();
  const timer = createTimer(onTick, { signal: controller.signal });
  const unregister = setTeardown(() => controller.abort());
  return {
    pause: timer.pause,
    resume: timer.resume,
    elapsed: timer.elapsed,
    isPaused: timer.isPaused,
    isStopped: timer.isStopped,
    stop() {
      const elapsed = timer.stop();
      unregister();
      return elapsed;
    },
  };
}

export function questionTypeBreakdown(items, answers) {
  const out = {
    main_idea: { correct: 0, total: 0 },
    inference: { correct: 0, total: 0 },
    detail: { correct: 0, total: 0 },
  };
  items.forEach((item, i) => {
    const type = item.type || 'other';
    if (!out[type]) out[type] = { correct: 0, total: 0 };
    out[type].total++;
    if (answers[i] && answers[i].correct) out[type].correct++;
  });
  return out;
}

export function timingValidity(units, elapsedMs, lang) {
  const maxRate = lang === 'zh' ? 900 : 800;
  const minimumMs = Math.max(3000, (Math.max(0, units) / maxRate) * 60000);
  return { timingValid: Number.isFinite(elapsedMs) && elapsedMs >= minimumMs, minimumMs, maxRate };
}

export function benchmarkEligible({
  novelAtStart, assisted, timingValid, tier, difficulty, total, expectedTotal, assessmentFallback = false,
}) {
  return novelAtStart === true
    && assisted === false
    && timingValid === true
    && (Number(tier) === Number(difficulty) || assessmentFallback === true)
    && Number.isInteger(total)
    && total > 0
    && total === expectedTotal;
}

export function preferredTier(lang, { hardest = false, fallback = 3 } = {}) {
  const all = content.allTiers(lang);
  const explicit = typeof store.getDifficulty === 'function' ? Number(store.getDifficulty(lang)) : NaN;
  if (Number.isFinite(explicit) && all.includes(explicit)) return explicit;
  const legacy = store.getLevel(lang);
  if (legacy) return (hardest ? hardestTier : defaultTier)(legacy, all) || fallback;
  return all.includes(fallback) ? fallback : (all[0] || fallback);
}

export function currentDifficulty(lang) {
  const value = typeof store.getDifficulty === 'function' ? Number(store.getDifficulty(lang)) : NaN;
  return Number.isFinite(value) && value >= 1 && value <= 6 ? value : 3;
}

export function drillTimerElement(initial = '0:00') {
  const hidden = store.getSetting('timerVisible') === false;
  return h('span', { class: 'hud__timer', hidden, 'aria-hidden': hidden ? 'true' : null }, initial);
}

export function reducedMotion() { return store.getSetting('reduceMotion') === true; }

// 코어 합류 전에도 드릴을 수동 점검할 수 있는 얇은 호환층이다.
// 선택·저장 규칙은 코어 API가 있으면 반드시 코어에 맡긴다.
export function pickUnseenPassage(lang, options = {}) {
  if (typeof content.pickUnseenPassage === 'function') return content.pickUnseenPassage(lang, options);
  const { tier = null, excludeIds = [] } = options;
  const seenIds = content.passagesFor(lang).filter(p => store.seenCount(p.id) > 0).map(p => p.id);
  const p = content.pickPassage(lang, tier, [...new Set([...seenIds, ...excludeIds])]);
  if (!p || store.seenCount(p.id) > 0 || excludeIds.includes(p.id) || (tier != null && p.tier !== tier)) return null;
  return p;
}

export function nearestTierOrder(tiers, requestedTier) {
  return [...new Set(tiers.map(Number).filter(Number.isFinite))]
    .filter(tier => tier !== Number(requestedTier))
    .sort((a, b) => Math.abs(a - requestedTier) - Math.abs(b - requestedTier) || a - b);
}

export function pickAssessmentPassage(lang, { tier = null, excludeIds = [], domain = null } = {}) {
  const requestedTier = Number(tier || preferredTier(lang));
  const exact = pickUnseenPassage(lang, { tier: requestedTier, excludeIds, domain });
  if (exact) return { passage: exact, assessmentFallback: false, requestedTier };
  for (const fallbackTier of nearestTierOrder(content.allTiers(lang), requestedTier)) {
    const passage = pickUnseenPassage(lang, { tier: fallbackTier, excludeIds, domain });
    if (passage) return { passage, assessmentFallback: true, requestedTier };
  }
  return null;
}

export function selectPracticePassage(pool, {
  excludeIds = [], preferredIds = [], seenCount = id => store.seenCount(id),
} = {}) {
  const excluded = new Set(excludeIds);
  const eligible = pool.filter(passage => passage && passage.id && !excluded.has(passage.id));
  for (const id of preferredIds) {
    const preferred = eligible.find(passage => passage.id === id && seenCount(passage.id) > 0);
    if (preferred) return preferred;
  }
  const seen = eligible.filter(passage => seenCount(passage.id) > 0);
  if (seen.length) return shuffle(seen)[0];
  return eligible.length ? shuffle(eligible)[0] : null;
}

export function recentPracticePassageIds(lang) {
  const ids = [];
  const add = id => { if (id && !ids.includes(id)) ids.push(id); };
  store.attemptsFor(lang).slice().reverse().forEach(attempt => {
    if (attempt.benchmark) add(attempt.transferPassageId || attempt.sourcePassageId || attempt.passageId);
    add(attempt.sourcePassageId);
  });
  return ids;
}

export function pickPracticePassage(lang, { tier = null, excludeIds = [], preferredIds = [] } = {}) {
  const requestedTier = tier || preferredTier(lang);
  let pool = content.passagesFor(lang, requestedTier);
  if (currentDifficulty(lang) < 6) {
    const general = pool.filter(passage => (passage.domain || 'general') === 'general');
    if (general.length) pool = general;
  }
  return selectPracticePassage(pool, { excludeIds, preferredIds });
}

export function pickRelatedPracticePassage(base, excludeIds = []) {
  if (!base) return null;
  const unseenIds = content.passagesFor(base.lang, base.tier)
    .filter(passage => store.seenCount(passage.id) === 0)
    .map(passage => passage.id);
  const candidate = content.relatedPassage(base, {
    excludeIds: [...new Set([...excludeIds, ...unseenIds])],
    unseenOnly: false,
    domain: base.domain,
  });
  return candidate && store.seenCount(candidate.id) > 0 ? candidate : null;
}

export function pickRelatedUnseenPassage(base, excludeIds = []) {
  if (!base) return null;
  if (typeof content.pickUnseenPassage === 'function') {
    return content.relatedPassage(base, { excludeIds, unseenOnly: true, domain: base.domain });
  }
  const seenIds = content.passagesFor(base.lang).filter(p => store.seenCount(p.id) > 0).map(p => p.id);
  const p = content.relatedPassage(base, [...new Set([...seenIds, ...excludeIds])]);
  if (!p || p.id === base.id || store.seenCount(p.id) > 0 || excludeIds.includes(p.id)) return null;
  return p;
}

export function pickAssessmentTransferPassage(base, excludeIds = []) {
  const exact = pickRelatedUnseenPassage(base, excludeIds);
  if (exact) return { passage: exact, assessmentFallback: false, requestedTier: base.tier };
  for (const fallbackTier of nearestTierOrder(content.allTiers(base.lang), base.tier)) {
    const passage = pickUnseenPassage(base.lang, {
      tier: fallbackTier,
      excludeIds: [base.id, ...excludeIds],
      domain: base.domain || null,
    });
    if (passage) return { passage, assessmentFallback: true, requestedTier: base.tier };
  }
  return null;
}

export function markPassageStarted(p) {
  if (!p || !p.id) return false;
  const novelAtStart = store.seenCount(p.id) === 0;
  store.markSeen(p.id);
  return novelAtStart;
}

export function recordAttempt(record) {
  try {
    const attempt = typeof store.addAttempt === 'function'
      ? store.addAttempt(record)
      : (store.logSession({ legacyAttempt: true, ...record }), record);
    return { attempt, error: null };
  } catch (error) {
    return { attempt: null, error };
  }
}

export function applyBenchmarkPace(result) {
  const attempt = result && !result.error ? result.attempt : null;
  if (!attempt || !isBenchmarkAttempt(attempt)
    || !Number.isFinite(attempt.rate) || !Number.isFinite(attempt.comprehension)) return null;
  const hasPrior = store.attemptsFor(attempt.lang).some(row => (
    row.attemptId !== attempt.attemptId
    && row.tier === attempt.tier
    && isBenchmarkAttempt(row)
  ));
  const seeded = hasPrior ? true : store.seedPace(attempt.lang, attempt.tier, attempt.rate);
  const updated = store.updatePace(attempt.lang, attempt.tier, attempt.comprehension, attempt.fatigue);
  const response = { ...updated, saved: seeded && updated.saved !== false };
  if (!response.saved && result) {
    const error = new Error(t('drill.shared.save_error', { code: 'PACE_STORAGE_FAILED' }));
    error.code = 'PACE_STORAGE_FAILED';
    result.paceError = error;
  }
  return response;
}

export function normalizeDrillOptions(options = {}) {
  if (options && typeof options === 'object' && options.text && !options.customText) return { customText: options };
  return options && typeof options === 'object' ? options : {};
}

export function attemptContext(options = {}) {
  const normalized = normalizeDrillOptions(options);
  const context = {};
  if (typeof normalized.programStage === 'string' && normalized.programStage) context.programStage = normalized.programStage;
  if (typeof normalized.targeted === 'boolean') context.targeted = normalized.targeted;
  if (typeof normalized.targetDrill === 'string' && normalized.targetDrill) context.targetDrill = normalized.targetDrill;
  if (typeof normalized.targetSubmode === 'string' && normalized.targetSubmode) context.targetSubmode = normalized.targetSubmode;
  if (typeof normalized.weaknessType === 'string' && normalized.weaknessType) context.weaknessType = normalized.weaknessType;
  return context;
}

export function attemptErrorNote(result) {
  const error = result?.error || result?.paceError;
  if (!error) return null;
  return h('div', { class: 'note note--warn', role: 'alert' },
    t('drill.shared.save_error', { code: error.code || 'UNKNOWN' }));
}

export function fatigueValue(level) {
  return ({ low: 2, medium: 3, high: 5 })[level] || null;
}

export function askFatigue(root, title, exit) {
  return new Promise(resolve => {
    mount(root, drillHeader(title, exit, null),
      h('div', { class: 'card fade-in center' },
        h('p', { class: 'eyebrow' }, t('drill.shared.fatigue_title')),
        h('p', { class: 'muted' }, t('drill.shared.fatigue_prompt')),
        h('div', { class: 'btnrow', style: { justifyContent: 'center' } },
          ...['low', 'medium', 'high'].map(level => h('button', {
            class: 'btn' + (level === 'low' ? ' btn--primary' : ''),
            onClick: () => resolve(fatigueValue(level)),
          }, t(`drill.shared.fatigue_${level}`))))));
  });
}

export function drillHeader(name, onExit, why) {
  const whyNote = why ? h('div', { class: 'note small', style: { display: 'none', marginBottom: '12px' } }, why) : null;
  const chip = why ? h('button', {
    class: 'chip chip--btn', type: 'button', 'aria-expanded': 'false',
    onClick: () => {
      const open = whyNote.style.display !== 'none';
      whyNote.style.display = open ? 'none' : '';
      chip.setAttribute('aria-expanded', open ? 'false' : 'true');
    },
  }, t('drill.shared.why')) : null;
  return h('div', null,
    h('div', { class: 'hud' },
      h('div', { class: 'row', style: { gap: '10px' } },
        h('button', { class: 'iconbtn', onClick: onExit, title: t('drill.shared.back_to_list'), 'aria-label': t('drill.shared.back') }, '‹'),
        h('div', null, h('div', { style: { fontWeight: '800' } }, name))),
      chip),
    whyNote);
}

export function whyBox(text) {
  if (!text) return null;
  const d = h('details', { class: 'why' }, h('summary', null), h('div', null, text));
  return d;
}

// MCQ single question -> resolves to {correct:boolean, choice:int}
export function askMCQ(root, item, { showExplain = true, startedAt = null } = {}) {
  return new Promise(resolve => {
    let answered = false;
    // shuffle option order at render time so a fixed answer position can't be exploited
    const order = shuffle(item.options.map((_, i) => i));
    const opts = order.map(i => item.options[i]);
    const correctPos = order.indexOf(item.answer);
    const optEls = opts.map((o, i) =>
      h('button', { class: 'opt', onClick: () => pick(i) }, h('span', { class: 'opt__k' }, letterFor(i)), o));
    const explain = h('div');
    function pick(i) {
      if (answered) return; answered = true;
      const correct = i === correctPos;
      const responseMs = Number.isFinite(startedAt) ? performance.now() - startedAt : null;
      optEls.forEach((el, j) => {
        el.disabled = true;
        if (j === correctPos) el.classList.add('is-correct');
        else if (j === i) el.classList.add('is-wrong');
      });
      if (showExplain && item.explanation) {
        const englishUi = getUILang() === 'en';
        const koreanExplanation = /[가-힣]/.test(item.explanation);
        const feedback = englishUi && koreanExplanation
          ? t('drill.shared.correct_answer', { answer: item.options[item.answer] })
          : t(correct ? 'drill.shared.correct_prefix' : 'drill.shared.incorrect_prefix') + item.explanation;
        mount(explain, h('div', { class: 'note ' + (correct ? 'note--good' : 'note--warn'), style: { marginTop: '8px' } },
          feedback));
      }
      schedule(() => resolve({ correct, choice: i, responseMs }), correct ? 550 : 1100);
    }
    mount(root, h('div', { class: 'fade-in' },
      h('p', { style: { fontWeight: '700', fontSize: '1.05rem' } }, item.q),
      ...optEls, explain));
  });
}

// run a comprehension quiz over items -> {correct,total,frac}
export async function compQuiz(root, items, title = t('drill.shared.comprehension_check')) {
  const host = h('div');
  let correct = 0;
  const answers = [];
  for (let i = 0; i < items.length; i++) {
    mount(root, h('div', { class: 'card' },
      h('div', { class: 'row spread', style: { marginBottom: '10px' } },
        h('span', { class: 'eyebrow', style: { margin: 0 } }, title),
        h('span', { class: 'chip' }, `${i + 1} / ${items.length}`)),
      host));
    const r = await askMCQ(host, items[i]);
    answers.push(r);
    if (r.correct) correct++;
  }
  return {
    correct,
    total: items.length,
    frac: items.length ? correct / items.length : 0,
    answers,
    questionTypes: questionTypeBreakdown(items, answers),
  };
}

function emitDrillState(active) {
  if (typeof globalThis.dispatchEvent !== 'function' || typeof globalThis.CustomEvent !== 'function') return;
  globalThis.dispatchEvent(new CustomEvent('readfast:drill-state', { detail: { active } }));
}

export function resultCard(rows, onAgain, onExit, extra) {
  emitDrillState(false);
  return h('div', { class: 'card fade-in center' },
    h('p', { class: 'eyebrow' }, t('drill.shared.result')),
    h('div', { class: 'stat-row', style: { margin: '6px 0 16px', justifyContent: 'center' } },
      ...rows.map(([num, lbl, sub]) => h('div', { class: 'stat', style: { alignItems: 'center' } },
        h('span', { class: 'stat__num' }, num), h('span', { class: 'stat__lbl' }, lbl), sub ? h('span', { class: 'stat__sub' }, sub) : null))),
    extra || null,
    h('div', { class: 'btnrow', style: { justifyContent: 'center', marginTop: '12px' } },
      onAgain ? h('button', { class: 'btn btn--primary', onClick: () => { emitDrillState(true); onAgain(); } }, t('drill.shared.again')) : null,
      h('button', { class: 'btn btn--ghost', onClick: onExit }, t('drill.shared.training_list'))));
}

// 난이도 선택: 전체 티어를 항상 보여주되, 현재 레벨의 권장 창을 표시
export function tierPicker(lang, current, onPick) {
  const all = content.allTiers(lang);
  const win = content.tiersFor(lang);
  return h('div', { class: 'row', style: { gap: '8px', flexWrap: 'wrap' } },
    h('span', { class: 'small muted' }, t('drill.shared.difficulty')),
    ...all.map(tier => h('button', {
      class: 'seg__btn' + (tier === current ? ' is-active' : '') + (win.includes(tier) ? '' : ' seg__btn--dim'),
      style: { border: '1px solid var(--line)' },
      title: win.includes(tier) ? '' : t('drill.shared.outside_recommendation'),
      onClick: () => onPick(tier),
    }, tierLabel(tier, lang))));
}
export function tierLabel(tier, lang) {
  return t('drill.shared.difficulty_n', { n: tier || '?' });
}
