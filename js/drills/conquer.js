// ===== drills/conquer.js — "정복(Conquer)" mode: comprehend-first → repeated speed → cold transfer =====
// Honors overload→recovery: overload LOAD (vocab/density/length), never eye-speed past comprehension.
import { h, mount, clear, startTimer, fmtClock, countUnits, sparkline, sample } from '../util.js';
import * as content from '../content.js';
import * as store from '../store.js';
import { drillHeader, askMCQ, compQuiz, resultCard, tierPicker, tierLabel } from './shared.js';

const MAX_PASS = 3;
const COVERAGE_GATE = 0.95;

function glossMap(lang) {
  const d = content.data();
  const m = new Map();
  if (lang === 'en') d.vocabEn.words.forEach(w => m.set(w.word.toLowerCase(), w.gloss_ko));
  else d.vocabZh.items.forEach(w => m.set(w.hanzi, w.gloss_ko));
  return m;
}
function tokenize(text, lang) {
  if (lang === 'zh') return Array.from(text).map(ch => (/[㐀-鿿]/.test(ch) ? { text: ch, key: ch } : { text: ch, key: null }));
  return text.split(/([A-Za-z]+(?:[''][A-Za-z]+)?)/).map(p => (/[A-Za-z]/.test(p) ? { text: p, key: p.toLowerCase() } : { text: p, key: null }));
}

export default {
  id: 'conquer', name: '정복 모드', icon: '⛰️', track: '속도',
  goal: '어려운 글을 1차 독해로 장악 → 반복 속독 → 새 글 전이. 단어를 먼저 해결해야 속도 훈련이 의미 있습니다.',
  langs: ['en', 'zh'],
  why: '승훈님이 제안한 "1차 독해 → 속독" 루프입니다. ①모르는 단어를 해결해 커버리지를 95%+로 올리고(그 전엔 속도 훈련 잠금), ②같은 글을 3회까지 반복해 자동성을 키우고, ③어휘·주제가 겹치는 새 글에서 차갑게 전이를 측정합니다. 과부하는 어휘·밀도·길이에 걸되, 눈 속도를 이해 붕괴까지 강제하지 않습니다(그건 훑기).',
  evidence: '반복읽기 같은지문 ES≈0.83(유창성)/0.67(이해), 전이는 약하고 L2 이해 전이는 종종 null(Therrien 2004). 커버리지 95% 선행(Laufer & Ravenhorst-Kalovski). 수면은 단어 학습(서술기억)을 공고화하지 속도(절차)를 빠르게 하지 않음.',

  // preset = {title,text,lang} optional (from 내 글)
  render(root, lang, exit, preset) {
    const tiers = content.tiersFor(lang);
    let tier = tiers.slice(-1)[0] || tiers[0]; // default hardest

    const setup = () => {
      if (preset) return phase1(preset, true);
      mount(root, drillHeader(this.name, exit, this.why),
        h('div', { class: 'card fade-in' },
          h('h2', { class: 'h2' }, '정복 모드'),
          h('p', { class: 'muted' }, '어려운 글 하나를 끝까지 “정복”합니다: 1차 독해(단어 해결) → 반복 속독 → 새 글 전이.'),
          h('div', { class: 'note small' }, '과부하는 어휘·밀도·길이에 — 눈 속도엔 걸지 않습니다. 이해도는 끝까지 따로 측정합니다.'),
          tierPicker(tiers, tier, t => { tier = t; setup(); }, lang),
          h('div', { class: 'btnrow', style: { marginTop: '14px' } },
            h('button', { class: 'btn btn--primary btn--lg', onClick: () => { const p = content.pickPassage(lang, tier); if (p) phase1(p, false); } }, '시작'))));
    };

    // ---- Phase 1: comprehend-first, mark unknown words, coverage gate ----
    const phase1 = (p, isPreset) => {
      const L = p.lang || lang;
      const gloss = glossMap(L);
      const toks = tokenize(p.text, L);
      const totalUnits = toks.filter(t => t.key).length || 1;
      const unknown = new Set();
      const spans = [];
      const covEl = h('span', { class: 'stat__num' }, '100%');
      const glossPanel = h('div', { class: 'stack', style: { marginTop: '10px' } });

      const refresh = () => {
        let unk = 0;
        toks.forEach((t, i) => { if (t.key && unknown.has(t.key)) unk++; });
        const cov = Math.floor((1 - unk / totalUnits) * 100);
        covEl.textContent = cov + '%';
        covEl.style.color = cov >= COVERAGE_GATE * 100 ? 'var(--good)' : 'var(--warn)';
        spans.forEach(({ el, key }) => { if (key) el.classList.toggle('unk', unknown.has(key)); });
        const list = [...unknown];
        mount(glossPanel, list.length ? h('div', { class: 'note small' },
          h('b', null, `모르는 단어 ${list.length}개  `),
          ...list.slice(0, 40).map(k => h('span', { class: 'chip', style: { margin: '2px' } }, k + (gloss.get(k) ? ` · ${gloss.get(k)}` : ' · (직접 확인)')))) : h('div', { class: 'note small muted' }, '모르는 단어를 탭하세요. 사전에 있으면 뜻이 보이고, 없으면 직접 확인 후 표시합니다.'));
      };

      const reader = h('div', { class: 'reader', 'data-lang': L });
      const wrap = h('div', { class: 'reader-wrap' });
      toks.forEach(t => {
        if (!t.key) { wrap.append(document.createTextNode(t.text)); return; }
        const el = h('span', { class: 'tok', onClick: () => { if (unknown.has(t.key)) unknown.delete(t.key); else unknown.add(t.key); refresh(); } }, t.text);
        spans.push({ el, key: t.key }); wrap.append(el);
      });
      reader.append(wrap);

      const proceed = () => {
        const unk = toks.filter(t => t.key && unknown.has(t.key)).length;
        const cov = 1 - unk / totalUnits;
        // add unknowns to a review queue (lexical model)
        unknown.forEach(k => store.srReview('conquer-vocab-' + L, k, 0));
        check(p, isPreset, cov, L);
      };

      mount(root, drillHeader('1패스 · 1차 독해 (시간 무제한)', exit, this.why),
        h('div', { class: 'hud' }, h('span', { class: 'chip' }, '모르는 단어를 탭해 표시'), h('div', { class: 'stat', style: { alignItems: 'flex-end' } }, covEl, h('span', { class: 'stat__lbl' }, '아는 단어 비율'))),
        h('div', { class: 'card' }, h('div', { class: 'eyebrow' }, p.title || '문헌'), reader),
        glossPanel,
        h('div', { class: 'btnrow', style: { marginTop: '12px' } },
          h('button', { class: 'btn btn--primary btn--lg', onClick: proceed }, '1차 독해 완료 → 이해 점검')));
      refresh();
    };

    // comprehension check + coverage gate
    const check = (p, isPreset, cov, L) => {
      const host = h('div');
      mount(root, drillHeader('이해 점검', exit, null), host);
      const item = isPreset ? (content.autoCloze(p.text, L, 1)[0]) : p.gist;
      const after = (passed) => gate(p, isPreset, cov, L, passed);
      if (!item) return after(true);
      askMCQ(host, item).then(r => after(r.correct));
    };

    const gate = (p, isPreset, cov, L, compPassed) => {
      const ok = cov >= COVERAGE_GATE && compPassed;
      const body = ok
        ? h('div', { class: 'note note--good' }, `커버리지 ${Math.floor(cov * 100)}% · 이해 점검 통과 → 속도 훈련 잠금 해제`)
        : h('div', { class: 'note note--warn' }, cov < COVERAGE_GATE
          ? `커버리지 ${Math.floor(cov * 100)}% (95% 미만). 모르는 단어를 먼저 해결하세요 — 단어를 모른 채 속도만 올리면 “빠른 오독” 훈련이 됩니다. 표시한 단어는 복습 큐에 담았습니다.`
          : `이해 점검을 통과하지 못했습니다. 다시 1차 독해부터 — 이해 못 한 글은 자동화할 수 없습니다.`);
      mount(root, drillHeader(this.name, exit, null),
        h('div', { class: 'card fade-in' }, body,
          h('div', { class: 'btnrow', style: { marginTop: '12px' } },
            ok ? h('button', { class: 'btn btn--primary btn--lg', onClick: () => phase2(p, isPreset, L) }, '반복 속독 시작 (최대 3회)')
              : h('button', { class: 'btn btn--primary', onClick: () => phase1(p, isPreset) }, '1차 독해 다시'),
            !ok ? h('button', { class: 'btn btn--ghost', onClick: () => phase2(p, isPreset, L), title: '권장하지 않음' }, '그래도 진행') : null)));
    };

    // ---- Phase 2: repeated timed passes, dual metrics ----
    const phase2 = (p, isPreset, L) => {
      const units = p.unit_count || countUnits(p.text, L);
      const microPool = isPreset ? content.autoCloze(p.text, L, MAX_PASS) : (p.questions || []).slice();
      const rates = [], comps = [];
      const passView = (n) => {
        const timerEl = h('span', { class: 'hud__timer' }, '0:00');
        const t = startTimer(ms => timerEl.textContent = fmtClock(ms));
        const done = () => {
          const ms = t.stop(); rates.push(Math.round(units / (ms / 60000)));
          const item = microPool[n % Math.max(1, microPool.length)] || microPool[0];
          const host = h('div');
          mount(root, drillHeader(`반복 ${n + 1}/${MAX_PASS} · 이해 미니체크`, exit, null), host);
          if (!item) { comps.push(1); return (n + 1 < MAX_PASS ? passView(n + 1) : afterPasses(p, isPreset, L, rates, comps, units)); }
          askMCQ(host, item).then(r => { comps.push(r.correct ? 1 : 0); (n + 1 < MAX_PASS ? passView(n + 1) : afterPasses(p, isPreset, L, rates, comps, units)); });
        };
        mount(root, drillHeader(`반복 속독 ${n + 1}/${MAX_PASS}`, () => { t.stop(); exit(); }, this.why),
          h('div', { class: 'hud' }, h('span', { class: 'chip' }, '이해하며 — 빠르게가 아니라'), timerEl),
          h('div', { class: 'card' }, h('div', { class: 'eyebrow' }, p.title || '문헌'),
            h('div', { class: 'reader', 'data-lang': L }, h('div', { class: 'reader-wrap' }, p.text))),
          h('div', { class: 'btnrow', style: { marginTop: '12px' } }, h('button', { class: 'btn btn--primary btn--lg', onClick: done }, '다 읽음 → 미니체크')));
      };
      passView(0);
    };

    const afterPasses = (p, isPreset, L, rates, comps, units) => {
      const dip = rates.length > 1 && rates[rates.length - 1] > rates[0] && comps[comps.length - 1] < comps[0];
      mount(root, drillHeader('반복 결과', exit, null),
        h('div', { class: 'card fade-in center' },
          h('p', { class: 'eyebrow' }, '같은 글 · 속도 곡선'),
          sparkline(rates, 300, 60),
          h('p', { class: 'muted small' }, rates.join(' → ') + ` ${L === 'zh' ? '자/분' : 'WPM'}  ·  이해 ${comps.map(c => c ? '○' : '✕').join(' ')}`),
          dip ? h('div', { class: 'note note--warn' }, '속도는 올랐는데 이해가 떨어졌습니다 — 이건 향상이 아니라 경고입니다. 속도를 늦추세요.') : h('div', { class: 'note note--good' }, '같은 글에서의 향상은 견고한 부분입니다. 진짜 시험은 새 글 전이입니다.'),
          isPreset
            ? h('div', { class: 'stack', style: { marginTop: '8px' } }, h('p', { class: 'small muted' }, '붙여넣은 글이라 전이용 새 글이 없습니다. 같은 주제의 다른 단락으로 전이를 측정해보세요.'), h('button', { class: 'btn btn--ghost', onClick: exit }, '마치기'))
            : h('button', { class: 'btn btn--primary btn--lg', style: { marginTop: '10px' }, onClick: () => phase3(p, L) }, '전이 검사 (새 글, 차갑게)')));
    };

    // ---- Phase 3: cold transfer on a related passage, corrective feedback ON, credit only if comprehension holds ----
    const phase3 = (p, L) => {
      const tp = content.relatedPassage(p, []);
      if (!tp) return exit();
      const tunits = tp.unit_count || countUnits(tp.text, L);
      const timerEl = h('span', { class: 'hud__timer' }, '0:00');
      const t = startTimer(ms => timerEl.textContent = fmtClock(ms));
      const done = () => {
        const ms = t.stop(); const wpm = tunits / (ms / 60000);
        const host = h('div');
        mount(root, drillHeader('전이 · 이해 확인 (피드백 ON)', exit, null), host);
        compQuiz(host, (tp.questions || []).slice()).then(res => finish(wpm, res.frac));
      };
      mount(root, drillHeader('전이 지문 (새 글, 같은 주제군)', () => { t.stop(); exit(); }, this.why),
        h('div', { class: 'hud' }, h('span', { class: 'chip' }, '차가운 전이 · 어휘·주제 겹침(근사)'), timerEl),
        h('div', { class: 'note small muted' }, '※ 코퍼스 한계상 “같은 난이도” 지문으로 전이를 근사합니다(이상적 narrow-reading 80% 어휘 재활용은 아님).'),
        h('div', { class: 'card', style: { marginTop: '8px' } }, h('div', { class: 'eyebrow' }, tp.title || '지문'),
          h('div', { class: 'reader', 'data-lang': L }, h('div', { class: 'reader-wrap' }, tp.text))),
        h('div', { class: 'btnrow', style: { marginTop: '12px' } }, h('button', { class: 'btn btn--primary btn--lg', onClick: done }, '다 읽음 → 이해 확인')));
    };

    const finish = (wpm, comp) => {
      const credited = comp >= 0.7;
      const err = comp < 0.6 ? 0 : Math.round(wpm * comp);
      store.addErr(lang, { tier, units: 0, wpm: Math.round(wpm), comp, err, mode: 'transfer' });
      store.logSession({ drill: 'conquer', lang, err, transfer: true, credited });
      mount(root, drillHeader(this.name, exit, null),
        resultCard([
          [err + '', '전이 ERR'],
          [Math.round(comp * 100) + '%', '전이 이해도'],
          [credited ? '정복 ✓' : '미완', '판정'],
        ], setup, exit,
          h('div', { class: credited ? 'note note--good' : 'note note--warn' }, credited
            ? '새 글에서도 이해를 유지했습니다 — 자동성이 일반화됐습니다.'
            : '전이 이해도가 70% 미만 → 아직 “정복”이 아닙니다. 속도 PR만으로는 인정하지 않습니다. (L2 이해 전이는 원래 잘 안 되기도 합니다 — 같은 주제로 더 쌓으세요.)')));
    };

    setup();
  },
};
