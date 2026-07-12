// ===== drills/modes.js — purpose-specific reading with separate metrics =====
import { h, mount, countUnits, norm, fmtClock } from '../util.js';
import * as content from '../content.js?v=20260713-34';
import * as store from '../store.js';
import { t } from '../i18n.js';
import {
  drillHeader, trainingRationale, compQuiz, askMCQ, resultCard, tierPicker,
  createDrillTimer, pickUnseenPassage, markPassageStarted,
  askFatigue, recordAttempt, attemptErrorNote, timingValidity,
  questionTypeBreakdown,
  preferredTier, drillTimerElement, attemptContext, applyBenchmarkPace, pickPracticePassage, benchmarkEligible,
} from './shared.js';

export function isExactLocateAnswer(input, expected) {
  const actual = norm(input);
  if (!actual) return false;
  return String(expected).split('|').map(norm).filter(Boolean).some(answer => actual === answer);
}

function unitLabel(lang) { return t(lang === 'zh' ? 'drill.shared.cpm' : 'drill.shared.wpm'); }

export default {
  id: 'modes',
  nameKey: 'drill.modes.name',
  goalKey: 'drill.modes.goal',
  whyKey: 'drill.modes.why',
  evidenceKey: 'drill.modes.evidence',
  category: 'core', categoryKey: 'drill.category.core',
  name: '목적별 읽기', icon: '🎯', track: '핵심 훈련',
  goal: '정확히 읽기, 핵심 파악, 정보 찾기를 구분해 연습합니다.',
  langs: ['en', 'zh'],
  why: '읽는 목적이 다르면 알맞은 평가도 달라야 하며, 서로 다른 결과를 한 점수로 섞으면 안 됩니다.',
  evidence: '훑기는 세부 이해 비용이 있는 별도 전략이므로 정독 성과와 분리해야 합니다.',

  render(root, lang, exit, options = {}) {
    const name = t(this.nameKey);
    const why = trainingRationale(this.id, t(this.whyKey));
    const context = attemptContext(options);
    const prescribedSubmode = typeof options?.targetSubmode === 'string' ? options.targetSubmode : null;
    let tier = preferredTier(lang);

    const menu = () => mount(root, drillHeader(name, exit, why),
      h('div', { class: 'card fade-in' },
        h('h2', { class: 'h2' }, t('drill.modes.title')),
        h('p', { class: 'muted' }, t('drill.modes.instructions')),
        tierPicker(lang, tier, next => { tier = next; menu(); }),
        h('div', { class: 'tiles', style: { marginTop: '12px' } },
          modeTile('📚', t('drill.modes.accuracy_name'), t('drill.modes.accuracy_goal'), accuracy),
          modeTile('💨', t('drill.modes.gist_name'), t('drill.modes.gist_goal'), gist),
          modeTile('🔎', t('drill.modes.locate_name'), t('drill.modes.locate_goal'), locate))));

    function modeTile(icon, title, goal, onClick) {
      return h('button', { class: 'tile', onClick },
        h('div', { class: 'tile__top' }, h('span', { class: 'tile__ico' }, icon), h('span', { class: 'tile__name' }, title)),
        h('span', { class: 'tile__goal' }, goal));
    }

    const pickAccuracy = () => pickUnseenPassage(lang, { tier }) || content.pickPassage(lang, tier, []);
    const pickPractice = () => pickPracticePassage(lang, { tier });

    const gist = () => {
      const p = pickPractice();
      if (!p || !p.gist) return menu();
      const novelAtStart = markPassageStarted(p);
      const units = p.unit_count || countUnits(p.text, lang);
      const configuredSeconds = Number(store.getSetting('gistSeconds'));
      let capSeconds = Number.isInteger(configuredSeconds) && configuredSeconds >= 20 && configuredSeconds <= 180
        ? configuredSeconds
        : Math.max(15, Math.round(units / (lang === 'zh' ? 360 : 320) * 60));
      let paused = false;
      let timedOut = false;
      const timerEl = drillTimerElement('');
      const reader = h('div', { class: 'reader', lang: lang === 'zh' ? 'zh-Hans' : 'en', 'data-lang': lang },
        h('div', { class: 'reader-wrap' }, p.text));
      let timer;
      const update = ms => {
        const left = Math.max(0, capSeconds * 1000 - ms);
        timerEl.textContent = fmtClock(left);
        if (left <= 0 && !timedOut) {
          timedOut = true;
          paused = true;
          timer.pause();
          reader.style.visibility = 'hidden';
          pauseButton.textContent = t('drill.modes.show_and_resume');
        }
      };
      timer = createDrillTimer(update);
      const pauseButton = h('button', { class: 'btn btn--ghost', onClick: () => {
        if (paused) {
          if (timedOut) capSeconds = Math.min(180, Math.ceil(timer.elapsed() / 1000) + 15);
          paused = false; timedOut = false; timer.resume(); reader.style.visibility = ''; pauseButton.textContent = t('drill.shared.pause');
        } else {
          paused = true; timer.pause(); reader.style.visibility = 'hidden'; pauseButton.textContent = t('drill.shared.resume');
        }
      } }, t('drill.shared.pause'));
      const adjust = delta => {
        capSeconds = Math.max(20, Math.min(180, capSeconds + delta));
        timedOut = false;
        update(timer.elapsed());
      };
      const toQuestion = () => {
        const elapsedMs = timer.stop();
        const rate = elapsedMs > 0 ? units / (elapsedMs / 60000) : 0;
        const host = h('div');
        mount(root, drillHeader(t('drill.modes.gist_quiz'), exit, null), host);
        askMCQ(host, p.gist).then(answer => {
          const answers = [answer];
          const questionTypes = questionTypeBreakdown([{ ...p.gist, type: 'main_idea' }], answers);
          askFatigue(root, t('drill.modes.gist_fatigue'), exit).then(fatigue => {
            const timing = timingValidity(units, elapsedMs, lang);
            const actualTier = p.tier || tier;
            const difficulty = (typeof store.getDifficulty === 'function' && store.getDifficulty(lang)) || actualTier;
            const saved = recordAttempt({
              drill: 'modes', submode: 'gist', benchmark: false,
              lang, tier: actualTier, difficulty,
              passageId: p.id, sourcePassageId: p.id, transferPassageId: null,
              novelAtStart, assisted: false, completed: true,
              units, elapsedMs: Math.max(1, Math.round(elapsedMs)), rate: Math.max(1, Math.round(rate)), timingValid: timing.timingValid,
              correct: answer.correct ? 1 : 0, total: 1, comprehension: answer.correct ? 1 : 0,
              questionTypes, fatigue,
              ...context,
            });
            mount(root, drillHeader(name, exit, null), resultCard([
              [answer.correct ? '✓' : '✕', t('drill.modes.gist_result'), answer.correct ? t('drill.modes.gist_correct') : t('drill.modes.gist_incorrect')],
              [Math.round(rate) + '', unitLabel(lang), t('drill.modes.gist_rate')],
            ], gist, exit, h('div', { class: 'stack' },
              !timing.timingValid ? h('div', { class: 'note note--warn' }, t('drill.shared.timing_invalid', { seconds: Math.ceil(timing.minimumMs / 1000) })) : null,
              h('p', { class: 'small muted' }, t('drill.modes.separate_metrics_note')),
              attemptErrorNote(saved))));
          });
        });
      };
      mount(root, drillHeader(t('drill.modes.gist_read'), () => { timer.stop(); exit(); }, why),
        h('div', { class: 'hud' }, h('span', { class: 'chip' }, t('drill.modes.gist_chip')), timerEl),
        h('div', { class: 'note note--warn' }, t('drill.modes.gist_notice')),
        h('div', { class: 'btnrow', style: { marginTop: '8px' } },
          h('button', { class: 'btn btn--ghost', onClick: () => adjust(-15) }, t('drill.modes.minus_15')),
          h('button', { class: 'btn btn--ghost', onClick: () => adjust(15) }, t('drill.modes.plus_15')),
          pauseButton),
        h('div', { class: 'card', style: { marginTop: '10px' } }, reader),
        h('div', { class: 'btnrow', style: { marginTop: '12px' } },
          h('button', { class: 'btn btn--primary', onClick: toQuestion }, t('drill.modes.finish_gist'))));
    };

    const locate = () => {
      const p = pickPractice();
      if (!p || !p.scan) return menu();
      const novelAtStart = markPassageStarted(p);
      const timerEl = drillTimerElement();
      const timer = createDrillTimer(ms => { timerEl.textContent = fmtClock(ms); });
      let paused = false;
      const input = h('input', { type: 'text', placeholder: t('drill.modes.locate_placeholder') });
      const reader = h('div', { class: 'reader', lang: lang === 'zh' ? 'zh-Hans' : 'en', 'data-lang': lang, style: { fontSize: lang === 'zh' ? '1.25rem' : '1.08rem', lineHeight: '1.7' } },
        h('div', { class: 'reader-wrap' }, p.text));
      const pauseButton = h('button', { class: 'btn btn--ghost', onClick: () => {
        if (paused) { paused = false; timer.resume(); reader.style.visibility = ''; input.disabled = false; pauseButton.textContent = t('drill.shared.pause'); }
        else { paused = true; timer.pause(); reader.style.visibility = 'hidden'; input.disabled = true; pauseButton.textContent = t('drill.shared.resume'); }
      } }, t('drill.shared.pause'));
      const check = () => {
        if (paused || !input.value.trim()) return;
        const elapsedMs = timer.stop();
        const correct = isExactLocateAnswer(input.value, p.scan.answer);
        askFatigue(root, t('drill.modes.locate_fatigue'), exit).then(fatigue => {
          const actualTier = p.tier || tier;
          const difficulty = (typeof store.getDifficulty === 'function' && store.getDifficulty(lang)) || actualTier;
          const saved = recordAttempt({
            drill: 'modes', submode: 'locate', benchmark: false,
            lang, tier: actualTier, difficulty,
            passageId: p.id, sourcePassageId: p.id, transferPassageId: null,
            novelAtStart, assisted: false, completed: true,
            units: null, elapsedMs: Math.max(1, Math.round(elapsedMs)), rate: null, timingValid: true,
            correct: correct ? 1 : 0, total: 1, comprehension: null,
            questionTypes: { locate: { correct: correct ? 1 : 0, total: 1 } }, fatigue,
            ...context,
          });
          mount(root, drillHeader(name, exit, null), resultCard([
            [correct ? '✓' : '✕', t('drill.modes.locate_result'), t('drill.modes.seconds', { seconds: (elapsedMs / 1000).toFixed(1) })],
          ], locate, exit, h('div', { class: 'stack' },
            h('div', { class: 'note ' + (correct ? 'note--good' : 'note--warn') }, correct ? t('drill.modes.locate_correct') : t('drill.modes.locate_answer', { answer: p.scan.answer })),
            attemptErrorNote(saved))));
        });
      };
      mount(root, drillHeader(t('drill.modes.locate_read'), () => { timer.stop(); exit(); }, why),
        h('div', { class: 'hud' }, h('span', { class: 'chip' }, t('drill.modes.locate_chip')), timerEl),
        h('div', { class: 'note' }, h('b', null, p.scan.q)),
        h('div', { class: 'card', style: { marginTop: '10px', maxHeight: '46vh', overflow: 'auto' } }, reader),
        h('div', { style: { marginTop: '12px' } }, input,
          h('div', { class: 'btnrow', style: { marginTop: '10px' } },
            h('button', { class: 'btn btn--primary', onClick: check }, t('drill.shared.check')),
            pauseButton)));
    };

    const accuracy = () => {
      const p = pickAccuracy();
      if (!p) return menu();
      const novelAtStart = markPassageStarted(p);
      const units = p.unit_count || countUnits(p.text, lang);
      const timerEl = drillTimerElement();
      const timer = createDrillTimer(ms => { timerEl.textContent = fmtClock(ms); });
      let paused = false;
      const reader = h('div', { class: 'reader', lang: lang === 'zh' ? 'zh-Hans' : 'en', 'data-lang': lang },
        h('div', { class: 'reader-wrap' }, p.text));
      const pauseButton = h('button', { class: 'btn btn--ghost', onClick: () => {
        if (paused) { paused = false; timer.resume(); reader.style.visibility = ''; pauseButton.textContent = t('drill.shared.pause'); }
        else { paused = true; timer.pause(); reader.style.visibility = 'hidden'; pauseButton.textContent = t('drill.shared.resume'); }
      } }, t('drill.shared.pause'));
      const done = () => {
        if (paused) return;
        const elapsedMs = timer.stop();
        const rate = elapsedMs > 0 ? units / (elapsedMs / 60000) : 0;
        const host = h('div');
        mount(root, drillHeader(t('drill.modes.accuracy_quiz'), exit, null), host);
        compQuiz(host, (p.questions || []).slice()).then(result => {
          askFatigue(root, t('drill.modes.accuracy_fatigue'), exit).then(fatigue => {
            const timing = timingValidity(units, elapsedMs, lang);
            const actualTier = p.tier || tier;
            const difficulty = (typeof store.getDifficulty === 'function' && store.getDifficulty(lang)) || actualTier;
            const benchmark = benchmarkEligible({
              novelAtStart, assisted: false, timingValid: timing.timingValid,
              tier: actualTier, difficulty, total: result.total, expectedTotal: (p.questions || []).length,
            });
            const saved = recordAttempt({
              drill: 'modes', submode: 'accuracy', benchmark,
              lang, tier: actualTier, difficulty,
              passageId: p.id, sourcePassageId: p.id, transferPassageId: null,
              novelAtStart, assisted: false, completed: true,
              units, elapsedMs: Math.max(1, Math.round(elapsedMs)), rate: Math.max(1, Math.round(rate)), timingValid: timing.timingValid,
              correct: result.correct, total: result.total, comprehension: result.frac,
              questionTypes: result.questionTypes, fatigue,
              ...context,
            });
            applyBenchmarkPace(saved);
            mount(root, drillHeader(name, exit, null), resultCard([
              [Math.round(rate) + '', unitLabel(lang), t('drill.modes.accuracy_rate')],
              [Math.round(result.frac * 100) + '%', t('drill.shared.comprehension'), `${result.correct}/${result.total}`],
            ], accuracy, exit, h('div', { class: 'stack' },
              !timing.timingValid ? h('div', { class: 'note note--warn' }, t('drill.shared.timing_invalid', { seconds: Math.ceil(timing.minimumMs / 1000) })) : null,
              h('p', { class: 'small muted' }, t('drill.modes.accuracy_note')),
              attemptErrorNote(saved))));
          });
        });
      };
      mount(root, drillHeader(t('drill.modes.accuracy_read'), () => { timer.stop(); exit(); }, why),
        h('div', { class: 'hud' }, h('span', { class: 'chip' }, novelAtStart ? t('drill.shared.unseen') : t('drill.shared.seen_before')), timerEl),
        h('div', { class: 'note note--good' }, t('drill.modes.accuracy_notice')),
        h('div', { class: 'card', style: { marginTop: '10px' } }, h('div', { class: 'eyebrow' }, p.title || t('drill.shared.passage')), reader),
        h('div', { class: 'btnrow', style: { marginTop: '12px' } },
          h('button', { class: 'btn btn--primary btn--lg', onClick: done }, t('drill.modes.finish_accuracy')),
          pauseButton));
    };

    if (prescribedSubmode === 'gist') gist();
    else if (prescribedSubmode === 'accuracy') accuracy();
    else if (prescribedSubmode === 'locate') locate();
    else menu();
  },
};
