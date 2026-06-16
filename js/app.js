// ===== app.js — entry, router, views =====
import { h, mount, $, $$, clear, countUnits, startTimer, fmtClock, sparkline, mean, median } from './util.js';
import * as store from './store.js';
import * as content from './content.js';
import { DRILLS, TRACKS } from './drills/index.js';
import { renderTheory } from './theory.js';
import { compQuiz } from './drills/shared.js';
import triage from './drills/triage.js';
import conquer from './drills/conquer.js';

const view = $('#view');
let lang = store.getSetting('lang') || 'en';
let route = 'home';

/* ---------- theme ---------- */
function applyTheme() {
  const t = store.getSetting('theme') || 'light';
  document.documentElement.setAttribute('data-theme', t);
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', t === 'dark' ? '#14181d' : '#1f2933');
}
$('#themeToggle').addEventListener('click', () => {
  store.setSetting('theme', (store.getSetting('theme') === 'dark') ? 'light' : 'dark');
  applyTheme();
});

/* ---------- language ---------- */
$$('.seg__btn').forEach(b => b.addEventListener('click', () => {
  lang = b.dataset.lang; store.setSetting('lang', lang);
  $$('.seg__btn').forEach(x => x.classList.toggle('is-active', x.dataset.lang === lang));
  render();
}));

/* ---------- routing ---------- */
$$('.tab').forEach(t => t.addEventListener('click', () => { route = t.dataset.route; syncTabs(); render(); }));
function syncTabs() { $$('.tab').forEach(t => t.classList.toggle('is-active', t.dataset.route === route)); }

function render() {
  clear(view); view.scrollTop = 0; window.scrollTo(0, 0);
  if (route === 'home') renderHome();
  else if (route === 'train') renderTrain();
  else if (route === 'mytexts') renderMyTexts();
  else if (route === 'progress') renderProgress();
  else if (route === 'theory') renderTheory(view);
}

function go(r) { route = r; syncTabs(); render(); }

/* ---------- HOME ---------- */
function renderHome() {
  const today = store.sessionsToday().length;
  const streak = store.getState().streak;
  const errFull = store.errSeries(lang, 'full');
  const recentErr = errFull.slice(-12).map(r => r.err);
  const lastErr = errFull.length ? errFull[errFull.length - 1].err : null;

  const vocabDue = store.srDueList('vocab-' + lang, vocabKeys()).length;
  const retrDue = store.srDueList('retr-' + lang, content.passagesFor(lang).map(p => p.id)).length;
  const coverageMeasured = errFull.length > 0;

  const hero = h('div', { class: 'card', style: { background: 'var(--accent-soft)', border: '1px solid var(--accent)' } },
    h('p', { class: 'eyebrow' }, (lang === 'en' ? 'English' : '中文') + ' 읽기 훈련'),
    h('div', { class: 'row spread' },
      h('div', null,
        h('div', { class: 'h1', style: { margin: 0 } }, lastErr != null ? `${lastErr} ` : '—',
          h('span', { class: 'small muted', style: { fontWeight: '600' } }, lastErr != null ? (lang === 'zh' ? ' 자/분 ERR' : ' WPM ERR') : '')),
        h('div', { class: 'small muted' }, lastErr != null ? '최근 유효 읽기속도 (속도×이해)' : '첫 ERR 정독으로 기준선을 만들어 보세요')),
      h('div', { class: 'stat', style: { alignItems: 'flex-end' } },
        h('span', { class: 'stat__num' }, '🔥 ' + streak.count), h('span', { class: 'stat__lbl' }, `연속 ${streak.count}일 · 오늘 ${today}세션`))),
    recentErr.length > 1 ? h('div', { style: { marginTop: '10px' } }, sparkline(recentErr, 320, 50)) : null);

  // adaptive recommendation
  const intenseToday = store.sessionsToday().filter(s => ['conquer', 'err', 'repeated'].includes(s.drill)).length;
  const recover = intenseToday >= 2;

  const recs = [];
  if (recover) recs.push(['retrieval', '회복 · 인출 복습', '과부하 충분 — 간격·인출로 공고화']);
  if (!coverageMeasured) recs.push(['err', '기준선 측정', 'ERR 정독으로 현재 속도·이해도부터 재기']);
  if (vocabDue > 0) recs.push(['vocab', `어휘 복습 (${vocabDue})`, '복습 시점 도래 — 잊기 전에']);
  recs.push(['conquer', '정복 모드', '어려운 글: 1차독해 → 반복속독 → 전이']);
  if (retrDue > 0) recs.push(['retrieval', `인출 복습 (${retrDue})`, '잊을 만할 때 다시 떠올리기']);
  recs.push(['err', 'ERR 정독', '이해 유지한 채 속도 끌어올리기']);
  if (lang === 'zh') recs.push(['zhchar', '글자 인지속도', '고빈도 한자 서브초 인식']);
  const seen = new Set(); const recList = recs.filter(r => !seen.has(r[0]) && seen.add(r[0])).slice(0, 3);

  const recCards = h('div', { class: 'tiles' }, ...recList.map(([id, name, sub]) => {
    const d = DRILLS.find(x => x.id === id);
    return h('button', { class: 'tile', onClick: () => launch(d) },
      h('div', { class: 'tile__top' }, h('span', { class: 'tile__ico' }, d.icon), h('span', { class: 'tile__name' }, name)),
      h('span', { class: 'tile__goal' }, sub));
  }));

  const programNote = h('div', { class: 'note small' },
    '프로그램 순서: ', h('b', null, '① 어휘·커버리지'), ' → ', h('b', null, '② 속도(ERR)'), ' → ', h('b', null, '③ 전략(모드·논문·인출)'), '. 진짜 병목은 눈이 아니라 단어 인지 자동화입니다 — ',
    h('a', { href: '#', onClick: (e) => { e.preventDefault(); go('theory'); }, style: { color: 'var(--accent-ink)', fontWeight: '700' } }, '원리 보기'));

  mount(view, h('div', { class: 'fade-in' },
    hero,
    h('p', { class: 'track-label' }, '오늘의 추천'),
    recCards,
    h('div', { class: 'note small ' + (recover ? 'note--good' : ''), style: { marginTop: '12px' } },
      recover
        ? '🌙 회복 모드 — 오늘 과부하는 충분합니다. 쉬운 넓게읽기·인출 복습으로 공고화하세요. 간격과 수면이 강화를 만듭니다(수면은 새로 익힌 단어를 굳히지, 읽기 속도를 빠르게 하진 않습니다).'
        : '🔥 과부하 모드 — 한 단계 위 난이도로 정복 모드를 미세요. 부하는 어휘·밀도·길이에 걸되, 눈 속도엔 걸지 않습니다(그건 훑기). 이해도는 끝까지 측정됩니다.'),
    h('div', { style: { marginTop: '12px' } }, programNote),
    content.data().isSeed ? h('div', { class: 'note note--warn', style: { marginTop: '14px' } }, '※ 콘텐츠 데이터(data/*.json)를 못 불러와 내장 샘플로 동작 중입니다.') : null));
}

function vocabKeys() {
  const d = content.data();
  return lang === 'en' ? d.vocabEn.words.map(w => w.word) : d.vocabZh.items.map(w => w.hanzi);
}

/* ---------- TRAIN catalog ---------- */
function renderTrain() {
  const blocks = TRACKS.map(track => {
    const ds = DRILLS.filter(d => d.track === track);
    if (!ds.length) return null;
    const tiles = ds.map(d => {
      const ok = d.langs.includes(lang);
      return h('button', { class: 'tile', disabled: !ok, onClick: ok ? () => launch(d) : null },
        h('div', { class: 'tile__top' }, h('span', { class: 'tile__ico' }, d.icon), h('span', { class: 'tile__name' }, d.name)),
        h('span', { class: 'tile__goal' }, d.goal),
        !ok ? h('span', { class: 'badge badge--neutral', style: { alignSelf: 'flex-start', marginTop: '4px' } }, d.langs.includes('zh') ? '중국어 전용' : '영어 전용') : null);
    });
    return h('div', null, h('p', { class: 'track-label' }, track), h('div', { class: 'tiles' }, ...tiles));
  }).filter(Boolean);

  mount(view, h('div', { class: 'fade-in' },
    h('h1', { class: 'h1' }, '훈련'),
    h('p', { class: 'lead' }, '커버리지 → 속도 → 전략 순으로 쌓으세요. 각 드릴 안에서 “왜 효과가 있나”를 확인할 수 있습니다.'),
    ...blocks));
}

function launch(drill) {
  const exit = () => { route = 'train'; syncTabs(); renderTrain(); };
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
      h('button', { class: 'iconbtn', title: '삭제', onClick: () => { store.removeMyText(t.id); renderMyTexts(); } }, '🗑')),
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

  const ceilRows = Object.entries(ceil).sort((a, b) => a[0] - b[0]).map(([t, v]) => h('tr', null,
    h('td', { style: { padding: '4px 10px 4px 0' } }, '난이도 ' + t), h('td', { style: { fontWeight: '700' } }, v + (lang === 'zh' ? ' 자/분' : ' WPM'))));

  const rtRows = Object.entries(rt).filter(([, arr]) => arr.length).sort((a, b) => a[0] - b[0]).map(([band, arr]) => h('tr', null,
    h('td', { style: { padding: '4px 10px 4px 0' } }, '빈도대 ' + band), h('td', { style: { fontWeight: '700' } }, Math.round(median(arr)) + ' ms'), h('td', { class: 'small muted' }, arr.length + '회')));

  mount(view, h('div', { class: 'fade-in' },
    h('h1', { class: 'h1' }, '기록'),
    h('p', { class: 'lead' }, (lang === 'en' ? 'English' : '中文') + ' 진행 상황. ERR과 이해도(정독 vs 훑기)를 분리해 정직하게 봅니다.'),

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
async function boot() {
  applyTheme();
  $$('.seg__btn').forEach(x => x.classList.toggle('is-active', x.dataset.lang === lang));
  view.innerHTML = '<div class="empty">콘텐츠 불러오는 중…</div>';
  await content.loadContent();
  content.setHideEasy(store.getSetting('hideEasy') !== false);
  render();
  // register service worker
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
}
boot();
