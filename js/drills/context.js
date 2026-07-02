// ===== drills/context.js — 문맥 추론: 모르는 단어를 만났을 때의 갭 전략 =====
// 커버리지를 95~98%까지 채워도 낯선 단어는 남는다. 사전 없이 문맥으로 후보를
// 좁히는 lexical inferencing이 그 갭을 다루는 검증된 전략이고, 클로즈(빈칸 추론)가
// 그 표준 훈련 형식이다. 빈칸의 원단어가 정답이므로 자동 생성이어도 채점이 정직하다.
import { h, mount } from '../util.js';
import * as content from '../content.js';
import * as store from '../store.js';
import { defaultTier } from '../levels.js';
import { drillHeader, compQuiz, resultCard, tierPicker } from './shared.js';

export default {
  id: 'context', name: '문맥 추론', icon: '?', track: '전략',
  goal: '모르는 단어를 만나도 멈추지 않습니다 — 문맥으로 뜻을 좁히는 힘.',
  langs: ['en', 'zh'],
  why: '커버리지 95~98%를 채워도 낯선 단어는 남습니다. 그때마다 사전을 열면 흐름이 끊기고, 무시하면 이해가 샙니다. 문맥 단서로 빈칸에 들어갈 말을 추론하는 훈련은 이 갭을 다루는 검증된 전략(lexical inferencing)이고, 추론이 빨라질수록 낯선 단어가 있는 글에서도 속도가 유지됩니다.',
  evidence: '문맥 기반 어휘 추론은 핵심 읽기 전략(Nation 2001; Grabe 2009). 클로즈 과제는 문맥 통합 능력의 표준 측정·훈련 형식.',

  render(root, lang, exit) {
    let tier = defaultTier(store.getLevel(lang) || 'builder', content.allTiers(lang)) || 3;

    const setup = () => mount(root, drillHeader(this.name, exit, this.why),
      h('div', { class: 'card fade-in' },
        h('h2', { class: 'h2' }, '문맥 추론'),
        h('p', { class: 'muted' }, '지문 문장에서 단어 하나가 빈칸이 됩니다. ', h('b', null, '문맥 단서만으로'), ' 들어갈 단어를 고르세요. 6문제, 75% 이상이 통과.'),
        tierPicker(lang, tier, t => { tier = t; setup(); }),
        h('div', { class: 'btnrow', style: { marginTop: '14px' } },
          h('button', { class: 'btn btn--primary btn--lg', onClick: run }, '시작'))));

    const run = () => {
      const p = content.pickPassage(lang, tier);
      if (!p) { mount(root, drillHeader(this.name, exit), h('div', { class: 'empty' }, '지문이 없습니다.')); return; }
      store.markSeen(p.id);
      const items = content.autoCloze(p.text, lang, 6);
      if (items.length < 4) { mount(root, drillHeader(this.name, exit), h('div', { class: 'empty' }, '이 지문으론 문항을 만들 수 없습니다. 다시 시작해 주세요.')); return; }
      const host = h('div');
      mount(root, drillHeader('문맥 추론 · ' + (p.title || '지문'), exit, this.why), host);
      compQuiz(host, items, '문맥 추론').then(res => {
        store.logSession({ drill: 'context', lang, tier, acc: res.frac });
        mount(root, drillHeader(this.name, exit, null),
          resultCard([
            [res.correct + '/' + res.total, '정확', '75% 이상이 통과'],
          ], () => this.render(root, lang, exit), exit,
            h('p', { class: 'small muted' }, res.frac >= 0.75
              ? '문맥 단서를 제대로 쓰고 있습니다. 실전에서 낯선 단어를 만나면 같은 방식으로 후보를 좁히고 계속 읽으세요.'
              : '빈칸 앞뒤 문장에 단서가 있습니다 — 품사(자리), 논리 방향(그래서/하지만), 주변 소재를 차례로 확인하세요.')));
      });
    };

    setup();
  },
};
