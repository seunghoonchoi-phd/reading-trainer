// ===== drills/vocab.js — due-only spaced review plus lexical decision =====
import { h, mount, shuffle, median } from '../util.js';
import * as content from '../content.js?v=20260713-34';
import * as store from '../store.js';
import { inBand } from '../levels.js';
import { t } from '../i18n.js';
import { drillHeader, resultCard, schedule, setTeardown, askFatigue, recordAttempt, attemptErrorNote, attemptContext, currentDifficulty } from './shared.js';
import { icon } from '../icons.js';

function bank(lang) {
  const data = content.data();
  return lang === 'en'
    ? { items: data.vocabEn.words.map(item => ({ key: item.word, band: item.band, front: item.word, ...item })), distractors: data.vocabEn.pseudowords }
    : { items: data.vocabZh.items.map(item => ({ key: item.hanzi, band: item.freq_band || item.hsk || 3, front: item.hanzi, ...item })), distractors: data.vocabZh.pseudochars };
}

function levelItems(lang, items) {
  const explicit = typeof store.getDifficulty === 'function' ? Number(store.getDifficulty(lang)) : NaN;
  const level = Number.isFinite(explicit) ? explicit : (store.getLevel(lang) || 3);
  const eligible = items.filter(item => !(lang === 'en' && item.band <= 1));
  const within = item => Number.isFinite(level) ? Math.abs(Number(item.band) - level) <= 1 : inBand(level, item.band);
  const inWindow = eligible.filter(within);
  return { inWindow, outside: eligible.filter(item => !within(item)) };
}

export function requeueFailedCard(queue, currentIndex, item, retries, maxRetries = 2) {
  const count = retries.get(item.key) || 0;
  if (count >= maxRetries) return false;
  retries.set(item.key, count + 1);
  queue.splice(Math.min(queue.length, currentIndex + 3), 0, item);
  return true;
}

export default {
  id: 'vocab',
  nameKey: 'drill.vocab.name',
  goalKey: 'drill.vocab.goal',
  whyKey: 'drill.vocab.why',
  evidenceKey: 'drill.vocab.evidence',
  category: 'core', categoryKey: 'drill.category.core',
  name: '어휘 복습', icon: '⚡', track: '핵심 훈련',
  goal: '간격을 둔 인출과 어휘 판단으로 단어 접근을 연습합니다.',
  langs: ['en', 'zh'],
  why: '이미 익힌 카드는 복습 예정일에 다시 보고, 실패한 카드는 같은 세션에서 다시 떠올려야 합니다.',
  evidence: '분산 연습과 인출 연습은 장기 기억에 도움이 됩니다.',

  render(root, lang, exit, options = {}) {
    const name = t(this.nameKey);
    const why = t(this.whyKey);
    const context = attemptContext(options);
    const difficulty = currentDifficulty(lang);
    const menu = () => mount(root,
      drillHeader(name, exit, why),
      h('div', { class: 'card fade-in' },
        h('h2', { class: 'h2' }, t('drill.vocab.title')),
        h('p', { class: 'muted' }, t('drill.vocab.instructions')),
        h('div', { class: 'tiles' },
          h('button', { class: 'tile', onClick: spacedReview },
            h('div', { class: 'tile__top' }, h('span', { class: 'iconchip' }, icon('cards')), h('span', { class: 'tile__name' }, t('drill.vocab.cards_name'))),
            h('span', { class: 'tile__goal' }, t('drill.vocab.cards_goal'))),
          h('button', { class: 'tile', onClick: lexicalDecision },
            h('div', { class: 'tile__top' }, h('span', { class: 'iconchip' }, icon('vocab')), h('span', { class: 'tile__name' }, t('drill.vocab.lexical_name'))),
            h('span', { class: 'tile__goal' }, t('drill.vocab.lexical_goal'))))));

    const spacedReview = () => {
      const data = bank(lang);
      const deck = `vocab-${lang}`;
      const conquerDeck = `conquer-vocab-${lang}`;
      const keys = data.items.map(item => item.key);
      const byKey = new Map(data.items.map(item => [item.key, item]));
      const dueKeys = store.srDueList(deck, keys);
      const conquerKeys = store.srKeys(conquerDeck);
      const conquerAvailable = [
        ...store.srDueList(conquerDeck, conquerKeys),
        ...conquerKeys.filter(key => store.srCard(conquerDeck, key).reps === 0),
      ];
      const { inWindow, outside } = levelItems(lang, data.items);
      const newItems = array => array.filter(item => store.srCard(deck, item.key).reps === 0 && !dueKeys.includes(item.key))
        .sort((a, b) => a.band - b.band);
      const dueItems = shuffle(data.items.filter(item => dueKeys.includes(item.key)));
      const conquerItems = [...new Set(conquerAvailable)]
        .filter(key => !dueKeys.includes(key))
        .map(key => byKey.get(key) || { key, front: key, band: 0, gloss_ko: '', fromConquer: true })
        .map(item => ({ ...item, fromConquer: true }))
        .slice(0, 6);
      const freshItems = newItems(inWindow).concat(newItems(outside)).slice(0, 8);
      const queue = dueItems.concat(conquerItems, freshItems);
      const retries = new Map();
      let index = 0;
      let graded = 0;
      let known = 0;
      let again = 0;

      if (!queue.length) {
        mount(root, drillHeader(t('drill.vocab.cards_name'), exit, null),
          resultCard([], spacedReview, exit, h('div', { class: 'note note--good' }, t('drill.vocab.nothing_due'))));
        return;
      }

      const showCard = () => {
        if (index >= queue.length) return finish();
        const item = queue[index];
        let revealed = false;
        const front = h('div', { class: 'flash__front' + (lang === 'zh' ? ' flash__zh' : '') }, item.front);
        const back = h('div', { class: 'stack center', style: { display: 'none' } },
          lang === 'zh'
            ? h('div', { class: 'flash__pinyin' }, item.pinyin || '')
            : h('div', { class: 'flash__pinyin', style: { fontSize: '.9rem' } }, item.pos || ''),
          h('div', { class: 'flash__gloss' }, item.gloss_ko || (item.fromConquer ? t('drill.vocab.lookup_reminder') : '')),
          item.example ? h('div', { class: 'flash__ex' }, item.example) : null,
          lang === 'zh' && item.transparent && item.semantic_radical
            ? h('div', { class: 'note note--good small' }, t('drill.vocab.radical_hint', { radical: item.semantic_radical, meaning: item.radical_meaning_ko || '' }))
            : null);
        const gradeButtons = h('div', { class: 'btnrow', style: { justifyContent: 'center', display: 'none' } },
          h('button', { class: 'btn', onClick: () => grade(0) }, t('drill.vocab.again')),
          h('button', { class: 'btn', onClick: () => grade(1) }, t('drill.vocab.hard')),
          h('button', { class: 'btn btn--primary', onClick: () => grade(2) }, t('drill.vocab.good')),
          h('button', { class: 'btn', onClick: () => grade(3) }, t('drill.vocab.easy')));
        const revealButton = h('button', { class: 'btn btn--primary btn--lg btn--block', onClick: () => {
          revealed = true;
          back.style.display = '';
          gradeButtons.style.display = 'flex';
          revealButton.style.display = 'none';
        } }, t('drill.vocab.reveal'));
        const grade = value => {
          if (!revealed) return;
          store.srReview(item.fromConquer ? conquerDeck : deck, item.key, value);
          graded++;
          if (value >= 2) known++;
          if (value === 0) { again++; requeueFailedCard(queue, index, item, retries); }
          index++;
          showCard();
        };
        mount(root,
          drillHeader(t('drill.vocab.cards_name'), exit, why),
          h('div', { class: 'hud' },
            h('span', { class: 'chip' }, lang === 'en' ? 'English' : '中文'),
            h('span', { class: 'chip' }, `${index + 1} / ${queue.length}`)),
          h('div', { class: 'card flash fade-in' }, front, back),
          h('div', { style: { marginTop: '12px' } }, revealButton, gradeButtons));
      };
      const finish = () => {
        const saved = recordAttempt({
          drill: 'vocab', submode: 'spaced_review', benchmark: false,
          lang, tier: difficulty, difficulty,
          passageId: null, sourcePassageId: null, transferPassageId: null,
          novelAtStart: null, assisted: false, completed: true,
          units: graded, elapsedMs: null, rate: null, timingValid: true,
          correct: known, total: graded, comprehension: null,
          questionTypes: { vocabulary_recall: { correct: known, total: graded } },
          fatigue: null, again,
          ...context,
        });
        mount(root, drillHeader(t('drill.vocab.cards_name'), exit, null),
          resultCard([
            [graded + '', t('drill.vocab.reviewed')],
            [known + '', t('drill.vocab.good_or_better')],
            [again + '', t('drill.vocab.requeued')],
          ], spacedReview, exit, h('div', { class: 'stack' },
            h('p', { class: 'small muted' }, t('drill.vocab.schedule_note')),
            attemptErrorNote(saved))));
      };
      showCard();
    };

    const lexicalDecision = () => {
      const data = bank(lang);
      const { inWindow, outside } = levelItems(lang, data.items);
      const realPool = shuffle(inWindow).concat(shuffle(outside)).slice(0, 14);
      const realTrials = realPool.map(item => ({ stimulus: item.front, real: true, band: item.band }));
      const fakeTrials = shuffle(data.distractors).slice(0, 8).map(stimulus => ({ stimulus, real: false, band: null }));
      const trials = shuffle(realTrials.concat(fakeTrials));
      const results = [];
      let index = 0;
      let pendingDelay = () => {};
      setTeardown(() => pendingDelay());

      const trial = () => {
        if (index >= trials.length) return finish();
        const item = trials[index];
        const stimulus = h('div', { class: 'stim' + (lang === 'zh' ? ' stim--zh' : '') }, '');
        let shown = false;
        let shownAt = 0;
        const wordButton = h('button', { class: 'btn btn--primary btn--lg', disabled: true, onClick: () => answer(true) }, t('drill.vocab.word_yes'));
        const nonwordButton = h('button', { class: 'btn btn--lg', disabled: true, onClick: () => answer(false) }, t('drill.vocab.word_no'));
        mount(root,
          drillHeader(t('drill.vocab.lexical_name'), exit, why),
          h('div', { class: 'hud' },
            h('span', { class: 'chip' }, t('drill.vocab.lexical_prompt')),
            h('span', { class: 'chip' }, `${index + 1} / ${trials.length}`)),
          h('div', { class: 'card' }, stimulus),
          h('div', { class: 'btnrow', style: { justifyContent: 'center' } },
            wordButton, nonwordButton));
        pendingDelay = schedule(() => {
          stimulus.textContent = item.stimulus;
          shownAt = performance.now();
          shown = true;
          wordButton.disabled = false;
          nonwordButton.disabled = false;
        }, 350);
        const answer = saidReal => {
          if (!shown) return;
          const rt = performance.now() - shownAt;
          const correct = saidReal === item.real;
          if (item.real) store.addRT(lang, item.band, rt, correct);
          results.push({ correct, rt, real: item.real });
          index++;
          trial();
        };
      };
      const finish = () => {
        const correctRealRts = results.filter(result => result.real && result.correct).map(result => result.rt);
        const correct = results.filter(result => result.correct).length;
        const med = Math.round(median(correctRealRts));
        askFatigue(root, t('drill.vocab.lexical_fatigue'), exit).then(fatigue => {
          const saved = recordAttempt({
            drill: 'vocab', submode: 'lexical_decision', benchmark: false,
            lang, tier: difficulty, difficulty,
            passageId: null, sourcePassageId: null, transferPassageId: null,
            novelAtStart: null, assisted: false, completed: true,
            units: trials.length, elapsedMs: null, rate: null, timingValid: true,
            correct, total: results.length, comprehension: null,
            questionTypes: { lexical_decision: { correct, total: results.length } },
            fatigue, medianRtMs: med,
            ...context,
          });
          mount(root, drillHeader(t('drill.vocab.lexical_name'), exit, null),
            resultCard([
              [med + 'ms', t('drill.vocab.median_rt'), t('drill.vocab.correct_real_words')],
              [Math.round(correct / Math.max(1, results.length) * 100) + '%', t('drill.shared.accuracy')],
            ], lexicalDecision, exit, h('div', { class: 'stack' },
              h('p', { class: 'small muted' }, t('drill.vocab.rt_note')),
              attemptErrorNote(saved))));
        });
      };
      trial();
    };

    menu();
  },
};
