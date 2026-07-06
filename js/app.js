// ===== app.js — entry, router, views =====
import { h, mount, $, $$, clear, countUnits, startTimer, fmtClock, sparkline, mean, median, clamp, shuffle } from './util.js';
import * as store from './store.js';
import * as content from './content.js';
import { LEVELS, LEVEL_ORDER, levelOf, defaultTier, recommendLevel } from './levels.js';
import { path as progressionPath, seedClears } from './progression.js';
import { DRILLS, TRACKS, DRILL_BY_ID } from './drills/index.js';
import { renderTheory } from './theory.js';
import { compQuiz, setTeardown, runTeardown } from './drills/shared.js';
import triage from './drills/triage.js';
import conquer from './drills/conquer.js';
import { tamper } from './drills/sentence.js';
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
function paintThemeToggle(t) {
  const btn = $('#themeToggle');
  if (!btn) return;
  // 현재 테마를 나타내는 아이콘 (다크면 달, 라이트면 해) — 아이콘 시스템(js/icons.js)으로 통일
  btn.innerHTML = iconSvg(t === 'dark' ? 'moon' : 'sun');
  btn.setAttribute('title', t === 'dark' ? '밝게 전환' : '어둡게 전환');
}
function applyTheme() {
  const t = resolveTheme();
  document.documentElement.setAttribute('data-theme', t);
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', t === 'dark' ? '#14181d' : '#FCFBF9');
  paintThemeToggle(t);
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
// 레이더 최약축 → 처방 드릴 매핑 (A2). 현재 레벨에서 열린(unlocked) 드릴만 후보.
// 어휘→vocab / 속도→err / 이해→err·context / 유지·전이→repeated / 전략→modes·preview·triage
const WEAKNESS_DRILLS = {
  '어휘': ['vocab'],
  '속도': ['err'],
  '이해': ['err', 'context'],
  '유지·전이': ['repeated'],
  '전략': ['modes', 'preview', 'triage', 'retrieval'],
};
// 최약축에 대응하며 지금 열려 있고 이 언어에 유효한 드릴 하나를 고른다. 없으면 null.
function weaknessDrillFor(lng, unlockedIds) {
  const valid = id => DRILL_BY_ID[id] && DRILL_BY_ID[id].langs.includes(lng);
  const skills = skillProfile(lng);
  if (skills.every(s => s.val === 0)) return null; // 데이터 없으면 처방 없음
  const weakest = skills.slice().sort((a, b) => a.val - b.val)[0];
  const cands = (WEAKNESS_DRILLS[weakest.name] || []).filter(id => unlockedIds.includes(id) && valid(id));
  return cands.length ? { drill: cands[0], axis: weakest.name } : null;
}

// 오늘의 코스: 도장깨기 경로에서 파생 — 워밍업(커버리지) → 지금 도전 단계 → 약점축 처방.
// 반환: { ids:[...], weakness:{drill,axis}|null }  (weakness.drill이 코스에 실제로 들어갔을 때만 라벨 표시)
function pickSession(lng) {
  const valid = id => DRILL_BY_ID[id] && DRILL_BY_ID[id].langs.includes(lng);
  const prog = progressionPath(lng);
  const unlocked = prog.stages.filter(s => s.unlocked).map(s => s.drillId).filter(valid);
  const active = prog.stages.find(s => !s.cleared);
  const out = [];
  // 1) 워밍업 — 커버리지(어휘)가 열려 있으면 항상 먼저
  if (unlocked.includes('vocab')) out.push('vocab');
  // 2) 도전 — 지금 깨야 할 단계
  if (active && valid(active.drillId)) out.push(active.drillId);
  // 3) 약점 보강 (A2) — 레이더 최약축에 대응하는 열린 드릴 1칸. 레이더 '집중' 라벨이 실제 처방으로 이어지게.
  const weakness = weaknessDrillFor(lng, unlocked);
  if (weakness) out.push(weakness.drill);
  // 4) 유지 — 이미 정복한 드릴을 날짜 로테이션 (실력 유지·간격 복습)
  const cleared = prog.stages.filter(s => s.cleared && s.drillId !== 'vocab').map(s => s.drillId).filter(valid);
  if (cleared.length) out.push(cleared[new Date().getDate() % cleared.length]);
  // 전부 정복(완성) 상태 — 코어·전략 다양성 로테이션으로 유지 훈련
  if (!active) {
    const core = ['conquer', 'err', 'repeated'].filter(valid);
    if (core.length) out.push(core[new Date().getDate() % core.length]);
    const strat = ['retrieval', 'modes', 'preview', 'triage'].filter(valid);
    if (strat.length) out.push(strat[(new Date().getDate() + 1) % strat.length]);
  }
  const ids = [...new Set(out)].slice(0, 3);
  // 약점 드릴이 최종 3칸 안에 실제로 남았을 때만 라벨링
  const weaknessFinal = weakness && ids.includes(weakness.drill) ? weakness : null;
  return { ids, weakness: weaknessFinal };
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
    h('div', { class: 'card card--recommend', style: { marginTop: '14px' } },
      h('p', { class: 'eyebrow eyebrow--latin' }, 'RECOMMENDED'),
      h('div', { class: 'row spread' },
        h('div', null,
          h('b', null, '잘 모르겠어요 — 3분 수준 측정으로 정확히'),
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

  // A3 복귀 훅: 오늘 복습할 어휘 카드 배지 (0이면 숨김) — 클릭 시 어휘 드릴 진입
  const dueN = store.dueCardCount(lang);
  const dueBadge = dueN > 0
    ? h('button', { class: 'due-badge', title: '잊히기 전에 복습하세요 — 어휘 카드로 이동', onClick: () => launch(DRILL_BY_ID['vocab']) },
        icon('cards', { size: 16 }),
        h('span', { class: 'due-badge__txt' }, '오늘 복습할 어휘 카드 ', h('b', null, String(dueN)), '장'),
        icon('chevron', { size: 15, cls: 'due-badge__chev' }))
    : null;

  const picked = pickSession(lang);
  const session = picked.ids;
  const weakness = picked.weakness; // {drill, axis} | null
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
    const isWeak = weakness && weakness.drill === id;
    const cls = 'step' + (done ? ' step--done' : (hasBaseline && i === activeIdx ? ' step--active' : ''));
    return h('button', { class: cls, onClick: () => launch(d) },
      h('span', { class: 'step__num' }, done ? icon('check', { size: 15 }) : String(i + 1)),
      h('div', { class: 'step__body' },
        h('div', { class: 'step__name' },
          d.name,
          isWeak ? h('span', { class: 'step__tag' }, icon('target', { size: 12 }), '약점 보강: ' + weakness.axis) : null),
        h('div', { class: 'step__meta' }, done ? '완료' : d.track)),
      icon('chevron', { size: 18, cls: 'step__chev' }));
  });

  mount(view, h('div', { class: 'fade-in' },
    status,
    dueBadge,
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

/* ---------- TRAIN = 도장깨기 정복 경로 ---------- */
function renderTrain() {
  // 목록형 보기 — 설정에서 전환 가능(잠금은 어디에도 없음, 보기 방식만 다름)
  if (store.getSetting('freePlay')) {
    mount(view, h('div', { class: 'fade-in' },
      h('h1', { class: 'h1' }, '훈련 · 전체 목록'),
      h('p', { class: 'lead' }, '모든 드릴을 카탈로그로 봅니다. ',
        h('a', { href: '#settings', class: 'plainlink', onClick: e => { e.preventDefault(); go('settings'); } }, '설정에서 정복 경로 보기로 되돌리기')),
      ...catalogBlocks()));
    return;
  }

  const prog = progressionPath(lang);
  const activeIdx = prog.stages.findIndex(s => !s.cleared);

  const header = h('div', { class: 'quest-head' },
    h('div', { class: 'quest-head__row' },
      h('div', null,
        h('div', { class: 'eyebrow' }, (lang === 'en' ? 'ENGLISH' : '中文') + ' · ' + levelOf(prog.level).label + ' 도장'),
        h('h1', { class: 'h1', style: { margin: 0 } }, '정복 경로'),
        h('p', { class: 'small muted', style: { margin: '6px 0 0' } }, '위에서 아래가 권장 순서 — 어느 단계든 바로 도전할 수 있고, 기준을 통과하면 도장이 찍힙니다. 전부 정복하면 레벨 승급 — 최상급까지 깨면 완성.')),
      h('div', { class: 'quest-head__score' },
        h('span', { class: 'quest-head__num' }, `${prog.clearedCount}`),
        h('span', { class: 'quest-head__den' }, `/ ${prog.total} 정복`))),
    h('div', { class: 'bar', style: { marginTop: '12px' } },
      h('div', { class: 'bar__fill', style: { width: Math.round(prog.clearedCount / prog.total * 100) + '%' } })));

  const stageCards = prog.stages.map((s, i) => {
    const d = DRILL_BY_ID[s.drillId];
    const isActive = i === activeIdx;
    // 잠금 없음(2026-07-06): 순서는 권장 경로 표시일 뿐, 전 단계가 항상 도전 가능.
    const state = s.cleared ? 'clear' : 'active';
    const pct = Math.round(Math.min(1, s.cur / s.goal) * 100);
    const isFinal = i === prog.stages.length - 1;
    return h('div', { class: `quest quest--${state}` + (isFinal ? ' quest--final' : '') },
      h('div', { class: 'quest__badge' },
        s.cleared ? icon('check', { size: 16 }) : String(s.idx)),
      h('div', { class: 'quest__body' },
        h('div', { class: 'quest__top' },
          h('span', { class: 'iconchip quest__chip' }, icon(DRILL_ICON[s.drillId] || 'dot')),
          h('div', { class: 'quest__names' },
            h('div', { class: 'quest__name' }, (isFinal ? '최종 관문 · ' : '') + d.name),
            h('div', { class: 'quest__state' },
              s.cleared ? '정복' : (isActive ? '지금 도전' : '도전 가능'))),
          h('button', { class: 'btn ' + (isActive ? 'btn--primary' : ''), onClick: () => launch(d) }, s.cleared ? '다시' : '도전')),
        h('div', { class: 'quest__gate' }, '기준: ' + s.gate),
        !s.cleared ? h('div', { class: 'quest__prog' },
          h('div', { class: 'bar' }, h('div', { class: 'bar__fill', style: { width: pct + '%' } })),
          h('span', { class: 'quest__detail' }, s.detail)) : null,
        s.cleared ? h('div', { class: 'quest__detail quest__detail--clear' }, s.detail) : null));
  });

  // 레벨 정복 / 완성 카드
  let finale = null;
  if (prog.conquered) {
    if (prog.nextLevel) {
      const next = LEVELS[prog.nextLevel];
      finale = h('div', { class: 'hero', style: { marginTop: '16px' } },
        h('div', { class: 'hero__eyebrow' }, icon('level', { size: 15 }), '도장 정복'),
        h('div', { class: 'hero__name' }, `${levelOf(prog.level).label} 도장을 전부 깼습니다`),
        h('div', { class: 'hero__goal' }, `다음 도장: ${next.label} (${next.sub[lang]}) — 더 어려운 지문에서 같은 경로를 다시 정복합니다. 읽기 단계(정독·전이·정복)의 도장은 새 난이도 기준으로 다시 비워집니다.`),
        h('button', { class: 'hero__cta', onClick: () => { if (confirm(`${next.label} 도장으로 승급할까요?`)) { store.setLevel(lang, prog.nextLevel); render(); } } }, icon('arrow'), `${next.label} 도장 입장`));
    } else {
      finale = h('div', { class: 'hero', style: { marginTop: '16px' } },
        h('div', { class: 'hero__eyebrow' }, icon('check', { size: 15 }), '완성'),
        h('div', { class: 'hero__name' }, '최상급 도장까지 전부 정복 — 완성입니다'),
        h('div', { class: 'hero__goal' }, '여기서부터는 유지 모드입니다: 오늘의 코스로 감을 유지하고, 「내 글」에 실제 읽는 책·논문을 붙여넣어 실전 전이를 이어가세요. 향상은 언제나 새 지문에서만 진짜입니다.'));
    }
  }

  mount(view, h('div', { class: 'fade-in' },
    header,
    h('div', { class: 'quest-path' }, ...stageCards),
    finale,
    h('div', { class: 'linkrow' },
      h('a', { href: '#theory', onClick: e => { e.preventDefault(); go('theory'); } }, icon('theory', { size: 16 }), '왜 이 순서인가 — 원리'),
      h('a', { href: '#settings', onClick: e => { e.preventDefault(); go('settings'); } }, icon('gear', { size: 16 }), '전체 드릴 목록 보기(설정)'))));
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
      h('button', { class: 'btn', onClick: () => runCustomSVT(t) }, '문장 검증(SVT)'),
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

// A6: 내 글 문장 검증(SVT) — 붙여넣은 텍스트에서 원문/1단어 변조 판정 문항을 자동 생성.
// sentence.js의 tamper(내용어 치환)를 재사용해 정답이 원문으로 결정 → 자동 클로즈보다 정직한 채점 경로.
function runCustomSVT(t) {
  clear(view); window.scrollTo(0, 0);
  drillActive = true;
  const L = t.lang;
  const sents = content.splitSentences(t.text, L).filter(s => countUnits(s, L) >= (L === 'zh' ? 8 : 6));
  if (sents.length < 4) {
    drillActive = false;
    mount(view,
      h('div', { class: 'hud' }, h('button', { class: 'iconbtn', onClick: backToTexts }, '‹'), h('span', { class: 'chip' }, '문장 검증(SVT)')),
      h('div', { class: 'card' }, h('div', { class: 'note note--warn' }, '이 글은 문장이 너무 적거나 짧아 문장 검증 문항을 만들 수 없습니다. 조금 더 긴 단락으로 시도해 보세요.'),
        h('div', { class: 'btnrow', style: { justifyContent: 'center', marginTop: '12px' } }, h('button', { class: 'btn btn--ghost', onClick: backToTexts }, '내 글로'))));
    return;
  }
  const chosen = shuffle(sents).slice(0, 6);
  // 절반은 원문, 절반은 1단어 변조. 변조 실패한 문장은 원문으로 대체(정직).
  const trials = shuffle(chosen.map((s, i) => {
    if (i % 2 === 0) return { text: s, real: true };
    const bad = tamper(s, t.text, L);
    return bad ? { text: bad, real: false } : { text: s, real: true };
  }));

  const read = () => mount(view,
    h('div', { class: 'hud' }, h('button', { class: 'iconbtn', onClick: backToTexts }, '‹'), h('span', { class: 'chip' }, '문장 검증(SVT) · 1/2 지문 읽기')),
    h('div', { class: 'note small' }, '평소처럼 읽으세요. 다음 단계에서 이 글의 문장들을 ', h('b', null, '원문 그대로'), '인지 ', h('b', null, '한 단어가 바뀌었'), '는지 판정합니다.'),
    h('div', { class: 'card', style: { marginTop: '10px' } }, h('div', { class: 'eyebrow' }, t.title),
      h('div', { class: 'reader', lang: L === 'zh' ? 'zh-Hans' : 'en', 'data-lang': L }, h('div', { class: 'reader-wrap' }, t.text))),
    h('div', { class: 'btnrow', style: { marginTop: '12px' } },
      h('button', { class: 'btn btn--primary btn--lg', onClick: () => trial(0, [], []) }, '다 읽음 → 문장 검증')));

  const trial = (i, results, rts) => {
    if (i >= trials.length) return finish(results, rts);
    const tr = trials[i];
    const stim = h('div', { class: 'reader', lang: L === 'zh' ? 'zh-Hans' : 'en', 'data-lang': L, style: { textAlign: 'center', padding: '18px 6px' } }, tr.text);
    let t0 = 0, shown = false;
    setTimeout(() => { t0 = performance.now(); shown = true; }, 250);
    const answer = (saidReal) => {
      if (!shown) return;
      results.push(saidReal === tr.real); rts.push(performance.now() - t0);
      trial(i + 1, results, rts);
    };
    mount(view,
      h('div', { class: 'hud' }, h('button', { class: 'iconbtn', onClick: backToTexts }, '‹'), h('span', { class: 'chip' }, '의미로 판단 — 표면 훑기로는 안 잡힙니다'), h('span', { class: 'chip' }, `${i + 1} / ${trials.length}`)),
      h('div', { class: 'card' }, stim),
      h('div', { class: 'btnrow', style: { justifyContent: 'center', marginTop: '12px' } },
        h('button', { class: 'btn btn--primary btn--lg', onClick: () => answer(true) }, '지문 그대로 ✓'),
        h('button', { class: 'btn btn--lg', onClick: () => answer(false) }, '바뀌었음 ✕')));
  };

  const finish = (results, rts) => {
    drillActive = false;
    const correct = results.filter(Boolean).length;
    const acc = results.length ? correct / results.length : 0;
    const med = rts.length ? Math.round(median(rts)) : 0;
    store.logSession({ drill: 'mytext-svt', lang: L, acc, rt: med });
    mount(view, h('div', { class: 'card fade-in center' },
      h('p', { class: 'eyebrow' }, '문장 검증 결과'),
      h('div', { class: 'stat-row', style: { justifyContent: 'center' } },
        h('div', { class: 'stat', style: { alignItems: 'center' } }, h('span', { class: 'stat__num' }, correct + '/' + results.length), h('span', { class: 'stat__lbl' }, '정확 (원문 결정)')),
        h('div', { class: 'stat', style: { alignItems: 'center' } }, h('span', { class: 'stat__num' }, (med / 1000).toFixed(1) + 's'), h('span', { class: 'stat__lbl' }, '문장당 중앙 판정시간'))),
      h('div', { class: 'note ' + (acc >= 5 / 6 ? 'note--good' : 'note--warn'), style: { textAlign: 'left', marginTop: '8px' } }, acc >= 5 / 6
        ? '문장을 의미로 통합하고 있습니다. 자동 빈칸 문제와 달리 정답이 원문으로 결정되므로 이 점수는 정직합니다.'
        : '표면(단어 나열)이 아니라 의미로 기억해야 잡힙니다. 이 채점은 원문 대조라 검증된 문항입니다.'),
      h('div', { class: 'btnrow', style: { justifyContent: 'center', marginTop: '12px' } },
        h('button', { class: 'btn btn--primary', onClick: () => runCustomSVT(t) }, '다시'),
        h('button', { class: 'btn btn--ghost', onClick: backToTexts }, '내 글로'))));
  };

  read();
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

/* ---------- growth trend + plateau (A4) ---------- */
// ISO 주(월요일 시작) 버킷 키 — 날짜축 눈금용
function weekKey(ts) {
  const d = new Date(ts);
  const day = (d.getDay() + 6) % 7; // Mon=0
  const monday = new Date(d); monday.setDate(d.getDate() - day); monday.setHours(0, 0, 0, 0);
  return monday.getTime();
}
// 주간 평균 ERR 버킷 [{wk, avg, label}] — 시간축 정렬
function weeklyBuckets(rows) {
  const map = new Map();
  rows.forEach(r => { if (!map.has(weekKey(r.ts))) map.set(weekKey(r.ts), []); map.get(weekKey(r.ts)).push(r.err); });
  return [...map.entries()].sort((a, b) => a[0] - b[0]).map(([wk, arr]) => {
    const d = new Date(wk);
    return { wk, avg: arr.reduce((s, x) => s + x, 0) / arr.length, label: `${d.getMonth() + 1}/${d.getDate()}` };
  });
}
// 지난주 대비 변화율(%) — 최근 2주 버킷 평균 비교. 데이터 부족이면 null.
function weekOverWeek(rows) {
  const b = weeklyBuckets(rows);
  if (b.length < 2) return null;
  const prev = b[b.length - 2].avg, cur = b[b.length - 1].avg;
  if (prev <= 0) return null;
  return Math.round((cur - prev) / prev * 100);
}
// 정체 감지: 최근 5개 전이 ERR의 연속 기울기(변화율)가 전부 ±3% 이내면 true. 데이터<5면 false.
function isPlateau(errVals) {
  if (errVals.length < 5) return false;
  const last5 = errVals.slice(-5);
  for (let i = 1; i < last5.length; i++) {
    const base = last5[i - 1];
    if (base <= 0) return false;
    const pct = Math.abs((last5[i] - base) / base) * 100;
    if (pct > 3) return false;
  }
  return true;
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

    (() => {
      // A4: 시간축 눈금 + '지난주 대비' + 정체 배지. 전이 ERR 우선, 데이터 부족 시 정독 ERR로 폴백.
      const trendRows = transfer.length >= 2 ? transfer : full;
      const trendLabel = trendRows === transfer && transfer.length >= 2 ? '전이' : '정독';
      const wow = weekOverWeek(trendRows);
      const buckets = weeklyBuckets(trendRows);
      const transferErr = transfer.map(r => r.err);
      const plateau = isPlateau(transferErr);
      const wowNode = wow != null
        ? h('div', { class: 'trend-line' + (wow >= 0 ? ' trend-line--up' : ' trend-line--down') },
            icon(wow >= 0 ? 'progress' : 'arrow', { size: 15 }),
            h('span', null, '지난주 대비 ', h('b', null, (wow >= 0 ? '+' : '') + wow + '%'),
              h('span', { class: 'small muted' }, ' · ' + trendLabel + ' ERR')))
        : null;
      const ticks = buckets.length > 1
        ? h('div', { class: 'week-ticks' }, ...buckets.map(b => h('span', { class: 'week-tick' }, b.label)))
        : null;
      return h('div', { class: 'card' },
        h('div', { class: 'row spread', style: { alignItems: 'center', marginBottom: '4px' } },
          h('h2', { class: 'h2', style: { margin: 0 } }, 'ERR 추이 (유효 읽기속도 = 속도 × 이해율)'),
          plateau ? h('span', { class: 'stall-badge', title: '최근 전이 ERR이 5회 연속 평평합니다' }, icon('target', { size: 13 }), '정체 — 커버리지·난이도 점검') : null),
        fullErr.length > 1 ? sparkline(fullErr, 340, 64) : h('p', { class: 'muted small' }, 'ERR 정독을 몇 번 하면 추이가 그려집니다.'),
        ticks,
        wowNode,
        h('div', { class: 'stat-row', style: { marginTop: '12px' } },
          stat(fullErr.length ? Math.round(fullErr[fullErr.length - 1]) : '—', '최근 ERR'),
          stat(fullErr.length ? Math.round(Math.max(...fullErr)) : '—', '최고 ERR'),
          stat(transfer.length ? Math.round(transfer[transfer.length - 1].err) : '—', '전이 ERR', '새 지문 기준')));
    })(),

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
      h('h2', { class: 'h2' }, '훈련 방식'),
      h('label', { class: 'row', style: { gap: '10px', cursor: 'pointer' } },
        h('input', { type: 'checkbox', checked: !store.getSetting('freePlay'), onChange: e => { store.setSetting('freePlay', !e.target.checked); renderSettings(); } }),
        h('span', null, '정복 경로 보기 ', h('span', { class: 'small muted' }, '— 권장 순서와 도장 진행을 한눈에 봅니다(잠금 없음, 어느 단계든 바로 도전). 끄면 전체 드릴 카탈로그로 표시.'))),
      h('p', { class: 'small muted', style: { marginTop: '8px' } }, '클리어는 "한 번 해봄"이 아니라 측정된 기준 통과로 판정되고, 기존 기록에서 자동 소급됩니다.')),

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
  // A1: 두 언어 모두 도장 클리어를 최초 1회 durable 원장에 스냅샷 (세션 FIFO에도 도장 유지)
  try { seedClears('en'); seedClears('zh'); } catch {}
  render();
  // register service worker
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
}
boot();
