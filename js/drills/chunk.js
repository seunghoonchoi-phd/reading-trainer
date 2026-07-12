// ===== drills/chunk.js — English phrase-boundary support =====
import { h, mount, countUnits, fmtClock } from '../util.js';
import * as content from '../content.js';
import * as store from '../store.js';
import { t } from '../i18n.js';
import {
  drillHeader, trainingRationale, askMCQ, resultCard, tierPicker, preferredTier,
  createDrillTimer, drillTimerElement, markPassageStarted,
  recordAttempt, attemptErrorNote, timingValidity, attemptContext, currentDifficulty,
  pickPracticePassage,
} from './shared.js';

const BREAK_BEFORE = new Set(['and', 'but', 'or', 'so', 'because', 'when', 'while', 'after', 'before', 'that', 'which', 'who', 'whose', 'where', 'if', 'though', 'although', 'as', 'since', 'until', 'unless', 'than', 'in', 'on', 'at', 'with', 'from', 'into', 'over', 'under', 'through', 'between', 'during', 'against', 'without', 'within', 'toward', 'towards', 'across', 'behind', 'beyond', 'of', 'for', 'to', 'by', 'about']);

export function mergeSingletonChunks(chunks) {
  const output = [];
  chunks.forEach(chunk => {
    const words = chunk.trim().split(/\s+/).filter(Boolean);
    if (words.length === 1 && output.length) output[output.length - 1] += ` ${chunk}`;
    else output.push(chunk);
  });
  if (output.length > 1 && output[0].trim().split(/\s+/).length === 1) {
    const first = output.shift();
    output[0] = `${first} ${output[0]}`;
  }
  return output;
}

export function phraseChunks(text) {
  const words = text.split(/\s+/).filter(Boolean);
  const chunks = [];
  let buffer = [];
  const flush = () => { if (buffer.length) { chunks.push(buffer.join(' ')); buffer = []; } };
  for (const word of words) {
    const bare = word.toLowerCase().replace(/[^a-z']/g, '');
    if (buffer.length >= 2 && BREAK_BEFORE.has(bare)) flush();
    buffer.push(word);
    if (/[.,;:!?…]["')\]]?$/.test(word) || buffer.length >= 5) flush();
  }
  flush();
  return mergeSingletonChunks(chunks);
}

const SCAFFOLDS = [1, 2, 3];

export default {
  id: 'chunk',
  nameKey: 'drill.chunk.name',
  goalKey: 'drill.chunk.goal',
  whyKey: 'drill.chunk.why',
  evidenceKey: 'drill.chunk.evidence',
  category: 'language_support', categoryKey: 'drill.category.language_support',
  name: '영어 구 단위 안내', icon: '⌒', track: '언어 보조',
  goal: '영어 문장을 한 단어씩이 아니라 짧은 의미 단위로 묶어 읽습니다.',
  langs: ['en'],
  why: '구 경계 표시는 임시 도움이며 마지막에는 표시 없이 읽어야 합니다.',
  evidence: '구 단위로 표시한 텍스트는 일부 유창성 훈련에서 보조 자료로 쓰입니다.',

  render(root, lang, exit, options = {}) {
    const name = t(this.nameKey);
    const why = trainingRationale(this.id, t(this.whyKey));
    const context = attemptContext(options);
    const difficulty = currentDifficulty(lang);
    let tier = preferredTier(lang);
    const passed = scaffold => store.getState().sessions.some(session => session.lang === lang && session.drill === 'chunk' && session.scaffold === scaffold && session.pass);
    let scaffold = SCAFFOLDS.find(value => !passed(value)) || 3;

    const setup = () => mount(root, drillHeader(name, exit, why),
      h('div', { class: 'card fade-in' },
        h('h2', { class: 'h2' }, t('drill.chunk.title')),
        h('p', { class: 'muted' }, t('drill.chunk.instructions')),
        h('div', { class: 'row', style: { gap: '8px', flexWrap: 'wrap' } },
          h('span', { class: 'small muted' }, t('drill.chunk.scaffold')),
          ...SCAFFOLDS.map(value => h('button', {
            class: 'seg__btn' + (value === scaffold ? ' is-active' : ''),
            style: { border: '1px solid var(--line)' },
            'aria-pressed': value === scaffold ? 'true' : 'false',
            onClick: () => { scaffold = value; setup(); },
          }, t('drill.chunk.stage_n', { n: value })))),
        h('p', { class: 'small muted', style: { marginTop: '8px' } }, t(`drill.chunk.stage_${scaffold}_description`)),
        tierPicker(lang, tier, next => { tier = next; setup(); }),
        h('div', { class: 'btnrow', style: { marginTop: '14px' } },
          h('button', { class: 'btn btn--primary btn--lg', onClick: run }, t('drill.chunk.start')))));

    const run = () => {
      const p = pickPracticePassage(lang, { tier });
      if (!p) return setup();
      const novelAtStart = markPassageStarted(p);
      const units = p.unit_count || countUnits(p.text, lang);
      const chunks = phraseChunks(p.text);
      const cssClass = scaffold === 1 ? 'phrase phrase--strong' : scaffold === 2 ? 'phrase phrase--soft' : '';
      const spans = chunks.map((chunk, index) => h('span', { class: cssClass + (cssClass && index % 2 ? ' phrase--alt' : '') }, `${chunk} `));
      const timerEl = drillTimerElement();
      const timer = createDrillTimer(ms => { timerEl.textContent = fmtClock(ms); });
      let paused = false;
      const reader = h('div', { class: 'reader', lang: 'en', 'data-lang': 'en' }, h('div', { class: 'reader-wrap' }, ...spans));
      const pauseButton = h('button', { class: 'btn btn--ghost', onClick: () => {
        if (paused) { paused = false; timer.resume(); reader.style.visibility = ''; pauseButton.textContent = t('drill.shared.pause'); }
        else { paused = true; timer.pause(); reader.style.visibility = 'hidden'; pauseButton.textContent = t('drill.shared.resume'); }
      } }, t('drill.shared.pause'));
      const done = () => {
        if (paused) return;
        const elapsedMs = timer.stop();
        const rate = elapsedMs > 0 ? units / (elapsedMs / 60000) : 0;
        const host = h('div');
        mount(root, drillHeader(t('drill.chunk.quiz_title'), exit, null), host);
        askMCQ(host, p.gist).then(answer => finish(elapsedMs, rate, answer));
      };
      const finish = (elapsedMs, rate, answer) => {
        const timing = timingValidity(units, elapsedMs, lang);
        const correct = answer.correct ? 1 : 0;
        const saved = recordAttempt({
          drill: 'chunk', submode: 'phrase_support', benchmark: false,
          lang, tier: p.tier || tier, difficulty,
          passageId: p.id, sourcePassageId: p.id, transferPassageId: null,
          novelAtStart, assisted: scaffold < 3, completed: true,
          units, elapsedMs: Math.max(1, Math.round(elapsedMs)), rate: Math.max(1, Math.round(rate)), timingValid: timing.timingValid,
          correct, total: 1, comprehension: correct,
          questionTypes: { main_idea: { correct, total: 1 } },
          fatigue: null, scaffold,
          ...context,
        });
        mount(root, drillHeader(name, exit, null), resultCard([
          [answer.correct ? t('drill.shared.pass') : t('drill.shared.not_passed'), t('drill.chunk.stage_n', { n: scaffold })],
          [Math.round(rate) + '', t('drill.shared.wpm'), t('drill.shared.reference_only')],
        ], () => this.render(root, lang, exit, options), exit, h('div', { class: 'stack' },
          !timing.timingValid ? h('div', { class: 'note note--warn' }, t('drill.shared.timing_invalid', { seconds: Math.ceil(timing.minimumMs / 1000) })) : null,
          h('div', { class: answer.correct ? 'note note--good' : 'note note--warn' }, t(answer.correct ? 'drill.chunk.good_feedback' : 'drill.chunk.retry_feedback', { next: Math.min(3, scaffold + 1) })),
          attemptErrorNote(saved))));
      };
      mount(root, drillHeader(t('drill.chunk.stage_n', { n: scaffold }), () => { timer.stop(); exit(); }, why),
        h('div', { class: 'hud' }, h('span', { class: 'chip' }, t('drill.chunk.meta', { units, chunks: chunks.length })), timerEl),
        h('div', { class: 'card' }, h('div', { class: 'eyebrow' }, p.title || t('drill.shared.passage')), reader),
        h('div', { class: 'btnrow', style: { marginTop: '12px' } },
          h('button', { class: 'btn btn--primary btn--lg', onClick: done }, t('drill.chunk.finish_reading')),
          pauseButton));
    };
    setup();
  },
};
