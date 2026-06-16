// ===== drills/vocab.js — frequency SR flashcards + speeded lexical decision =====
import { h, mount, clear, shuffle, sample, median, startTimer } from '../util.js';
import * as content from '../content.js';
import * as store from '../store.js';
import { drillHeader, resultCard } from './shared.js';

function bank(lang) {
  const d = content.data();
  return lang === 'en'
    ? { items: d.vocabEn.words.map(w => ({ key: w.word, band: w.band, front: w.word, ...w })), distract: d.vocabEn.pseudowords }
    : { items: d.vocabZh.items.map(w => ({ key: w.hanzi, band: w.freq_band || w.hsk || 3, front: w.hanzi, ...w })), distract: d.vocabZh.pseudochars };
}

export default {
  id: 'vocab', name: '어휘·인지속도', icon: '⚡', track: '커버리지',
  goal: '읽기의 진짜 병목인 단어 인지를 자동화합니다 (빈도순 간격반복 + 인지속도).',
  langs: ['en', 'zh'],
  why: '읽기 속도의 병목은 눈이 아니라 어휘 접근입니다. 빈도가 높은 단어부터 간격반복(SM-2)으로 외우고, 어휘판단 과제로 재인 속도(반응시간)와 안정성을 높입니다. 빠르고 들쭉날쭉하지 않게 만드는 게 목표 — 이것이 “한눈에 들어오는” 느낌의 토대입니다.',
  evidence: '간격·인출 효과 HIGH 유틸리티(Dunlosky 2013; Cepeda 2006/08). 어휘 접근이 병목(Rayner 2016; Grabe). RT 변동성은 참고 지표일 뿐 검증된 점수 아님.',

  render(root, lang, exit) {
    const menu = () => mount(root,
      drillHeader(this.name, exit, this.why),
      h('div', { class: 'card fade-in' },
        h('h2', { class: 'h2' }, '어휘·인지속도'),
        h('p', { class: 'muted' }, '두 가지 훈련을 번갈아 하세요. 카드는 “아는 것”을, 어휘판단은 “빠르게 아는 것”을 만듭니다.'),
        h('div', { class: 'tiles' },
          h('button', { class: 'tile', onClick: srMode },
            h('div', { class: 'tile__top' }, h('span', { class: 'tile__ico' }, '🗂'), h('span', { class: 'tile__name' }, '어휘 카드 (간격반복)')),
            h('span', { class: 'tile__goal' }, '빈도순으로 새 단어를 익히고 복습 일정에 맞춰 다시 떠올립니다.')),
          h('button', { class: 'tile', onClick: ldMode },
            h('div', { class: 'tile__top' }, h('span', { class: 'tile__ico' }, '⏱'), h('span', { class: 'tile__name' }, '어휘판단 (속도)')),
            h('span', { class: 'tile__goal' }, '단어/비단어를 빠르게 가려 인지 반응시간을 측정·단축합니다.')))));

    // ---------- SR flashcards ----------
    const srMode = () => {
      const b = bank(lang);
      const deck = 'vocab-' + lang;
      const keys = b.items.map(i => i.key);
      const due = store.srDueList(deck, keys);
      // build session: due cards + up to 8 new, prioritized by frequency band (low band = frequent = first)
      const dueItems = b.items.filter(i => due.includes(i.key));
      const newItems = b.items.filter(i => store.srCard(deck, i.key).reps === 0 && !due.includes(i.key))
        .sort((x, y) => x.band - y.band).slice(0, 8);
      let queue = shuffle(dueItems).concat(newItems);
      if (!queue.length) queue = sample(b.items, Math.min(10, b.items.length));
      let i = 0, graded = 0, known = 0;

      const card = () => {
        if (i >= queue.length) return finish();
        const it = queue[i];
        let revealed = false;
        const t = startTimer();
        const front = lang === 'zh'
          ? h('div', { class: 'flash__front flash__zh' }, it.front)
          : h('div', { class: 'flash__front' }, it.front);
        const back = h('div', { class: 'stack center', style: { display: 'none' } },
          lang === 'zh' ? h('div', { class: 'flash__pinyin' }, it.pinyin) : h('div', { class: 'flash__pinyin', style: { fontSize: '.9rem' } }, it.pos || ''),
          h('div', { class: 'flash__gloss' }, it.gloss_ko),
          it.example ? h('div', { class: 'flash__ex' }, it.example) : null,
          (lang === 'zh' && it.transparent && it.semantic_radical) ? h('div', { class: 'note note--good small' }, `의미 힌트: 부수 ‘${it.semantic_radical}’ = ${it.radical_meaning_ko || ''}`) : null);
        const grades = h('div', { class: 'btnrow', style: { justifyContent: 'center', display: 'none' } },
          h('button', { class: 'btn', onClick: () => grade(0) }, '다시'),
          h('button', { class: 'btn', onClick: () => grade(1) }, '어려움'),
          h('button', { class: 'btn btn--primary', onClick: () => grade(2) }, '알맞음'),
          h('button', { class: 'btn', onClick: () => grade(3) }, '쉬움'));
        const revealBtn = h('button', { class: 'btn btn--primary btn--lg btn--block', onClick: reveal }, '뜻 보기');
        function reveal() {
          revealed = true; const rt = t.stop();
          store.addRT(lang, it.band, rt, true);
          back.style.display = ''; grades.style.display = 'flex'; revealBtn.style.display = 'none';
        }
        function grade(g) {
          if (!revealed) return; store.srReview(deck, it.key, g); graded++; if (g >= 2) known++;
          i++; card();
        }
        mount(root,
          drillHeader('어휘 카드', exit, this.why),
          h('div', { class: 'hud' }, h('span', { class: 'chip' }, lang === 'en' ? 'English' : '中文'), h('span', { class: 'chip' }, `${i + 1} / ${queue.length}`)),
          h('div', { class: 'card flash fade-in' }, front, back),
          h('div', { style: { marginTop: '12px' } }, revealBtn, grades));
      };
      const finish = () => mount(root, drillHeader('어휘 카드', exit, null),
        resultCard([[graded + '', '복습한 카드'], [known + '', '알맞음 이상']], srMode, exit,
          h('p', { class: 'small muted' }, '복습 일정(간격반복)에 따라 다음에 다시 등장합니다.')));
      store.logSession({ drill: 'vocab-sr', lang });
      card();
    };

    // ---------- speeded lexical decision ----------
    const ldMode = () => {
      const b = bank(lang);
      const reals = shuffle(b.items).slice(0, 14).map(x => ({ stim: x.front, real: true, band: x.band }));
      const fakes = shuffle(b.distract).slice(0, 8).map(x => ({ stim: x, real: false, band: null }));
      const trials = shuffle(reals.concat(fakes));
      let i = 0; const results = [];

      const trial = () => {
        if (i >= trials.length) return finish();
        const tr = trials[i];
        const stim = h('div', { class: 'stim' + (lang === 'zh' ? ' stim--zh' : '') }, '');
        mount(root,
          drillHeader('어휘판단', exit, this.why),
          h('div', { class: 'hud' }, h('span', { class: 'chip' }, '실제 단어인지 빠르게 판단'), h('span', { class: 'chip' }, `${i + 1} / ${trials.length}`)),
          h('div', { class: 'card' }, stim),
          h('div', { class: 'btnrow', style: { justifyContent: 'center' } },
            h('button', { class: 'btn btn--primary btn--lg', onClick: () => answer(true) }, '단어 ✓'),
            h('button', { class: 'btn btn--lg', onClick: () => answer(false) }, '비단어 ✕')));
        // brief fixation then show
        let shown = false, t0 = 0;
        setTimeout(() => { stim.textContent = tr.stim; t0 = performance.now(); shown = true; }, 350);
        function answer(said) {
          if (!shown) return;
          const rt = performance.now() - t0;
          const correct = said === tr.real;
          if (tr.real) store.addRT(lang, tr.band, rt, correct);
          results.push({ correct, rt, real: tr.real });
          i++; trial();
        }
      };
      const finish = () => {
        const correctReals = results.filter(r => r.real && r.correct).map(r => r.rt);
        const acc = results.filter(r => r.correct).length / results.length;
        const med = Math.round(median(correctReals));
        store.logSession({ drill: 'vocab-ld', lang, acc, rt: med });
        mount(root, drillHeader('어휘판단', exit, null),
          resultCard([
            [med + 'ms', '중앙 반응시간', '맞힌 진짜 단어'],
            [Math.round(acc * 100) + '%', '정확도'],
          ], ldMode, exit,
            h('p', { class: 'small muted' }, '반응시간이 짧고 일정해질수록 단어 인지가 자동화된 것입니다. (참고 지표이며 검증된 “자동화 점수”는 아닙니다.)')));
      };
      trial();
    };

    menu();
  },
};
