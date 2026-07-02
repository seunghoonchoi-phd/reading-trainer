// ===== drills/sentence.js — 문장 검증 스피드: 문장 수준 통합의 속도·정확도 훈련 =====
// Sentence Verification Technique(SVT) 차용: 지문을 읽은 뒤, 원문 문장과
// 한 단어가 바뀐 변조 문장을 섞어 보여주고 "지문과 일치하는가"를 빠르게 판정한다.
// 변조는 지문 안의 다른 실질어와 교체 — 정답이 원문에 의해 100% 결정되므로 자동 생성이어도 정직하다.
import { h, mount, shuffle, median, countUnits } from '../util.js';
import * as content from '../content.js';
import * as store from '../store.js';
import { defaultTier } from '../levels.js';
import { drillHeader, resultCard, tierPicker, tierLabel, setTeardown } from './shared.js';

const STOP_EN = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'of', 'to', 'in', 'on', 'at', 'for', 'with', 'as', 'by', 'is', 'are', 'was', 'were', 'be', 'been', 'it', 'its', 'this', 'that', 'these', 'those', 'he', 'she', 'they', 'we', 'you', 'i', 'his', 'her', 'their', 'our', 'your', 'from', 'not', 'no', 'so', 'if', 'than', 'then', 'there', 'here', 'which', 'who', 'what', 'when', 'where', 'how', 'will', 'would', 'can', 'could', 'may', 'might', 'do', 'does', 'did', 'have', 'has', 'had']);

// 문장 하나를 지문 내 다른 실질어로 변조. 실패 시 null.
function tamper(sent, text, lang) {
  if (lang === 'zh') {
    const chars = Array.from(sent).filter(c => /[㐀-鿿]/.test(c));
    if (chars.length < 5) return null;
    const poolAll = [...new Set(Array.from(text).filter(c => /[㐀-鿿]/.test(c) && !sent.includes(c)))];
    if (!poolAll.length) return null;
    const target = chars[2 + Math.floor(Math.random() * (chars.length - 3))];
    const repl = shuffle(poolAll)[0];
    return sent.replace(target, repl);
  }
  const words = sent.split(/\b/).filter(w => /[A-Za-z]{4,}/.test(w) && !STOP_EN.has(w.toLowerCase()));
  if (!words.length) return null;
  const target = words[Math.floor(Math.random() * words.length)];
  const pool = [...new Set((text.match(/[A-Za-z]{4,}/g) || []))]
    .filter(w => !STOP_EN.has(w.toLowerCase()) && w.toLowerCase() !== target.toLowerCase() && Math.abs(w.length - target.length) <= 3 && !sent.includes(w));
  if (!pool.length) return null;
  const repl = shuffle(pool)[0];
  return sent.replace(new RegExp('\\b' + target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b'), repl);
}

export default {
  id: 'sentence', name: '문장 검증 스피드', icon: '✓✕', track: '유창성 기초',
  goal: '문장 하나를 통째로 빠르고 정확하게 통합합니다 — 단어와 지문 사이의 잃어버린 고리.',
  langs: ['en', 'zh'],
  why: '지문 유창성은 문장 수준 통합이 빨라야 나옵니다. 지문을 읽은 뒤 원문 문장과 한 단어가 바뀐 문장을 섞어 "지문과 일치하는가"를 판정하면, 문장을 표면이 아니라 의미로 처리했는지가 드러나고 그 속도를 단축할 수 있습니다.',
  evidence: 'Sentence Verification Technique — 문장 의미 통합·이해의 검증된 측정 패러다임(Royer et al. 1987). 정답이 원문으로 결정되므로 자동 생성 문항이어도 채점이 정직함.',

  render(root, lang, exit) {
    let tier = defaultTier(store.getLevel(lang) || 'builder', content.allTiers(lang)) || 2;

    const setup = () => mount(root, drillHeader(this.name, exit, this.why),
      h('div', { class: 'card fade-in' },
        h('h2', { class: 'h2' }, '문장 검증 스피드'),
        h('p', { class: 'muted' }, '① 지문을 평소처럼 읽고 → ② 문장 6개가 하나씩 나옵니다. ', h('b', null, '지문 그대로'), '인지 ', h('b', null, '한 단어가 바뀌었'), '는지 빠르게 판정하세요.'),
        tierPicker(lang, tier, t => { tier = t; setup(); }),
        h('div', { class: 'btnrow', style: { marginTop: '14px' } },
          h('button', { class: 'btn btn--primary btn--lg', onClick: run }, '시작'))));

    const run = () => {
      const p = content.pickPassage(lang, tier);
      if (!p) { mount(root, drillHeader(this.name, exit), h('div', { class: 'empty' }, '지문이 없습니다.')); return; }
      store.markSeen(p.id);
      const sents = content.splitSentences(p.text, lang).filter(s => countUnits(s, lang) >= (lang === 'zh' ? 8 : 6));
      if (sents.length < 4) { mount(root, drillHeader(this.name, exit), h('div', { class: 'empty' }, '이 지문으론 문항을 만들 수 없습니다. 다시 시작해 주세요.')); return; }
      const chosen = shuffle(sents).slice(0, 6);
      const trials = shuffle(chosen.map((s, i) => {
        if (i % 2 === 0) return { text: s, real: true };
        const bad = tamper(s, p.text, lang);
        return bad ? { text: bad, real: false } : { text: s, real: true };
      }));

      const read = () => mount(root, drillHeader('1/2 · 지문 읽기', exit, this.why),
        h('div', { class: 'note small' }, '평소처럼 읽으세요. 다음 단계에서 이 지문의 문장들을 검증합니다.'),
        h('div', { class: 'card', style: { marginTop: '10px' } }, h('div', { class: 'eyebrow' }, p.title || '지문'),
          h('div', { class: 'reader', lang: lang === 'zh' ? 'zh-Hans' : 'en', 'data-lang': lang }, h('div', { class: 'reader-wrap' }, p.text))),
        h('div', { class: 'btnrow', style: { marginTop: '12px' } },
          h('button', { class: 'btn btn--primary btn--lg', onClick: () => trial(0, [], []) }, '다 읽음 → 문장 검증')));

      const trial = (i, results, rts) => {
        if (i >= trials.length) return finish(results, rts);
        const tr = trials[i];
        const stim = h('div', { class: 'reader', lang: lang === 'zh' ? 'zh-Hans' : 'en', 'data-lang': lang, style: { textAlign: 'center', padding: '18px 6px' } }, tr.text);
        let t0 = 0, shown = false;
        setTimeout(() => { t0 = performance.now(); shown = true; }, 250);
        const answer = (saidReal) => {
          if (!shown) return;
          const rt = performance.now() - t0;
          results.push(saidReal === tr.real); rts.push(rt);
          trial(i + 1, results, rts);
        };
        mount(root, drillHeader('2/2 · 문장 검증', exit, null),
          h('div', { class: 'hud' }, h('span', { class: 'chip' }, '의미로 판단 — 표면 훑기로는 안 잡힙니다'), h('span', { class: 'chip' }, `${i + 1} / ${trials.length}`)),
          h('div', { class: 'card' }, stim),
          h('div', { class: 'btnrow', style: { justifyContent: 'center', marginTop: '12px' } },
            h('button', { class: 'btn btn--primary btn--lg', onClick: () => answer(true) }, '지문 그대로 ✓'),
            h('button', { class: 'btn btn--lg', onClick: () => answer(false) }, '바뀌었음 ✕')));
      };

      const finish = (results, rts) => {
        const acc = results.filter(Boolean).length / results.length;
        const med = Math.round(median(rts));
        store.logSession({ drill: 'sentence', lang, tier, acc, rt: med });
        mount(root, drillHeader(this.name, exit, null),
          resultCard([
            [results.filter(Boolean).length + '/' + results.length, '정확', '5/6 이상이 통과'],
            [(med / 1000).toFixed(1) + 's', '문장당 중앙 판정시간'],
          ], () => this.render(root, lang, exit), exit,
            h('p', { class: 'small muted' }, acc >= 5 / 6
              ? '문장을 의미로 통합하고 있습니다. 판정시간이 짧고 일정해질수록 문장 처리가 자동화된 것입니다.'
              : '표면(단어 나열)이 아니라 의미로 기억해야 잡힙니다. 지문을 읽을 때 문장마다 "무슨 말인지"를 붙잡으세요.')));
      };

      read();
    };

    setup();
  },
};
