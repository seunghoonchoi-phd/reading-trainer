// ===== drills/repeated.js — repeated reading plus genuinely unseen transfer =====
import { h, mount, fmtClock, countUnits, sparkline } from '../util.js';
import * as content from '../content.js?v=20260713-36';
import * as store from '../store.js';
import { t } from '../i18n.js';
import {
  drillHeader, trainingRationale, compQuiz, resultCard, tierPicker, tierLabel,
  createDrillTimer, markPassageStarted, pickAssessmentTransferPassage,
  askFatigue, recordAttempt, attemptErrorNote, timingValidity, pickPracticePassage,
  preferredTier, drillTimerElement, attemptContext, applyBenchmarkPace, benchmarkEligible,
} from './shared.js';

export const REPEATED_PASSES = 3;

function unitLabel(lang) { return t(lang === 'zh' ? 'drill.shared.cpm' : 'drill.shared.wpm'); }

export default {
  id: 'repeated',
  nameKey: 'drill.repeated.name',
  goalKey: 'drill.repeated.goal',
  whyKey: 'drill.repeated.why',
  evidenceKey: 'drill.repeated.evidence',
  category: 'core', categoryKey: 'drill.category.core',
  name: '반복읽기와 새 글 전이', icon: '🔁', track: '핵심 훈련',
  goal: '같은 글에서 익힌 유창성이 처음 보는 글에서도 이어지는지 확인합니다.',
  langs: ['en', 'zh'],
  why: '같은 글에서 빨라진 결과는 기억 효과일 수 있으므로 처음 보는 관련 글을 따로 측정해야 합니다.',
  evidence: '반복읽기는 같은 글의 유창성을 높이지만 새 글로의 전이는 별도로 확인해야 합니다.',

  render(root, lang, exit, options = {}) {
    const name = t(this.nameKey);
    const why = trainingRationale(this.id, t(this.whyKey));
    const context = attemptContext(options);
    let tier = preferredTier(lang);

    const setup = () => mount(root, drillHeader(name, exit, why),
      h('div', { class: 'card fade-in' },
        h('h2', { class: 'h2' }, t('drill.repeated.title')),
        h('p', { class: 'muted' }, t('drill.repeated.instructions', { count: REPEATED_PASSES })),
        tierPicker(lang, tier, next => { tier = next; setup(); }),
        h('div', { class: 'btnrow', style: { marginTop: '14px' } },
          h('button', { class: 'btn btn--primary btn--lg', onClick: start }, t('drill.repeated.start')))));

    const start = () => {
      const source = pickPracticePassage(lang, { tier });
      if (!source) {
        mount(root, drillHeader(name, exit), h('div', { class: 'empty' }, t('drill.shared.no_passage')));
        return;
      }
      const sourceNovel = markPassageStarted(source);
      const units = source.unit_count || countUnits(source.text, lang);
      const passes = [];

      const runPass = index => {
        const timerEl = drillTimerElement();
        const timer = createDrillTimer(ms => { timerEl.textContent = fmtClock(ms); });
        let paused = false;
        const reader = h('div', { class: 'reader', lang: lang === 'zh' ? 'zh-Hans' : 'en', 'data-lang': lang },
          h('div', { class: 'reader-wrap' }, source.text));
        const pauseButton = h('button', { class: 'btn btn--ghost', onClick: () => {
          if (paused) {
            paused = false; timer.resume(); reader.style.visibility = ''; pauseButton.textContent = t('drill.shared.pause');
          } else {
            paused = true; timer.pause(); reader.style.visibility = 'hidden'; pauseButton.textContent = t('drill.shared.resume');
          }
        } }, t('drill.shared.pause'));
        const done = () => {
          if (paused) return;
          const elapsedMs = timer.stop();
          const rate = elapsedMs > 0 ? units / (elapsedMs / 60000) : 0;
          const timing = timingValidity(units, elapsedMs, lang);
          passes.push({ elapsedMs, rate, timingValid: timing.timingValid, minimumMs: timing.minimumMs });
          if (index + 1 < REPEATED_PASSES) runPass(index + 1);
          else saveSourcePasses();
        };
        mount(root, drillHeader(t('drill.repeated.pass_title', { current: index + 1, total: REPEATED_PASSES }), () => { timer.stop(); exit(); }, why),
          h('div', { class: 'hud' },
            h('span', { class: 'chip' }, t('drill.repeated.pass_meta', { difficulty: tierLabel(tier, lang), current: index + 1 })),
            timerEl),
          h('div', { class: 'card' }, h('div', { class: 'eyebrow' }, source.title || t('drill.shared.passage')), reader),
          h('div', { class: 'btnrow', style: { marginTop: '12px' } },
            h('button', { class: 'btn btn--primary btn--lg', onClick: done }, index + 1 < REPEATED_PASSES ? t('drill.repeated.next_pass') : t('drill.repeated.finish_passes')),
            pauseButton));
      };

      const saveSourcePasses = () => {
        askFatigue(root, t('drill.repeated.fatigue_repeats'), exit).then(fatigue => {
          const saves = passes.map((pass, index) => recordAttempt({
            drill: 'repeated', submode: 'repeat', benchmark: false,
            lang, tier: source.tier || tier,
            difficulty: (typeof store.getDifficulty === 'function' && store.getDifficulty(lang)) || source.tier || tier,
            passageId: source.id, sourcePassageId: source.id, transferPassageId: null,
            novelAtStart: index === 0 ? sourceNovel : false,
            assisted: true,
            completed: true,
            repetition: index + 1,
            units,
            elapsedMs: Math.max(1, Math.round(pass.elapsedMs)),
            rate: Math.max(1, Math.round(pass.rate)),
            timingValid: pass.timingValid,
            correct: null, total: null, comprehension: null, questionTypes: {},
            fatigue,
            ...context,
          }));
          showRepeatResult(saves);
        });
      };

      const showRepeatResult = saves => {
        const rates = passes.map(pass => Math.round(pass.rate));
        const invalid = passes.some(pass => !pass.timingValid);
        mount(root, drillHeader(t('drill.repeated.repeat_result'), exit, null),
          h('div', { class: 'card fade-in center' },
            h('p', { class: 'eyebrow' }, t('drill.repeated.same_text_curve')),
            sparkline(rates, 300, 70),
            h('p', { class: 'muted small' }, `${rates.join(' → ')} ${unitLabel(lang)}`),
            h('div', { class: 'note note--warn', style: { textAlign: 'left' } }, t('drill.repeated.memory_warning')),
            invalid ? h('div', { class: 'note note--warn', style: { textAlign: 'left', marginTop: '8px' } }, t('drill.shared.timing_invalid_short')) : null,
            ...saves.map(attemptErrorNote).filter(Boolean),
            h('button', { class: 'btn btn--primary btn--lg', style: { marginTop: '12px' }, onClick: transfer }, t('drill.repeated.start_transfer'))));
      };

      const transfer = () => {
        const assessment = pickAssessmentTransferPassage(source, [source.id]);
        if (!assessment) {
          mount(root, drillHeader(name, exit, null), resultCard([], setup, exit,
            h('div', { class: 'note note--warn' }, t('drill.shared.assessment_no_material'))));
          return;
        }
        const target = assessment.passage;
        const targetNovel = markPassageStarted(target);
        const targetUnits = target.unit_count || countUnits(target.text, lang);
        const timerEl = drillTimerElement();
        const timer = createDrillTimer(ms => { timerEl.textContent = fmtClock(ms); });
        let paused = false;
        const reader = h('div', { class: 'reader', lang: lang === 'zh' ? 'zh-Hans' : 'en', 'data-lang': lang },
          h('div', { class: 'reader-wrap' }, target.text));
        const pauseButton = h('button', { class: 'btn btn--ghost', onClick: () => {
          if (paused) { paused = false; timer.resume(); reader.style.visibility = ''; pauseButton.textContent = t('drill.shared.pause'); }
          else { paused = true; timer.pause(); reader.style.visibility = 'hidden'; pauseButton.textContent = t('drill.shared.resume'); }
        } }, t('drill.shared.pause'));
        const done = () => {
          if (paused) return;
          const elapsedMs = timer.stop();
          const rate = elapsedMs > 0 ? targetUnits / (elapsedMs / 60000) : 0;
          const host = h('div');
          mount(root, drillHeader(t('drill.repeated.transfer_quiz'), exit, null), host);
          compQuiz(host, (target.questions || []).slice()).then(result => saveTransfer(target, targetNovel, targetUnits, elapsedMs, rate, result, assessment.assessmentFallback));
        };
        mount(root, drillHeader(t('drill.repeated.transfer_title'), () => { timer.stop(); exit(); }, why),
          h('div', { class: 'hud' }, h('span', { class: 'chip' }, t('drill.repeated.unseen_related_tier', { tier: target.tier })), timerEl),
          assessment.assessmentFallback ? h('div', { class: 'note small' }, t('drill.shared.assessment_fallback', { requested: source.tier, actual: target.tier })) : null,
          h('div', { class: 'card' }, h('div', { class: 'eyebrow' }, target.title || t('drill.shared.passage')), reader),
          h('div', { class: 'btnrow', style: { marginTop: '12px' } },
            h('button', { class: 'btn btn--primary btn--lg', onClick: done }, t('drill.repeated.finish_transfer')),
            pauseButton));
      };

      const saveTransfer = (target, targetNovel, targetUnits, elapsedMs, rate, quizResult, assessmentFallback) => {
        askFatigue(root, t('drill.repeated.fatigue_transfer'), exit).then(fatigue => {
          const timing = timingValidity(targetUnits, elapsedMs, lang);
          const actualTier = target.tier || tier;
          const difficulty = (typeof store.getDifficulty === 'function' && store.getDifficulty(lang)) || actualTier;
          const benchmark = benchmarkEligible({
            novelAtStart: targetNovel, assisted: false, timingValid: timing.timingValid,
            tier: actualTier, difficulty, total: quizResult.total, expectedTotal: (target.questions || []).length,
            assessmentFallback,
          });
          const saved = recordAttempt({
            drill: 'repeated', submode: 'accuracy', benchmark,
            lang, tier: actualTier, difficulty,
            passageId: target.id, sourcePassageId: source.id, transferPassageId: target.id,
            novelAtStart: targetNovel,
            assisted: false,
            completed: true,
            units: targetUnits,
            elapsedMs: Math.max(1, Math.round(elapsedMs)),
            rate: Math.max(1, Math.round(rate)),
            timingValid: timing.timingValid,
            correct: quizResult.correct,
            total: quizResult.total,
            comprehension: quizResult.frac,
            questionTypes: quizResult.questionTypes,
            fatigue,
            assessmentFallback,
            ...context,
            programStage: 'transfer',
          });
          applyBenchmarkPace(saved);
          mount(root, drillHeader(name, exit, null),
            resultCard([
              [Math.round(rate) + '', unitLabel(lang), t('drill.repeated.transfer_rate')],
              [Math.round(quizResult.frac * 100) + '%', t('drill.shared.comprehension'), `${quizResult.correct}/${quizResult.total}`],
            ], setup, exit,
            h('div', { class: 'stack' },
              !timing.timingValid ? h('div', { class: 'note note--warn' }, t('drill.shared.timing_invalid', { seconds: Math.ceil(timing.minimumMs / 1000) })) : null,
              assessmentFallback ? h('div', { class: 'note small' }, t('drill.shared.assessment_fallback', { requested: source.tier, actual: actualTier })) : null,
              h('p', { class: 'small muted' }, t('drill.repeated.transfer_interpretation')),
              attemptErrorNote(saved))));
        });
      };

      runPass(0);
    };

    setup();
  },
};
