// ===== drills/retrieval.js — self-explanation + retrieval lock-in (spaced) =====
import { h, mount } from '../util.js';
import * as content from '../content.js';
import * as store from '../store.js';
import { drillHeader, compQuiz, resultCard, tierPicker, tierLabel } from './shared.js';

export default {
  id: 'retrieval', name: '자기설명·인출', icon: '🧠', track: '전략',
  goal: '읽은 것을 “덮고 떠올려” 영속 이해로 바꾸고, 이해 착각을 드러냅니다.',
  langs: ['en', 'zh'],
  why: '다시 읽기·형광펜·요약은 효율이 낮습니다(LOW). 강력한 건 인출(덮고 떠올리기)과 지연 복습입니다(HIGH). 자기설명으로 빈/순환 답을 잡아내고, 항목을 간격 인출 큐에 넣어 “즉시”가 아니라 “지연” 시점에 다시 테스트합니다.',
  evidence: '인출+분산연습 HIGH 유틸리티, 자기설명 MODERATE(Dunlosky 2013); 지연 시 인출이 재독을 능가(Roediger & Karpicke 2006).',

  render(root, lang, exit) {
    const tiers = content.tiersFor(lang);
    let tier = tiers.includes(3) ? 3 : tiers[Math.floor(tiers.length / 2)] || tiers[0];
    const deck = 'retr-' + lang;

    const setup = () => {
      const due = store.srDueList(deck, content.passagesFor(lang).map(p => p.id));
      mount(root, drillHeader(this.name, exit, this.why),
        h('div', { class: 'card fade-in' },
          h('h2', { class: 'h2' }, '자기설명·인출'),
          h('p', { class: 'muted' }, '읽기 → 덮고 떠올리기 → 자기설명 → 인출 퀴즈. 항목은 지연 복습 일정으로 다시 나타납니다.'),
          due.length ? h('div', { class: 'note note--good' }, `복습 예정 인출 항목 ${due.length}개`) : null,
          tierPicker(tiers, tier, t => { tier = t; setup(); }, lang),
          h('div', { class: 'btnrow', style: { marginTop: '14px' } },
            h('button', { class: 'btn btn--primary btn--lg', onClick: () => read(due[0]) }, due.length ? '복습 시작' : '시작'))));
    };

    const read = (dueId) => {
      const p = dueId ? content.passagesFor(lang).find(x => x.id === dueId) || content.pickPassage(lang, tier) : content.pickPassage(lang, tier);
      if (!p) return setup();
      mount(root, drillHeader('읽기', exit, this.why),
        h('div', { class: 'note note--good' }, '깊이 읽으세요. 다 읽으면 “덮고 떠올리기”로 넘어갑니다.'),
        h('div', { class: 'card', style: { marginTop: '10px' } }, h('div', { class: 'eyebrow' }, p.title || '지문'),
          h('div', { class: 'reader', 'data-lang': lang }, h('div', { class: 'reader-wrap' }, p.text))),
        h('div', { class: 'btnrow', style: { marginTop: '12px' } }, h('button', { class: 'btn btn--primary btn--lg', onClick: () => recall(p) }, '덮기 → 떠올리기')));
    };

    const recall = (p) => {
      const ta = h('textarea', { placeholder: '본문을 보지 말고, 기억나는 핵심을 모두 적어보세요.' });
      const next = h('button', { class: 'btn btn--primary', disabled: true, onClick: () => explain(p, ta.value) }, '다음');
      ta.addEventListener('input', () => { next.disabled = ta.value.trim().length < 10; });
      mount(root, drillHeader('자유 인출 (덮고 떠올리기)', exit, this.why),
        h('div', { class: 'note' }, '여기서 떠올리는 노력 자체가 학습입니다. 완벽하지 않아도 됩니다.'),
        h('div', { style: { marginTop: '10px' } }, ta, h('div', { class: 'btnrow', style: { marginTop: '10px' } }, next)));
    };

    const explain = (p, recallText) => {
      const ta = h('textarea', { rows: 3, placeholder: '이 글의 핵심 주장을 한 문장으로 “왜 그런지”까지 설명해보세요.' });
      const cmp = h('details', { class: 'why' }, h('summary', null), h('div', null, h('div', { class: 'reader', 'data-lang': lang, style: { fontSize: lang === 'zh' ? '1.2rem' : '1rem' } }, h('div', { class: 'reader-wrap' }, p.text))));
      mount(root, drillHeader('자기설명', exit, this.why),
        h('div', { class: 'note' }, '핵심을 “설명”하세요. 빈 말·순환 설명이면 아직 이해가 덜 된 것입니다.'),
        h('div', { style: { marginTop: '10px' } }, ta),
        h('div', { style: { marginTop: '8px' } }, h('span', { class: 'small muted' }, '원문 다시 보기'), cmp),
        h('div', { class: 'btnrow', style: { marginTop: '10px' } }, h('button', { class: 'btn btn--primary', onClick: () => quiz(p) }, '인출 퀴즈')));
    };

    const quiz = (p) => {
      const host = h('div');
      mount(root, drillHeader('인출 퀴즈', exit, null), host);
      compQuiz(host, (p.questions || []).slice(), '인출 퀴즈').then(res => {
        const grade = res.frac >= 0.85 ? 3 : res.frac >= 0.6 ? 2 : res.frac >= 0.4 ? 1 : 0;
        store.srReview(deck, p.id, grade);
        store.logSession({ drill: 'retrieval', lang, comp: res.frac });
        const c = store.srCard(deck, p.id);
        const days = c.interval;
        mount(root, drillHeader(this.name, exit, null),
          resultCard([[Math.round(res.frac * 100) + '%', '인출 정확도'], [days >= 1 ? days + '일 후' : '곧', '다음 복습']], setup, exit,
            h('p', { class: 'small muted' }, '즉시 다시 보는 대신, 잊을 만할 때 다시 떠올리게 일정을 잡았습니다. 그래야 오래 남습니다.')));
      });
    };

    setup();
  },
};
