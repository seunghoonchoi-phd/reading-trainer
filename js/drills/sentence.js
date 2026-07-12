// ===== drills/sentence.js — balanced sentence verification practice =====
import { h, mount, shuffle, median, countUnits } from '../util.js';
import * as content from '../content.js?v=20260713-35';
import * as store from '../store.js';
import { t } from '../i18n.js';
import {
  drillHeader, trainingRationale, resultCard, tierPicker, schedule, markPassageStarted,
  recordAttempt, attemptErrorNote, preferredTier, attemptContext, currentDifficulty,
  pickPracticePassage,
} from './shared.js';

const STOP_EN = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'of', 'to', 'in', 'on', 'at', 'for', 'with', 'as', 'by', 'is', 'are', 'was', 'were', 'be', 'been', 'it', 'its', 'this', 'that', 'these', 'those', 'he', 'she', 'they', 'we', 'you', 'i', 'his', 'her', 'their', 'our', 'your', 'from', 'not', 'no', 'so', 'if', 'than', 'then', 'there', 'here', 'which', 'who', 'what', 'when', 'where', 'how', 'will', 'would', 'can', 'could', 'may', 'might', 'do', 'does', 'did', 'have', 'has', 'had']);

export function tamper(sentence, text, lang) {
  if (lang === 'zh') {
    const chars = Array.from(sentence).filter(char => /[㐀-鿿]/.test(char));
    if (chars.length < 5) return null;
    const pool = [...new Set(Array.from(text).filter(char => /[㐀-鿿]/.test(char) && !sentence.includes(char)))];
    if (!pool.length) return null;
    const target = chars[2 + Math.floor(Math.random() * (chars.length - 3))];
    return sentence.replace(target, shuffle(pool)[0]);
  }
  const words = sentence.split(/\b/).filter(word => /[A-Za-z]{4,}/.test(word) && !STOP_EN.has(word.toLowerCase()));
  if (!words.length) return null;
  const target = words[Math.floor(Math.random() * words.length)];
  const pool = [...new Set(text.match(/[A-Za-z]{4,}/g) || [])]
    .filter(word => !STOP_EN.has(word.toLowerCase()) && word.toLowerCase() !== target.toLowerCase() && Math.abs(word.length - target.length) <= 3 && !sentence.includes(word));
  if (!pool.length) return null;
  const replacement = shuffle(pool)[0];
  return sentence.replace(new RegExp(`\\b${target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`), replacement);
}

export function buildSentenceTrials(sentences, text, lang, maxTrials = 6) {
  const candidates = shuffle(sentences).map(sentence => ({ sentence, changed: tamper(sentence, text, lang) })).filter(pair => pair.changed);
  const pairCount = Math.floor(maxTrials / 2);
  if (pairCount < 1 || candidates.length < pairCount) return [];
  const pairs = candidates.slice(0, pairCount);
  return shuffle(pairs.flatMap(pair => [
    { text: pair.sentence, real: true },
    { text: pair.changed, real: false },
  ]));
}

export default {
  id: 'sentence',
  nameKey: 'drill.sentence.name',
  goalKey: 'drill.sentence.goal',
  whyKey: 'drill.sentence.why',
  evidenceKey: 'drill.sentence.evidence',
  category: 'practice', categoryKey: 'drill.category.practice',
  name: '문장 검증', icon: '✓✕', track: '연습',
  goal: '읽은 문장의 의미가 원문과 같은지 빠르고 정확하게 구별합니다.',
  langs: ['en', 'zh'],
  why: '원문과 바뀐 문장을 같은 수로 섞어야 편향 없이 의미 통합을 연습할 수 있습니다.',
  evidence: '문장 검증은 문장 의미 통합을 확인하는 과제로 사용됩니다.',

  render(root, lang, exit, options = {}) {
    const name = t(this.nameKey);
    const why = trainingRationale(this.id, t(this.whyKey));
    const context = attemptContext(options);
    const difficulty = currentDifficulty(lang);
    let tier = preferredTier(lang);
    const setup = () => mount(root, drillHeader(name, exit, why),
      h('div', { class: 'card fade-in' },
        h('h2', { class: 'h2' }, t('drill.sentence.title')),
        h('p', { class: 'muted' }, t('drill.sentence.instructions')),
        tierPicker(lang, tier, next => { tier = next; setup(); }),
        h('div', { class: 'btnrow', style: { marginTop: '14px' } },
          h('button', { class: 'btn btn--primary btn--lg', onClick: run }, t('drill.sentence.start')))));

    const run = () => {
      const p = pickPracticePassage(lang, { tier });
      if (!p) return setup();
      const novelAtStart = markPassageStarted(p);
      const sentences = content.splitSentences(p.text, lang).filter(sentence => countUnits(sentence, lang) >= (lang === 'zh' ? 8 : 6));
      const trials = buildSentenceTrials(sentences, p.text, lang, 6);
      if (trials.length < 4) {
        mount(root, drillHeader(name, exit), h('div', { class: 'empty' }, t('drill.sentence.not_enough_items')));
        return;
      }
      const read = () => mount(root, drillHeader(t('drill.sentence.read_title'), exit, why),
        h('div', { class: 'note small' }, t('drill.sentence.read_note')),
        h('div', { class: 'card', style: { marginTop: '10px' } }, h('div', { class: 'eyebrow' }, p.title || t('drill.shared.passage')),
          h('div', { class: 'reader', lang: lang === 'zh' ? 'zh-Hans' : 'en', 'data-lang': lang }, h('div', { class: 'reader-wrap' }, p.text))),
        h('div', { class: 'btnrow', style: { marginTop: '12px' } },
          h('button', { class: 'btn btn--primary btn--lg', onClick: () => trial(0, [], []) }, t('drill.sentence.begin_trials'))));

      const trial = (index, results, rts) => {
        if (index >= trials.length) return finish(results, rts);
        const item = trials[index];
        const stimulus = h('div', { class: 'reader', lang: lang === 'zh' ? 'zh-Hans' : 'en', 'data-lang': lang, style: { textAlign: 'center', padding: '18px 6px' } }, '');
        let shown = false;
        let shownAt = 0;
        const answer = saidReal => {
          if (!shown) return;
          results.push(saidReal === item.real);
          rts.push(performance.now() - shownAt);
          trial(index + 1, results, rts);
        };
        const sameButton = h('button', { class: 'btn btn--primary btn--lg', disabled: true, onClick: () => answer(true) }, t('drill.sentence.same'));
        const changedButton = h('button', { class: 'btn btn--lg', disabled: true, onClick: () => answer(false) }, t('drill.sentence.changed'));
        mount(root, drillHeader(t('drill.sentence.trial_title'), exit, null),
          h('div', { class: 'hud' }, h('span', { class: 'chip' }, t('drill.sentence.meaning_prompt')), h('span', { class: 'chip' }, `${index + 1} / ${trials.length}`)),
          h('div', { class: 'card' }, stimulus),
          h('div', { class: 'btnrow', style: { justifyContent: 'center', marginTop: '12px' } },
            sameButton, changedButton));
        schedule(() => {
          stimulus.textContent = item.text;
          shownAt = performance.now();
          shown = true;
          sameButton.disabled = false;
          changedButton.disabled = false;
        }, 250);
      };

      const finish = (results, rts) => {
        const correct = results.filter(Boolean).length;
        const med = Math.round(median(rts));
        const saved = recordAttempt({
          drill: 'sentence', submode: 'verification', benchmark: false,
          lang, tier: p.tier || tier, difficulty,
          passageId: p.id, sourcePassageId: p.id, transferPassageId: null,
          novelAtStart, assisted: false, completed: true,
          units: trials.length, elapsedMs: Math.max(1, Math.round(rts.reduce((sum, value) => sum + value, 0))), rate: null, timingValid: true,
          correct, total: results.length, comprehension: null,
          questionTypes: { sentence_verification: { correct, total: results.length } },
          fatigue: null, medianRtMs: med,
          ...context,
        });
        mount(root, drillHeader(name, exit, null),
          resultCard([
            [`${correct}/${results.length}`, t('drill.shared.accuracy'), t('drill.sentence.balance_note', { each: trials.length / 2 })],
            [(med / 1000).toFixed(1) + 's', t('drill.sentence.median_time')],
          ], () => this.render(root, lang, exit, options), exit, h('div', { class: 'stack' },
            h('p', { class: 'small muted' }, t(correct / results.length >= 5 / 6 ? 'drill.sentence.good_feedback' : 'drill.sentence.retry_feedback')),
            attemptErrorNote(saved))));
      };
      read();
    };
    setup();
  },
};
