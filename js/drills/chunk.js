// ===== drills/chunk.js — English phrase-boundary support =====
import { h, mount, countUnits, fmtClock } from '../util.js';
import * as content from '../content.js?v=20260713-36';
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

function normalizedChunkText(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

/**
 * Registered passages can carry editor-reviewed meaning units for each original
 * paragraph.  Only use those units when they reproduce the saved paragraph
 * exactly.  This keeps the reader faithful to the pasted source text while
 * avoiding a word-count heuristic for passages that have been prepared.
 */
export function meaningUnitParagraphs(passage) {
  const paragraphs = String(passage?.text || '')
    .split(/\n{2,}/)
    .map(paragraph => paragraph.trim())
    .filter(Boolean);
  const prepared = passage?.meaning_units;

  const isValid = Array.isArray(prepared)
    && prepared.length === paragraphs.length
    && prepared.every((units, index) => Array.isArray(units)
      && units.length
      && normalizedChunkText(units.join(' ')) === normalizedChunkText(paragraphs[index]));

  return isValid ? prepared : paragraphs.map(phraseChunks);
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
    const registeredPassages = () => content.passagesFor(lang);

    const setup = () => {
      const passages = registeredPassages();
      mount(root, drillHeader(name, exit, why),
        h('section', { class: 'card', style: { marginBottom: '12px' } },
          h('h2', { class: 'h2', style: { marginBottom: '10px' } }, t('drill.chunk.passage_tab')),
          h('div', { class: 'stack', style: { gap: '8px' } },
            ...passages.map((passage, index) => h('button', {
              class: 'passage-launch',
              onClick: () => run(passage),
            }, `${index + 1}. ${passage.title || t('drill.shared.passage')}`)),
            !passages.length ? h('p', { class: 'note', style: { width: '100%', margin: 0 } }, t('drill.chunk.no_registered')) : null)),
        );
    };

    const run = p => {
      if (!p) return setup();
      const novelAtStart = markPassageStarted(p);
      const units = p.unit_count || countUnits(p.text, lang);
      const paragraphUnits = meaningUnitParagraphs(p);
      const chunks = paragraphUnits.flat();
      const scaffold = 1;
      const cssClass = 'phrase phrase--strong';
      let unitIndex = 0;
      const paragraphEls = paragraphUnits.map(units => h('p', { class: 'reader__paragraph' },
        ...units.map(chunk => {
          const alternate = unitIndex % 2 === 1;
          unitIndex += 1;
          return h('span', { class: cssClass + (alternate ? ' phrase--alt' : '') }, `${chunk} `);
        })));
      const timerEl = drillTimerElement();
      const timer = createDrillTimer(ms => { timerEl.textContent = fmtClock(ms); });
      let paused = false;
      const reader = h('div', { class: 'reader', lang: 'en', 'data-lang': 'en' }, h('div', { class: 'reader-wrap' }, ...paragraphEls));
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
          lang, tier: p.tier || null, difficulty: p.tier || 1,
          passageId: p.id, sourcePassageId: p.id, transferPassageId: null,
          novelAtStart, assisted: scaffold < 3, completed: true,
          units, elapsedMs: Math.max(1, Math.round(elapsedMs)), rate: Math.max(1, Math.round(rate)), timingValid: timing.timingValid,
          correct, total: 1, comprehension: correct,
          questionTypes: { main_idea: { correct, total: 1 } },
          fatigue: null, scaffold,
          ...context,
        });
        mount(root, drillHeader(name, exit, null), resultCard([
          [answer.correct ? t('drill.shared.pass') : t('drill.shared.not_passed'), t('drill.shared.comprehension')],
          [Math.round(rate) + '', t('drill.shared.wpm'), t('drill.shared.reference_only')],
        ], () => this.render(root, lang, exit, options), exit, h('div', { class: 'stack' },
          !timing.timingValid ? h('div', { class: 'note note--warn' }, t('drill.shared.timing_invalid', { seconds: Math.ceil(timing.minimumMs / 1000) })) : null,
          h('div', { class: answer.correct ? 'note note--good' : 'note note--warn' }, t(answer.correct ? 'drill.chunk.good_feedback' : 'drill.chunk.retry_feedback')),
          attemptErrorNote(saved))));
      };
      mount(root, drillHeader(name, () => { timer.stop(); exit(); }, why),
        h('div', { class: 'hud' }, h('span', { class: 'chip' }, t('drill.chunk.meta', { units, chunks: chunks.length })), timerEl),
        h('div', { class: 'card' }, h('div', { class: 'eyebrow' }, p.title || t('drill.shared.passage')), reader),
        h('div', { class: 'btnrow', style: { marginTop: '12px' } },
          h('button', { class: 'btn btn--primary btn--lg', onClick: done }, t('drill.chunk.finish_reading')),
          pauseButton));
    };
    setup();
  },
};
