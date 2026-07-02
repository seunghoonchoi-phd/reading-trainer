// ===== drills/chunk.js — 청크 읽기: 단어를 의미 단위(구)로 묶어 처리하는 훈련 =====
// phrase-cued reading: 구 경계를 시각 비계로 보여주며 읽고, 비계를 점점 제거해 자립시킨다.
// 3단계 비계: ① 뚜렷한 구 표시 → ② 옅은 표시 → ③ 표시 없음(+구 단위 페이서).
import { h, mount, startTimer, fmtClock, countUnits } from '../util.js';
import * as content from '../content.js';
import * as store from '../store.js';
import { defaultTier } from '../levels.js';
import { drillHeader, askMCQ, resultCard, tierPicker, tierLabel, setTeardown } from './shared.js';

// 의미 단위 분할 휴리스틱: 구두점·접속사·전치사 경계에서 끊되 2~5단어 유지
const BREAK_BEFORE = new Set(['and', 'but', 'or', 'so', 'because', 'when', 'while', 'after', 'before', 'that', 'which', 'who', 'whose', 'where', 'if', 'though', 'although', 'as', 'since', 'until', 'unless', 'than', 'in', 'on', 'at', 'with', 'from', 'into', 'over', 'under', 'through', 'between', 'during', 'against', 'without', 'within', 'toward', 'towards', 'across', 'behind', 'beyond', 'of', 'for', 'to', 'by', 'about']);

export function phraseChunks(text) {
  const words = text.split(/\s+/).filter(Boolean);
  const chunks = [];
  let buf = [];
  const flush = () => { if (buf.length) { chunks.push(buf.join(' ')); buf = []; } };
  for (const w of words) {
    const bare = w.toLowerCase().replace(/[^a-z']/g, '');
    if (buf.length >= 2 && BREAK_BEFORE.has(bare)) flush();
    buf.push(w);
    if (/[.,;:!?…]["')\]]?$/.test(w) || buf.length >= 5) flush();
  }
  flush();
  return chunks;
}

const SCAFFOLDS = [
  { n: 1, name: '1단계 · 뚜렷한 구 표시', desc: '구 단위가 색으로 또렷이 묶여 보입니다. 단어가 아니라 덩어리를 따라가세요.' },
  { n: 2, name: '2단계 · 옅은 표시', desc: '표시가 옅어집니다. 묶음 감각을 스스로 유지하세요.' },
  { n: 3, name: '3단계 · 표시 없음', desc: '보통 지문입니다. 머릿속에서 구 단위로 묶으며 읽으세요 — 이게 자립입니다.' },
];

export default {
  id: 'chunk', name: '청크 읽기', icon: '⌒', track: '유창성 기초',
  goal: '단어를 하나씩이 아니라 의미 단위(구)로 묶어 처리합니다 — "한눈에 들어오는" 느낌의 실체.',
  langs: ['en'],
  why: '유창한 독자는 단어를 구 단위로 통합하며 읽습니다. 구 경계를 시각적으로 보여주는 phrase-cued reading은 유창성 훈련의 검증된 비계이고, 핵심은 비계를 점진 제거해 스스로 묶게 만드는 것입니다. 시야폭을 넓히는 게 아니라, 이미 보이는 단어들의 통합을 빠르게 하는 훈련입니다.',
  evidence: 'Phrase-cued text reading (Rasinski 2010/2011; LeVasseur et al. 2006 — 구 경계 비계가 유창성·운율 개선). 지각폭 확장 아님(Rayner 2016).',

  render(root, lang, exit) {
    let tier = defaultTier(store.getLevel(lang) || 'builder', content.allTiers(lang)) || 2;
    // 통과한 비계 다음 단계를 기본 선택
    const passed = n => store.getState().sessions.some(s => s.lang === lang && s.drill === 'chunk' && s.scaffold === n && s.pass);
    let scaffold = SCAFFOLDS.find(s => !passed(s.n))?.n || 3;

    const setup = () => mount(root, drillHeader(this.name, exit, this.why),
      h('div', { class: 'card fade-in' },
        h('h2', { class: 'h2' }, '청크 읽기'),
        h('p', { class: 'muted' }, '지문을 의미 단위(2~5단어 구)로 묶어 읽고, 이해 문제로 확인합니다. 비계 3단계를 차례로 통과하면 정복.'),
        h('div', { class: 'row', style: { gap: '8px', flexWrap: 'wrap' } },
          h('span', { class: 'small muted' }, '비계'),
          ...SCAFFOLDS.map(s => h('button', {
            class: 'seg__btn' + (s.n === scaffold ? ' is-active' : ''),
            style: { border: '1px solid var(--line)' },
            title: s.desc + (passed(s.n) ? ' (통과함)' : ''),
            onClick: () => { scaffold = s.n; setup(); },
          }, (passed(s.n) ? '✓ ' : '') + s.n + '단계'))),
        h('p', { class: 'small muted', style: { marginTop: '8px' } }, SCAFFOLDS[scaffold - 1].desc),
        tierPicker(lang, tier, t => { tier = t; setup(); }),
        h('div', { class: 'btnrow', style: { marginTop: '14px' } },
          h('button', { class: 'btn btn--primary btn--lg', onClick: run }, '시작'))));

    const run = () => {
      const p = content.pickPassage(lang, tier);
      if (!p) { mount(root, drillHeader(this.name, exit), h('div', { class: 'empty' }, '지문이 없습니다.')); return; }
      store.markSeen(p.id);
      const units = p.unit_count || countUnits(p.text, lang);
      const chunks = phraseChunks(p.text);
      const cls = scaffold === 1 ? 'phrase phrase--strong' : scaffold === 2 ? 'phrase phrase--soft' : '';
      const spans = chunks.map((c, i) => h('span', { class: cls + (cls && i % 2 ? ' phrase--alt' : '') }, c + ' '));
      const timerEl = h('span', { class: 'hud__timer' }, '0:00');
      const t = startTimer(ms => timerEl.textContent = fmtClock(ms));
      setTeardown(() => t.stop());
      const done = () => {
        const ms = t.stop();
        const wpm = units / (ms / 60000);
        const host = h('div');
        mount(root, drillHeader('청크 읽기 · 이해 확인', exit, null), host);
        askMCQ(host, p.gist).then(r => finish(wpm, r.correct));
      };
      const finish = (wpm, ok) => {
        store.logSession({ drill: 'chunk', lang, scaffold, wpm: Math.round(wpm), pass: !!ok });
        const next = SCAFFOLDS.find(s => s.n > scaffold);
        mount(root, drillHeader(this.name, exit, null),
          resultCard([
            [ok ? '통과' : '미통과', `비계 ${scaffold}단계`, ok ? '요지 정확' : '요지 빗나감'],
            [Math.round(wpm) + '', 'WPM', '(참고용)'],
          ], () => this.render(root, lang, exit), exit,
            h('div', { class: ok ? 'note note--good' : 'note note--warn' }, ok
              ? (next ? `통과! 다음은 ${next.name} — 표시가 줄어도 묶음을 유지하는 게 목표입니다.` : '표시 없이도 구 단위로 읽었습니다 — 청크 처리가 자립했습니다.')
              : '요지를 놓쳤습니다. 덩어리를 눈으로만 쫓지 말고, 구마다 의미를 붙잡으며 읽으세요.')));
      };
      mount(root, drillHeader(SCAFFOLDS[scaffold - 1].name, () => { t.stop(); exit(); }, this.why),
        h('div', { class: 'hud' }, h('span', { class: 'chip' }, `${tierLabel(tier, lang)} · ${units} 단어 · 구 ${chunks.length}개`), timerEl),
        h('div', { class: 'card' }, h('div', { class: 'eyebrow' }, p.title || '지문'),
          h('div', { class: 'reader', lang: 'en', 'data-lang': 'en' }, h('div', { class: 'reader-wrap' }, ...spans))),
        h('div', { class: 'btnrow', style: { marginTop: '12px' } },
          h('button', { class: 'btn btn--primary btn--lg', onClick: done }, '다 읽었어요 → 이해 확인')));
    };

    setup();
  },
};
