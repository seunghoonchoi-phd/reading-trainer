// ===== drills/zhseg.js — Chinese word-segmentation (boundary marking) =====
import { h, mount, shuffle } from '../util.js';
import * as content from '../content.js';
import * as store from '../store.js';
import { levelOf } from '../levels.js';
import { drillHeader, resultCard } from './shared.js';

export default {
  id: 'zhseg', name: '중국어 단어 분할', icon: '丨', track: '중국어',
  goal: '띄어쓰기 없는 중국어에서 머릿속 단어 경계를 세우는 능력을 키웁니다.',
  langs: ['zh'],
  why: '중국어는 단어 사이 띄어쓰기가 없어 독자가 머릿속에서 단어 경계를 나눕니다(병렬 어휘 경쟁). 경계 인식 정확도가 L2 이해를 예측합니다. 색칠/띄어쓰기 보조는 정확도가 오르면 사라지는 임시 비계입니다.',
  evidence: '머릿속 분할(Li & Pollatsek 2020); 분할 정확도가 L2 이해 예측(Shen & Jiang 2013); 띄어쓰기는 L2에 약간 도움, 비계로만 사용(Frontiers 2023).',

  render(root, lang, exit) {
    const every = content.data().segZh.sentences || [];
    // 레벨 티어 창 이하 난이도 문장만 (tier 필드 없거나 풀이 빈약하면 전체)
    const maxTier = Math.max(...levelOf(store.getLevel('zh') || 'builder').tiers);
    const filtered = every.filter(s => (s.tier || 1) <= maxTier);
    const all = filtered.length >= 8 ? filtered : every;
    let hint = false;
    let pool = shuffle(all).slice(0, 8);
    let i = 0; const scores = [];

    const goldCuts = (s) => {
      const cuts = new Set(); let acc = 0;
      for (let k = 0; k < s.gold_words.length - 1; k++) { acc += Array.from(s.gold_words[k]).length; cuts.add(acc); }
      return cuts;
    };

    const trial = () => {
      if (i >= pool.length) return finish();
      const s = pool[i];
      const chars = Array.from(s.text);
      const gold = goldCuts(s);
      const cuts = new Set();
      const gapEls = [];

      const render = () => {
        const line = h('div', { class: 'segline' });
        chars.forEach((c, idx) => {
          // word coloring hint
          const span = h('span', { class: 'segchar' }, c);
          if (hint) {
            let acc = 0, wi = 0;
            for (let k = 0; k < s.gold_words.length; k++) { const len = Array.from(s.gold_words[k]).length; if (idx < acc + len) { wi = k; break; } acc += len; }
            span.style.color = wi % 2 ? 'var(--accent)' : 'var(--ink)';
          }
          line.append(span);
          if (idx < chars.length - 1) {
            const cut = cuts.has(idx + 1);
            const gap = h('button', {
              type: 'button', class: 'seggap' + (cut ? ' is-cut' : ''),
              'aria-pressed': cut ? 'true' : 'false',
              'aria-label': `${idx + 1}번째 글자 뒤 단어 경계 ${cut ? '해제' : '표시'}`,
              onClick: () => { if (cuts.has(idx + 1)) cuts.delete(idx + 1); else cuts.add(idx + 1); render(); },
            });
            gapEls.push(gap); line.append(gap);
          }
        });
        mount(root, drillHeader('단어 분할', exit, this.why),
          h('div', { class: 'hud' }, h('span', { class: 'chip' }, '글자 사이를 눌러 단어 경계 표시'), h('span', { class: 'chip' }, `${i + 1} / ${pool.length}`)),
          h('div', { class: 'card' }, line),
          h('div', { class: 'btnrow', style: { marginTop: '12px' } },
            h('button', { class: 'btn btn--primary', onClick: check }, '채점'),
            h('button', { class: 'btn btn--ghost', onClick: () => { hint = !hint; render(); } }, hint ? '색칠 끄기' : '색칠 힌트')));
      };

      const check = () => {
        // precision/recall over internal boundary positions
        const allPos = chars.length - 1;
        let tp = 0;
        cuts.forEach(c => { if (gold.has(c)) tp++; });
        const precision = cuts.size ? tp / cuts.size : (gold.size === 0 ? 1 : 0);
        const recall = gold.size ? tp / gold.size : 1;
        const f1 = (precision + recall) ? 2 * precision * recall / (precision + recall) : 0;
        scores.push(f1);
        // reveal gold
        const correctLine = h('div', { class: 'segline' });
        s.gold_words.forEach((w, k) => { correctLine.append(h('span', { style: { color: k % 2 ? 'var(--accent)' : 'var(--ink)', marginRight: '6px' } }, w)); });
        mount(root, drillHeader('정답', exit, null),
          h('div', { class: 'card center' },
            h('p', { class: 'eyebrow' }, `정확도 ${Math.round(f1 * 100)}%`),
            h('p', { class: 'small muted' }, '정답 분할'), correctLine,
            h('button', { class: 'btn btn--primary', style: { marginTop: '12px' }, onClick: () => { i++; trial(); } }, i + 1 < pool.length ? '다음' : '결과')));
      };

      render();
    };

    const finish = () => {
      const avg = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
      // fade scaffold automatically when doing well
      store.logSession({ drill: 'zhseg', lang: 'zh', acc: avg });
      mount(root, drillHeader(this.name, exit, null),
        resultCard([[Math.round(avg * 100) + '%', '평균 경계 정확도']], () => this.render(root, lang, exit), exit,
          avg >= 0.85 ? h('div', { class: 'note note--good' }, '정확도가 높아 다음엔 색칠 보조 없이 더 긴 문장에 도전하세요.') : h('p', { class: 'small muted' }, '색칠 힌트로 단어 묶음 감을 잡은 뒤, 점차 힌트 없이 해보세요.')));
    };

    if (!all.length) { mount(root, drillHeader(this.name, exit), h('div', { class: 'empty' }, '분할 데이터가 없습니다.')); return; }
    trial();
  },
};
