// ===== drills/zhchar.js — Chinese character recognition speed + radical decomposition =====
import { h, mount, shuffle, sample, median } from '../util.js';
import * as content from '../content.js';
import * as store from '../store.js';
import { inBand } from '../levels.js';
import { drillHeader, askMCQ, resultCard } from './shared.js';

export default {
  id: 'zhchar', name: '중국어 글자인지·부수', icon: '字', track: '중국어',
  goal: '글자→뜻/소리 매핑을 자동화하고, 투명한 형성자에서만 부수를 활용합니다.',
  langs: ['zh'],
  why: '글자 인지의 정확도와 속도는 L2 중국어 이해의 가장 강한 예측 변수입니다. 고빈도 글자를 1초 안에 알아보게 만들고, 의미가 “투명한” 형성자에 한해 의미 부수를 활용합니다. 불투명 글자에 부수를 억지로 대면 오히려 방해됩니다.',
  evidence: '글자 명명 정확도→속도가 최강 예측변수(Shen & Jiang 2013). 부수는 투명/규칙적 글자에만 도움(J Neurosci 2022). 통째 그림 암기 아님.',

  render(root, lang, exit) {
    const items = content.data().vocabZh.items || [];
    const menu = () => mount(root, drillHeader(this.name, exit, this.why),
      h('div', { class: 'card fade-in' },
        h('h2', { class: 'h2' }, '글자 인지 · 부수'),
        h('div', { class: 'tiles' },
          h('button', { class: 'tile', onClick: naming },
            h('div', { class: 'tile__top' }, h('span', { class: 'tile__ico' }, '⏱'), h('span', { class: 'tile__name' }, '글자 인지속도')),
            h('span', { class: 'tile__goal' }, '글자를 보고 1초 안에 뜻을 고릅니다. 반응시간을 측정합니다.')),
          h('button', { class: 'tile', onClick: radical },
            h('div', { class: 'tile__top' }, h('span', { class: 'tile__ico' }, '氵'), h('span', { class: 'tile__name' }, '의미 부수 (투명 글자만)')),
            h('span', { class: 'tile__goal' }, '형성자의 의미 부수로 뜻의 범주를 예측합니다.')))));

    // ---- naming: char -> meaning, timed ----
    const naming = () => {
      // 느리거나 틀렸던 글자 우선 재출제 + 레벨 빈도대 창 우선
      const lv = store.getLevel('zh') || 'builder';
      const hard = store.hardKeys('zh');
      const hardItems = items.filter(x => hard.includes(x.hanzi)).slice(0, 4);
      const restPool = items.filter(x => !hardItems.includes(x));
      const inWin = restPool.filter(x => inBand(lv, x.freq_band || x.hsk || 3));
      const filler = restPool.filter(x => !inWin.includes(x));
      const pool = shuffle(hardItems.concat(sample(inWin, 12), sample(filler, 12)).slice(0, 12));
      let i = 0; const rts = []; let correct = 0;
      const trial = () => {
        if (i >= pool.length) return finish();
        const it = pool[i];
        const distract = shuffle(items.filter(x => x.gloss_ko && x.gloss_ko !== it.gloss_ko)).slice(0, 3).map(x => x.gloss_ko);
        const opts = shuffle([it.gloss_ko, ...distract]);
        const item = { q: '', options: opts, answer: opts.indexOf(it.gloss_ko), explanation: `${it.hanzi} (${it.pinyin}) = ${it.gloss_ko}` };
        const big = h('div', { class: 'stim stim--zh' }, it.hanzi);
        const host = h('div');
        mount(root, drillHeader('글자 인지속도', exit, this.why),
          h('div', { class: 'hud' }, h('span', { class: 'chip' }, '뜻을 빠르게'), h('span', { class: 'chip' }, `${i + 1} / ${pool.length}`)),
          h('div', { class: 'card' }, big), host);
        const t0 = performance.now();
        askMCQ(host, item).then(r => {
          const rt = performance.now() - t0;
          if (r.correct) {
            correct++; store.addRT('zh', it.freq_band || it.hsk || 3, rt, true); rts.push(rt);
            if (rt > 2500) store.bumpHard('zh', it.hanzi); else store.easeHard('zh', it.hanzi);
          } else store.bumpHard('zh', it.hanzi); // 틀리거나 느린 글자는 다음에 더 자주
          i++; trial();
        });
      };
      const finish = () => {
        const med = Math.round(median(rts));
        store.logSession({ drill: 'zhchar-naming', lang: 'zh', rt: med, correct });
        mount(root, drillHeader(this.name, exit, null),
          resultCard([[med + 'ms', '중앙 반응시간'], [correct + '/' + pool.length, '정확']], naming, exit,
            h('p', { class: 'small muted' }, '고빈도 글자는 1초 미만(서브초)이 목표입니다. 느리거나 틀린 글자가 다음에 더 자주 나옵니다.')));
      };
      trial();
    };

    // ---- radical: transparent compounds only ----
    const radical = () => {
      const trans = items.filter(x => x.transparent && x.semantic_radical && x.radical_meaning_ko);
      if (trans.length < 3) { mount(root, drillHeader('의미 부수', exit, null), h('div', { class: 'empty' }, '투명한 형성자 데이터가 부족합니다. 글자 인지속도 훈련을 먼저 해보세요.'), h('div', { class: 'center' }, h('button', { class: 'btn', onClick: menu }, '뒤로'))); return; }
      const pool = sample(trans, Math.min(8, trans.length));
      let i = 0, correct = 0;
      const trial = () => {
        if (i >= pool.length) return finish();
        const it = pool[i];
        const distract = shuffle(trans.filter(x => x.radical_meaning_ko !== it.radical_meaning_ko)).slice(0, 3).map(x => x.radical_meaning_ko);
        const opts = shuffle([it.radical_meaning_ko, ...new Set(distract)]).slice(0, 4);
        if (!opts.includes(it.radical_meaning_ko)) opts[0] = it.radical_meaning_ko;
        const item = { q: `‘${it.hanzi}’ 의 의미 부수가 가리키는 범주는?`, options: opts, answer: opts.indexOf(it.radical_meaning_ko), explanation: `의미 부수 ‘${it.semantic_radical}’ → ${it.radical_meaning_ko}. (${it.hanzi} = ${it.gloss_ko})` };
        const host = h('div');
        mount(root, drillHeader('의미 부수', exit, this.why),
          h('div', { class: 'hud' }, h('span', { class: 'chip' }, '투명 형성자만'), h('span', { class: 'chip' }, `${i + 1} / ${pool.length}`)),
          h('div', { class: 'card center' }, h('div', { class: 'stim stim--zh' }, it.hanzi)), host);
        askMCQ(host, item).then(r => { if (r.correct) correct++; i++; trial(); });
      };
      const finish = () => {
        store.logSession({ drill: 'zhchar-radical', lang: 'zh', correct });
        mount(root, drillHeader(this.name, exit, null),
          resultCard([[correct + '/' + pool.length, '정확']], radical, exit,
            h('div', { class: 'note note--warn' }, '주의: 부수 힌트는 의미가 투명한 글자에서만 통합니다. 모든 한자를 부수로 풀 수 있다고 일반화하지 마세요.')));
      };
      trial();
    };

    if (!items.length) { mount(root, drillHeader(this.name, exit), h('div', { class: 'empty' }, '글자 데이터가 없습니다.')); return; }
    menu();
  },
};
