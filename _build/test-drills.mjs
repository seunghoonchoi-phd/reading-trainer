import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const memory = new Map();
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: {
    getItem: key => memory.has(key) ? memory.get(key) : null,
    setItem: (key, value) => { memory.set(key, String(value)); },
    removeItem: key => { memory.delete(key); },
    clear: () => { memory.clear(); },
  },
});
if (!globalThis.navigator) Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { language: 'ko', languages: ['ko'] } });

const store = await import('../js/store.js');
const content = await import('../js/content.js');
const shared = await import('../js/drills/shared.js');
const { isExactLocateAnswer } = await import('../js/drills/modes.js');
const { mergeSingletonChunks, phraseChunks } = await import('../js/drills/chunk.js');
const { buildSentenceTrials } = await import('../js/drills/sentence.js');
const { hasMeaningfulText } = await import('../js/drills/triage.js');
const { validRetrievalText } = await import('../js/drills/retrieval.js');
const { DRILLS } = await import('../js/drills/index.js');
const { buildZhCharPool } = await import('../js/drills/zhchar.js');
const { boundaryF1, goldBoundaryCuts } = await import('../js/drills/zhseg.js');
const { tokenizeStudyUnits } = await import('../js/drills/conquer.js');
const { DRILL_MESSAGES } = await import('../js/drills/messages.js');

let checks = 0;
const check = (name, fn) => {
  fn();
  checks++;
  process.stdout.write(`ok ${checks} - ${name}\n`);
};
const checkAsync = async (name, fn) => {
  await fn();
  checks++;
  process.stdout.write(`ok ${checks} - ${name}\n`);
};

check('정보 찾기는 정답 전체가 맞아야 하며 한 글자 부분일치는 거부한다', () => {
  assert.equal(isExactLocateAnswer('thirty years', 'thirty years'), true);
  assert.equal(isExactLocateAnswer('Thirty years!', 'thirty years'), true);
  assert.equal(isExactLocateAnswer('t', 'thirty years'), false);
  assert.equal(isExactLocateAnswer('thirty', 'thirty years'), false);
  assert.equal(isExactLocateAnswer('one hundred', '100|one hundred'), true);
});

check('청크 후처리는 여러 청크가 있을 때 한 단어 조각을 남기지 않는다', () => {
  const merged = mergeSingletonChunks(['One', 'two three', 'four']);
  assert.ok(merged.every(chunk => chunk.trim().split(/\s+/).length >= 2));
  const chunks = phraseChunks('A swift fox jumps over the fence and lands near the quiet river.');
  assert.ok(chunks.length >= 2);
  assert.ok(chunks.every(chunk => chunk.trim().split(/\s+/).length >= 2));
});

check('문장 검증은 여섯 문항을 원문/변조 3:3으로 만든다', () => {
  const sentences = [
    'Amber falcons glide above silent canyons.',
    'Silver lanterns shine beside narrow bridges.',
    'Gentle rivers curve around ancient gardens.',
    'Winter breezes carry distant morning voices.',
  ];
  const trials = buildSentenceTrials(sentences, sentences.join(' '), 'en', 6);
  assert.equal(trials.length, 6);
  assert.equal(trials.filter(item => item.real).length, 3);
  assert.equal(trials.filter(item => !item.real).length, 3);
});

check('논문 도구와 자기설명은 빈 입력을 완료로 인정하지 않는다', () => {
  assert.equal(hasMeaningfulText('   ', 10), false);
  assert.equal(hasMeaningfulText('짧음', 10), false);
  assert.equal(hasMeaningfulText('핵심 기여를 구체적으로 적었습니다.', 10), true);
  assert.equal(validRetrievalText('\n\t', 10), false);
  assert.equal(validRetrievalText('A concrete recalled idea.', 10), true);
});

check('훈련 목록에는 어휘 카드와 어휘 판단을 넣지 않는다', () => {
  assert.equal(DRILLS.some(drill => drill.id === 'vocab'), false);
});

check('느리거나 틀린 중국어 글자가 세션 맨 앞에 온다', () => {
  const items = [
    { hanzi: '甲', freq_band: 3 }, { hanzi: '乙', freq_band: 3 },
    { hanzi: '丙', freq_band: 2 }, { hanzi: '丁', freq_band: 4 },
  ];
  const pool = buildZhCharPool(items, ['丁', '乙'], 3, 4);
  assert.deepEqual(pool.slice(0, 2).map(item => item.hanzi), ['丁', '乙']);
});

check('중국어 정복 준비는 사전의 여러 글자 어휘를 한 학습 항목으로 유지한다', () => {
  const tokens = tokenizeStudyUnits('我喜欢图书馆', 'zh', ['图书馆', '喜欢']);
  assert.ok(tokens.some(token => token.key === '图书馆' && token.kind === 'vocab_item'));
  assert.ok(tokens.some(token => token.key === '喜欢' && token.kind === 'vocab_item'));
});

check('중국어 경계 F1은 정확한 경계와 빈 경계를 구분한다', () => {
  const gold = goldBoundaryCuts(['我', '喜欢', '中文']);
  assert.equal(boundaryF1(new Set(gold), gold), 1);
  assert.equal(boundaryF1(new Set(), gold), 0);
});

check('문항 유형 집계는 4/5 원점수와 유형별 분모를 보존한다', () => {
  const items = [
    { type: 'main_idea' }, { type: 'inference' }, { type: 'detail' },
    { type: 'detail' }, { type: 'inference' },
  ];
  const answers = [true, true, false, true, true].map(correct => ({ correct }));
  const result = shared.questionTypeBreakdown(items, answers);
  assert.deepEqual(result.main_idea, { correct: 1, total: 1 });
  assert.deepEqual(result.inference, { correct: 2, total: 2 });
  assert.deepEqual(result.detail, { correct: 1, total: 2 });
  assert.equal(answers.filter(answer => answer.correct).length, 4);
  assert.equal(items.length, 5);
});

check('즉시 완료 방지 규칙은 EN 800 WPM, ZH 900자/분과 절대 3초를 적용한다', () => {
  assert.equal(shared.timingValidity(400, 29999, 'en').timingValid, false);
  assert.equal(shared.timingValidity(400, 30000, 'en').timingValid, true);
  assert.equal(shared.timingValidity(30, 2999, 'zh').timingValid, false);
  assert.equal(shared.timingValidity(30, 3000, 'zh').timingValid, true);
});

check('benchmark는 같은 난이도의 처음 보는 무도움 전체문항 유효 시도만 허용한다', () => {
  const valid = { novelAtStart: true, assisted: false, timingValid: true, tier: 3, difficulty: 3, total: 5, expectedTotal: 5 };
  assert.equal(shared.benchmarkEligible(valid), true);
  assert.equal(shared.benchmarkEligible({ ...valid, tier: 4 }), false);
  assert.equal(shared.benchmarkEligible({ ...valid, assisted: true }), false);
  assert.equal(shared.benchmarkEligible({ ...valid, novelAtStart: false }), false);
  assert.equal(shared.benchmarkEligible({ ...valid, timingValid: false }), false);
  assert.equal(shared.benchmarkEligible({ ...valid, total: 4 }), false);
  assert.equal(shared.benchmarkEligible({ ...valid, tier: 4, assessmentFallback: true }), true);
});

check('평가 fallback 난이도는 요청 난이도와 가장 가까운 순서로 정한다', () => {
  assert.deepEqual(shared.nearestTierOrder([1, 2, 3, 4, 5, 6], 3), [2, 4, 1, 5, 6]);
  assert.deepEqual(shared.nearestTierOrder([2, 4, 6], 5), [4, 6, 2]);
});

check('피로도 선택은 v3 스키마가 받는 1~5 정수로 변환된다', () => {
  assert.equal(shared.fatigueValue('low'), 2);
  assert.equal(shared.fatigueValue('medium'), 3);
  assert.equal(shared.fatigueValue('high'), 5);
  assert.equal(shared.fatigueValue('unknown'), null);
});

check('프로그램 문맥은 제공된 경우에만 attempt로 복사된다', () => {
  assert.deepEqual(shared.attemptContext({ programStage: 'weakness', targeted: true }), { programStage: 'weakness', targeted: true });
  assert.deepEqual(shared.attemptContext({
    programStage: 'weakness', targeted: true, targetDrill: 'modes', targetSubmode: 'gist', weaknessType: 'main_idea',
  }), {
    programStage: 'weakness', targeted: true, targetDrill: 'modes', targetSubmode: 'gist', weaknessType: 'main_idea',
  });
  assert.deepEqual(shared.attemptContext({}), {});
  assert.deepEqual(shared.normalizeDrillOptions({ text: 'legacy custom text', lang: 'en' }), {
    customText: { text: 'legacy custom text', lang: 'en' },
  });
});

check('연습 지문은 본 글을 재사용해 10편 풀의 cold transfer 후보를 보존한다', () => {
  const pool = Array.from({ length: 10 }, (_, index) => ({ id: `p${index + 1}`, tier: 3, lang: 'en' }));
  const counts = new Map([['p1', 1], ['p2', 1]]); // baseline 2편 완료
  const seenCount = id => counts.get(id) || 0;
  for (let weakness = 0; weakness < 2; weakness++) {
    const source = shared.selectPracticePassage(pool, { seenCount });
    assert.ok(seenCount(source.id) > 0);
    counts.set(source.id, seenCount(source.id) + 1);
    // repeated reading may use one unseen transfer target, but its source must not use another.
    const transfer = pool.find(passage => seenCount(passage.id) === 0);
    counts.set(transfer.id, 1);
  }
  const coldCandidates = pool.filter(passage => seenCount(passage.id) === 0);
  assert.equal(coldCandidates.length, 6);
  assert.ok(coldCandidates.some(passage => passage.id !== 'p1' && passage.id !== 'p2'));
});

await checkAsync('화면 이탈 정리는 예약 callback을 실제로 취소한다', async () => {
  let calls = 0;
  shared.schedule(() => { calls++; }, 10);
  shared.runTeardown();
  await new Promise(resolve => setTimeout(resolve, 25));
  assert.equal(calls, 0);
});

check('모든 정적 드릴 번역 키와 동적 키 변형에 한·영 문구가 있다', () => {
  const directory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../js/drills');
  const keys = new Set();
  for (const filename of fs.readdirSync(directory).filter(name => name.endsWith('.js') && name !== 'messages.js')) {
    const source = fs.readFileSync(path.join(directory, filename), 'utf8');
    for (const match of source.matchAll(/['"](drill\.[A-Za-z0-9_.-]+)['"]/g)) keys.add(match[1]);
  }
  [
    'drill.shared.fatigue_low', 'drill.shared.fatigue_medium', 'drill.shared.fatigue_high',
    'drill.chunk.stage_1_description', 'drill.chunk.stage_2_description', 'drill.chunk.stage_3_description',
    ...['category', 'context', 'correctness', 'contributions', 'clarity'].flatMap(key => [
      `drill.triage.${key}_label`, `drill.triage.${key}_hint`,
    ]),
  ].forEach(key => keys.add(key));
  const missing = [...keys].filter(key => !DRILL_MESSAGES.ko[key] || !DRILL_MESSAGES.en[key]);
  assert.deepEqual(missing, []);
});

check('모든 recordAttempt 호출이 v3 필수 필드를 명시한다', () => {
  const directory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../js/drills');
  const missing = [];
  for (const filename of fs.readdirSync(directory).filter(name => name.endsWith('.js') && !['shared.js', 'messages.js'].includes(name))) {
    const source = fs.readFileSync(path.join(directory, filename), 'utf8');
    let cursor = 0;
    while ((cursor = source.indexOf('recordAttempt({', cursor)) >= 0) {
      const start = source.indexOf('{', cursor);
      let depth = 0;
      let end = start;
      for (; end < source.length; end++) {
        if (source[end] === '{') depth++;
        else if (source[end] === '}' && --depth === 0) { end++; break; }
      }
      const objectText = source.slice(start, end);
      const required = ['drill', 'submode', 'benchmark', 'lang', 'tier', 'difficulty', 'completed', 'assisted', 'correct', 'total', 'questionTypes', 'fatigue'];
      const absent = required.filter(field => !new RegExp(`\\b${field}\\b`).test(objectText));
      if (absent.length) missing.push(`${filename}:${source.slice(0, cursor).split('\n').length} -> ${absent.join(',')}`);
      cursor = end;
    }
  }
  assert.deepEqual(missing, []);
});

check('실제 v3 addAttempt가 숫자 피로도, 4/5 분모, 프로그램 문맥을 받아 불변 저장한다', () => {
  store.resetEverything();
  store.setDifficulty('en', 3, 'manual');
  const base = {
    lang: 'en', difficulty: 3, tier: 3,
    drill: 'test', submode: 'accuracy', benchmark: true,
    sourcePassageId: 'en3-test', transferPassageId: null,
    novelAtStart: true, assisted: false, completed: true,
    units: 100, elapsedMs: 60000, rate: 100, timingValid: true,
    correct: 4, total: 5,
    questionTypes: {
      main_idea: { correct: 1, total: 1 },
      inference: { correct: 2, total: 2 },
      detail: { correct: 1, total: 2 },
    },
    fatigue: shared.fatigueValue('low'),
    programStage: 'weakness', targeted: true,
  };
  const saved = store.addAttempt(base);
  assert.equal(saved.comprehension, 0.8);
  assert.equal(saved.fatigue, 2);
  assert.equal(saved.programStage, 'weakness');
  assert.equal(saved.targeted, true);
  assert.equal(Object.isFrozen(saved), true);
  assert.equal(store.attemptsFor('en').length, 1);
  assert.throws(() => store.addAttempt({ ...base, fatigue: 'low' }), error => error.code === 'ATTEMPT_INVALID');
  const questionless = store.addAttempt({
    ...base,
    drill: 'repeated', submode: 'repeat', benchmark: false,
    correct: null, total: null, questionTypes: {}, fatigue: 3,
  });
  assert.equal(questionless.correct, null);
  assert.equal(questionless.total, null);
});

check('첫 유효 benchmark 저장 뒤 페이스를 90%로 시드하고 정책 표본을 한 번만 추가한다', () => {
  store.resetEverything();
  store.setDifficulty('en', 3, 'manual');
  const saved = shared.recordAttempt({
    lang: 'en', difficulty: 3, tier: 3,
    drill: 'err', submode: 'accuracy', benchmark: true,
    sourcePassageId: 'en3-seed', transferPassageId: null,
    novelAtStart: true, assisted: false, completed: true,
    units: 200, elapsedMs: 60000, rate: 200, timingValid: true,
    correct: 4, total: 5,
    questionTypes: { main_idea: { correct: 1, total: 1 }, detail: { correct: 3, total: 4 } },
    fatigue: 2,
  });
  const update = shared.applyBenchmarkPace(saved);
  assert.ok(update);
  assert.equal(store.getPace('en', 3), 180);
  assert.equal(store.getState().prof.en.pace[3].run.length, 1);
});

check('저장소 쓰기 실패는 code가 있는 오류로 UI 계층에 돌아온다', () => {
  store.resetEverything();
  store.setDifficulty('en', 3, 'manual');
  const originalSetItem = localStorage.setItem;
  localStorage.setItem = () => { throw new Error('quota'); };
  const result = shared.recordAttempt({
    lang: 'en', difficulty: 3, tier: 3,
    drill: 'triage', submode: 'paper_tool', benchmark: false,
    sourcePassageId: 'en3-test', transferPassageId: null,
    novelAtStart: false, assisted: true, completed: true,
    units: null, elapsedMs: null, rate: null, timingValid: true,
    correct: null, total: null, questionTypes: {}, fatigue: null,
  });
  localStorage.setItem = originalSetItem;
  assert.equal(result.attempt, null);
  assert.equal(result.error.code, 'STORAGE_WRITE_FAILED');
  assert.equal(store.attemptsFor('en').length, 0);
});

await content.loadContent();
check('unseen helper는 본 지문을 새 글로 재사용하지 않는다', () => {
  store.resetEverything();
  store.setDifficulty('en', 2, 'manual');
  const first = shared.pickUnseenPassage('en', { tier: 2 });
  assert.ok(first);
  assert.equal(shared.markPassageStarted(first), true);
  assert.equal(store.seenCount(first.id), 1);
  const second = shared.pickUnseenPassage('en', { tier: 2, excludeIds: [first.id] });
  assert.equal(second, null);
});

check('정확 tier 새 글이 없으면 인접 tier 새 글을 실제 tier와 함께 반환하고, 전부 소진되면 null이다', () => {
  store.resetEverything();
  store.setDifficulty('en', 1, 'manual');
  const fallback = shared.pickAssessmentPassage('en', { tier: 1 });
  assert.ok(fallback);
  assert.equal(fallback.assessmentFallback, true);
  assert.equal(fallback.requestedTier, 1);
  assert.equal(fallback.passage.tier, 2);
  shared.markPassageStarted(fallback.passage);
  assert.equal(shared.pickAssessmentPassage('en', { tier: 1 }), null);
});

check('반복읽기 전이도 정확 tier가 없을 때 인접 tier unseen으로 fallback한다', () => {
  store.resetEverything();
  const base = { id: 'practice-tier1', lang: 'en', tier: 1, domain: 'general', text: 'practice' };
  const fallback = shared.pickAssessmentTransferPassage(base, [base.id]);
  assert.ok(fallback);
  assert.equal(fallback.assessmentFallback, true);
  assert.equal(fallback.passage.tier, 2);
});

process.stdout.write(`# ${checks} drill regression checks passed\n`);
