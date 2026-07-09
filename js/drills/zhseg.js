// ===== drills/zhseg.js — Chinese word-boundary support =====
import { h, mount, shuffle } from '../util.js';
import * as content from '../content.js';
import { t } from '../i18n.js';
import { drillHeader, resultCard, preferredTier, recordAttempt, attemptErrorNote, attemptContext, currentDifficulty } from './shared.js';

export function goldBoundaryCuts(words) {
  const cuts = new Set();
  let length = 0;
  for (let index = 0; index < words.length - 1; index++) {
    length += Array.from(words[index]).length;
    cuts.add(length);
  }
  return cuts;
}

export function boundaryF1(selectedCuts, goldCuts) {
  let truePositive = 0;
  selectedCuts.forEach(cut => { if (goldCuts.has(cut)) truePositive++; });
  const precision = selectedCuts.size ? truePositive / selectedCuts.size : (goldCuts.size === 0 ? 1 : 0);
  const recall = goldCuts.size ? truePositive / goldCuts.size : 1;
  return precision + recall ? 2 * precision * recall / (precision + recall) : 0;
}

export default {
  id: 'zhseg',
  nameKey: 'drill.zhseg.name',
  goalKey: 'drill.zhseg.goal',
  whyKey: 'drill.zhseg.why',
  evidenceKey: 'drill.zhseg.evidence',
  category: 'language_support', categoryKey: 'drill.category.language_support',
  name: '중국어 단어 분할', icon: '丨', track: '언어 보조',
  goal: '띄어쓰기가 없는 중국어 문장에서 단어 경계를 찾습니다.',
  langs: ['zh'],
  why: '색칠 힌트는 경계를 익히는 임시 도움이며, 힌트를 쓴 결과는 무도움 결과와 구분해야 합니다.',
  evidence: '중국어 읽기에서는 단어 분할이 필요하며 시각 경계 보조는 학습자에게 제한적으로 도움을 줄 수 있습니다.',

  render(root, lang, exit, options = {}) {
    const name = t(this.nameKey);
    const why = t(this.whyKey);
    const context = attemptContext(options);
    const difficulty = currentDifficulty('zh');
    const allItems = content.data().segZh.sentences || [];
    const filtered = allItems.filter(item => (item.tier || 1) <= difficulty);
    const pool = shuffle(filtered.length >= 8 ? filtered : allItems).slice(0, 8);
    const scores = [];
    let index = 0;
    let assisted = false;

    const trial = () => {
      if (index >= pool.length) return finish();
      const item = pool[index];
      const chars = Array.from(item.text);
      const gold = goldBoundaryCuts(item.gold_words);
      const cuts = new Set();
      let hint = false;
      const renderTrial = () => {
        const line = h('div', { class: 'segline' });
        chars.forEach((char, charIndex) => {
          const span = h('span', { class: 'segchar' }, char);
          if (hint) {
            let consumed = 0;
            let wordIndex = 0;
            for (let i = 0; i < item.gold_words.length; i++) {
              const length = Array.from(item.gold_words[i]).length;
              if (charIndex < consumed + length) { wordIndex = i; break; }
              consumed += length;
            }
            span.style.color = wordIndex % 2 ? 'var(--accent)' : 'var(--ink)';
          }
          line.append(span);
          if (charIndex < chars.length - 1) {
            const selected = cuts.has(charIndex + 1);
            line.append(h('button', {
              type: 'button', class: 'seggap' + (selected ? ' is-cut' : ''),
              'aria-pressed': selected ? 'true' : 'false',
              'aria-label': t(selected ? 'drill.zhseg.remove_boundary' : 'drill.zhseg.add_boundary', { position: charIndex + 1 }),
              onClick: () => { if (selected) cuts.delete(charIndex + 1); else cuts.add(charIndex + 1); renderTrial(); },
            }));
          }
        });
        mount(root, drillHeader(t('drill.zhseg.trial_title'), exit, why),
          h('div', { class: 'hud' }, h('span', { class: 'chip' }, t('drill.zhseg.prompt')), h('span', { class: 'chip' }, `${index + 1} / ${pool.length}`)),
          h('div', { class: 'card' }, line),
          h('div', { class: 'btnrow', style: { marginTop: '12px' } },
            h('button', { class: 'btn btn--primary', onClick: check }, t('drill.shared.check')),
            h('button', { class: 'btn btn--ghost', 'aria-pressed': hint ? 'true' : 'false', onClick: () => {
              hint = !hint;
              if (hint) assisted = true;
              renderTrial();
            } }, hint ? t('drill.zhseg.hide_hint') : t('drill.zhseg.show_hint'))));
      };
      const check = () => {
        const score = boundaryF1(cuts, gold);
        scores.push(score);
        const answerLine = h('div', { class: 'segline' });
        item.gold_words.forEach((word, wordIndex) => answerLine.append(h('span', { style: { color: wordIndex % 2 ? 'var(--accent)' : 'var(--ink)', marginRight: '6px' } }, word)));
        mount(root, drillHeader(t('drill.shared.answer'), exit, null),
          h('div', { class: 'card center' },
            h('p', { class: 'eyebrow' }, t('drill.zhseg.score', { score: Math.round(score * 100) })),
            h('p', { class: 'small muted' }, t('drill.zhseg.gold_segmentation')), answerLine,
            h('button', { class: 'btn btn--primary', style: { marginTop: '12px' }, onClick: () => { index++; trial(); } }, index + 1 < pool.length ? t('drill.shared.next') : t('drill.shared.result'))));
      };
      renderTrial();
    };

    const finish = () => {
      const average = scores.length ? scores.reduce((sum, value) => sum + value, 0) / scores.length : 0;
      const saved = recordAttempt({
        drill: 'zhseg', submode: 'boundary', benchmark: false,
        lang: 'zh', tier: difficulty, difficulty,
        passageId: null, sourcePassageId: null, transferPassageId: null,
        novelAtStart: null, assisted, completed: true,
        units: pool.length, elapsedMs: null, rate: null, timingValid: true,
        correct: null, total: null, comprehension: null,
        questionTypes: {},
        fatigue: null, boundaryF1: average,
        ...context,
      });
      mount(root, drillHeader(name, exit, null), resultCard([
        [Math.round(average * 100) + '%', t('drill.zhseg.average_f1')],
      ], () => this.render(root, lang, exit, options), exit, h('div', { class: 'stack' },
        assisted ? h('div', { class: 'note small' }, t('drill.zhseg.assisted_note')) : null,
        h('p', { class: 'small muted' }, t(average >= 0.85 ? 'drill.zhseg.good_feedback' : 'drill.zhseg.practice_feedback')),
        attemptErrorNote(saved))));
    };

    if (!pool.length) {
      mount(root, drillHeader(name, exit), h('div', { class: 'empty' }, t('drill.zhseg.no_data')));
      return;
    }
    trial();
  },
};
