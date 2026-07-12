// ===== drills/zhchar.js — Chinese character recognition and radical support =====
import { h, mount, shuffle, median } from '../util.js';
import * as content from '../content.js';
import * as store from '../store.js';
import { inBand } from '../levels.js';
import { t } from '../i18n.js';
import { drillHeader, trainingRationale, askMCQ, resultCard, recordAttempt, attemptErrorNote, attemptContext, currentDifficulty } from './shared.js';

export function buildZhCharPool(items, hardKeys, levelKey, limit = 12) {
  const hard = hardKeys.map(key => items.find(item => item.hanzi === key)).filter(Boolean).slice(0, Math.min(4, limit));
  const hardSet = new Set(hard.map(item => item.hanzi));
  const remaining = items.filter(item => !hardSet.has(item.hanzi));
  const within = item => Number.isFinite(Number(levelKey))
    ? Math.abs(Number(item.freq_band || item.hsk || 3) - Number(levelKey)) <= 1
    : inBand(levelKey, item.freq_band || item.hsk || 3);
  const inWindow = shuffle(remaining.filter(within));
  const outside = shuffle(remaining.filter(item => !within(item)));
  return hard.concat(inWindow, outside).slice(0, limit);
}

export default {
  id: 'zhchar',
  nameKey: 'drill.zhchar.name',
  goalKey: 'drill.zhchar.goal',
  whyKey: 'drill.zhchar.why',
  evidenceKey: 'drill.zhchar.evidence',
  category: 'language_support', categoryKey: 'drill.category.language_support',
  name: '중국어 글자 인지', icon: '字', track: '언어 보조',
  goal: '글자의 뜻과 소리를 더 빠르고 정확하게 떠올리고, 투명한 글자에서만 부수 힌트를 씁니다.',
  langs: ['zh'],
  why: '느리거나 틀린 글자를 먼저 다시 만나야 연습이 약점에 집중됩니다.',
  evidence: '글자 인지 정확도와 속도는 중국어 제2언어 읽기와 관련되며 부수 힌트의 도움은 글자에 따라 다릅니다.',

  render(root, lang, exit, options = {}) {
    const name = t(this.nameKey);
    const why = trainingRationale(this.id, t(this.whyKey));
    const context = attemptContext(options);
    const difficulty = currentDifficulty('zh');
    const items = content.data().vocabZh.items || [];
    const menu = () => mount(root, drillHeader(name, exit, why),
      h('div', { class: 'card fade-in' },
        h('h2', { class: 'h2' }, t('drill.zhchar.title')),
        h('div', { class: 'tiles' },
          h('button', { class: 'tile', onClick: recognition },
            h('div', { class: 'tile__top' }, h('span', { class: 'tile__ico' }, '⏱'), h('span', { class: 'tile__name' }, t('drill.zhchar.recognition_name'))),
            h('span', { class: 'tile__goal' }, t('drill.zhchar.recognition_goal'))),
          h('button', { class: 'tile', onClick: radical },
            h('div', { class: 'tile__top' }, h('span', { class: 'tile__ico' }, '氵'), h('span', { class: 'tile__name' }, t('drill.zhchar.radical_name'))),
            h('span', { class: 'tile__goal' }, t('drill.zhchar.radical_goal'))))));

    const recognition = () => {
      const configured = typeof store.getDifficulty === 'function' ? Number(store.getDifficulty('zh')) : NaN;
      const level = Number.isFinite(configured) ? configured : (store.getLevel('zh') || 3);
      const pool = buildZhCharPool(items, store.hardKeys('zh'), level, 12);
      const rts = [];
      let index = 0;
      let correct = 0;
      const trial = () => {
        if (index >= pool.length) return finish();
        const item = pool[index];
        const distractors = shuffle(items.filter(candidate => candidate.gloss_ko && candidate.gloss_ko !== item.gloss_ko)).slice(0, 3).map(candidate => candidate.gloss_ko);
        const options = shuffle([item.gloss_ko, ...distractors]);
        const question = {
          q: '', options, answer: options.indexOf(item.gloss_ko),
          explanation: t('drill.zhchar.recognition_explanation', { char: item.hanzi, pinyin: item.pinyin, gloss: item.gloss_ko }),
        };
        const host = h('div');
        mount(root, drillHeader(t('drill.zhchar.recognition_name'), exit, why),
          h('div', { class: 'hud' }, h('span', { class: 'chip' }, t('drill.zhchar.choose_meaning')), h('span', { class: 'chip' }, `${index + 1} / ${pool.length}`)),
          h('div', { class: 'card' }, h('div', { class: 'stim stim--zh' }, item.hanzi)), host);
        const shownAt = performance.now();
        askMCQ(host, question, { startedAt: shownAt }).then(answer => {
          const rt = answer.responseMs;
          if (answer.correct) {
            correct++;
            store.addRT('zh', item.freq_band || item.hsk || 3, rt, true);
            rts.push(rt);
            if (rt > 2500) store.bumpHard('zh', item.hanzi); else store.easeHard('zh', item.hanzi);
          } else {
            store.bumpHard('zh', item.hanzi);
          }
          index++;
          trial();
        });
      };
      const finish = () => {
        const med = Math.round(median(rts));
        const saved = recordAttempt({
          drill: 'zhchar', submode: 'recognition', benchmark: false,
          lang: 'zh', tier: difficulty, difficulty,
          passageId: null, sourcePassageId: null, transferPassageId: null,
          novelAtStart: null, assisted: false, completed: true,
          units: pool.length, elapsedMs: null, rate: null, timingValid: true,
          correct, total: pool.length, comprehension: null,
          questionTypes: { character_recognition: { correct, total: pool.length } },
          fatigue: null, medianRtMs: med,
          ...context,
        });
        mount(root, drillHeader(name, exit, null), resultCard([
          [med + 'ms', t('drill.zhchar.median_rt')],
          [`${correct}/${pool.length}`, t('drill.shared.accuracy')],
        ], recognition, exit, h('div', { class: 'stack' },
          h('p', { class: 'small muted' }, t('drill.zhchar.hard_priority_note')),
          attemptErrorNote(saved))));
      };
      trial();
    };

    const radical = () => {
      const transparent = items.filter(item => item.transparent && item.semantic_radical && item.radical_meaning_ko);
      if (transparent.length < 3) {
        mount(root, drillHeader(t('drill.zhchar.radical_name'), exit, null),
          h('div', { class: 'empty' }, t('drill.zhchar.radical_empty')),
          h('div', { class: 'center' }, h('button', { class: 'btn', onClick: menu }, t('drill.shared.back'))));
        return;
      }
      const pool = shuffle(transparent).slice(0, Math.min(8, transparent.length));
      let index = 0;
      let correct = 0;
      const trial = () => {
        if (index >= pool.length) return finish();
        const item = pool[index];
        const distractors = shuffle(transparent.filter(candidate => candidate.radical_meaning_ko !== item.radical_meaning_ko)).slice(0, 3).map(candidate => candidate.radical_meaning_ko);
        const options = shuffle([item.radical_meaning_ko, ...new Set(distractors)]).slice(0, 4);
        if (!options.includes(item.radical_meaning_ko)) options[0] = item.radical_meaning_ko;
        const question = {
          q: t('drill.zhchar.radical_question', { char: item.hanzi }),
          options,
          answer: options.indexOf(item.radical_meaning_ko),
          explanation: t('drill.zhchar.radical_explanation', { radical: item.semantic_radical, meaning: item.radical_meaning_ko, char: item.hanzi, gloss: item.gloss_ko }),
        };
        const host = h('div');
        mount(root, drillHeader(t('drill.zhchar.radical_name'), exit, why),
          h('div', { class: 'hud' }, h('span', { class: 'chip' }, t('drill.zhchar.transparent_only')), h('span', { class: 'chip' }, `${index + 1} / ${pool.length}`)),
          h('div', { class: 'card center' }, h('div', { class: 'stim stim--zh' }, item.hanzi)), host);
        askMCQ(host, question).then(answer => { if (answer.correct) correct++; index++; trial(); });
      };
      const finish = () => {
        const saved = recordAttempt({
          drill: 'zhchar', submode: 'radical', benchmark: false,
          lang: 'zh', tier: difficulty, difficulty,
          passageId: null, sourcePassageId: null, transferPassageId: null,
          novelAtStart: null, assisted: true, completed: true,
          units: pool.length, elapsedMs: null, rate: null, timingValid: true,
          correct, total: pool.length, comprehension: null,
          questionTypes: { radical_category: { correct, total: pool.length } },
          fatigue: null,
          ...context,
        });
        mount(root, drillHeader(name, exit, null), resultCard([
          [`${correct}/${pool.length}`, t('drill.shared.accuracy')],
        ], radical, exit, h('div', { class: 'stack' },
          h('div', { class: 'note note--warn' }, t('drill.zhchar.radical_warning')),
          attemptErrorNote(saved))));
      };
      trial();
    };

    if (!items.length) {
      mount(root, drillHeader(name, exit), h('div', { class: 'empty' }, t('drill.zhchar.no_data')));
      return;
    }
    menu();
  },
};
