// ===== drills/zhchunk.js — Chinese meaning-unit reading support =====
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

const SCAFFOLDS = [1, 2, 3];

export function chineseMeaningChunks(text) {
  const chunks = [];
  let buffer = '';
  const flush = () => {
    const value = buffer.trim();
    if (value) chunks.push(value);
    buffer = '';
  };
  for (const char of String(text || '')) {
    buffer += char;
    const hanCount = (buffer.match(/[㐀-鿿]/g) || []).length;
    if (/[。！？；]/.test(char) || (/[，、：]/.test(char) && hanCount >= 5) || hanCount >= 12) flush();
  }
  flush();
  return chunks;
}

function normalizedChunkText(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

export function chineseMeaningUnitParagraphs(passage) {
  const paragraphs = String(passage?.text || '')
    .split(/\n{2,}/)
    .map(paragraph => paragraph.trim())
    .filter(Boolean);
  const prepared = passage?.meaning_units;
  const isValid = Array.isArray(prepared)
    && prepared.length === paragraphs.length
    && prepared.every((units, index) => Array.isArray(units)
      && units.length
      && normalizedChunkText(units.join('')) === normalizedChunkText(paragraphs[index]));
  return isValid ? prepared : paragraphs.map(chineseMeaningChunks);
}

export default {
  id: 'zhchunk',
  nameKey: 'drill.zhchunk.name',
  goalKey: 'drill.zhchunk.goal',
  whyKey: 'drill.zhchunk.why',
  evidenceKey: 'drill.zhchunk.evidence',
  category: 'language_support', categoryKey: 'drill.category.language_support',
  name: '중국어 의미 단위 안내', icon: '⌒', track: '언어 보조',
  goal: '중국어 문장을 짧은 의미 단위로 묶어 읽습니다.',
  langs: ['zh'],
  why: '의미 단위 표시는 임시 도움이며 마지막에는 표시 없이 읽어야 합니다.',
  evidence: '중국어 읽기에서는 글자를 하나씩 따라가기보다 문장 안의 의미 단위를 빠르게 묶는 연습이 필요합니다.',

  render(root, lang, exit, options = {}) {
    const name = t(this.nameKey);
    const why = trainingRationale(this.id, t(this.whyKey));
    const context = attemptContext(options);
    const registeredPassages = () => content.passagesFor(lang);

    const setup = () => {
      const passages = registeredPassages();
      mount(root, drillHeader(name, exit, why),
        h('section', { class: 'card', style: { marginBottom: '12px' } },
          h('h2', { class: 'h2', style: { marginBottom: '10px' } }, t('drill.zhchunk.passage_tab')),
          h('div', { class: 'stack', style: { gap: '8px' } },
            ...passages.map((passage, index) => h('button', {
              class: 'passage-launch',
              onClick: () => run(passage),
            }, `${index + 1}. ${passage.title || t('drill.shared.passage')}`)),
            !passages.length ? h('p', { class: 'note', style: { width: '100%', margin: 0 } }, t('drill.zhchunk.no_registered')) : null)),
        );
    };

    const run = passage => {
      if (!passage) return setup();
      const novelAtStart = markPassageStarted(passage);
      const units = passage.unit_count || countUnits(passage.text, lang);
      const paragraphUnits = chineseMeaningUnitParagraphs(passage);
      const chunks = paragraphUnits.flat();
      const scaffold = 1;
      const cssClass = 'phrase phrase--strong';
      let unitIndex = 0;
      const paragraphEls = paragraphUnits.map(units => h('p', { class: 'reader__paragraph' },
        ...units.map(chunk => {
          const alternate = unitIndex % 2 === 1;
          unitIndex += 1;
          return h('span', { class: cssClass + (alternate ? ' phrase--alt' : '') }, chunk);
        })));
      const timerEl = drillTimerElement();
      const timer = createDrillTimer(ms => { timerEl.textContent = fmtClock(ms); });
      let paused = false;
      const reader = h('div', { class: 'reader', lang: 'zh-Hans', 'data-lang': 'zh' }, h('div', { class: 'reader-wrap' }, ...paragraphEls));
      const pauseButton = h('button', { class: 'btn btn--ghost', onClick: () => {
        if (paused) { paused = false; timer.resume(); reader.style.visibility = ''; pauseButton.textContent = t('drill.shared.pause'); }
        else { paused = true; timer.pause(); reader.style.visibility = 'hidden'; pauseButton.textContent = t('drill.shared.resume'); }
      } }, t('drill.shared.pause'));
      const finish = (elapsedMs, rate, answer) => {
        const timing = timingValidity(units, elapsedMs, lang);
        const correct = answer.correct ? 1 : 0;
        const saved = recordAttempt({
          drill: 'zhchunk', submode: 'meaning_unit_support', benchmark: false,
          lang, tier: passage.tier || null, difficulty: passage.tier || 1, passageId: passage.id,
          sourcePassageId: passage.id, transferPassageId: null, novelAtStart,
          assisted: scaffold < 3, completed: true, units,
          elapsedMs: Math.max(1, Math.round(elapsedMs)), rate: Math.max(1, Math.round(rate)),
          timingValid: timing.timingValid, correct, total: 1, comprehension: correct,
          questionTypes: { main_idea: { correct, total: 1 } }, fatigue: null, scaffold, ...context,
        });
        mount(root, drillHeader(name, exit, null), resultCard([
          [answer.correct ? t('drill.shared.pass') : t('drill.shared.not_passed'), t('drill.shared.comprehension')],
          [Math.round(rate) + '', t('drill.shared.cpm'), t('drill.shared.reference_only')],
        ], () => this.render(root, lang, exit, options), exit, h('div', { class: 'stack' },
          !timing.timingValid ? h('div', { class: 'note note--warn' }, t('drill.shared.timing_invalid', { seconds: Math.ceil(timing.minimumMs / 1000) })) : null,
          h('div', { class: answer.correct ? 'note note--good' : 'note note--warn' }, t(answer.correct ? 'drill.zhchunk.good_feedback' : 'drill.zhchunk.retry_feedback')),
          attemptErrorNote(saved))));
      };
      const done = () => {
        if (paused) return;
        const elapsedMs = timer.stop();
        const rate = elapsedMs > 0 ? units / (elapsedMs / 60000) : 0;
        const host = h('div');
        mount(root, drillHeader(t('drill.zhchunk.quiz_title'), exit, null), host);
        askMCQ(host, passage.gist).then(answer => finish(elapsedMs, rate, answer));
      };
      mount(root, drillHeader(name, () => { timer.stop(); exit(); }, why),
        h('div', { class: 'hud' }, h('span', { class: 'chip' }, t('drill.zhchunk.meta', { units, chunks: chunks.length })), timerEl),
        h('div', { class: 'card' }, h('div', { class: 'eyebrow' }, passage.title || t('drill.shared.passage')), reader),
        h('div', { class: 'btnrow', style: { marginTop: '12px' } },
          h('button', { class: 'btn btn--primary btn--lg', onClick: done }, t('drill.zhchunk.finish_reading')),
          pauseButton));
    };
    setup();
  },
};
