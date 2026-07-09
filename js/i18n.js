// ===== i18n.js: UI language only. Training language (English/Chinese) stays separate. =====

const STORAGE_KEY = 'readfast.uiLanguage';
const SUPPORTED_LANGS = new Set(['ko', 'en']);

const MESSAGES = {
  ko: {
    'meta.title': '리드패스트 | 읽기 속도와 이해 훈련',
    'meta.description': '영어와 중국어 읽기 훈련 앱. 속도와 이해를 따로 기록하고, 처음 보는 글에서도 이해가 유지되는지 확인합니다.',
    'shell.skip': '본문으로 건너뛰기',
    'shell.home': '홈으로',
    'shell.brand': '리드패스트',
    'shell.tagline': '읽기 속도와 이해 훈련',
    'shell.nav': '주 메뉴',
    'shell.nav.today': '오늘',
    'shell.nav.train': '훈련',
    'shell.nav.myTexts': '내 글',
    'shell.nav.progress': '기록',
    'shell.nav.theory': '원리',
    'shell.trainingLanguage': '훈련할 언어',
    'shell.theme': '화면 밝기 전환',
    'shell.themeTitle': '밝은 화면과 어두운 화면 전환',
    'shell.settings': '설정',
    'shell.settingsTitle': '읽기 화면과 데이터 설정',
    'shell.uiLanguage': '화면 언어',
    'shell.switchToEnglish': '화면을 영어로 바꾸기',
    'shell.switchToKorean': '화면을 한국어로 바꾸기',
    'common.noData': '아직 기록이 없습니다.',
    'common.why': '이 훈련을 하는 이유',
    'common.close': '닫기',
    'common.pause': '일시정지',
    'common.resume': '계속',
    'common.stop': '끝내기',

    'theory.pageTitle': '훈련 원리',
    'theory.pageLead': '속도만 올리는 연습은 읽기 실력을 보여주지 못합니다. 이 앱은 이해가 유지되는지, 처음 보는 글에서도 같은 결과가 나오는지 함께 확인합니다.',
    'theory.toc.measure': '무엇을 재나',
    'theory.toc.cycle': '훈련 순서',
    'theory.toc.goals': '읽기 목적',
    'theory.toc.transfer': '처음 보는 글',
    'theory.toc.policy': '난이도 조절',
    'theory.toc.supports': '보조 훈련',
    'theory.toc.claims': '하지 않는 주장',
    'theory.toc.sources': '근거 자료',
    'theory.intro.label': '이 앱의 측정 원칙',
    'theory.intro.title': '속도와 이해를 따로 기록합니다.',
    'theory.intro.body': '빠르게 넘겼지만 내용을 놓쳤다면 속도 기록만 오른 것입니다. 그래서 한 숫자로 합친 점수 대신 읽은 속도, 이해 문항 결과, 피로도를 나란히 보여줍니다.',
    'theory.measure.title': '속도보다 먼저 확인할 것',
    'theory.measure.p1': '읽는 속도는 글의 난이도와 읽는 목적에 따라 달라집니다. 같은 사람도 꼼꼼히 읽을 때, 핵심만 잡을 때, 정보를 찾을 때 속도가 다릅니다.',
    'theory.measure.p2': '진행 화면에서는 분당 단어 수나 분당 글자 수를 보여줍니다. 결과 화면에서는 이해 문항을 몇 개 맞혔는지 따로 보여줍니다. 두 기록을 섞지 않아야 무엇이 좋아졌는지 알 수 있습니다.',
    'theory.measure.rate': '읽은 속도',
    'theory.measure.comprehension': '이해 결과',
    'theory.measure.fatigue': '느낀 피로',
    'theory.measure.transfer': '처음 보는 글 결과',
    'theory.measure.rateValue': 'WPM / CPM',
    'theory.measure.comprehensionValue': '정답 수 / 전체 문항',
    'theory.measure.fatigueValue': '1~5',
    'theory.measure.transferValue': '새 글',
    'theory.cycle.title': '한 번의 훈련은 네 단계로 돕니다',
    'theory.cycle.baseline.title': '1. 현재 상태 확인',
    'theory.cycle.baseline.body': '도움 없이 처음 보는 글을 읽습니다. 속도, 이해, 문항 유형별 오답을 기록합니다.',
    'theory.cycle.practice.title': '2. 약한 부분 연습',
    'theory.cycle.practice.body': '어휘, 문장 처리, 반복읽기처럼 지금 필요한 한 가지를 고릅니다. 한 번에 여러 축을 올리지 않습니다.',
    'theory.cycle.transfer.title': '3. 새 글에서 다시 확인',
    'theory.cycle.transfer.body': '연습에 쓰지 않은 글을 도움 없이 읽습니다. 같은 글에 익숙해진 효과와 실제 전이를 구분합니다.',
    'theory.cycle.recheck.title': '4. 주간 재측정',
    'theory.cycle.recheck.body': '최근의 새 글 기록을 모아 다음 주 난이도와 연습 항목을 정합니다.',
    'theory.goals.title': '읽는 목적 세 가지를 섞지 않습니다',
    'theory.goals.accurate.title': '정확히 읽기',
    'theory.goals.accurate.body': '논리와 세부 내용을 놓치지 않는 것이 목표입니다. 속도가 느려져도 이해 결과를 우선합니다.',
    'theory.goals.gist.title': '핵심 잡기',
    'theory.goals.gist.body': '짧은 시간 안에 글의 주장과 큰 흐름을 잡습니다. 세부 문항 점수와 한데 합치지 않습니다.',
    'theory.goals.locate.title': '정보 찾기',
    'theory.goals.locate.body': '질문에 필요한 이름, 수치, 근거를 찾습니다. 전체 글을 이해하는 과제와 다른 결과로 저장합니다.',
    'theory.transfer.title': '같은 글은 연습, 새 글은 확인입니다',
    'theory.transfer.p1': '같은 글을 다시 읽으면 그 글은 빨라질 수 있습니다. 이 변화만으로 다른 글도 빨라졌다고 말할 수는 없습니다.',
    'theory.transfer.p2': '그래서 앱은 연습에 쓴 글과 확인에 쓴 글을 구분합니다. 대표 속도는 최근의 처음 보는 글 가운데 도움 없이 읽고 이해 문항을 80% 이상 맞힌 기록에서 계산합니다.',
    'theory.transfer.note': '처음 보는 글 기록이 아직 적으면 대표 속도를 확정하지 않습니다. 더 쉬운 결론 대신 기록이 더 필요하다고 알려줍니다.',
    'theory.policy.title': '난이도는 한 축씩 조절합니다',
    'theory.policy.researchLabel': '연구가 말하는 범위',
    'theory.policy.research': '읽는 속도를 무리하게 올리면 이해가 떨어질 수 있습니다. 되돌아 읽기와 읽는 사람의 시간 조절은 어려운 글을 이해하는 데 도움이 됩니다.',
    'theory.policy.productLabel': '앱의 초기 조정 규칙',
    'theory.policy.product': '처음 보는 글에서 이해 문항을 80% 이상 두 번 맞히고 피로가 낮으면 다음 목표 속도를 약 5% 올립니다. 이해가 60% 이상이고 80%보다 낮으면 유지합니다. 60% 미만이거나 피로가 높으면 목표 속도만 약 5% 낮춥니다.',
    'theory.policy.caution': '이 수치는 연구가 정한 자연법칙이 아닙니다. 앱을 안정적으로 조절하기 위한 초기 제품 규칙이며, 기록이 쌓이면 사용자 결과를 바탕으로 고칠 수 있습니다.',
    'theory.supports.title': '보조 훈련은 약한 부분에만 씁니다',
    'theory.supports.vocab.title': '어휘 복습',
    'theory.supports.vocab.body': '자주 마주치는 단어를 빠르게 알아보도록 간격을 두고 복습합니다. 어휘가 읽기의 전부라는 뜻은 아닙니다.',
    'theory.supports.repeat.title': '반복읽기',
    'theory.supports.repeat.body': '한 글에서 처리 부담을 줄이는 연습입니다. 끝나면 반드시 다른 글로 확인합니다.',
    'theory.supports.language.title': '언어별 보조',
    'theory.supports.language.body': '영어 구절 안내와 중국어 글자·단어 경계 연습은 읽기 자체를 대신하지 않습니다. 필요한 사람에게만 보조로 제공합니다.',
    'theory.supports.tools.title': '실전 도구',
    'theory.supports.tools.body': '미리보기, 자기설명, 논문 3회 읽기는 목적에 맞춰 쓰는 방법입니다. 모든 글에 같은 순서를 강제하지 않습니다.',
    'theory.claims.title': '이 앱이 하지 않는 주장',
    'theory.claims.p1': '한눈에 한 단락을 읽거나 수천 단어를 완전히 이해할 수 있다고 약속하지 않습니다. 단어를 한곳에 빠르게 띄우는 방식도 기본 훈련으로 쓰지 않습니다.',
    'theory.claims.p2': '되돌아 읽기나 머릿속 소리를 무조건 없애라고 하지 않습니다. 둘 다 어려운 글을 이해할 때 도움이 될 수 있습니다.',
    'theory.claims.p3': '앱 난이도 1부터 6은 훈련용 구간입니다. CEFR이나 HSK 성적을 인증하거나 대신하지 않습니다.',
    'theory.claims.p4': '읽기 연습이 지능이나 일반 집중력을 높인다고 주장하지 않습니다. 이 앱이 확인하는 범위는 연습한 언어의 읽기 과제입니다.',
    'theory.sources.title': '근거 자료와 한계',
    'theory.sources.note': '아래 연구는 제품 설계의 출발점입니다. 연구 대상과 글 종류가 이 앱 사용자와 다를 수 있으므로 개인 효과를 보장하지 않습니다.',
    'theory.sources.rayner': '읽는 속도, 이해, 눈의 움직임, 상업 속독 주장을 함께 검토한 논문입니다.',
    'theory.sources.schotter': '되돌아 읽기가 이해에 도움이 될 수 있음을 실험으로 확인했습니다.',
    'theory.sources.benedetto': '단어를 빠르게 한곳에 띄우는 방식과 보통의 문서 읽기를 비교하고 이해와 피로를 측정했습니다.',
    'theory.sources.skinner': '읽은 속도와 이해율을 곱한 점수의 타당성에 한계가 있음을 다룹니다.',
    'theory.sources.therrien': '반복읽기 연구를 모아 분석했으며, 연구 대상과 새 글 전이의 한계도 함께 봐야 합니다.',
    'theory.sources.dunlosky': '인출 연습, 간격 복습 등 여러 학습 방법의 근거를 검토했습니다.',
  },
  en: {
    'meta.title': 'ReadFast | Reading rate and comprehension practice',
    'meta.description': 'English and Chinese reading practice that reports rate and comprehension separately and checks performance on unseen texts.',
    'shell.skip': 'Skip to content',
    'shell.home': 'Go home',
    'shell.brand': 'ReadFast',
    'shell.tagline': 'Reading rate and comprehension practice',
    'shell.nav': 'Main navigation',
    'shell.nav.today': 'Today',
    'shell.nav.train': 'Practice',
    'shell.nav.myTexts': 'My texts',
    'shell.nav.progress': 'Progress',
    'shell.nav.theory': 'How it works',
    'shell.trainingLanguage': 'Practice language',
    'shell.theme': 'Change color theme',
    'shell.themeTitle': 'Switch between light and dark themes',
    'shell.settings': 'Settings',
    'shell.settingsTitle': 'Reading display and data settings',
    'shell.uiLanguage': 'Interface language',
    'shell.switchToEnglish': 'Switch the interface to English',
    'shell.switchToKorean': 'Switch the interface to Korean',
    'common.noData': 'No records yet.',
    'common.why': 'Why this practice is included',
    'common.close': 'Close',
    'common.pause': 'Pause',
    'common.resume': 'Resume',
    'common.stop': 'Finish',

    'theory.pageTitle': 'How the training works',
    'theory.pageLead': 'Practice that only raises the displayed rate does not show better reading. ReadFast also checks whether comprehension holds and whether the result transfers to an unseen text.',
    'theory.toc.measure': 'What is measured',
    'theory.toc.cycle': 'Training cycle',
    'theory.toc.goals': 'Reading goals',
    'theory.toc.transfer': 'Unseen texts',
    'theory.toc.policy': 'Difficulty changes',
    'theory.toc.supports': 'Supporting drills',
    'theory.toc.claims': 'Claims we avoid',
    'theory.toc.sources': 'Sources',
    'theory.intro.label': 'The measurement rule',
    'theory.intro.title': 'Reading rate and comprehension stay separate.',
    'theory.intro.body': 'Moving through a text quickly while missing its meaning only raises the rate. ReadFast therefore shows rate, comprehension questions, and perceived fatigue side by side instead of merging them into one score.',
    'theory.measure.title': 'What to check before rate',
    'theory.measure.p1': 'Reading rate changes with text difficulty and purpose. The same person will read at different rates when studying details, identifying the main point, or locating one fact.',
    'theory.measure.p2': 'During a session, the app shows words or characters per minute. The result view reports comprehension separately. Keeping the two records separate makes the source of improvement easier to see.',
    'theory.measure.rate': 'Reading rate',
    'theory.measure.comprehension': 'Comprehension',
    'theory.measure.fatigue': 'Perceived fatigue',
    'theory.measure.transfer': 'Unseen-text result',
    'theory.measure.rateValue': 'WPM / CPM',
    'theory.measure.comprehensionValue': 'correct / total',
    'theory.measure.fatigueValue': '1 to 5',
    'theory.measure.transferValue': 'unseen',
    'theory.cycle.title': 'Each cycle has four steps',
    'theory.cycle.baseline.title': '1. Check the current level',
    'theory.cycle.baseline.body': 'Read an unseen text without assistance. Record rate, comprehension, and errors by question type.',
    'theory.cycle.practice.title': '2. Practice one weak point',
    'theory.cycle.practice.body': 'Choose one current need, such as vocabulary, sentence processing, or repeated reading. Do not raise several demands at once.',
    'theory.cycle.transfer.title': '3. Check a different text',
    'theory.cycle.transfer.body': 'Read a text that was not used for practice and do so without assistance. This separates familiarity with one passage from transfer.',
    'theory.cycle.recheck.title': '4. Reassess each week',
    'theory.cycle.recheck.body': 'Use recent unseen-text attempts to choose the next difficulty and practice target.',
    'theory.goals.title': 'Three reading goals stay separate',
    'theory.goals.accurate.title': 'Read accurately',
    'theory.goals.accurate.body': 'Preserve the logic and details. Comprehension takes priority even when the rate is lower.',
    'theory.goals.gist.title': 'Get the gist',
    'theory.goals.gist.body': 'Identify the claim and broad structure in limited time. This result is not merged with detailed comprehension.',
    'theory.goals.locate.title': 'Locate information',
    'theory.goals.locate.body': 'Find the name, number, or evidence needed for a question. This is stored separately from whole-text comprehension.',
    'theory.transfer.title': 'A repeated text is practice. A new text is the check.',
    'theory.transfer.p1': 'Rereading can make that passage faster. It does not by itself show that other passages became easier.',
    'theory.transfer.p2': 'ReadFast therefore marks practice and check passages separately. The headline maintained-comprehension rate uses recent unseen, unassisted attempts with at least 80% comprehension.',
    'theory.transfer.note': 'When there are too few unseen attempts, the app does not claim a stable rate. It asks for more evidence instead.',
    'theory.policy.title': 'Change one demand at a time',
    'theory.policy.researchLabel': 'What research supports',
    'theory.policy.research': 'Pushing rate can reduce comprehension. Regressions and control over reading time can support understanding, especially in difficult text.',
    'theory.policy.productLabel': 'Initial product rule',
    'theory.policy.product': 'After two unseen attempts with at least 80% comprehension and low fatigue, the next target rate rises by about 5%. A result of at least 60% and below 80% holds the target. A result below 60%, or high fatigue, lowers only the target rate by about 5%.',
    'theory.policy.caution': 'These numbers are not a scientific constant. They are an initial product policy for stable adjustment and can be revised as a user builds a longer record.',
    'theory.supports.title': 'Use supporting drills only where needed',
    'theory.supports.vocab.title': 'Vocabulary review',
    'theory.supports.vocab.body': 'Spaced review helps frequent words become easier to recognize. Vocabulary is important, but it is not the whole of reading.',
    'theory.supports.repeat.title': 'Repeated reading',
    'theory.supports.repeat.body': 'This reduces processing demand within one passage. A different passage is still needed afterward.',
    'theory.supports.language.title': 'Language-specific support',
    'theory.supports.language.body': 'English phrase cues and Chinese character or segmentation practice support reading. They do not replace connected-text reading.',
    'theory.supports.tools.title': 'Practical tools',
    'theory.supports.tools.body': 'Previewing, self-explanation, and three-pass paper reading are tools for particular goals. They are not a mandatory sequence for every text.',
    'theory.claims.title': 'Claims ReadFast does not make',
    'theory.claims.p1': 'The app does not promise full comprehension of a paragraph at a glance or thousands of words per minute. Rapid serial display is not a core training method.',
    'theory.claims.p2': 'The app does not tell readers to eliminate regressions or inner speech. Both can support difficult reading.',
    'theory.claims.p3': 'App difficulty levels 1 through 6 are training bands. They do not certify or replace CEFR or HSK results.',
    'theory.claims.p4': 'The app does not claim to raise intelligence or general attention. It measures reading tasks in the language being practiced.',
    'theory.sources.title': 'Sources and limits',
    'theory.sources.note': 'These studies inform the product design. Their participants and texts may differ from yours, so they do not guarantee an individual outcome.',
    'theory.sources.rayner': 'Review of reading rate, comprehension, eye movements, and speed-reading claims.',
    'theory.sources.schotter': 'Experimental evidence that regressions can support comprehension.',
    'theory.sources.benedetto': 'Comparison of RSVP-style reading with normal page reading, including comprehension and fatigue.',
    'theory.sources.skinner': 'Limits of combining rate and comprehension into one product score.',
    'theory.sources.therrien': 'Evidence for repeated reading, with important limits on population and transfer.',
    'theory.sources.dunlosky': 'Review of retrieval practice, spacing, and other learning techniques.',
  },
};

let uiLang = 'ko';
let initialized = false;
let storageListenerBound = false;

function normalizeLang(value) {
  const short = String(value || '').trim().toLowerCase().split('-')[0];
  return SUPPORTED_LANGS.has(short) ? short : null;
}

function safeStorageGet() {
  try { return globalThis.localStorage?.getItem(STORAGE_KEY) || null; }
  catch { return null; }
}

function safeStorageSet(value) {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, value);
    return true;
  } catch {
    return false;
  }
}

function detectLang() {
  const stored = normalizeLang(safeStorageGet());
  if (stored) return stored;
  const candidates = globalThis.navigator?.languages || [globalThis.navigator?.language];
  for (const candidate of candidates || []) {
    const normalized = normalizeLang(candidate);
    if (normalized) return normalized;
  }
  return 'ko';
}

function interpolate(message, params) {
  return String(message).replace(/\{([a-zA-Z0-9_]+)\}/g, (match, key) => (
    Object.prototype.hasOwnProperty.call(params, key) ? String(params[key]) : match
  ));
}

export function getUILang() { return uiLang; }

export function t(key, params = {}, fallback = '') {
  const found = MESSAGES[uiLang]?.[key] ?? MESSAGES.ko?.[key] ?? fallback;
  const message = found || key;
  return typeof message === 'function' ? message(params) : interpolate(message, params);
}

export function registerMessages(lang, messages) {
  const normalized = normalizeLang(lang);
  if (!normalized || !messages || typeof messages !== 'object') return false;
  Object.assign(MESSAGES[normalized], messages);
  return true;
}

function nodesIncludingRoot(root, selector) {
  if (!root?.querySelectorAll) return [];
  const nodes = Array.from(root.querySelectorAll(selector));
  if (root.matches?.(selector)) nodes.unshift(root);
  return nodes;
}

export function translateDocument(root = globalThis.document) {
  if (!root) return;
  for (const node of nodesIncludingRoot(root, '[data-i18n]')) {
    node.textContent = t(node.dataset.i18n);
  }
  const attrs = [
    ['aria-label', 'i18nAriaLabel'],
    ['title', 'i18nTitle'],
    ['placeholder', 'i18nPlaceholder'],
  ];
  for (const [attr, datasetKey] of attrs) {
    for (const node of nodesIncludingRoot(root, `[data-${datasetKey.replace(/[A-Z]/g, c => '-' + c.toLowerCase())}]`)) {
      node.setAttribute(attr, t(node.dataset[datasetKey]));
    }
  }
  syncLanguageToggles(root);
}

function syncLanguageToggles(root = globalThis.document) {
  if (!root?.querySelectorAll) return;
  for (const button of nodesIncludingRoot(root, '[data-ui-lang-toggle]')) {
    const target = uiLang === 'ko' ? 'en' : 'ko';
    button.textContent = target === 'en' ? 'EN' : '한국어';
    button.lang = target;
    button.setAttribute('aria-label', t(target === 'en' ? 'shell.switchToEnglish' : 'shell.switchToKorean'));
    button.title = button.getAttribute('aria-label');
  }
}

export function bindI18nUI(root = globalThis.document) {
  if (!root?.querySelectorAll) return;
  for (const button of nodesIncludingRoot(root, '[data-ui-lang-toggle]')) {
    if (button.dataset.i18nBound === 'true') continue;
    button.dataset.i18nBound = 'true';
    button.addEventListener('click', () => setUILang(uiLang === 'ko' ? 'en' : 'ko'));
  }
  syncLanguageToggles(root);
}

export function setUILang(lang, options = {}) {
  const normalized = normalizeLang(lang) || 'ko';
  const { persist = true, translate = true, emit = true } = options;
  const changed = normalized !== uiLang;
  uiLang = normalized;
  const persisted = !persist || safeStorageSet(uiLang);

  const doc = globalThis.document;
  if (doc?.documentElement) {
    doc.documentElement.lang = uiLang;
    doc.documentElement.dir = 'ltr';
    doc.title = t('meta.title');
    doc.querySelector('meta[name="description"]')?.setAttribute('content', t('meta.description'));
    if (translate) translateDocument(doc);
    bindI18nUI(doc);
  }

  if (emit && changed && typeof globalThis.dispatchEvent === 'function' && typeof globalThis.CustomEvent === 'function') {
    globalThis.dispatchEvent(new CustomEvent('readfast:ui-language-change', { detail: { lang: uiLang } }));
  }
  if (emit && persist && !persisted && typeof globalThis.dispatchEvent === 'function' && typeof globalThis.CustomEvent === 'function') {
    globalThis.dispatchEvent(new CustomEvent('readfast:storage-error', { detail: { code: 'UI_LANGUAGE_STORAGE_FAILED' } }));
  }
  return uiLang;
}

export function initI18n(options = {}) {
  const requested = normalizeLang(options.lang) || detectLang();
  setUILang(requested, { persist: options.persist !== false, emit: false });
  if (!storageListenerBound && typeof globalThis.addEventListener === 'function') {
    globalThis.addEventListener('storage', event => {
      if (event.key === STORAGE_KEY && normalizeLang(event.newValue)) {
        setUILang(event.newValue, { persist: false });
      }
    });
    storageListenerBound = true;
  }
  initialized = true;
  return uiLang;
}

export function isI18nInitialized() { return initialized; }
