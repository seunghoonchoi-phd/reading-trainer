// ===== drills/shared.js — common drill UI =====
import { h, mount, letterFor, shuffle, createTimer } from '../util.js';
import * as content from '../content.js?v=20260713-34';
import * as store from '../store.js';
import { t, getUILang } from '../i18n.js';
import { defaultTier, hardestTier } from '../levels.js';
import { isBenchmarkAttempt } from '../metrics.js';

/* ---- 활성 드릴 정리 훅: 한 화면에 여러 타이머·Promise가 있어도 모두 취소 ---- */
const teardowns = new Set();
let activePassage = null;
const translationUsedPassages = new Set();
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
  activePassage = null;
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
  if (!p) return false;
  activePassage = p;
  if (!p.id) return false;
  const novelAtStart = store.seenCount(p.id) === 0;
  store.markSeen(p.id);
  return novelAtStart;
}

export function recordAttempt(record) {
  const passageIds = [record?.passageId, record?.sourcePassageId, record?.transferPassageId].filter(Boolean);
  const translationUsed = passageIds.some(id => translationUsedPassages.has(id));
  const normalizedRecord = translationUsed
    ? { ...record, assisted: true, benchmark: false }
    : record;
  try {
    const attempt = typeof store.addAttempt === 'function'
      ? store.addAttempt(normalizedRecord)
      : (store.logSession({ legacyAttempt: true, ...normalizedRecord }), normalizedRecord);
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
  const whyNote = why ? h('div', { class: 'note small', style: { display: 'none', marginBottom: '12px' } }, rationaleNode(why)) : null;
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
    whyNote,
    activePassage ? translationPanel(activePassage) : null);
}

function rationaleNode(rationale) {
  if (typeof rationale === 'string') return rationale;
  const process = rationale.process?.length
    ? h('div', null,
      h('b', null, getUILang() === 'en' ? 'How to do this training' : '훈련 순서'),
      h('ol', { style: { margin: '6px 0 0', paddingInlineStart: '20px' } },
        ...rationale.process.map(step => h('li', { style: { marginBottom: '4px' } }, step))))
    : null;
  const sourceLinks = rationale.sources.flatMap((source, index) => [
    index ? document.createTextNode(' · ') : null,
    h('a', { href: source.href, target: '_blank', rel: 'noopener noreferrer' }, source.label),
  ].filter(Boolean));
  return h('div', { class: 'stack', style: { gap: '10px' } },
    h('div', null, h('b', null, getUILang() === 'en' ? 'Training intent' : '훈련 의도'), h('p', { style: { margin: '4px 0 0' } }, rationale.intent)),
    h('div', null, h('b', null, getUILang() === 'en' ? 'Training mechanism' : '훈련 메커니즘'), h('p', { style: { margin: '4px 0 0' } }, rationale.mechanism)),
    process,
    h('div', { class: 'small muted' }, getUILang() === 'en' ? 'Original sources' : '근거 원문', ': ',
      ...sourceLinks));
}

function translationPanel(passage) {
  const key = passage.id || `${passage.lang || 'en'}:${passage.text}`;
  const englishUi = getUILang() === 'en';
  const panel = h('div', { class: 'note small', style: { display: 'none', marginBottom: '12px' } });
  const button = h('button', {
    class: 'chip chip--btn', type: 'button', 'aria-expanded': 'false',
    onClick: async () => {
      const open = panel.style.display !== 'none';
      if (open) {
        panel.style.display = 'none';
        button.setAttribute('aria-expanded', 'false');
        return;
      }
      translationUsedPassages.add(key);
      panel.style.display = '';
      button.setAttribute('aria-expanded', 'true');
      button.disabled = true;
      mount(panel, h('span', { class: 'muted' }, englishUi ? 'Loading Korean translation…' : '한국어 전문을 불러오는 중입니다…'));
      try {
        const translated = await content.koreanTranslationFor(passage);
        mount(panel,
          h('div', { style: { fontWeight: '800', marginBottom: '6px' } }, englishUi ? 'Korean full translation' : '한국어 전문'),
          h('div', { style: { whiteSpace: 'pre-wrap', lineHeight: '1.7' } }, translated),
          h('p', { class: 'small muted', style: { margin: '10px 0 0' } }, englishUi
            ? 'Machine translation is a support tool. This attempt is recorded as assisted and is excluded from the no-help speed baseline.'
            : '이 번역은 단어 때문에 멈추지 않도록 돕는 기계 번역입니다. 앱은 이번 시도를 도움 사용으로 기록하고, 무도움 속도 기준선에서 제외합니다.'));
      } catch {
        mount(panel, h('span', { class: 'muted' }, englishUi
          ? 'The translation could not be loaded. Please try again with an internet connection.'
          : '번역을 불러오지 못했습니다. 인터넷 연결을 확인한 뒤 다시 눌러 주세요.'));
      } finally {
        button.disabled = false;
      }
    },
  }, englishUi ? 'View Korean translation' : '한국어 전문 보기');
  return h('div', { style: { marginBottom: '12px' } }, button, panel);
}

const SOURCES = {
  speed: { label: 'Rayner et al. (2016)', href: 'https://pubmed.ncbi.nlm.nih.gov/26769745/' },
  fluency: { label: 'NICHD National Reading Panel: Fluency', href: 'https://www.nichd.nih.gov/sites/default/files/publications/pubs/nrp/Documents/ch3.pdf' },
  comprehension: { label: 'NICHD National Reading Panel: Comprehension', href: 'https://www.nichd.nih.gov/sites/default/files/publications/pubs/nrp/Documents/ch4-II.pdf' },
  spacing: { label: 'Cepeda et al. (2006)', href: 'https://digitalcommons.usf.edu/psy_facpub/1771/' },
  retrieval: { label: 'Roediger & Karpicke (2006)', href: 'https://pubmed.ncbi.nlm.nih.gov/16507066/' },
  purpose: { label: 'McCrudden & Schraw (2007)', href: 'https://doi.org/10.1007/s10648-006-9010-7' },
  triage: { label: 'Keshav, How to Read a Paper (2007)', href: 'https://svr-sk818-web.cl.cam.ac.uk/keshav/publications/htrap.html' },
};

const RATIONALES = {
  err: {
    ko: ['사용자는 읽기 속도와 이해가 함께 유지되는 범위를 확인합니다.', '사용자는 처음 보는 글을 읽고 문항을 풉니다. 앱은 읽은 시간과 문항 결과를 따로 기록합니다. 앱은 두 결과를 한 점수로 합치지 않습니다.', [SOURCES.speed]],
    en: ['Check the range in which reading speed and understanding are both maintained.', 'Read an unseen passage and answer questions. The app stores reading time and question performance separately instead of merging them into one score.', [SOURCES.speed]],
  },
  repeated: {
    ko: ['사용자는 같은 글에서 빨라진 결과가 새 글에서도 유지되는지 확인합니다.', '사용자는 같은 글을 여러 번 읽은 뒤, 처음 보는 관련 글을 읽고 문항을 풉니다. 앱은 같은 글의 반복 결과와 새 글 결과를 구분합니다.', [SOURCES.fluency]],
    en: ['Check whether a gain on a familiar passage carries over to a new passage.', 'Read one passage repeatedly, then read an unseen related passage and answer questions. The app keeps familiar-passage results separate from transfer results.', [SOURCES.fluency]],
  },
  modes: {
    ko: ['사용자는 읽는 목적에 따라 필요한 정보를 다르게 선택합니다.', '사용자는 정확히 읽기, 핵심 파악, 정보 찾기 중 한 목적을 고릅니다. 앱은 각 목적에 맞는 문항과 기록을 따로 제공합니다.', [SOURCES.purpose, SOURCES.speed]],
    en: ['Select information differently for different reading purposes.', 'Choose close reading, main-idea reading, or information locating. The app uses task-specific questions and keeps their results separate.', [SOURCES.purpose, SOURCES.speed]],
  },
  chunk: {
    ko: ['사용자는 긴 영어 문장에서 의미가 이어지는 구를 먼저 인식합니다.', '앱은 구 경계를 표시한 상태에서 읽게 한 뒤, 표시를 줄이거나 없앤 상태에서도 읽게 합니다. 표시를 본 결과는 무도움 결과와 구분합니다.', [SOURCES.speed, SOURCES.comprehension]],
    en: ['Recognize phrase units that carry meaning in long English sentences.', 'The app first displays phrase boundaries, then reduces or removes them. Results with visible boundaries remain separate from no-help results.', [SOURCES.speed, SOURCES.comprehension]],
  },
  zhchar: {
    ko: ['사용자는 느리거나 자주 틀리는 중국어 글자를 다시 확인합니다.', '앱은 오답과 느린 글자를 다시 섞어 제시하고, 같은 항목을 한 번에 몰아 내지 않고 다음 연습에 다시 배치합니다.', [SOURCES.spacing]],
    en: ['Revisit Chinese characters that are slow or often missed.', 'The app brings back missed and slow characters in later practice instead of presenting all repetitions at once.', [SOURCES.spacing]],
  },
  zhseg: {
    ko: ['사용자는 중국어 문장에서 단어 경계를 빠르게 구분합니다.', '사용자는 붙어 있는 문장을 단어 단위로 나누고, 앱은 오답 항목을 뒤 연습에 다시 섞어 제시합니다.', [SOURCES.spacing]],
    en: ['Identify word boundaries quickly in continuous Chinese text.', 'Split an unspaced sentence into words. The app returns missed items in later practice.', [SOURCES.spacing]],
  },
  conquer: {
    ko: ['사용자는 한 지문을 여러 방식으로 다시 다루고, 새 글에서 이해를 확인합니다.', '사용자는 핵심 확인, 반복 읽기, 짧은 확인 문항을 순서대로 수행한 뒤 처음 보는 관련 글을 풉니다. 앱은 반복 단계와 새 글 단계를 구분합니다.', [SOURCES.fluency, SOURCES.retrieval]],
    en: ['Work through one passage in several ways, then check understanding on a new passage.', 'Complete a main-idea check, repeated reading, and short checks, then answer questions on an unseen related passage. The app separates repeated and transfer stages.', [SOURCES.fluency, SOURCES.retrieval]],
  },
  sentence: {
    ko: ['사용자는 문장이 원문 의미와 맞는지 확인하며 이해의 빈틈을 찾습니다.', '앱은 지문에서 문장을 만들고, 사용자는 문장 내용이 원문과 맞는지 판정합니다. 즉시 피드백으로 어떤 근거를 놓쳤는지 확인합니다.', [SOURCES.comprehension]],
    en: ['Find gaps in comprehension by checking whether sentences match the passage meaning.', 'The app creates statements from a passage and asks whether each matches the text. Immediate feedback identifies the missed evidence.', [SOURCES.comprehension]],
  },
  context: {
    ko: ['사용자는 주변 문장에 있는 단서로 빠진 정보를 추론합니다.', '앱은 문맥이 있는 문장에서 한 부분을 비우고, 사용자는 주변 정보로 답을 고릅니다. 피드백은 답의 근거가 된 문장 정보를 알려 줍니다.', [SOURCES.comprehension]],
    en: ['Infer missing information from cues in the surrounding sentences.', 'The app removes one part from a contextual sentence and asks the reader to choose from the surrounding evidence. Feedback points to the supporting information.', [SOURCES.comprehension]],
  },
  retrieval: {
    ko: ['사용자는 글을 덮은 뒤 기억에서 내용을 꺼내며 이해의 빈칸을 확인합니다.', '사용자는 원문을 보지 않고 핵심을 적고 자기 말로 설명합니다. 이후 앱은 원문 핵심과 문항으로 결과를 대조하게 합니다.', [SOURCES.retrieval, SOURCES.comprehension]],
    en: ['Expose gaps in understanding by retrieving the passage from memory.', 'Write the main idea and explain it without viewing the passage, then compare the result with the passage focus and questions.', [SOURCES.retrieval, SOURCES.comprehension]],
  },
  preview: {
    ko: ['사용자는 글을 읽기 전에 문단 구조로 읽을 목표를 세웁니다.', '사용자는 각 문단의 첫 문장을 보고 글의 방향을 예측한 뒤 전체 글과 비교합니다. 이 훈련은 시야를 넓히는 훈련이 아니라, 어디를 자세히 읽을지 정하는 훈련입니다.', [SOURCES.purpose, SOURCES.comprehension]],
    en: ['Set a reading goal from paragraph structure before reading the full text.', 'Predict the direction of a text from each paragraph’s first sentence, then compare that prediction with the full passage. This is not a visual-span exercise; it is a way to choose where close reading is needed.', [SOURCES.purpose, SOURCES.comprehension]],
  },
  triage: {
    ko: ['사용자는 모든 논문에 같은 시간을 쓰지 않고, 읽을 깊이를 먼저 결정합니다.', '사용자는 제목·구조를 보는 1패스, 핵심을 확인하는 2패스, 근거를 검토하는 3패스를 차례로 수행합니다. 이 도구는 논문 읽기 순서를 돕고 속독 능력을 측정하지 않습니다.', [SOURCES.triage]],
    en: ['Choose reading depth instead of spending the same time on every paper.', 'Use a first pass for title and structure, a second pass for the main idea, and a third pass for evidence. This tool organizes paper reading; it does not measure speed-reading skill.', [SOURCES.triage]],
  },
};

const READING_MANUALS = {
  err: {
    ko: ['한국어 전문과 페이서를 끈 상태에서 처음 보는 지문을 처음부터 끝까지 읽습니다.', '지문을 다 읽으면 완료 버튼을 누릅니다.', '원문을 다시 보지 않고 이해 문항을 풉니다.', '결과에서 읽기 속도와 이해도를 따로 확인합니다.'],
    en: ['Keep the Korean translation and pacer closed, then read the unseen passage from start to finish.', 'Press the finish button after reading.', 'Answer the comprehension questions without reopening the passage.', 'Check rate and comprehension as separate results.'],
  },
  repeated: {
    ko: ['같은 지문을 첫 번째로 읽고 완료 버튼을 누릅니다.', '같은 지문을 정해진 횟수만큼 다시 읽습니다. 각 회차에서 완료 버튼을 누릅니다.', '반복 결과를 본 뒤 처음 보는 관련 지문을 읽습니다.', '새 지문의 이해 문항을 풀고 반복 결과와 새 지문 결과를 따로 봅니다.'],
    en: ['Read the source passage once and finish it.', 'Reread the same passage for the requested number of passes, finishing each pass.', 'Then read the unseen related passage.', 'Answer its questions and compare repeated-reading results with the new-passage result.'],
  },
  modes: {
    ko: ['먼저 정확히 읽기, 핵심 파악, 정보 찾기 중 오늘 연습할 목적을 하나 고릅니다.', '정확히 읽기에서는 세부 내용을 확인하며 읽습니다.', '핵심 파악에서는 각 문단의 중심 내용을 잡으며 읽습니다.', '정보 찾기에서는 질문에 필요한 단어와 숫자를 찾아 답합니다.'],
    en: ['Choose close reading, main-idea reading, or information locating first.', 'For close reading, verify details.', 'For main-idea reading, identify the point of each paragraph.', 'For locating, search for the words or numbers needed for the question.'],
  },
  chunk: {
    ko: ['구 경계가 보일 때는 한 단어씩 끊지 말고 표시된 구 단위로 읽습니다.', '다음 단계에서는 구 경계 표시가 줄어든 상태로 같은 방식으로 읽습니다.', '마지막에는 표시가 없는 문장에서 의미 단위를 스스로 찾습니다.', '문항을 풀고 구 경계 도움을 받은 결과와 무도움 결과를 구분합니다.'],
    en: ['When phrase boundaries appear, read each displayed phrase as one unit.', 'Continue with fewer displayed boundaries.', 'Finally find phrase units yourself without visible boundaries.', 'Answer the question and keep supported and unsupported results separate.'],
  },
  zhchar: {
    ko: ['화면의 한자를 먼저 봅니다.', '뜻이나 소리 단서를 본 뒤 해당 한자를 고릅니다.', '오답과 느린 항목은 다음 연습에서 다시 확인합니다.', '맞힌 항목은 바로 외웠다고 판단하지 말고 다음 간격 복습에서 다시 확인합니다.'],
    en: ['Look at the Chinese character first.', 'Use the meaning or pronunciation cue, then choose the character.', 'Missed and slow items return in later practice.', 'Do not treat one correct response as permanent mastery; check it again later.'],
  },
  zhseg: {
    ko: ['붙어 있는 중국어 문장을 처음부터 끝까지 봅니다.', '단어와 단어 사이를 나누어 표시합니다.', '답을 확인하고 틀린 경계를 다시 봅니다.', '오답 문장은 다음 연습에서 다시 나올 수 있습니다.'],
    en: ['Read the unspaced Chinese sentence from beginning to end.', 'Mark the boundaries between words.', 'Check the answer and review any missed boundaries.', 'Missed sentences can return in later practice.'],
  },
  conquer: {
    ko: ['처음 읽은 뒤 지문의 핵심을 고릅니다.', '같은 지문을 다시 읽고 짧은 확인 문항을 풉니다.', '반복 단계가 끝나면 처음 보는 관련 지문을 읽습니다.', '새 지문의 문항을 풀어 기억한 내용과 새 글 이해를 구분합니다.'],
    en: ['After the first read, choose the passage main idea.', 'Reread the same passage and complete the short checks.', 'When the repeated stage ends, read an unseen related passage.', 'Answer its questions to separate familiarity from new-text understanding.'],
  },
  sentence: {
    ko: ['먼저 원문을 읽습니다.', '화면에 나온 문장이 원문과 맞는지 판단합니다.', '즉시 피드백에서 원문 근거를 확인합니다.', '다음 문장에서도 원문을 다시 추측하지 말고 문장 의미를 대조합니다.'],
    en: ['Read the original passage first.', 'Decide whether each displayed statement matches it.', 'Use immediate feedback to check the supporting evidence.', 'For the next statement, compare its meaning with the passage again.'],
  },
  context: {
    ko: ['빈칸 앞뒤 문장을 먼저 읽습니다.', '문맥에 맞는 답을 하나 고릅니다.', '피드백에서 답을 지지하는 단서를 확인합니다.', '단어 하나만 보지 말고 문장 전체 정보를 사용합니다.'],
    en: ['Read the sentences before and after the blank.', 'Choose one answer that fits the context.', 'Use feedback to identify the supporting cue.', 'Use the full sentence context instead of one word alone.'],
  },
  retrieval: {
    ko: ['지문을 한 번 읽습니다.', '원문을 덮은 상태에서 기억나는 핵심을 적습니다.', '자기 말로 지문을 설명합니다.', '원문 핵심과 문항으로 설명이 맞는지 확인합니다.'],
    en: ['Read the passage once.', 'With the passage hidden, write the main points you remember.', 'Explain the passage in your own words.', 'Use the passage focus and questions to check the explanation.'],
  },
  preview: {
    ko: ['각 문단의 첫 문장만 봅니다.', '글 전체가 말할 내용을 예측합니다.', '예측 문항에 답합니다.', '전체 지문을 열어 예측과 실제 내용을 비교합니다.'],
    en: ['Read only the first sentence of each paragraph.', 'Predict what the full text will say.', 'Answer the prediction question.', 'Open the full passage and compare the prediction with the text.'],
  },
  triage: {
    ko: ['1패스에서 제목과 문단 첫 문장을 보고 글의 주제와 구조를 적습니다.', '더 읽을 가치가 있으면 2패스에서 전체 내용을 읽고 핵심을 요약합니다.', '근거를 검토해야 하면 3패스에서 주장과 자료를 확인합니다.', '더 읽지 않기로 정해도 그 결정을 기록하고 다음 글로 넘어갑니다.'],
    en: ['In pass 1, use the title and paragraph openings to note the topic and structure.', 'If the text deserves more time, use pass 2 to read it fully and summarize the main point.', 'If evidence needs review, use pass 3 to check claims and support.', 'If you stop reading, record that decision and move to the next text.'],
  },
};

export function trainingRationale(id, fallback) {
  const entry = RATIONALES[id];
  if (!entry) return fallback;
  const [intent, mechanism, sources] = getUILang() === 'en' ? entry.en : entry.ko;
  const process = (getUILang() === 'en' ? READING_MANUALS[id]?.en : READING_MANUALS[id]?.ko) || [];
  return { intent, mechanism, process, sources };
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
