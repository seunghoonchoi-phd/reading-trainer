// ===== drills/err.js — Effective Reading Rate timed passage =====
import { h, mount, clear, startTimer, fmtClock, countUnits, clamp } from '../util.js';
import * as content from '../content.js';
import * as store from '../store.js';
import { defaultTier, levelOf, LEVEL_ORDER } from '../levels.js';
import { drillHeader, compQuiz, resultCard, tierPicker, tierLabel, setTeardown } from './shared.js';

function unitsName(lang) { return lang === 'zh' ? '자/분' : 'WPM'; }

export default {
  id: 'err', name: 'ERR 정독', icon: '📖', track: '속도',
  goal: '이해를 유지한 채 개인 한계까지 읽기 속도를 끌어올립니다. (ERR = 속도 × 이해율)',
  langs: ['en', 'zh'],
  why: '속도 단독 점수는 훑기로 조작됩니다. 모든 속도 시도에 이해 문제를 묶어 ERR(유효 읽기속도) = 속도 × 이해율로만 점수화하고, 이해가 60% 미만이면 0점 처리합니다. 페이서는 정상 레이아웃 위 하이라이트일 뿐, 언제든 끄고 되돌아갈 수 있습니다.',
  evidence: '속도-이해 트레이드오프와 WPM 단독 무효(Rayner 2016; Miyata 2012). 현실적 기준선 ~238/260 WPM(Brysbaert 2019).',

  render(root, lang, exit) {
    let tier = defaultTier(store.getLevel(lang) || 'builder', content.allTiers(lang)) || 2;
    let usePacer = false;
    let exclude = [];

    const setup = () => {
      const pace = store.getPace(lang, tier);
      const ceil = store.ceiling(lang, tier);
      mount(root,
        drillHeader(this.name, exit, this.why),
        h('div', { class: 'card fade-in' },
          h('h2', { class: 'h2' }, 'ERR 정독'),
          h('p', { class: 'muted' }, '지문을 평소처럼 읽고(되돌아 읽기 허용) “다 읽었어요”를 누르면 이해 문제가 나옵니다. 점수 = ', h('b', null, '속도 × 이해율'), '.'),
          tierPicker(lang, tier, t => { tier = t; setup(); }),
          h('hr', { class: 'sep' }),
          h('label', { class: 'row', style: { gap: '10px', cursor: 'pointer' } },
            h('input', { type: 'checkbox', checked: usePacer, onChange: e => usePacer = e.target.checked }),
            h('span', null, '적응형 페이서 켜기 ', h('span', { class: 'small muted' }, `(목표 ${pace} ${unitsName(lang)} · 하이라이트가 안내, 언제든 끄기 가능)`))),
          h('div', { class: 'note small', style: { marginTop: '10px' } },
            ceil ? `이 난이도 개인 최고(이해 80%↑ 유지): ${ceil} ${unitsName(lang)}` : '아직 이 난이도 기준선을 측정 중입니다.'),
          h('div', { class: 'btnrow', style: { marginTop: '14px' } },
            h('button', { class: 'btn btn--primary btn--lg', onClick: run }, '시작'))));
    };

    const run = () => {
      const p = content.pickPassage(lang, tier, exclude);
      if (!p) { mount(root, drillHeader(this.name, exit), h('div', { class: 'empty' }, '이 난이도 지문이 없습니다.')); return; }
      exclude.push(p.id); store.markSeen(p.id);
      const units = p.unit_count || countUnits(p.text, lang);
      const pace = store.getPace(lang, tier);
      const seenBefore = store.seenCount(p.id) > 1;

      // build reading view
      const chunks = content.pacerChunks(p.text, lang, lang === 'zh' ? 4 : 3);
      const chunkEls = chunks.map(c => h('span', { class: usePacer ? 'pacer-seg' : '' }, c.text));
      const reader = h('div', { class: 'reader', lang: lang === 'zh' ? 'zh-Hans' : 'en', 'data-lang': lang },
        h('div', { class: 'reader-wrap' }, ...chunkEls));

      const timerEl = h('span', { class: 'hud__timer' }, '0:00');
      const t = startTimer(ms => timerEl.textContent = fmtClock(ms));

      let alive = true, pacerOn = usePacer, idx = 0, pacerTimer = null;
      const stepDelay = () => Math.max(120, (chunks[idx].units / pace) * 60000);
      function advance() {
        if (!alive || !pacerOn) return;
        chunkEls.forEach(e => e.classList.remove('pacer-active'));
        if (idx >= chunkEls.length) { finishReading(); return; }
        chunkEls[idx].classList.add('pacer-active');
        chunkEls[idx].scrollIntoView({ block: 'center', behavior: 'smooth' });
        const d = stepDelay(); idx++;
        pacerTimer = setTimeout(advance, d);
      }
      function stopPacer() { pacerOn = false; clearTimeout(pacerTimer); chunkEls.forEach(e => { e.classList.remove('pacer-active'); e.classList.remove('pacer-seg'); }); pacerBtn.textContent = '페이서 꺼짐 (자유 읽기)'; pacerBtn.disabled = true; }
      const stopAll = () => { alive = false; t.stop(); clearTimeout(pacerTimer); };
      setTeardown(stopAll); // 탭·언어 전환 시 잔존 타이머가 다른 화면을 덮지 않게

      const pacerBtn = h('button', { class: 'btn btn--ghost', onClick: stopPacer }, usePacer ? '페이서 끄기' : '페이서 꺼짐 (자유 읽기)');
      if (!usePacer) pacerBtn.disabled = true;

      let elapsedMs = 0;
      function finishReading() {
        if (!alive) return;
        alive = false;
        elapsedMs = t.stop(); clearTimeout(pacerTimer);
        const minutes = elapsedMs / 60000;
        const wpm = minutes > 0 ? units / minutes : 0;
        quiz(p, units, wpm);
      }

      mount(root,
        drillHeader(this.name, () => { stopAll(); exit(); }, this.why),
        h('div', { class: 'hud' },
          h('span', { class: 'chip' }, `${tierLabel(tier, lang)} · ${units} ${lang === 'zh' ? '자' : '단어'}`),
          h('div', { class: 'row', style: { gap: '10px' } },
            seenBefore ? h('span', { class: 'chip', title: '이미 푼 지문이라 점수가 실제보다 높게 나올 수 있습니다' }, '이미 본 지문') : null,
            timerEl)),
        h('div', { class: 'card' }, h('div', { class: 'eyebrow' }, p.title || '지문'), reader),
        h('div', { class: 'btnrow', style: { marginTop: '12px' } },
          h('button', { class: 'btn btn--primary btn--lg', onClick: finishReading }, '다 읽었어요 → 이해 확인'),
          pacerBtn));
      if (usePacer) { setTimeout(advance, 400); }
    };

    const quiz = (p, units, wpm) => {
      const host = h('div');
      mount(root, drillHeader(`${p.title} · 이해 확인`, exit, null), host);
      const items = (p.questions || []).slice();
      compQuiz(host, items).then(res => done(p, units, wpm, res.frac));
    };

    const done = (p, units, wpm, comp) => {
      const floored = comp < 0.6;
      const err = floored ? 0 : Math.round(wpm * comp);
      const isBaseline = store.errSeries(lang, 'full').length === 0;
      if (isBaseline && !floored) store.seedPace(lang, tier, wpm); // 기준선 실측으로 페이서 시작점 보정
      const upd = store.updatePace(lang, tier, comp);
      store.addErr(lang, { tier, units, wpm: Math.round(wpm), comp, err, mode: 'full' });
      store.logSession({ drill: 'err', lang, tier, err, wpm: Math.round(wpm), comp });
      const ceil = store.ceiling(lang, tier);
      const dirMsg = { up: '이해가 잘 유지돼 다음엔 페이스를 올립니다 ▲', down: '이해가 떨어져 페이스를 낮춥니다 ▼', hold: '페이스 유지 ―' }[upd.dir];
      // 레벨 창 최상단에서 이해 90%+ 반복이면 레벨 올리기 제안
      const lvKey = store.getLevel(lang) || 'builder';
      const win = levelOf(lvKey).tiers;
      const canLevelUp = lvKey !== 'overload' && tier >= win[win.length - 1] && comp >= 0.9;
      const nextLv = canLevelUp ? levelOf(LEVEL_ORDER[LEVEL_ORDER.indexOf(lvKey) + 1]) : null;
      const extra = h('div', { class: 'stack' },
        floored ? h('div', { class: 'note note--warn' }, '이해도 60% 미만 → ERR 0점. 훑기는 정독 점수를 이길 수 없습니다. 조금 더 천천히, 정확하게. 난이도를 한 단계 낮추는 것도 방법입니다.') : null,
        h('div', { class: 'note small' }, `${dirMsg}  ·  다음 목표 ${upd.pace} ${unitsName(lang)}` + (ceil ? `  ·  개인 최고 ${ceil}` : '')),
        nextLv ? h('div', { class: 'note note--good small' }, `이 난이도에서 이해 90%를 넘겼습니다. 설정에서 레벨을 ‘${nextLv.label}’로 올려 더 어려운 지문에 도전해 보세요.`) : null,
        h('p', { class: 'small muted' }, 'ERR(유효 읽기속도) = 속도 × 이해율. 이것만이 헤드라인 지표입니다.'));
      mount(root, drillHeader(this.name, exit, null),
        resultCard([
          [err + '', 'ERR ' + unitsName(lang), '유효 읽기속도'],
          [Math.round(wpm) + '', '원속도 ' + unitsName(lang), '(참고용)'],
          [Math.round(comp * 100) + '%', '이해도', `${Math.round(comp * (p.questions || []).length)}/${(p.questions || []).length}`],
        ], () => this.render(root, lang, exit), exit, extra));
    };

    setup();
  },
};
