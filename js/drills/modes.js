// ===== drills/modes.js — explicit gist / scan / mastery mode selector =====
import { h, mount, startTimer, fmtClock, countUnits, norm } from '../util.js';
import * as content from '../content.js';
import * as store from '../store.js';
import { drillHeader, compQuiz, askMCQ, resultCard, tierPicker, tierLabel } from './shared.js';

export default {
  id: 'modes', name: '모드 선택 (훑기/찾기/정독)', icon: '🎯', track: '전략',
  goal: '목적에 따라 읽기 깊이를 의식적으로 고르고, 깊이에 맞는 질문으로 평가합니다.',
  langs: ['en', 'zh'],
  why: '훑기(gist)는 요지만 빠르게 얻는 합법적 기술이지만 세부 이해는 떨어집니다 — 정독과 섞이면 안 됩니다. 모드를 명시적으로 고르고 그에 맞는 질문으로 채점해, 훑기 성과가 정독 성과로 둔갑하지 못하게 합니다.',
  evidence: '훑기는 알려진 이해 비용을 지닌 별개 기술(Rayner 2016; Duggan & Payne 2009; Just & Carpenter 1987).',

  render(root, lang, exit) {
    const tiers = content.tiersFor(lang);
    let tier = tiers.includes(2) ? 2 : tiers[Math.floor(tiers.length / 2)] || tiers[0];

    const menu = () => mount(root, drillHeader(this.name, exit, this.why),
      h('div', { class: 'card fade-in' },
        h('h2', { class: 'h2' }, '읽기 모드를 고르세요'),
        h('p', { class: 'muted' }, '같은 글이라도 목적이 다르면 읽는 방식이 달라야 합니다.'),
        tierPicker(tiers, tier, t => { tier = t; menu(); }, lang),
        h('div', { class: 'tiles', style: { marginTop: '12px' } },
          modeTile('💨', 'Gist · 요지', '시간 제한 안에 훑고 핵심 1문제. 세부 기억은 떨어집니다.', () => gist()),
          modeTile('🔎', 'Scan · 정보 찾기', '특정 사실 하나를 시간 압박 속에 찾아냅니다.', () => scan()),
          modeTile('📚', 'Mastery · 정독', '천천히 읽고 전체 이해 + 떠올리기까지.', () => mastery()))));

    function modeTile(ico, name, goal, on) {
      return h('button', { class: 'tile', onClick: on },
        h('div', { class: 'tile__top' }, h('span', { class: 'tile__ico' }, ico), h('span', { class: 'tile__name' }, name)),
        h('span', { class: 'tile__goal' }, goal));
    }

    const pick = () => content.pickPassage(lang, tier, []);

    // ---- Gist: soft time cap, single main-idea question ----
    const gist = () => {
      const p = pick(); if (!p) return menu();
      const units = p.unit_count || countUnits(p.text, lang);
      const cap = Math.max(8, Math.round(units / (lang === 'zh' ? 360 : 320) * 60)); // seconds at skim pace
      let left = cap;
      const timerEl = h('span', { class: 'hud__timer' }, left + 's');
      const iv = setInterval(() => { left--; timerEl.textContent = left + 's'; if (left <= 0) { clearInterval(iv); toQ(); } }, 1000);
      const toQ = () => {
        clearInterval(iv);
        const host = h('div');
        mount(root, drillHeader('Gist · 핵심 1문제', exit, null), host);
        askMCQ(host, p.gist).then(r => {
          store.addErr(lang, { tier, units, wpm: Math.round(units / (cap / 60)), comp: r.correct ? 1 : 0, err: 0, mode: 'gist' });
          store.logSession({ drill: 'modes-gist', lang, correct: r.correct });
          mount(root, drillHeader(this.name, exit, null),
            resultCard([[r.correct ? '✓' : '✕', '핵심 파악', r.correct ? '요지 정확' : '요지 빗나감']], gist, exit,
              h('p', { class: 'small muted' }, 'Gist 정확도는 정독 이해도와 ', h('b', null, '따로'), ' 기록됩니다. 훑기로 세부를 안다고 착각하지 마세요.')));
        });
      };
      mount(root, drillHeader('Gist · 요지 훑기', () => { clearInterval(iv); exit(); }, this.why),
        h('div', { class: 'hud' }, h('span', { class: 'chip' }, `훑기 모드 · 세부 기억 ↓`), timerEl),
        h('div', { class: 'note note--warn' }, '핵심만 잡으세요. 시간이 끝나면 요지 1문제가 나옵니다.'),
        h('div', { class: 'card', style: { marginTop: '10px' } }, h('div', { class: 'reader', 'data-lang': lang }, h('div', { class: 'reader-wrap' }, p.text))),
        h('div', { class: 'btnrow', style: { marginTop: '12px' } }, h('button', { class: 'btn btn--primary' , onClick: toQ }, '다 훑음 → 핵심 문제')));
    };

    // ---- Scan: find a fact under time pressure ----
    const scan = () => {
      const p = pick(); if (!p || !p.scan) return menu();
      const timerEl = h('span', { class: 'hud__timer' }, '0:00');
      const t = startTimer(ms => timerEl.textContent = fmtClock(ms));
      const input = h('input', { type: 'text', placeholder: '찾은 답을 입력' });
      const fb = h('div');
      const check = () => {
        const ms = t.stop();
        const a = norm(input.value), b = norm(p.scan.answer);
        const ok = a.length > 0 && (a.includes(b) || b.includes(a));
        store.logSession({ drill: 'modes-scan', lang, correct: ok, ms });
        mount(root, drillHeader(this.name, exit, null),
          resultCard([[ok ? '✓' : '✕', '정보 찾기', `${(ms / 1000).toFixed(1)}초`]], scan, exit,
            h('div', { class: 'note ' + (ok ? 'note--good' : 'note--warn') }, ok ? '정확히 찾았습니다.' : '정답: ' + p.scan.answer)));
      };
      mount(root, drillHeader('Scan · 정보 찾기', () => { t.stop(); exit(); }, this.why),
        h('div', { class: 'hud' }, h('span', { class: 'chip' }, '아래 질문의 답을 본문에서 찾으세요'), timerEl),
        h('div', { class: 'note' }, h('b', null, p.scan.q)),
        h('div', { class: 'card', style: { marginTop: '10px', maxHeight: '46vh', overflow: 'auto' } },
          h('div', { class: 'reader', 'data-lang': lang, style: { fontSize: lang === 'zh' ? '1.25rem' : '1.08rem', lineHeight: '1.7' } }, h('div', { class: 'reader-wrap' }, p.text))),
        h('div', { style: { marginTop: '12px' } }, input, fb,
          h('button', { class: 'btn btn--primary', style: { marginTop: '10px' }, onClick: check }, '확인')));
    };

    // ---- Mastery: full read + full comprehension + retrieval ----
    const mastery = () => {
      const p = pick(); if (!p) return menu();
      const units = p.unit_count || countUnits(p.text, lang);
      const t = startTimer();
      const done = () => {
        const ms = t.stop(); const wpm = units / (ms / 60000);
        const host = h('div');
        mount(root, drillHeader('Mastery · 이해 확인', exit, null), host);
        compQuiz(host, (p.questions || []).slice()).then(res => {
          const err = res.frac < 0.6 ? 0 : Math.round(wpm * res.frac);
          store.addErr(lang, { tier, units, wpm: Math.round(wpm), comp: res.frac, err, mode: 'full' });
          store.logSession({ drill: 'modes-mastery', lang, err, comp: res.frac });
          mount(root, drillHeader(this.name, exit, null),
            resultCard([[err + '', 'ERR'], [Math.round(res.frac * 100) + '%', '정독 이해도']], mastery, exit,
              h('p', { class: 'small muted' }, '정독 이해도는 Gist 정확도와 분리해 기록됩니다. 둘의 격차가 곧 전략 선택의 근거입니다.')));
        });
      };
      mount(root, drillHeader('Mastery · 정독', () => { t.stop(); exit(); }, this.why),
        h('div', { class: 'note note--good' }, '천천히, 정확히. 되돌아 읽어도 됩니다. 끝나면 전체 이해 문제가 나옵니다.'),
        h('div', { class: 'card', style: { marginTop: '10px' } }, h('div', { class: 'eyebrow' }, p.title || '지문'),
          h('div', { class: 'reader', 'data-lang': lang }, h('div', { class: 'reader-wrap' }, p.text))),
        h('div', { class: 'btnrow', style: { marginTop: '12px' } }, h('button', { class: 'btn btn--primary btn--lg', onClick: done }, '다 읽음 → 이해 확인')));
    };

    menu();
  },
};
