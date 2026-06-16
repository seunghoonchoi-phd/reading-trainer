// ===== drills/preview.js — topic-sentence foraging (within-span, NOT span widening) =====
import { h, mount } from '../util.js';
import * as content from '../content.js';
import { splitParagraphs, splitSentences } from '../content.js';
import * as store from '../store.js';
import { drillHeader, askMCQ, resultCard, tierPicker } from './shared.js';

export default {
  id: 'preview', name: '미리보기 활용', icon: '⟶', track: '시야 활용',
  goal: '자연 지각폭과 글의 구조를 효율적으로 “활용”합니다 — 시야폭을 넓히는 게 아닙니다.',
  langs: ['en', 'zh'],
  why: '지각폭은 고정돼 있어 넓힐 수 없습니다(영어 식별 ~7–8자, 중국어 ~3자). 대신 할 수 있는 건 자연 폭의 효율적 활용: 다음 단어 미리보기, 문단 첫 문장으로 논지 예측(포레이징). 이 드릴은 폭 확장을 약속하지 않습니다.',
  evidence: '철자/음운 미리보기 효과는 견고(~20–50ms), 의미 미리보기는 영어에서 불안정(Rayner 경계 패러다임). 훑기 독자의 문단 앞부분 “만족화”(Duggan & Payne 2009). 중국어 폭 캡 ~3–4자(Inhoff & Liu 1998).',

  render(root, lang, exit) {
    const tiers = content.tiersFor(lang);
    let tier = tiers.includes(3) ? 3 : tiers[Math.floor(tiers.length / 2)] || tiers[0];

    const setup = () => mount(root, drillHeader(this.name, exit, this.why),
      h('div', { class: 'card fade-in' },
        h('h2', { class: 'h2' }, '주제문 포레이징'),
        h('p', { class: 'muted' }, '각 문단의 ', h('b', null, '첫 문장만'), ' 보고 글 전체의 논지를 예측합니다. 그다음 전체를 펼쳐 확인합니다.'),
        h('div', { class: 'note note--warn' }, '이건 “한눈에 더 많이 보기”가 아니라, 글의 구조를 이용해 어디를 깊게 볼지 고르는 훈련입니다.'),
        tierPicker(tiers, tier, t => { tier = t; setup(); }, lang),
        h('div', { class: 'btnrow', style: { marginTop: '14px' } },
          h('button', { class: 'btn btn--primary btn--lg', onClick: forage }, '시작'))));

    const forage = () => {
      const p = content.pickPassage(lang, tier);
      if (!p) return setup();
      const paras = splitParagraphs(p.text);
      const leads = paras.map(par => splitSentences(par, lang)[0] || par);
      mount(root, drillHeader('포레이징 · 첫 문장만', exit, this.why),
        h('div', { class: 'hud' }, h('span', { class: 'chip' }, '문단 첫 문장만 노출')),
        h('div', { class: 'card' },
          h('div', { class: 'reader', 'data-lang': lang, style: { fontSize: lang === 'zh' ? '1.3rem' : '1.12rem' } },
            h('div', { class: 'reader-wrap' }, ...leads.map(s => h('p', null, s,
              h('span', { class: 'span-blur', style: { userSelect: 'none' } }, lang === 'zh' ? ' （…后文省略…）' : ' …(rest hidden)…')))))),
        h('div', { class: 'btnrow', style: { marginTop: '12px' } }, h('button', { class: 'btn btn--primary', onClick: () => predict(p) }, '논지 예측하기')));
    };

    const predict = (p) => {
      const host = h('div');
      mount(root, drillHeader('논지 예측', exit, null),
        h('div', { class: 'note' }, '첫 문장들만 보고, 글의 핵심 주장을 고르세요.'), host);
      askMCQ(host, p.gist).then(r => reveal(p, r.correct));
    };

    const reveal = (p, correct) => {
      store.logSession({ drill: 'preview', lang, correct });
      mount(root, drillHeader('전체 확인', exit, null),
        h('div', { class: 'card' },
          h('div', { class: 'note ' + (correct ? 'note--good' : 'note--warn') }, correct ? '첫 문장만으로 논지를 정확히 잡았습니다 — 구조 활용 성공.' : '첫 문장만으로는 빗나갔습니다. 이런 글은 깊게 읽어야 합니다.'),
          h('div', { class: 'reader', 'data-lang': lang, style: { marginTop: '12px' } }, h('div', { class: 'reader-wrap' }, p.text))),
        resultCard([[correct ? '✓' : '✕', '논지 예측']], () => this.render(root, lang, exit), exit,
          h('p', { class: 'small muted' }, '문단 첫 문장(주제문)에 핵심이 모이는 글이 많습니다. 단, 첫 문장이 빗나가는 글은 훑기로 충분치 않다는 신호입니다.')));
    };

    setup();
  },
};
