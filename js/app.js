// ===== app.js — entry, router, views =====
import { h, mount, $, $$, clear, countUnits, startTimer, fmtClock, sparkline, mean, median, clamp } from './util.js';
import * as store from './store.js';
import * as content from './content.js';
import { DRILLS, TRACKS, DRILL_BY_ID } from './drills/index.js';
import { renderTheory } from './theory.js';
import { compQuiz } from './drills/shared.js';
import triage from './drills/triage.js';
import conquer from './drills/conquer.js';
import { icon, iconSvg, DRILL_ICON } from './icons.js';

const view = $('#view');
let lang = store.getSetting('lang') || 'en';
let route = 'home';

const ROUTES = ['home', 'train', 'mytexts', 'progress', 'theory'];
const TAB_ICON = { home: 'today', train: 'train', mytexts: 'mytexts', progress: 'progress', theory: 'theory' };
const DAILY_GOAL = 3;

/* ---------- theme ---------- */
function resolveTheme() {
  const t = store.getSetting('theme');
  if (t === 'light' || t === 'dark') return t;                                  // explicit choice
  return (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
}
function applyTheme() {
  const t = resolveTheme();
  document.documentElement.setAttribute('data-theme', t);
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', t === 'dark' ? '#14181d' : '#1f2933');
}
$('#themeToggle').addEventListener('click', () => {
  store.setSetting('theme', (resolveTheme() === 'dark') ? 'light' : 'dark');
  applyTheme();
});
// follow system changes while the user is on "auto" (no explicit choice yet)
if (window.matchMedia) {
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  mq.addEventListener?.('change', () => { const t = store.getSetting('theme'); if (t !== 'light' && t !== 'dark') applyTheme(); });
}

/* ---------- language ---------- */
$$('.seg__btn').forEach(b => b.addEventListener('click', () => {
  lang = b.dataset.lang; store.setSetting('lang', lang);
  $$('.seg__btn').forEach(x => x.classList.toggle('is-active', x.dataset.lang === lang));
  render();
}));

/* ---------- routing ---------- */
$$('.tab').forEach(t => t.addEventListener('click', () => go(t.dataset.route)));
function syncTabs() { $$('.tab').forEach(t => t.classList.toggle('is-active', t.dataset.route === route)); }

window.addEventListener('hashchange', () => {
  const r = location.hash.slice(1);
  if (ROUTES.includes(r) && r !== route) { route = r; syncTabs(); render(); }
});

// brand → home
const brandEl = $('.appbar__brand');
if (brandEl) {
  brandEl.addEventListener('click', () => go('home'));
  brandEl.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go('home'); } });
}

function render() {
  clear(view); view.scrollTop = 0; window.scrollTo(0, 0);
  if (route === 'home') renderHome();
  else if (route === 'train') renderTrain();
  else if (route === 'mytexts') renderMyTexts();
  else if (route === 'progress') renderProgress();
  else if (route === 'theory') renderTheory(view);
}

function go(r) {
  route = r;
  if (location.hash.slice(1) !== r) { try { location.hash = r; } catch {} }
  syncTabs(); render();
}

/* ---------- catalog (shared by 훈련) ---------- */
// only render drills valid for the active language — no cross-language disabled clutter.
function catalogBlocks() {
  return TRACKS.map(track => {
    const ds = DRILLS.filter(d => d.track === track && d.langs.includes(lang));
    if (!ds.length) return null;
    const tiles = ds.map(d => h('button', { class: 'tile', onClick: () => launch(d) },
      h('div', { class: 'tile__top' },
        h('span', { class: 'iconchip' }, icon(DRILL_ICON[d.id] || d.id)),
        h('span', { class: 'tile__name' }, d.name)),
      h('span', { class: 'tile__goal' }, d.goal)));
    return h('div', null, h('p', { class: 'track-label' }, track), h('div', { class: 'tiles' }, ...tiles));
  }).filter(Boolean);
}

/* ---------- today's session ---------- */
function sessionDoneToday(drillId) {
  return store.sessionsToday().some(s => s.drill === drillId || s.drill.startsWith(drillId + '-'));
}
// Balanced 3-step session: coverage → core rate → strategy/retention.
function pickSession(lng) {
  const valid = id => DRILL_BY_ID[id] && DRILL_BY_ID[id].langs.includes(lng);
  const out = [];
  if (valid('vocab')) out.push('vocab');                                  // 1) coverage opener
  const core = ['conquer', 'err', 'repeated'].filter(valid);              // 2) core rate (rotate by day)
  if (core.length) out.push(core[new Date().getDate() % core.length]);
  const strat = ['retrieval', 'modes', 'triage'].filter(valid);           // 3) strategy / retention
  const intense = store.sessionsToday().filter(s => /^(conquer|err|repeated)/.test(s.drill)).length;
  let third = valid('retrieval') ? 'retrieval' : strat[0];
  if (valid('retrieval') && intense === 0 && strat.length) third = strat[new Date().getDate() % strat.length];
  if (third) out.push(third);
  return [...new Set(out)].filter(valid).slice(0, 3);
}

function goalRing(done, goal) {
  const ns = 'http://www.w3.org/2000/svg';
  const r = 20, c = 2 * Math.PI * r, frac = Math.min(1, goal ? done / goal : 0);
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('class', 'ring'); svg.setAttribute('width', '54'); svg.setAttribute('height', '54'); svg.setAttribute('viewBox', '0 0 54 54');
  const mk = (cls, extra) => { const e = document.createElementNS(ns, 'circle'); e.setAttribute('class', cls); e.setAttribute('cx', '27'); e.setAttribute('cy', '27'); e.setAttribute('r', r); e.setAttribute('stroke-width', '5'); if (extra) extra(e); return e; };
  const val = mk('ring__val', e => { e.setAttribute('stroke-dasharray', c.toFixed(1)); e.setAttribute('stroke-dashoffset', (c * (1 - frac)).toFixed(1)); e.setAttribute('transform', 'rotate(-90 27 27)'); });
  const txt = document.createElementNS(ns, 'text');
  txt.setAttribute('class', 'ring__txt'); txt.setAttribute('x', '27'); txt.setAttribute('y', '28'); txt.setAttribute('text-anchor', 'middle'); txt.setAttribute('dominant-baseline', 'central'); txt.setAttribute('font-size', '14');
  txt.textContent = `${Math.min(done, goal)}/${goal}`;
  svg.append(mk('ring__track'), val, txt);
  return svg;
}

/* ---------- HOME = 오늘 ---------- */
function renderHome() {
  const errFull = store.errSeries(lang, 'full');
  const lastErr = errFull.length ? errFull[errFull.length - 1].err : null;
  const streak = store.getState().streak;
  const todayN = store.sessionsToday().length;
  const hasBaseline = errFull.length > 0;

  const status = h('div', { class: 'today-status' },
    goalRing(todayN, DAILY_GOAL),
    h('div', { class: 'status-metrics' },
      h('div', { class: 'metric' },
        h('span', { class: 'metric__num' }, icon('flame', { size: 18 }), String(streak.count)),
        h('span', { class: 'metric__lbl' }, '연속일')),
      h('div', { class: 'metric' },
        h('span', { class: 'metric__num' }, lastErr != null ? String(lastErr) : '—'),
        h('span', { class: 'metric__lbl' }, lang === 'zh' ? '최근 ERR · 자/분' : '최근 ERR · WPM')),
      h('div', { class: 'metric' },
        h('span', { class: 'metric__num' }, String(todayN)),
        h('span', { class: 'metric__lbl' }, '오늘 세션'))));

  const session = pickSession(lang);
  const doneFlags = session.map(sessionDoneToday);
  let activeIdx = doneFlags.findIndex(d => !d);
  const allDone = activeIdx === -1;
  if (allDone) activeIdx = Math.max(0, session.length - 1);

  let heroNode, label;
  if (!hasBaseline) {
    const errDrill = DRILL_BY_ID['err'];
    label = '시작하기';
    heroNode = h('div', { class: 'hero' },
      h('div', { class: 'hero__eyebrow' }, icon('today', { size: 15 }), label),
      h('div', { class: 'hero__row' },
        h('span', { class: 'iconchip iconchip--lg iconchip--on' }, icon('err')),
        h('div', { class: 'hero__body' },
          h('div', { class: 'hero__name' }, '기준선 측정'),
          h('div', { class: 'hero__goal' }, '훈련 전에 지금의 읽기 속도·이해를 한 번 정직하게 잽니다. 이후 모든 향상은 이 기준과 비교합니다.'))),
      h('button', { class: 'hero__cta', onClick: () => launch(errDrill) }, icon('play'), 'ERR 정독으로 기준선 재기'));
  } else {
    const active = DRILL_BY_ID[session[activeIdx]] || DRILL_BY_ID['err'];
    label = allDone ? '오늘 훈련 완료 · 한 번 더?' : '오늘의 훈련';
    heroNode = h('div', { class: 'hero' },
      h('div', { class: 'hero__eyebrow' }, icon('today', { size: 15 }), label),
      h('div', { class: 'hero__row' },
        h('span', { class: 'iconchip iconchip--lg iconchip--on' }, icon(DRILL_ICON[active.id] || active.id)),
        h('div', { class: 'hero__body' },
          h('div', { class: 'hero__name' }, active.name),
          h('div', { class: 'hero__goal' }, active.goal))),
      h('button', { class: 'hero__cta', onClick: () => launch(active) }, icon('play'),
        allDone ? '다시 훈련' : (activeIdx === 0 ? '오늘 훈련 시작' : '이어서 훈련')));
  }

  const steps = session.map((id, i) => {
    const d = DRILL_BY_ID[id]; const done = doneFlags[i];
    const cls = 'step' + (done ? ' step--done' : (hasBaseline && i === activeIdx ? ' step--active' : ''));
    return h('button', { class: cls, onClick: () => launch(d) },
      h('span', { class: 'step__num' }, done ? icon('check', { size: 15 }) : String(i + 1)),
      h('div', { class: 'step__body' },
        h('div', { class: 'step__name' }, d.name),
        h('div', { class: 'step__meta' }, done ? '완료' : d.track)),
      icon('chevron', { size: 18, cls: 'step__chev' }));
  });

  mount(view, h('div', { class: 'fade-in' },
    status,
    h('p', { class: 'track-label', style: { marginTop: '16px' } }, hasBaseline ? '오늘의 훈련' : '먼저 · 기준선'),
    heroNode,
    !hasBaseline ? h('p', { class: 'track-label' }, '측정 후 · 오늘의 코스') : null,
    h('div', { class: 'session' + (hasBaseline ? '' : ' session--preview'), style: { marginTop: '12px' } }, ...steps),
    h('div', { class: 'linkrow' },
      h('a', { href: '#train', onClick: e => { e.preventDefault(); go('train'); } }, icon('train', { size: 16 }), '전체 훈련 보기'),
      h('a', { href: '#theory', onClick: e => { e.preventDefault(); go('theory'); } }, icon('theory', { size: 16 }), '왜 이렇게 훈련하나')),
    content.data().isSeed ? h('div', { class: 'note note--warn', style: { marginTop: '12px' } }, '※ 콘텐츠 데이터를 못 불러와 내장 샘플로 동작 중입니다.') : null));
}

function vocabKeys() {
  const d = content.data();
  return lang === 'en' ? d.vocabEn.words.map(w => w.word) : d.vocabZh.items.map(w => w.hanzi);
}

/* ---------- TRAIN catalog ---------- */
function renderTrain() {
  mount(view, h('div', { class: 'fade-in' },
    h('h1', { class: 'h1' }, '훈련'),
    h('p', { class: 'lead' }, '커버리지 → 속도 → 전략 순으로 쌓으세요. 위 ' + (lang === 'en' ? 'English/中文' : '中文/English') + ' 전환에 따라 드릴이 바뀝니다.'),
    ...catalogBlocks()));
}

function launch(drill) {
  const from = (route === 'home' || route === 'train') ? route : 'train';
  const exit = () => { route = from; syncTabs(); render(); };
  clear(view); window.scrollTo(0, 0);
  drill.render(view, lang, exit);
}

/* ---------- MY TEXTS ---------- */
function detectLang(text) { return /[㐀-鿿]/.test(text) ? 'zh' : 'en'; }

function renderMyTexts() {
  const ta = h('textarea', { placeholder: lang === 'zh' ? '책·논문의 중국어 단락을 붙여넣으세요…' : 'Paste a paragraph from a book or paper…' });
  const titleIn = h('input', { type: 'text', placeholder: '제목(선택)' });
  const save = () => {
    const text = ta.value.trim(); if (text.length < 20) return;
    const tl = detectLang(text);
    store.addMyText({ title: titleIn.value.trim() || (text.slice(0, 24) + '…'), text, lang: tl, unit_count: countUnits(text, tl) });
    ta.value = ''; titleIn.value = ''; renderMyTexts();
  };

  const list = store.myTexts();
  const items = list.length ? list.map(t => h('div', { class: 'card' },
    h('div', { class: 'row spread' },
      h('div', null, h('b', null, t.title), h('div', { class: 'small muted' }, `${t.lang === 'zh' ? '中文' : 'EN'} · ${t.unit_count}${t.lang === 'zh' ? '자' : '단어'}`)),
      h('button', { class: 'iconbtn', title: '삭제', 'aria-label': '삭제', onClick: () => { store.removeMyText(t.id); renderMyTexts(); } }, icon('trash', { size: 18 }))),
    h('div', { class: 'btnrow', style: { marginTop: '10px' } },
      h('button', { class: 'btn btn--primary', onClick: () => { clear(view); conquer.render(view, t.lang, backToTexts, t); } }, '정복 모드'),
      h('button', { class: 'btn', onClick: () => runCustomERR(t) }, '정독(ERR)'),
      h('button', { class: 'btn', onClick: () => { clear(view); triage.render(view, t.lang, backToTexts, t); } }, '논문 3-패스'),
      h('button', { class: 'btn btn--ghost', onClick: () => runCustomRecall(t) }, '자기설명·인출'))))
    : [h('div', { class: 'empty' }, '저장한 글이 없습니다. 위에 붙여넣어 보세요.')];

  mount(view, h('div', { class: 'fade-in' },
    h('h1', { class: 'h1' }, '내 글'),
    h('p', { class: 'lead' }, '읽고 있는 책·논문 단락을 붙여넣어 직접 훈련하세요. 언어는 자동 감지됩니다.'),
    h('div', { class: 'card' },
      h('label', { class: 'field' }, '제목'), titleIn,
      h('label', { class: 'field', style: { marginTop: '10px' } }, '본문'), ta,
      h('div', { class: 'btnrow', style: { marginTop: '10px' } }, h('button', { class: 'btn btn--primary', onClick: save }, '저장')),
      h('p', { class: 'small muted', style: { marginTop: '8px' } }, '※ 붙여넣은 글의 이해 문제는 자동 생성(클로즈)이라 검증된 문항이 아닙니다. 자기 점검용으로 쓰세요.')),
    h('p', { class: 'track-label' }, '저장한 글'),
    ...items));
}

function backToTexts() { route = 'mytexts'; syncTabs(); renderMyTexts(); }

function runCustomERR(t) {
  clear(view); window.scrollTo(0, 0);
  const units = t.unit_count || countUnits(t.text, t.lang);
  const timerEl = h('span', { class: 'hud__timer' }, '0:00');
  const timer = startTimer(ms => timerEl.textContent = fmtClock(ms));
  const done = () => {
    const ms = timer.stop(); const wpm = units / (ms / 60000);
    const items = content.autoCloze(t.text, t.lang, 4);
    if (!items.length) return finish(wpm, null);
    const host = h('div');
    mount(view, h('div', null, h('div', { class: 'hud' }, h('span', { class: 'chip' }, '자동 클로즈 (자기 점검)')), host));
    compQuiz(host, items).then(res => finish(wpm, res.frac));
  };
  const finish = (wpm, comp) => {
    const err = comp == null ? null : (comp < 0.6 ? 0 : Math.round(wpm * comp));
    store.addErr(t.lang, { tier: 0, units, wpm: Math.round(wpm), comp: comp == null ? 0 : comp, err: err || 0, mode: comp == null ? 'speed-only' : 'full' });
    store.logSession({ drill: 'mytext-err', lang: t.lang, err: err || 0 });
    mount(view, h('div', { class: 'card fade-in center' },
      h('p', { class: 'eyebrow' }, '결과'),
      h('div', { class: 'stat-row', style: { justifyContent: 'center' } },
        h('div', { class: 'stat', style: { alignItems: 'center' } }, h('span', { class: 'stat__num' }, comp == null ? Math.round(wpm) : (err + '')), h('span', { class: 'stat__lbl' }, comp == null ? (t.lang === 'zh' ? '자/분(속도만)' : 'WPM(속도만)') : 'ERR')),
        comp != null ? h('div', { class: 'stat', style: { alignItems: 'center' } }, h('span', { class: 'stat__num' }, Math.round(comp * 100) + '%'), h('span', { class: 'stat__lbl' }, '클로즈 정확도')) : null),
      comp == null ? h('div', { class: 'note note--warn' }, '이 글로는 자동 문제를 만들지 못했습니다. 속도만 기록합니다.') : null,
      h('div', { class: 'btnrow', style: { justifyContent: 'center', marginTop: '12px' } },
        h('button', { class: 'btn btn--primary', onClick: () => runCustomERR(t) }, '다시'),
        h('button', { class: 'btn btn--ghost', onClick: backToTexts }, '내 글로'))));
  };
  mount(view,
    h('div', { class: 'hud' },
      h('button', { class: 'iconbtn', onClick: () => { timer.stop(); backToTexts(); } }, '‹'),
      h('span', { class: 'chip' }, `${units}${t.lang === 'zh' ? '자' : '단어'}`), timerEl),
    h('div', { class: 'card' }, h('div', { class: 'eyebrow' }, t.title), h('div', { class: 'reader', 'data-lang': t.lang }, h('div', { class: 'reader-wrap' }, t.text))),
    h('div', { class: 'btnrow', style: { marginTop: '12px' } }, h('button', { class: 'btn btn--primary btn--lg', onClick: done }, '다 읽음 → 이해 확인')));
}

function runCustomRecall(t) {
  clear(view); window.scrollTo(0, 0);
  const read = () => mount(view,
    h('div', { class: 'hud' }, h('button', { class: 'iconbtn', onClick: backToTexts }, '‹'), h('span', { class: 'chip' }, '깊이 읽기')),
    h('div', { class: 'card' }, h('div', { class: 'eyebrow' }, t.title), h('div', { class: 'reader', 'data-lang': t.lang }, h('div', { class: 'reader-wrap' }, t.text))),
    h('div', { class: 'btnrow', style: { marginTop: '12px' } }, h('button', { class: 'btn btn--primary btn--lg', onClick: recall }, '덮기 → 떠올리기')));
  const recall = () => {
    const recallTa = h('textarea', { placeholder: '보지 말고, 기억나는 핵심을 적어보세요.' });
    const next = h('button', { class: 'btn btn--primary', disabled: true, onClick: quiz });
    next.textContent = '자기 점검';
    recallTa.addEventListener('input', () => next.disabled = recallTa.value.trim().length < 10);
    mount(view, h('div', { class: 'note' }, '떠올리는 노력 자체가 학습입니다.'),
      h('div', { style: { marginTop: '10px' } }, recallTa, h('div', { class: 'btnrow', style: { marginTop: '10px' } }, next)));
  };
  const quiz = () => {
    const items = content.autoCloze(t.text, t.lang, 4);
    if (!items.length) { store.logSession({ drill: 'mytext-recall', lang: t.lang }); return backToTexts(); }
    const host = h('div');
    mount(view, h('div', null, h('div', { class: 'eyebrow' }, '자동 클로즈 (자기 점검)'), host));
    compQuiz(host, items).then(() => { store.logSession({ drill: 'mytext-recall', lang: t.lang }); backToTexts(); });
  };
  read();
}

/* ---------- skill profile (radar) ---------- */
const TIERS = [[85, '정통'], [65, '상급'], [45, '숙련'], [25, '발전'], [1, '입문'], [0, '미착수']];
function tierName(v) { for (const [t, n] of TIERS) if (v >= t) return n; return '미착수'; }

function skillProfile(lng) {
  const st = store.getState();
  const full = store.errSeries(lng, 'full');
  const transfer = store.errSeries(lng, 'transfer');
  const comp = full.length ? mean(full.map(r => r.comp)) * 100 : 0;
  const targetW = lng === 'zh' ? 450 : 380;
  const recentW = full.length ? median(full.slice(-5).map(r => r.wpm)) : 0;
  const speed = clamp(Math.round(recentW / targetW * 100), 0, 100);
  const vdeck = st.sr['vocab-' + lng] || {};
  const matured = Object.values(vdeck).filter(c => c.reps >= 3).length;
  const vocab = clamp(Math.round(matured / 40 * 100), 0, 100);
  const retrN = st.sessions.filter(s => s.lang === lng && s.drill === 'retrieval').length;
  const retention = clamp(transfer.length * 14 + retrN * 9, 0, 100);
  const isStrat = s => s.lang === lng && /^(modes|triage|retrieval|preview)/.test(s.drill);
  const stratKinds = new Set(st.sessions.filter(isStrat).map(s => s.drill.split('-')[0])).size;
  const stratN = st.sessions.filter(isStrat).length;
  const strategy = clamp(Math.round(stratKinds / 4 * 55 + stratN * 5), 0, 100);
  return [
    { name: '어휘', val: vocab },
    { name: '속도', val: speed },
    { name: '이해', val: Math.round(comp) },
    { name: '유지·전이', val: retention },
    { name: '전략', val: strategy },
  ].map(s => ({ ...s, tier: tierName(s.val) }));
}

function renderRadar(skills) {
  const ns = 'http://www.w3.org/2000/svg';
  const W = 260, H = 220, cx = 130, cy = 106, R = 72, n = skills.length;
  const ang = i => (-90 + i * (360 / n)) * Math.PI / 180;
  const pt = (i, r) => [cx + r * Math.cos(ang(i)), cy + r * Math.sin(ang(i))];
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('class', 'radar'); svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', '읽기 스킬 프로필 레이더');
  [0.34, 0.67, 1].forEach(f => {
    const poly = document.createElementNS(ns, 'polygon');
    poly.setAttribute('class', 'grid-line');
    poly.setAttribute('points', skills.map((_, i) => pt(i, R * f).map(v => v.toFixed(1)).join(',')).join(' '));
    svg.append(poly);
  });
  skills.forEach((s, i) => {
    const [x, y] = pt(i, R);
    const ax = document.createElementNS(ns, 'line');
    ax.setAttribute('class', 'axis'); ax.setAttribute('x1', cx); ax.setAttribute('y1', cy); ax.setAttribute('x2', x.toFixed(1)); ax.setAttribute('y2', y.toFixed(1));
    svg.append(ax);
    const [lx, ly] = pt(i, R + 17);
    const t = document.createElementNS(ns, 'text');
    t.setAttribute('class', 'axis-lbl'); t.setAttribute('x', lx.toFixed(1)); t.setAttribute('y', ly.toFixed(1));
    t.setAttribute('text-anchor', Math.abs(lx - cx) < 8 ? 'middle' : (lx > cx ? 'start' : 'end'));
    t.setAttribute('dominant-baseline', 'central');
    t.textContent = s.name;
    svg.append(t);
  });
  const shape = document.createElementNS(ns, 'polygon');
  shape.setAttribute('class', 'shape');
  shape.setAttribute('points', skills.map((s, i) => pt(i, R * Math.max(0.02, s.val / 100)).map(v => v.toFixed(1)).join(',')).join(' '));
  svg.append(shape);
  skills.forEach((s, i) => {
    const [x, y] = pt(i, R * Math.max(0.02, s.val / 100));
    const c = document.createElementNS(ns, 'circle');
    c.setAttribute('class', 'vtx'); c.setAttribute('cx', x.toFixed(1)); c.setAttribute('cy', y.toFixed(1)); c.setAttribute('r', '2.6');
    svg.append(c);
  });
  return svg;
}

/* ---------- PROGRESS ---------- */
function renderProgress() {
  const full = store.errSeries(lang, 'full');
  const transfer = store.errSeries(lang, 'transfer');
  const gist = store.errSeries(lang, 'gist');
  const fullErr = full.map(r => r.err);
  const fullComp = full.map(r => r.comp);
  const gistComp = gist.map(r => r.comp);
  const ceil = store.getState().prof[lang].ceiling;
  const rt = store.rtBands(lang);
  const sessions = store.getState().sessions.length;
  const skills = skillProfile(lang);

  const ceilRows = Object.entries(ceil).sort((a, b) => a[0] - b[0]).map(([t, v]) => h('tr', null,
    h('td', { style: { padding: '4px 10px 4px 0' } }, '난이도 ' + t), h('td', { style: { fontWeight: '700' } }, v + (lang === 'zh' ? ' 자/분' : ' WPM'))));

  const rtRows = Object.entries(rt).filter(([, arr]) => arr.length).sort((a, b) => a[0] - b[0]).map(([band, arr]) => h('tr', null,
    h('td', { style: { padding: '4px 10px 4px 0' } }, '빈도대 ' + band), h('td', { style: { fontWeight: '700' } }, Math.round(median(arr)) + ' ms'), h('td', { class: 'small muted' }, arr.length + '회')));

  const weakest = skills.slice().sort((a, b) => a.val - b.val)[0];
  const noSkillData = skills.every(s => s.val === 0);

  mount(view, h('div', { class: 'fade-in' },
    h('h1', { class: 'h1' }, '기록'),
    h('p', { class: 'lead' }, (lang === 'en' ? 'English' : '中文') + ' 진행 상황. ERR과 이해도(정독 vs 훑기)를 분리해 정직하게 봅니다.'),

    h('div', { class: 'card' },
      h('div', { class: 'row spread', style: { alignItems: 'center', marginBottom: '4px' } },
        h('h2', { class: 'h2', style: { margin: 0 } }, '읽기 스킬 프로필'),
        (weakest && !noSkillData) ? h('span', { class: 'tier-pill' }, icon('target', { size: 14 }), '집중: ' + weakest.name) : null),
      h('div', { class: 'radar-wrap', style: { marginTop: '12px' } },
        renderRadar(skills),
        h('div', { class: 'skill-list' }, ...skills.map(s => h('div', { class: 'skill' },
          h('span', { class: 'skill__name' }, s.name),
          h('span', { class: 'skill__tier' }, s.tier + ' · ' + s.val),
          h('div', { class: 'skill__bar' }, h('div', { class: 'skill__fill', style: { width: Math.max(2, s.val) + '%' } })))))),
      h('p', { class: 'small muted', style: { marginTop: '10px' } }, noSkillData
        ? '아직 데이터가 없습니다. 오늘의 훈련을 시작하면 다섯 축이 채워지고, 가장 짧은 축이 다음 집중 영역이 됩니다.'
        : '검증된 절대점수가 아니라 활동·이해 기록에서 추정한 상대 프로필입니다. 가장 짧은 축이 다음에 집중할 영역입니다.')),

    h('div', { class: 'card' },
      h('h2', { class: 'h2' }, 'ERR 추이 (유효 읽기속도)'),
      fullErr.length > 1 ? sparkline(fullErr, 340, 64) : h('p', { class: 'muted small' }, 'ERR 정독을 몇 번 하면 추이가 그려집니다.'),
      h('div', { class: 'stat-row', style: { marginTop: '12px' } },
        stat(fullErr.length ? Math.round(fullErr[fullErr.length - 1]) : '—', '최근 ERR'),
        stat(fullErr.length ? Math.round(Math.max(...fullErr)) : '—', '최고 ERR'),
        stat(transfer.length ? Math.round(transfer[transfer.length - 1].err) : '—', '전이 ERR', '새 지문 기준'))),

    h('div', { class: 'card' },
      h('h2', { class: 'h2' }, '이해도 — 정독 vs 훑기 (분리)'),
      h('div', { class: 'stat-row' },
        stat(fullComp.length ? Math.round(mean(fullComp) * 100) + '%' : '—', '정독 이해도'),
        stat(gistComp.length ? Math.round(mean(gistComp) * 100) + '%' : '—', '훑기(Gist) 정확도')),
      h('p', { class: 'small muted', style: { marginTop: '8px' } }, '두 값의 격차가 곧 “언제 훑고 언제 정독할지” 전략의 근거입니다. 훑기 점수가 정독으로 둔갑하지 않습니다.')),

    ceilRows.length ? h('div', { class: 'card' }, h('h2', { class: 'h2' }, '개인 한계 (이해 80%↑ 유지 최고속)'),
      h('table', { style: { width: '100%', borderCollapse: 'collapse' } }, ...ceilRows),
      h('p', { class: 'small muted', style: { marginTop: '8px' } }, '고정 목표가 아니라 경험적으로 측정한 개인별 천장입니다.')) : null,

    rtRows.length ? h('div', { class: 'card' }, h('h2', { class: 'h2' }, '단어 인지 반응시간 (빈도대별)'),
      h('table', { style: { width: '100%', borderCollapse: 'collapse' } }, ...rtRows),
      h('p', { class: 'small muted', style: { marginTop: '8px' } }, '짧고 일정해질수록 자동화. (참고 지표, 검증된 점수 아님)')) : null,

    h('div', { class: 'card' },
      h('h2', { class: 'h2' }, '설정'),
      h('label', { class: 'row', style: { gap: '10px', cursor: 'pointer' } },
        h('input', { type: 'checkbox', checked: store.getSetting('hideEasy') !== false, onChange: e => { store.setSetting('hideEasy', e.target.checked); content.setHideEasy(e.target.checked); } }),
        h('span', null, '쉬운 지문 숨기기 ', h('span', { class: 'small muted' }, '(영 C2+ / 중 HSK6+ 이상만 노출)'))),
      h('p', { class: 'small muted', style: { marginTop: '8px' } }, '한계 위 난이도로 과부하 → 회복(간격·deload·수면)으로 강화하는 방식에 맞춰 기본은 최상위 난이도입니다.')),

    h('div', { class: 'card' },
      h('div', { class: 'row spread' }, h('span', { class: 'muted small' }, `총 ${sessions} 세션 기록`),
        h('button', { class: 'btn btn--ghost small', onClick: () => { if (confirm('모든 기록을 초기화할까요?')) { store.resetAll(); applyTheme(); go('home'); } } }, '기록 초기화')),
      h('p', { class: 'small muted', style: { marginTop: '6px' } }, '※ 향상은 “학습하지 않은 새 지문(전이)”에서 확인됩니다. 일반 인지능력 향상이 아니라 읽기 과제에 한정된 근거리 향상입니다.'))));
}

function stat(num, lbl, sub) { return h('div', { class: 'stat' }, h('span', { class: 'stat__num' }, num), h('span', { class: 'stat__lbl' }, lbl), sub ? h('span', { class: 'stat__sub' }, sub) : null); }

/* ---------- boot ---------- */
function paintTabIcons() {
  $$('.tab').forEach(t => { const name = TAB_ICON[t.dataset.route]; const span = t.querySelector('.tab__ico'); if (span && name) span.innerHTML = iconSvg(name); });
}

async function boot() {
  applyTheme();
  paintTabIcons();
  const hashRoute = location.hash.slice(1);
  if (ROUTES.includes(hashRoute)) route = hashRoute;
  $$('.seg__btn').forEach(x => x.classList.toggle('is-active', x.dataset.lang === lang));
  syncTabs();
  view.innerHTML = '<div class="empty">콘텐츠 불러오는 중…</div>';
  await content.loadContent();
  content.setHideEasy(store.getSetting('hideEasy') !== false);
  render();
  // register service worker
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
}
boot();
