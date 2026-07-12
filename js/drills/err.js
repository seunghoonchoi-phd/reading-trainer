// ===== drills/err.js — timed accuracy reading with separate rate/comprehension =====
import { h, mount, countUnits, fmtClock } from '../util.js';
import * as content from '../content.js?v=20260713-35';
import * as store from '../store.js';
import { t } from '../i18n.js';
import {
  drillHeader, trainingRationale, compQuiz, resultCard, tierPicker, tierLabel,
  setTeardown, schedule, createDrillTimer, pickAssessmentPassage,
  markPassageStarted, askFatigue, recordAttempt, attemptErrorNote,
  timingValidity, preferredTier, drillTimerElement, reducedMotion, attemptContext, applyBenchmarkPace, benchmarkEligible,
} from './shared.js';

function unitLabel(lang) { return t(lang === 'zh' ? 'drill.shared.cpm' : 'drill.shared.wpm'); }

export default {
  id: 'err',
  nameKey: 'drill.err.name',
  goalKey: 'drill.err.goal',
  whyKey: 'drill.err.why',
  evidenceKey: 'drill.err.evidence',
  category: 'core', categoryKey: 'drill.category.core',
  name: '속도·이해 읽기', icon: '📖', track: '핵심 훈련',
  goal: '처음 보는 글에서 읽기 속도와 이해도를 따로 측정합니다.',
  langs: ['en', 'zh'],
  why: '빠른 읽기가 실제로 도움이 됐는지는 속도와 이해도를 함께 보되, 둘을 하나의 점수로 합치지 않아야 알 수 있습니다.',
  evidence: '속도와 이해 사이에는 상충 관계가 있으며, 합산 점수는 해석에 한계가 있습니다.',

  render(root, lang, exit, options = {}) {
    const name = t(this.nameKey);
    const why = trainingRationale(this.id, t(this.whyKey));
    const context = attemptContext(options);
    let tier = preferredTier(lang);
    let usePacer = false;
    const excludeIds = [];

    const setup = () => {
      const pace = store.getPace(lang, tier);
      mount(root,
        drillHeader(name, exit, why),
        h('div', { class: 'card fade-in' },
          h('h2', { class: 'h2' }, t('drill.err.title')),
          h('p', { class: 'muted' }, t('drill.err.instructions')),
          tierPicker(lang, tier, next => { tier = next; setup(); }),
          h('hr', { class: 'sep' }),
          h('label', { class: 'row check-row', style: { gap: '10px', cursor: 'pointer' } },
            h('input', { type: 'checkbox', checked: usePacer, onChange: event => { usePacer = event.target.checked; } }),
            h('span', null, t('drill.err.pacer_toggle', { pace, unit: unitLabel(lang) }))),
          h('div', { class: 'note small', style: { marginTop: '10px' } }, t('drill.err.pacer_benchmark_note')),
          h('div', { class: 'btnrow', style: { marginTop: '14px' } },
            h('button', { class: 'btn btn--primary btn--lg', onClick: run }, t('drill.err.start')))));
    };

    const run = () => {
      const assessment = pickAssessmentPassage(lang, { tier, excludeIds });
      if (!assessment) {
        mount(root, drillHeader(name, exit), h('div', { class: 'empty' }, t('drill.shared.assessment_no_material')));
        return;
      }
      const p = assessment.passage;
      excludeIds.push(p.id);
      const novelAtStart = markPassageStarted(p);
      const units = p.unit_count || countUnits(p.text, lang);
      const pace = store.getPace(lang, p.tier || tier);
      const chunks = content.pacerChunks(p.text, lang, lang === 'zh' ? 4 : 3);
      const chunkEls = chunks.map(chunk => h('span', { class: usePacer ? 'pacer-seg' : '' }, chunk.text));
      const reader = h('div', { class: 'reader', lang: lang === 'zh' ? 'zh-Hans' : 'en', 'data-lang': lang },
        h('div', { class: 'reader-wrap' }, ...chunkEls));
      const timerEl = drillTimerElement();
      const timer = createDrillTimer(ms => { timerEl.textContent = fmtClock(ms); });
      let alive = true;
      let paused = false;
      let pacerOn = usePacer;
      let pacerDispose = () => {};
      let index = 0;

      const scheduleAdvance = (delay = 400) => {
        pacerDispose();
        pacerDispose = schedule(advance, delay);
      };
      const advance = () => {
        if (!alive || paused || !pacerOn) return;
        chunkEls.forEach(el => el.classList.remove('pacer-active'));
        if (index >= chunkEls.length) return;
        const chunk = chunks[index];
        chunkEls[index].classList.add('pacer-active');
        chunkEls[index].scrollIntoView({ block: 'center', behavior: reducedMotion() ? 'auto' : 'smooth' });
        index++;
        scheduleAdvance(Math.max(120, (chunk.units / pace) * 60000));
      };
      const stopPacer = () => {
        pacerOn = false;
        pacerDispose();
        chunkEls.forEach(el => { el.classList.remove('pacer-active', 'pacer-seg'); });
        pacerButton.textContent = t('drill.err.pacer_off');
        pacerButton.disabled = true;
      };
      const stopAll = () => {
        alive = false;
        timer.stop();
        pacerDispose();
      };
      setTeardown(stopAll);

      const pauseButton = h('button', { class: 'btn btn--ghost', onClick: () => {
        if (!alive) return;
        if (paused) {
          paused = false;
          timer.resume();
          reader.style.visibility = '';
          pauseButton.textContent = t('drill.shared.pause');
          if (pacerOn) scheduleAdvance(250);
        } else {
          paused = true;
          timer.pause();
          pacerDispose();
          reader.style.visibility = 'hidden';
          pauseButton.textContent = t('drill.shared.resume');
        }
      } }, t('drill.shared.pause'));
      const pacerButton = h('button', { class: 'btn btn--ghost', onClick: stopPacer }, usePacer ? t('drill.err.pacer_stop') : t('drill.err.pacer_off'));
      if (!usePacer) pacerButton.disabled = true;

      const finishReading = () => {
        if (!alive || paused) return;
        alive = false;
        const elapsedMs = timer.stop();
        pacerDispose();
        const rate = elapsedMs > 0 ? units / (elapsedMs / 60000) : 0;
        quiz(p, { units, elapsedMs, rate, novelAtStart, assisted: usePacer, assessmentFallback: assessment.assessmentFallback });
      };

      mount(root,
        drillHeader(name, () => { stopAll(); exit(); }, why),
        h('div', { class: 'hud' },
          h('span', { class: 'chip' }, t('drill.err.passage_meta', { difficulty: tierLabel(p.tier || tier, lang), units, unit: t(lang === 'zh' ? 'drill.shared.characters' : 'drill.shared.words') })),
          h('div', { class: 'row', style: { gap: '10px' } },
            novelAtStart ? h('span', { class: 'chip' }, t('drill.shared.unseen')) : h('span', { class: 'chip' }, t('drill.shared.seen_before')),
            timerEl)),
        assessment.assessmentFallback ? h('div', { class: 'note small' }, t('drill.shared.assessment_fallback', { requested: tier, actual: p.tier })) : null,
        h('div', { class: 'card' }, h('div', { class: 'eyebrow' }, p.title || t('drill.shared.passage')), reader),
        h('div', { class: 'btnrow', style: { marginTop: '12px' } },
          h('button', { class: 'btn btn--primary btn--lg', onClick: finishReading }, t('drill.err.finish_reading')),
          pauseButton,
          pacerButton));
      if (usePacer) scheduleAdvance();
    };

    const quiz = (p, reading) => {
      const host = h('div');
      const items = (p.questions || []).slice();
      mount(root, drillHeader(t('drill.err.quiz_title', { title: p.title || t('drill.shared.passage') }), exit, null), host);
      compQuiz(host, items).then(result => finish(p, reading, result));
    };

    const finish = (p, reading, quizResult) => {
      askFatigue(root, t('drill.err.fatigue_step'), exit).then(fatigue => {
        const timing = timingValidity(reading.units, reading.elapsedMs, lang);
        const actualTier = p.tier || tier;
        const difficulty = (typeof store.getDifficulty === 'function' && store.getDifficulty(lang)) || actualTier;
        const benchmark = benchmarkEligible({
          novelAtStart: reading.novelAtStart, assisted: reading.assisted, timingValid: timing.timingValid,
          tier: actualTier, difficulty, total: quizResult.total, expectedTotal: (p.questions || []).length,
          assessmentFallback: reading.assessmentFallback,
        });
        const saved = recordAttempt({
          drill: 'err', submode: 'accuracy', benchmark,
          lang, tier: actualTier, difficulty,
          passageId: p.id, sourcePassageId: p.id, transferPassageId: null,
          novelAtStart: reading.novelAtStart,
          assisted: reading.assisted,
          completed: true,
          units: reading.units,
          elapsedMs: Math.max(1, Math.round(reading.elapsedMs)),
          rate: Math.max(1, Math.round(reading.rate)),
          timingValid: timing.timingValid,
          correct: quizResult.correct,
          total: quizResult.total,
          comprehension: quizResult.frac,
          questionTypes: quizResult.questionTypes,
          fatigue,
          assessmentFallback: reading.assessmentFallback,
          ...context,
        });
        applyBenchmarkPace(saved);
        mount(root, drillHeader(name, exit, null),
          resultCard([
            [Math.round(reading.rate) + '', unitLabel(lang), t('drill.err.raw_rate')],
            [Math.round(quizResult.frac * 100) + '%', t('drill.shared.comprehension'), `${quizResult.correct}/${quizResult.total}`],
          ], setup, exit,
          h('div', { class: 'stack' },
            !timing.timingValid ? h('div', { class: 'note note--warn' }, t('drill.shared.timing_invalid', { seconds: Math.ceil(timing.minimumMs / 1000) })) : null,
            reading.assisted ? h('div', { class: 'note small' }, t('drill.err.assisted_note')) : null,
            reading.assessmentFallback ? h('div', { class: 'note small' }, t('drill.shared.assessment_fallback', { requested: tier, actual: actualTier })) : null,
            !reading.novelAtStart ? h('div', { class: 'note small' }, t('drill.err.seen_note')) : null,
            attemptErrorNote(saved))));
      });
    };

    setup();
  },
};
