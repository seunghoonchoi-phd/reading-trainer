// ===== drills/repeated.js — repeated reading with transfer check =====
import { h, mount, startTimer, fmtClock, countUnits, sparkline } from '../util.js';
import * as content from '../content.js';
import * as store from '../store.js';
import { drillHeader, compQuiz, resultCard, tierPicker, tierLabel } from './shared.js';

const REPS = 3;

export default {
  id: 'repeated', name: '반복읽기 전이', icon: '🔁', track: '속도',
  goal: '자동성을 키우되, 진짜 향상은 “새 관련 지문”에서만 인정합니다.',
  langs: ['en', 'zh'],
  why: '같은 지문을 반복하면 빨라지지만 그건 암기일 수 있습니다. 그래서 3회 반복 뒤 어휘·주제가 겹치는 새 지문을 읽혀, 일반화된(전이된) 향상만 점수로 인정합니다.',
  evidence: '반복읽기는 전이된다 — 단, 속도+이해 이중 단서가 속도만 단서보다 낫고 전이는 관련 지문에 한함(Therrien 2004; LaBerge & Samuels 1974).',

  render(root, lang, exit) {
    const tiers = content.tiersFor(lang);
    let tier = tiers.includes(2) ? 2 : tiers[Math.floor(tiers.length / 2)] || tiers[0];

    const setup = () => mount(root, drillHeader(this.name, exit, this.why),
      h('div', { class: 'card fade-in' },
        h('h2', { class: 'h2' }, '반복읽기 전이'),
        h('p', { class: 'muted' }, `같은 지문을 ${REPS}번 읽어 속도 곡선을 만든 뒤, 비슷한 새 지문으로 전이를 확인합니다.`),
        tierPicker(tiers, tier, t => { tier = t; setup(); }, lang),
        h('div', { class: 'btnrow', style: { marginTop: '14px' } },
          h('button', { class: 'btn btn--primary btn--lg', onClick: () => start() }, '시작'))));

    const start = () => {
      const p = content.pickPassage(lang, tier);
      if (!p) { mount(root, drillHeader(this.name, exit), h('div', { class: 'empty' }, '지문이 없습니다.')); return; }
      const units = p.unit_count || countUnits(p.text, lang);
      const wpms = [];
      const repView = (rep) => {
        const timerEl = h('span', { class: 'hud__timer' }, '0:00');
        const t = startTimer(ms => timerEl.textContent = fmtClock(ms));
        const done = () => {
          const ms = t.stop(); const wpm = units / (ms / 60000); wpms.push(Math.round(wpm));
          if (rep + 1 < REPS) repView(rep + 1); else afterReps();
        };
        mount(root, drillHeader(`반복읽기 ${rep + 1}/${REPS}`, () => { t.stop(); exit(); }, this.why),
          h('div', { class: 'hud' }, h('span', { class: 'chip' }, `${tierLabel(tier, lang)} · ${rep + 1}회차`), timerEl),
          h('div', { class: 'card' }, h('div', { class: 'eyebrow' }, p.title || '지문'),
            h('div', { class: 'reader', 'data-lang': lang }, h('div', { class: 'reader-wrap' }, p.text))),
          h('div', { class: 'btnrow', style: { marginTop: '12px' } },
            h('button', { class: 'btn btn--primary btn--lg', onClick: done }, rep + 1 < REPS ? '다 읽음 → 다음 회차' : '다 읽음 → 전이 검사')));
      };
      const afterReps = () => {
        const speedup = wpms.length > 1 ? Math.round((wpms[wpms.length - 1] / wpms[0] - 1) * 100) : 0;
        mount(root, drillHeader('반복 결과', exit, null),
          h('div', { class: 'card fade-in center' },
            h('p', { class: 'eyebrow' }, '같은 지문 속도 곡선'),
            sparkline(wpms, 300, 70),
            h('p', { class: 'muted small' }, wpms.join(' → ') + ` ${lang === 'zh' ? '자/분' : 'WPM'}  ·  ${speedup >= 0 ? '+' : ''}${speedup}%`),
            h('div', { class: 'note note--warn', style: { textAlign: 'left' } }, '여기까지는 “암기”일 수 있습니다. 이제 비슷한 ', h('b', null, '새 지문'), '으로 진짜 전이를 확인합니다.'),
            h('button', { class: 'btn btn--primary btn--lg', style: { marginTop: '12px' }, onClick: transfer }, '전이 지문 읽기')));
      };
      const transfer = () => {
        const tp = content.relatedPassage(p, []);
        if (!tp) { exit(); return; }
        const tunits = tp.unit_count || countUnits(tp.text, lang);
        const timerEl = h('span', { class: 'hud__timer' }, '0:00');
        const t = startTimer(ms => timerEl.textContent = fmtClock(ms));
        const done = () => {
          const ms = t.stop(); const wpm = tunits / (ms / 60000);
          const host = h('div');
          mount(root, drillHeader('전이 · 이해 확인', exit, null), host);
          compQuiz(host, (tp.questions || []).slice()).then(res => finish(wpm, res.frac, tp));
        };
        mount(root, drillHeader('전이 지문 (새 글)', () => { t.stop(); exit(); }, this.why),
          h('div', { class: 'hud' }, h('span', { class: 'chip' }, '새 관련 지문'), timerEl),
          h('div', { class: 'card' }, h('div', { class: 'eyebrow' }, tp.title || '지문'),
            h('div', { class: 'reader', 'data-lang': lang }, h('div', { class: 'reader-wrap' }, tp.text))),
          h('div', { class: 'btnrow', style: { marginTop: '12px' } },
            h('button', { class: 'btn btn--primary btn--lg', onClick: done }, '다 읽음 → 이해 확인')));
      };
      const finish = (wpm, comp, tp) => {
        const err = comp < 0.6 ? 0 : Math.round(wpm * comp);
        store.addErr(lang, { tier, units: tp.unit_count, wpm: Math.round(wpm), comp, err, mode: 'transfer' });
        store.logSession({ drill: 'repeated', lang, tier, err, transfer: true });
        mount(root, drillHeader(this.name, exit, null),
          resultCard([
            [err + '', '전이 ERR', '이것만 진짜 향상'],
            [Math.round(wpm) + '', lang === 'zh' ? '자/분' : 'WPM'],
            [Math.round(comp * 100) + '%', '이해도'],
          ], setup, exit,
            h('p', { class: 'small muted' }, '전이 ERR이 주 단위로 오르면 자동성이 일반화되고 있는 것입니다.')));
      };
      store.logSession({ drill: 'repeated-start', lang, tier });
      repView(0);
    };

    setup();
  },
};
