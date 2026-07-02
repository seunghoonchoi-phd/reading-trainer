// ===== drills/triage.js — three-pass academic-paper triage (Keshav) =====
import { h, mount, startTimer, fmtClock } from '../util.js';
import * as content from '../content.js';
import { splitParagraphs, splitSentences } from '../content.js';
import * as store from '../store.js';
import { hardestTier } from '../levels.js';
import { drillHeader, resultCard, setTeardown } from './shared.js';

const FIVE_C = [
  ['Category', '범주', '어떤 종류의 글인가? (실험/이론/리뷰…)'],
  ['Context', '맥락', '무엇과 관련되며 어떤 배경 위에 있나?'],
  ['Correctness', '타당성', '가정·근거가 타당해 보이는가?'],
  ['Contributions', '기여', '핵심 기여는 무엇인가?'],
  ['Clarity', '명료성', '잘 쓰였는가?'],
];

export default {
  id: 'triage', name: '논문 3-패스', icon: '📄', track: '전략',
  goal: '눈을 빨리 굴리는 게 아니라 “깊이를 배분”해 논문을 빠르게 읽습니다.',
  langs: ['en', 'zh'],
  why: '밀도 높은 글의 합법적 가속기는 깊이 배분입니다. 1패스에서 구조(제목·초록·소제목·결론·그림)만 보고 5C로 “더 읽을지”를 판단하고, 필요할 때만 2·3패스로 들어갑니다.',
  evidence: 'Keshav(2007) 전문가 휴리스틱; 미리보기/선택적 주의(중간 근거). 훑기는 요지를 보존하되 세부는 아님(Duggan & Payne 2009).',

  // preset = {title, text, lang} optional (from 내 글)
  render(root, lang, exit, preset) {
    const src = preset || content.pickPassage(lang, hardestTier(store.getLevel(lang) || 'builder', content.allTiers(lang)));
    if (!src) { mount(root, drillHeader(this.name, exit), h('div', { class: 'empty' }, '논문/지문이 없습니다. “내 글” 탭에서 논문 단락을 붙여넣어 보세요.')); return; }
    const text = src.text, L = src.lang || lang;
    const paras = splitParagraphs(text);

    const pass1 = () => {
      const sec = Math.min(180, Math.max(40, Math.round((src.unit_count || 300) / 4)));
      let left = sec;
      const timerEl = h('span', { class: 'hud__timer' }, fmtClock(left * 1000));
      const iv = setInterval(() => { left--; timerEl.textContent = fmtClock(Math.max(0, left) * 1000); if (left <= 0) clearInterval(iv); }, 1000);
      setTeardown(() => clearInterval(iv));
      const leads = paras.map(p => (splitSentences(p, L)[0] || p)).filter(Boolean);
      const fields = FIVE_C.map(([en, ko, hint]) =>
        h('div', { style: { marginBottom: '8px' } },
          h('label', { class: 'field' }, `${ko} · ${en}`, h('span', { class: 'small muted' }, '  ' + hint)),
          h('textarea', { rows: 1, style: { minHeight: '42px' }, dataset: { c: en } })));
      const decide = (deep) => {
        clearInterval(iv);
        store.logSession({ drill: 'triage-p1', lang: L, deep });
        if (deep) pass2(); else stop();
      };
      mount(root, drillHeader('1패스 · 구조 훑기 (5분 룰)', () => { clearInterval(iv); exit(); }, this.why),
        h('div', { class: 'hud' }, h('span', { class: 'chip' }, '구조만 봅니다: 제목·첫 문장·결론'), timerEl),
        h('div', { class: 'card' }, h('div', { class: 'eyebrow' }, src.title || '문헌'),
          h('div', { class: 'reader', lang: L === 'zh' ? 'zh-Hans' : 'en', 'data-lang': L, style: { fontSize: L === 'zh' ? '1.2rem' : '1.05rem', lineHeight: '1.8' } },
            h('div', { class: 'reader-wrap' }, ...leads.map(s => h('p', { style: { margin: '0 0 .5em' } }, '• ', s))))),
        h('div', { class: 'card', style: { marginTop: '12px' } }, h('div', { class: 'eyebrow' }, '5C 메모'), ...fields),
        h('div', { class: 'btnrow' },
          h('button', { class: 'btn btn--primary', onClick: () => decide(true) }, '깊이 읽을 가치 있음 → 2패스'),
          h('button', { class: 'btn', onClick: () => decide(false) }, '여기서 중단(요지 충분)')));
    };

    const pass2 = () => {
      const input = h('textarea', { rows: 2, placeholder: '핵심 기여를 한 문장으로' });
      mount(root, drillHeader('2패스 · 내용 + 그림', exit, this.why),
        h('div', { class: 'note' }, '본문과 그림을 읽되 증명·세부 유도는 건너뜁니다. 한 문장으로 핵심 기여를 적으세요.'),
        h('div', { class: 'card', style: { marginTop: '10px', maxHeight: '46vh', overflow: 'auto' } },
          h('div', { class: 'reader', lang: L === 'zh' ? 'zh-Hans' : 'en', 'data-lang': L, style: { fontSize: L === 'zh' ? '1.25rem' : '1.08rem', lineHeight: '1.75' } }, h('div', { class: 'reader-wrap' }, text))),
        h('div', { style: { marginTop: '12px' } }, h('label', { class: 'field' }, '핵심 기여 (한 문장)'), input,
          h('div', { class: 'btnrow', style: { marginTop: '10px' } },
            h('button', { class: 'btn btn--primary', onClick: pass3 }, '깊이 이해 필요 → 3패스'),
            h('button', { class: 'btn', onClick: stop }, '여기서 충분'))));
    };

    const pass3 = () => {
      const input = h('textarea', { rows: 4, placeholder: '저자의 가정을 다시 세워 본다면? 어디서 막히고, 무엇을 다르게 하겠는가?' });
      mount(root, drillHeader('3패스 · 재구성/비판', exit, this.why),
        h('div', { class: 'note' }, '가장 깊은 단계: 마치 직접 구현/재현한다는 듯 가정을 재구성하고 약점을 짚으세요.'),
        h('div', { style: { marginTop: '10px' } }, h('label', { class: 'field' }, '재구성 & 비판'), input,
          h('button', { class: 'btn btn--primary', style: { marginTop: '10px' }, onClick: () => stop(true) }, '완료')));
    };

    const stop = (deep3) => {
      store.logSession({ drill: 'triage', lang: L, completed: !!deep3 });
      mount(root, drillHeader(this.name, exit, null),
        resultCard([['✓', '트리아지 완료', deep3 ? '3패스까지' : '필요한 깊이까지']], pass1, exit,
          h('p', { class: 'small muted' }, '핵심은 속도가 아니라 “어디에 시간을 쓸지” 결정한 것입니다. 1패스 판단이 나중 가치와 맞아떨어졌는지 스스로 점검해 보세요.')));
    };

    pass1();
  },
};
