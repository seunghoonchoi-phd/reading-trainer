// ===== app.js — entry, router, views =====
import { h, mount, $, $$, clear, countUnits, startTimer, fmtClock, sparkline, mean, median, clamp } from './util.js';
import * as store from './store.js';
import * as content from './content.js';
import { LEVELS, LEVEL_ORDER, levelOf, defaultTier, recommendLevel } from './levels.js';
import { DRILLS, TRACKS, DRILL_BY_ID } from './drills/index.js';
import { renderTheory } from './theory.js';
import { compQuiz, setTeardown, runTeardown } from './drills/shared.js';
import triage from './drills/triage.js';
import conquer from './drills/conquer.js';
import { icon, iconSvg, DRILL_ICON } from './icons.js';

const view = $('#view');
let lang = store.getSetting('lang') || 'en';
let route = 'home';
let drillActive = false;

const ROUTES = ['home', 'train', 'mytexts', 'progress', 'theory', 'settings'];
const TAB_ICON = { home: 'today', train: 'train', mytexts: 'mytexts', progress: 'progress', theory: 'theory' };
const DAILY_GOAL = 3;

/* ---------- PWA install prompt ---------- */
let installPrompt = null;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installPrompt = e; });

/* ---------- theme ---------- */
function resolveTheme() {
  const t = store.getSetting('theme');
  if (t === 'light' || t === 'dark') return t;                                  // explicit choice
  return (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
}
function applyTheme() {
  const t = resolveTheme();
  document.documentElement.setAttribute('data-theme', t);
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', t === 'dark' ? '#14181d' : '#FCFBF9');
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

/* ---------- leaving guard: 진행 중 드릴 보호 ---------- */
function confirmLeave() {
  if (!drillActive) return true;
  const ok = confirm('진행 중인 훈련을 중단할까요? 이번 시도 기록은 저장되지 않습니다.');
  if (ok) { runTeardown(); drillActive = false; }
  return ok;
}

/* ---------- language ---------- */
$$('.seg__btn').forEach(b => b.addEventListener('click', () => {
  if (b.dataset.lang === lang) return;
  if (!confirmLeave()) return;
  lang = b.dataset.lang; store.setSetting('lang', lang);
  $$('.seg__btn').forEach(x => x.classList.toggle('is-active', x.dataset.lang === lang));
  render();
}));

/* ---------- routing ---------- */
$$('.tab').forEach(t => t.addEventListener('click', () => go(t.dataset.route)));
function syncTabs() {
  $$('.tab').forEach(t => {
    const active = t.dataset.route === route;
    t.classList.toggle('is-active', active);
    if (active) t.setAttribute('aria-current', 'page'); else t.removeAttribute('aria-current');
  });
}

window.addEventListener('hashchange', () => {
  const r = location.hash.slice(1);
  if (ROUTES.includes(r) && r !== route) {
    if (!confirmLeave()) { try { location.hash = route; } catch {} return; }
    route = r; syncTabs(); render();
  }
});

// brand → home
const brandEl = $('.appbar__brand');
if (brandEl) {
  brandEl.addEventListener('click', () => go('home'));
  brandEl.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go('home'); } });
}
const settingsBtn = $('#settingsBtn');
if (settingsBtn) settingsBtn.addEventListener('click', () => go('settings'));

function render() {
  runTeardown(); drillActive = false;
  clear(view); view.scrollTop = 0; window.scrollTo(0, 0);
  if (route === 'home') renderHome();
  else if (route === 'train') renderTrain();
  else if (route === 'mytexts') renderMyTexts();
  else if (route === 'progress') renderProgress();
  else if (route === 'theory') renderTheory(view);
  else if (route === 'settings') renderSettings();
}

function go(r) {
  if (r !== route && !confirmLeave()) return;
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
// Balanced 3-step session: coverage → core rate → strategy/retention. 레벨에 맞춰 편성.
function pickSession(lng) {
  const lv = store.getLevel(lng) || 'builder';
  const gentle = lv === 'starter' || lv === 'builder';
  const valid = id => DRILL_BY_ID[id] && DRILL_BY_ID[id].langs.includes(lng);
  const out = [];
  // 1) coverage opener — 중국어는 어휘/글자인지/분할을 날짜 로테이션
  if (lng === 'zh') {
    const cov = ['vocab', 'zhchar', 'zhseg'].filter(valid);
    if (cov.length) out.push(cov[new Date().getDate() % cov.length]);
  } else if (valid('vocab')) out.push('vocab');
  // 2) core rate — 입문·중급은 정복 모드 대신 ERR/반복읽기부터
  const core = (gentle ? ['err', 'repeated'] : ['conquer', 'err', 'repeated']).filter(valid);
  if (core.length) out.push(core[new Date().getDate() % core.length]);
  // 3) strategy / retention — 논문 3-패스는 상급·과부하에서만 기본 편성
  const strat = (gentle ? ['retrieval', 'modes', 'preview'] : ['retrieval', 'modes', 'triage']).filter(valid);
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
  svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', `오늘 ${Math.min(done, goal)}/${goal} 세션`);
  const mk = (cls, extra) => { const e = document.createElementNS(ns, 'circle'); e.setAttribute('class', cls); e.setAttribute('cx', '27'); e.setAttribute('cy', '27'); e.setAttribute('r', r); e.setAttribute('stroke-width', '5'); if (extra) extra(e); return e; };
  const val = mk('ring__val', e => { e.setAttribute('stroke-dasharray', c.toFixed(1)); e.setAttribute('stroke-dashoffset', (c * (1 - frac)).toFixed(1)); e.setAttribute('transform', 'rotate(-90 27 27)'); });
  const txt = document.createElementNS(ns, 'text');
  txt.setAttribute('class', 'ring__txt'); txt.setAttribute('x', '27'); txt.setAttribute('y', '28'); txt.setAttribute('text-anchor', 'middle'); txt.setAttribute('dominant-baseline', 'central'); txt.setAttribute('font-size', '14');
  txt.textContent = `${Math.min(done, goal)}/${goal}`;
  svg.append(mk('ring__track'), val, txt);
  return svg;
}

/* ---------- ONBOARDING: 첫 실행 레벨 선택 ---------- */
function renderOnboarding() {
  const cards = LEVEL_ORDER.map(key => {
    const lv = LEVELS[key];
    return h('button', { class: 'levelcard', onClick: () => { store.setLevel(lang, key); render(); } },
      h('div', { class: 'levelcard__top' },
        h('span', { class: 'levelcard__name' }, lv.label),
        h('span', { class: 'levelcard__sub' }, lv.sub[lang])),
      h('span', { class: 'levelcard__desc' }, lv.desc));
  });
  mount(view, h('div', { class: 'fade-in' },
    h('div', { class: 'hero', style: { marginBottom: '16px' } },
      h('div', { class: 'hero__eyebrow' }, icon('level', { size: 15 }), '시작하기 · 1분'),
      h('div', { class: 'hero__name', style: { fontSize: '1.2rem' } },
        (lang === 'zh' ? '중국어' : '영어') + ' 읽기, 지금 어느 정도인가요?'),
      h('div', { class: 'hero__goal' }, '레벨에 맞춰 지문 난이도·훈련 속도·어휘가 정해집니다. 언제든 설정에서 바꿀 수 있고, 훈련하다 보면 앱이 레벨 올리기를 제안합니다.')),
    h('div', { class: 'levelgrid' }, ...cards),
    h('div', { class: 'card', style: { marginTop: '14px' } },
      h('div', { class: 'row spread' },
        h('div', null,
          h('b', null, '잘 모르겠어요'),
          h('div', { class: 'small muted' }, '짧은 지문 하나를 읽고 이해 문제를 풀면, 결과로 레벨을 추천해 드립니다 (약 3분).')),
        h('button', { class: 'btn btn--primary', onClick: placement }, '수준 측정')),
      h('p', { class: 'small muted', style: { marginTop: '10px' } },
        '이 앱은 속독 미신(시야 확장, 1만 WPM) 없이, 근거가 검증된 방법만 씁니다 — 자세한 근거는 「원리」 탭에.'))));
}

// 배치 테스트: 중간 난이도(티어 3) 지문 1편 → ERR 측정 → 레벨 추천 (기준선 기록으로도 저장)
function placement() {
  const p = content.passagesFor(lang, 3).length ? content.pickPassage(lang, 3) : content.pickPassage(lang, null);
  if (!p) { alert('지문 데이터를 불러오지 못했습니다.'); return; }
  store.markSeen(p.id);
  const units = p.unit_count || countUnits(p.text, lang);
  const timerEl = h('span', { class: 'hud__timer' }, '0:00');
  const t = startTimer(ms => timerEl.textContent = fmtClock(ms));
  drillActive = true;
  setTeardown(() => t.stop());
  const done = () => {
    const ms = t.stop();
    const wpm = units / (ms / 60000);
    const host = h('div');
    mount(view, h('div', { class: 'hud' }, h('span', { class: 'chip' }, '수준 측정 · 이해 확인')), host);
    compQuiz(host, (p.questions || []).slice()).then(res => {
      drillActive = false;
      const comp = res.frac;
      const err = comp < 0.6 ? 0 : Math.round(wpm * comp);
      store.addErr(lang, { tier: 3, units, wpm: Math.round(wpm), comp, err, mode: 'full' });
      if (comp >= 0.6) store.seedPace(lang, 3, wpm);
      const rec = recommendLevel(comp, wpm, lang);
      const lv = LEVELS[rec];
      mount(view, h('div', { class: 'card fade-in center' },
        h('p', { class: 'eyebrow' }, '수준 측정 결과'),
        h('div', { class: 'stat-row', style: { justifyContent: 'center' } },
          h('div', { class: 'stat', style: { alignItems: 'center' } }, h('span', { class: 'stat__num' }, Math.round(wpm) + ''), h('span', { class: 'stat__lbl' }, lang === 'zh' ? '자/분' : 'WPM')),
          h('div', { class: 'stat', style: { alignItems: 'center' } }, h('span', { class: 'stat__num' }, Math.round(comp * 100) + '%'), h('span', { class: 'stat__lbl' }, '이해도'))),
        h('div', { class: 'note note--good', style: { textAlign: 'left', marginTop: '8px' } },
          `추천 레벨: `, h('b', null, `${lv.label} (${lv.sub[lang]})`), ` — ${lv.desc}`),
        h('div', { class: 'btnrow', style: { justifyContent: 'center', marginTop: '14px' } },
          h('button', { class: 'btn btn--primary btn--lg', onClick: () => { store.setLevel(lang, rec); go('home'); } }, `${lv.label}로 시작`),
          h('button', { class: 'btn btn--ghost', onClick: () => { render(); } }, '직접 고르기'))));
    });
  };
  mount(view,
    h('div', { class: 'hud' },
      h('span', { class: 'chip' }, `수준 측정 · ${units}${lang === 'zh' ? '자' : '단어'}`), timerEl),
    h('div', { class: 'note small' }, '평소처럼 읽으세요. 빨리 읽으려고 무리하지 않아도 됩니다 — 다 읽으면 이해 문제가 나옵니다.'),
    h('div', { class: 'card', style: { marginTop: '10px' } }, h('div', { class: 'eyebrow' }, p.title || '지문'),
      h('div', { class: 'reader', lang: lang === 'zh' ? 'zh-Hans' : 'en', 'data-lang': lang }, h('div', { class: 'reader-wrap' }, p.text))),
    h('div', { class: 'btnrow', style: { marginTop: '12px' } },
      h('button', { class: 'btn btn--primary btn--lg', onClick: done }, '다 읽었어요 → 이해 확인')));
}

/* ---------- HOME = 오늘 ---------- */
function renderHome() {
  if (!store.getLevel(lang)) return renderOnboarding();
  const errFull = store.errSeries(lang, 'full');
  const lastErr = errFull.length ? errFull[errFull.length - 1].err : null;
  const streak = store.getState().streak;
  const todayN = store.sessionsToday().length;
  const hasBaseline = errFull.length > 0;
  const lv = levelOf(store.getLevel(lang));

  const status = h('div', { class: 'today-status' },
    goalRing(todayN, DAILY_GOAL),
    h('div', { class: 'status-metrics' },
      h('div', { class: 'metric' },
        h('span', { class: 'metric__num' }, icon('flame', { size: 18 }), String(streak.count)),
        h('span', { class: 'metric__lbl' }, '연속일')),
      h('div', { class: 'metric' },
        h('span', { class: 'metric__num' }, lastErr != null ? String(lastErr) : '—'),
        h('span', { class: 'metric__lbl', title: 'ERR(유효 읽기속도) = 속도 × 이해율' }, lang === 'zh' ? 'ERR · 자/분' : 'ERR · WPM')),
      h('div', { class: 'metric' },
        h('span', { class: 'metric__num' }, String(todayN)),
        h('span', { class: 'metric__lbl' }, '오늘 세션'))),
    h('button', { class: 'level-pill', title: '레벨 바꾸기 (설정)', onClick: () => go('settings') },
      icon('level', { size: 14 }), lv.label));

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
      h('button', { class: 'hero__cta', onClick: () => launch(errDrill) }, icon('play'), '내 속도·이해 측정하기'));
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
    content.data().isSeed ? h('div', { class: 'note note--warn', style: { marginTop: '12px' } }, '※ 콘텐츠 데이터를 못 불러와 내장 샘플로 동작 중입니다.') : null,
    h('div', { class: 'linkrow' },
      h('a', { href: '#theory', onClick: e => { e.preventDefault(); go('theory'); } }, icon('theory', { size: 16 }), '왜 이 순서로 훈련하나 — 원리'),
      h('a', { href: '#settings', onClick: e => { e.preventDefault(); go('settings'); } }, icon('gear', { size: 16 }), '레벨·설정'),
      installPrompt ? h('a', { href: '#', onClick: e => { e.preventDefault(); installPrompt.prompt(); } }, icon('install', { size: 16 }), '앱으로 설치') : null)));
}

/* ---------- TRAIN catalog ---------- */
function renderTrain() {
  mount(view, h('div', { class: 'fade-in' },
    h('h1', { class: 'h1' }, '훈련'),
    h('p', { class: 'lead' }, '커버리지(아는 단어 비율) → 속도 → 전략 순으로 쌓으세요. 위 ' + (lang === 'en' ? 'English/中文' : '中文/English') + ' 전환에 따라 드릴이 바뀝니다. ',
      h('a', { href: '#theory', class: 'plainlink', onClick: e => { e.preventDefault(); go('theory'); } }, '왜 이 순서인가 → 원리')),
    ...catalogBlocks()));
}

function launch(drill) {
  if (!confirmLeave()) return;
  const from = (route === 'home' || route === 'train') ? route : 'train';
  const exit = () => { runTeardown(); drillActive = false; route = from; syncTabs(); render(); };
  runTeardown();
  drillActive = true;
  clear(view); window.scrollTo(0, 0);
  drill.render(view, lang, exit);
}

/* ---------- MY TEXTS ---------- */
function detectLang(text) { return /[㐀-鿿]/.test(text) ? 'zh' : 'en'; }

function renderMyTexts() {
  const ta = h('textarea', { placeholder: lang === 'zh' ? '책·논문의 중국어 단락을 붙여넣으세요…' : '책·논문의 영어 단락을 붙여넣으세요…' });
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
      h('button', { class: 'iconbtn', title: '삭제', 'aria-label': '삭제', onClick: () => { if (confirm(`'${t.title}' 글을 삭제할까요?`)) { store.removeMyText(t.id); renderMyTexts(); } } }, icon('trash', { size: 18 }))),
    h('div', { class: 'btnrow', style: { marginTop: '10px' } },
      h('button', { class: 'btn btn--primary', onClick: () => { clear(view); drillActive = true; conquer.render(view, t.lang, backToTexts, t); } }, '정복 모드'),
      h('button', { class: 'btn', onClick: () => runCustomERR(t) }, '정독(ERR)'),
      h('button', { class: 'btn', onClick: () => { clear(view); drillActive = true; triage.render(view, t.lang, backToTexts, t); } }, '논문 3-패스'),
      h('button', { class: 'btn btn--ghost', onClick: () => runCustomRecall(t) }, '자기설명·인출'))))
    : [h('div', { class: 'empty' }, '저장한 글이 없습니다. 위에 붙여넣어 보세요.')];

  mount(view, h('div', { class: 'fade-in' },
    h('h1', { class: 'h1' }, '내 글'),
    h('p', { class: 'lead' }, '읽고 있는 책·논문 단락을 붙여넣으면 훈련 지문이 됩니다. 언어는 자동 감지됩니다.'),
    h('div', { class: 'card' },
      h('label', { class: 'field' }, '제목'), titleIn,
      h('label', { class: 'field', style: { marginTop: '10px' } }, '본문'), ta,
      h('div', { class: 'btnrow', style: { marginTop: '10px' } }, h('button', { class: 'btn btn--primary', onClick: save }, '저장')),
      h('p', { class: 'small muted', style: { marginTop: '8px' } }, '※ 붙여넣은 글의 이해 문제는 자동 생성(빈칸 문제)이라 검증된 문항이 아닙니다. 자기 점검용으로 쓰세요.')),
    h('p', { class: 'track-label' }, '저장한 글'),
    ...items));
}

function backToTexts() { runTeardown(); drillActive = false; route = 'mytexts'; syncTabs(); renderMyTexts(); }

function runCustomERR(t) {
  clear(view); window.scrollTo(0, 0);
  const units = t.unit_count || countUnits(t.text, t.lang);
  const timerEl = h('span', { class: 'hud__timer' }, '0:00');
  const timer = startTimer(ms => timerEl.textContent = fmtClock(ms));
  drillActive = true;
  setTeardown(() => timer.stop());
  const done = () => {
    const ms = timer.stop(); const wpm = units / (ms / 60000);
    const items = content.autoCloze(t.text, t.lang, 4);
    if (!items.length) return finish(wpm, null);
    const host = h('div');
    mount(view, h('div', null, h('div', { class: 'hud' }, h('span', { class: 'chip' }, '자동 빈칸 문제 (자기 점검)')), host));
    compQuiz(host, items).then(res => finish(wpm, res.frac));
  };
  const finish = (wpm, comp) => {
    drillActive = false;
    const err = comp == null ? null : (comp < 0.6 ? 0 : Math.round(wpm * comp));
    store.addErr(t.lang, { tier: 0, units, wpm: Math.round(wpm), comp: comp == null ? 0 : comp, err: err || 0, mode: comp == null ? 'speed-only' : 'full' });
    store.logSession({ drill: 'mytext-err', lang: t.lang, err: err || 0 });
    mount(view, h('div', { class: 'card fade-in center' },
      h('p', { class: 'eyebrow' }, '결과'),
      h('div', { class: 'stat-row', style: { justifyContent: 'center' } },
        h('div', { class: 'stat', style: { alignItems: 'center' } }, h('span', { class: 'stat__num' }, comp == null ? Math.round(wpm) : (err + '')), h('span', { class: 'stat__lbl' }, comp == null ? (t.lang === 'zh' ? '자/분(속도만)' : 'WPM(속도만)') : 'ERR')),
        comp != null ? h('div', { class: 'stat', style: { alignItems: 'center' } }, h('span', { class: 'stat__num' }, Math.round(comp * 100) + '%'), h('span', { class: 'stat__lbl' }, '빈칸 정확도')) : null),
      comp == null ? h('div', { class: 'note note--warn' }, '이 글로는 자동 문제를 만들지 못했습니다. 속도만 기록합니다.') : null,
      h('div', { class: 'btnrow', style: { justifyContent: 'center', marginTop: '12px' } },
        h('button', { class: 'btn btn--primary', onClick: () => runCustomERR(t) }, '다시'),
        h('button', { class: 'btn btn--ghost', onClick: backToTexts }, '내 글로'))));
  };
  mount(view,
    h('div', { class: 'hud' },
      h('button', { class: 'iconbtn', onClick: () => { timer.stop(); backToTexts(); } }, '‹'),
      h('span', { class: 'chip' }, `${units}${t.lang === 'zh' ? '자' : '단어'}`), timerEl),
    h('div', { class: 'card' }, h('div', { class: 'eyebrow' }, t.title), h('div', { class: 'reader', lang: t.lang === 'zh' ? 'zh-Hans' : 'en', 'data-lang': t.lang }, h('div', { class: 'reader-wrap' }, t.text))),
    h('div', { class: 'btnrow', style: { marginTop: '12px' } }, h('button', { class: 'btn btn--primary btn--lg', onClick: done }, '다 읽음 → 이해 확인')));
}

function runCustomRecall(t) {
  clear(view); window.scrollTo(0, 0);
  drillActive = true;
  const read = () => mount(view,
    h('div', { class: 'hud' }, h('button', { class: 'iconbtn', onClick: backToTexts }, '‹'), h('span', { class: 'chip' }, '깊이 읽기')),
    h('div', { class: 'card' }, h('div', { class: 'eyebrow' }, t.title), h('div', { class: 'reader', lang: t.lang === 'zh' ? 'zh-Hans' : 'en', 'data-lang': t.lang }, h('div', { class: 'reader-wrap' }, t.text))),
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
    mount(view, h('div', null, h('div', { class: 'eyebrow' }, '자동 빈칸 문제 (자기 점검)'), host));
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
    h('p', { class: 'lead' }, (lang === 'en' ? 'English' : '中文') + ' 진행 상황. ERR(유효 읽기속도)과 이해도(정독 vs 훑기)를 분리해 정직하게 봅니다.'),

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
      h('h2', { class: 'h2' }, 'ERR 추이 (유효 읽기속도 = 속도 × 이해율)'),
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
      h('div', { class: 'row spread' },
        h('span', { class: 'muted small' }, `총 ${sessions} 세션 기록`),
        h('button', { class: 'btn btn--ghost small', onClick: () => go('settings') }, '설정 · 데이터 관리')),
      h('p', { class: 'small muted', style: { marginTop: '6px' } }, '※ 향상은 “학습하지 않은 새 지문(전이)”에서 확인됩니다. 일반 인지능력 향상이 아니라 읽기 과제에 한정된 근거리 향상입니다.'))));
}

function stat(num, lbl, sub) { return h('div', { class: 'stat' }, h('span', { class: 'stat__num' }, num), h('span', { class: 'stat__lbl' }, lbl), sub ? h('span', { class: 'stat__sub' }, sub) : null); }

/* ---------- SETTINGS ---------- */
function levelPicker(lng) {
  const cur = store.getLevel(lng);
  return h('div', { class: 'row', style: { gap: '8px', flexWrap: 'wrap' } },
    ...LEVEL_ORDER.map(key => h('button', {
      class: 'seg__btn' + (cur === key ? ' is-active' : ''),
      style: { border: '1px solid var(--line)' },
      title: LEVELS[key].desc,
      onClick: () => { store.setLevel(lng, key); renderSettings(); },
    }, `${LEVELS[key].label} (${LEVELS[key].sub[lng]})`)));
}

function renderSettings() {
  const themeSeg = (val, label) => h('button', {
    class: 'seg__btn' + ((store.getSetting('theme') || 'auto') === val ? ' is-active' : ''),
    style: { border: '1px solid var(--line)' },
    onClick: () => { store.setSetting('theme', val); applyTheme(); renderSettings(); },
  }, label);

  const doExport = () => {
    const blob = new Blob([store.exportJSON()], { type: 'application/json' });
    const a = h('a', { href: URL.createObjectURL(blob), download: 'readfast-backup.json' });
    document.body.append(a); a.click(); a.remove();
  };
  const fileIn = h('input', { type: 'file', accept: '.json,application/json', style: { display: 'none' } });
  fileIn.addEventListener('change', () => {
    const f = fileIn.files[0]; if (!f) return;
    f.text().then(txt => {
      try { store.importJSON(txt); alert('가져오기 완료. 화면을 새로 그립니다.'); applyTheme(); go('home'); }
      catch (e) { alert('가져오기 실패: 백업 파일 형식이 아닙니다.'); }
    });
  });

  mount(view, h('div', { class: 'fade-in' },
    h('h1', { class: 'h1' }, '설정'),
    h('p', { class: 'lead' }, '레벨은 지문 난이도·훈련 속도·어휘 범위를 한 번에 정합니다. 언어별로 따로 저장됩니다.'),

    h('div', { class: 'card' },
      h('h2', { class: 'h2' }, '레벨'),
      h('p', { class: 'field', style: { marginBottom: '6px' } }, 'English'),
      levelPicker('en'),
      h('p', { class: 'field', style: { margin: '14px 0 6px' } }, '中文'),
      levelPicker('zh'),
      h('p', { class: 'small muted', style: { marginTop: '10px' } },
        '최상급·과부하는 최고난도 지문(영 C2+/중 HSK6+)과 전공(재료과학) 지문까지 포함합니다 — 한계 바로 위 부하로 훈련하고 싶을 때 고르세요. 드릴 안에서 난이도를 개별 선택할 수도 있습니다.')),

    h('div', { class: 'card' },
      h('h2', { class: 'h2' }, '화면'),
      h('div', { class: 'row', style: { gap: '8px' } }, themeSeg('auto', '자동'), themeSeg('light', '밝게'), themeSeg('dark', '어둡게'))),

    h('div', { class: 'card' },
      h('h2', { class: 'h2' }, '데이터'),
      h('p', { class: 'small muted' }, '모든 기록은 이 기기(브라우저)에만 저장됩니다. 기기를 바꿀 땐 내보내기 → 가져오기를 쓰세요.'),
      h('div', { class: 'btnrow', style: { marginTop: '10px' } },
        h('button', { class: 'btn', onClick: doExport }, '백업 내보내기'),
        h('button', { class: 'btn', onClick: () => fileIn.click() }, '백업 가져오기'), fileIn),
      h('hr', { class: 'sep' }),
      h('div', { class: 'btnrow' },
        h('button', { class: 'btn btn--ghost', onClick: () => { if (confirm('훈련 기록만 초기화할까요? 내 글과 설정(레벨·테마)은 남습니다.')) { store.resetProgress(); go('home'); } } }, '기록 초기화 (내 글 보존)'),
        h('button', { class: 'btn btn--ghost', style: { color: 'var(--bad)' }, onClick: () => { if (confirm('내 글을 포함한 모든 데이터를 삭제할까요?') && confirm('정말요? 붙여넣은 글도 전부 사라집니다.')) { store.resetEverything(); applyTheme(); go('home'); } } }, '전체 삭제'))),

    installPrompt ? h('div', { class: 'card' },
      h('h2', { class: 'h2' }, '앱으로 설치'),
      h('p', { class: 'small muted' }, '홈 화면에 추가하면 오프라인에서도 앱처럼 쓸 수 있습니다.'),
      h('button', { class: 'btn btn--primary', style: { marginTop: '8px' }, onClick: () => installPrompt.prompt() }, icon('install', { size: 18 }), ' 설치')) :
      h('div', { class: 'card' },
        h('h2', { class: 'h2' }, '앱으로 설치'),
        h('p', { class: 'small muted' }, 'iPhone/iPad: 사파리 공유 버튼 → “홈 화면에 추가”. Android/PC: 브라우저 메뉴(또는 주소창 아이콘)의 “앱 설치”를 누르면 오프라인에서도 앱처럼 쓸 수 있습니다.')),

    h('div', { class: 'card' },
      h('h2', { class: 'h2' }, '만든 사람'),
      h('p', { style: { margin: '0 0 8px' } }, '재료공학 연구자 ', h('b', null, '최승훈'), '이 영어·중국어 논문을 더 빨리, 정확히 읽으려고 읽기과학·학습과학의 검증된 방법만 골라 직접 만들었습니다. 과장된 속독 약속은 없습니다 — 무엇이 왜 들어갔는지는 「원리」 탭에 전부 공개돼 있습니다.'),
      h('div', { class: 'linkrow', style: { justifyContent: 'flex-start', marginTop: '10px' } },
        h('a', { href: 'https://seunghoonchoi.com', target: '_blank', rel: 'noopener' }, icon('globe', { size: 16 }), 'seunghoonchoi.com'),
        h('a', { href: 'https://github.com/seunghoonchoi-phd/reading-trainer', target: '_blank', rel: 'noopener' }, icon('mytexts', { size: 16 }), '소스 코드 (GitHub)'),
        h('a', { href: '#theory', onClick: e => { e.preventDefault(); go('theory'); } }, icon('theory', { size: 16 }), '원리·출처')))));
}

/* ---------- boot ---------- */
function paintTabIcons() {
  $$('.tab').forEach(t => { const name = TAB_ICON[t.dataset.route]; const span = t.querySelector('.tab__ico'); if (span && name) span.innerHTML = iconSvg(name); });
  const logo = $('.appbar__logo'); if (logo) logo.innerHTML = iconSvg('brand');
  const gear = $('#settingsBtn'); if (gear) gear.innerHTML = iconSvg('gear');
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
  render();
  // register service worker
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
}
boot();
