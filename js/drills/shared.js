// ===== drills/shared.js — common drill UI =====
import { h, mount, clear, letterFor, shuffle } from '../util.js';
import * as content from '../content.js';

/* ---- 활성 드릴 정리 훅: 라우트·언어 전환 시 잔존 타이머가 화면을 덮지 않게 ---- */
let teardown = null;
export function setTeardown(fn) { teardown = fn; }
export function runTeardown() { if (teardown) { try { teardown(); } catch {} teardown = null; } }

export function drillHeader(name, onExit, why) {
  const whyNote = why ? h('div', { class: 'note small', style: { display: 'none', marginBottom: '12px' } }, why) : null;
  const chip = why ? h('button', {
    class: 'chip chip--btn', type: 'button', 'aria-expanded': 'false',
    onClick: () => {
      const open = whyNote.style.display !== 'none';
      whyNote.style.display = open ? 'none' : '';
      chip.setAttribute('aria-expanded', open ? 'false' : 'true');
    },
  }, '왜 효과 있나 ✦') : null;
  return h('div', null,
    h('div', { class: 'hud' },
      h('div', { class: 'row', style: { gap: '10px' } },
        h('button', { class: 'iconbtn', onClick: onExit, title: '훈련 목록으로', 'aria-label': '뒤로' }, '‹'),
        h('div', null, h('div', { style: { fontWeight: '800' } }, name))),
      chip),
    whyNote);
}

export function whyBox(text) {
  if (!text) return null;
  const d = h('details', { class: 'why' }, h('summary', null), h('div', null, text));
  return d;
}

// MCQ single question -> resolves to {correct:boolean, choice:int}
export function askMCQ(root, item, { showExplain = true } = {}) {
  return new Promise(resolve => {
    let answered = false;
    // shuffle option order at render time so a fixed answer position can't be exploited
    const order = shuffle(item.options.map((_, i) => i));
    const opts = order.map(i => item.options[i]);
    const correctPos = order.indexOf(item.answer);
    const optEls = opts.map((o, i) =>
      h('button', { class: 'opt', onClick: () => pick(i) }, h('span', { class: 'opt__k' }, letterFor(i)), o));
    const explain = h('div');
    function pick(i) {
      if (answered) return; answered = true;
      const correct = i === correctPos;
      optEls.forEach((el, j) => {
        el.disabled = true;
        if (j === correctPos) el.classList.add('is-correct');
        else if (j === i) el.classList.add('is-wrong');
      });
      if (showExplain && item.explanation) {
        mount(explain, h('div', { class: 'note ' + (correct ? 'note--good' : 'note--warn'), style: { marginTop: '8px' } },
          (correct ? '정답 · ' : '오답 · ') + item.explanation));
      }
      setTimeout(() => resolve({ correct, choice: i }), correct ? 550 : 1100);
    }
    mount(root, h('div', { class: 'fade-in' },
      h('p', { style: { fontWeight: '700', fontSize: '1.05rem' } }, item.q),
      ...optEls, explain));
  });
}

// run a comprehension quiz over items -> {correct,total,frac}
export async function compQuiz(root, items, title = '이해도 확인') {
  const host = h('div');
  let correct = 0;
  for (let i = 0; i < items.length; i++) {
    mount(root, h('div', { class: 'card' },
      h('div', { class: 'row spread', style: { marginBottom: '10px' } },
        h('span', { class: 'eyebrow', style: { margin: 0 } }, title),
        h('span', { class: 'chip' }, `${i + 1} / ${items.length}`)),
      host));
    const r = await askMCQ(host, items[i]);
    if (r.correct) correct++;
  }
  return { correct, total: items.length, frac: items.length ? correct / items.length : 0 };
}

export function resultCard(rows, onAgain, onExit, extra) {
  return h('div', { class: 'card fade-in center' },
    h('p', { class: 'eyebrow' }, '결과'),
    h('div', { class: 'stat-row', style: { margin: '6px 0 16px', justifyContent: 'center' } },
      ...rows.map(([num, lbl, sub]) => h('div', { class: 'stat', style: { alignItems: 'center' } },
        h('span', { class: 'stat__num' }, num), h('span', { class: 'stat__lbl' }, lbl), sub ? h('span', { class: 'stat__sub' }, sub) : null))),
    extra || null,
    h('div', { class: 'btnrow', style: { justifyContent: 'center', marginTop: '12px' } },
      onAgain ? h('button', { class: 'btn btn--primary', onClick: onAgain }, '한 번 더') : null,
      h('button', { class: 'btn btn--ghost', onClick: onExit }, '훈련 목록')));
}

// 난이도 선택: 전체 티어를 항상 보여주되, 현재 레벨의 권장 창을 표시
export function tierPicker(lang, current, onPick) {
  const all = content.allTiers(lang);
  const win = content.tiersFor(lang);
  return h('div', { class: 'row', style: { gap: '8px', flexWrap: 'wrap' } },
    h('span', { class: 'small muted' }, '난이도'),
    ...all.map(t => h('button', {
      class: 'seg__btn' + (t === current ? ' is-active' : '') + (win.includes(t) ? '' : ' seg__btn--dim'),
      style: { border: '1px solid var(--line)' },
      title: win.includes(t) ? '' : '내 레벨 권장 범위 밖 (선택 가능)',
      onClick: () => onPick(t),
    }, tierLabel(t, lang))));
}
export function tierLabel(t, lang) {
  if (lang === 'zh') return ['', 'HSK3', 'HSK4', 'HSK5', 'HSK6', 'HSK6+', '고급'][t] || ('T' + t);
  return ['', 'A2', 'B1', 'B2', 'C1', 'C2', 'C2+'][t] || ('T' + t);
}
