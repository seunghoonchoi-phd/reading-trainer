// ===== drills/conquer.js — comprehension-first repeated practice plus unseen transfer =====
import { h, mount, countUnits, fmtClock, sparkline } from '../util.js';
import * as content from '../content.js';
import * as store from '../store.js';
import { t } from '../i18n.js';
import {
  drillHeader, askMCQ, compQuiz, resultCard, tierPicker, tierLabel,
  createDrillTimer, markPassageStarted, pickRelatedPracticePassage,
  askFatigue, recordAttempt, attemptErrorNote, timingValidity,
  questionTypeBreakdown,
  preferredTier, drillTimerElement, normalizeDrillOptions, attemptContext, currentDifficulty,
  pickPracticePassage,
} from './shared.js';

export const CONQUER_PASSES = 3;

export function tokenizeStudyUnits(text, lang, zhTerms = []) {
  if (lang !== 'zh') {
    return text.split(/([A-Za-z]+(?:['’][A-Za-z]+)?)/).map(part =>
      /[A-Za-z]/.test(part) ? { text: part, key: part.toLowerCase(), kind: 'word' } : { text: part, key: null, kind: 'separator' });
  }
  const terms = [...new Set(zhTerms.filter(Boolean))].sort((a, b) => Array.from(b).length - Array.from(a).length);
  const chars = Array.from(text);
  const out = [];
  for (let i = 0; i < chars.length;) {
    const rest = chars.slice(i).join('');
    const term = terms.find(candidate => rest.startsWith(candidate));
    if (term) {
      out.push({ text: term, key: term, kind: 'vocab_item' });
      i += Array.from(term).length;
    } else {
      const char = chars[i++];
      out.push({ text: char, key: /[㐀-鿿]/.test(char) ? char : null, kind: /[㐀-鿿]/.test(char) ? 'character' : 'separator' });
    }
  }
  return out;
}

function glossMap(lang) {
  const data = content.data();
  const map = new Map();
  if (lang === 'en') data.vocabEn.words.forEach(item => map.set(item.word.toLowerCase(), item.gloss_ko));
  else data.vocabZh.items.forEach(item => map.set(item.hanzi, item.gloss_ko));
  return map;
}

function unitLabel(lang) { return t(lang === 'zh' ? 'drill.shared.cpm' : 'drill.shared.wpm'); }

export default {
  id: 'conquer',
  nameKey: 'drill.conquer.name',
  goalKey: 'drill.conquer.goal',
  whyKey: 'drill.conquer.why',
  evidenceKey: 'drill.conquer.evidence',
  category: 'practice', categoryKey: 'drill.category.practice',
  name: '정복 연습', icon: '⛰️', track: '연습',
  goal: '어려운 글의 낯선 표현을 확인하고, 반복 뒤 처음 보는 글에서 이해를 점검합니다.',
  langs: ['en', 'zh'],
  why: '어휘 확인은 연습을 돕지만 자기보고 비율은 숙련 판정이 아닙니다. 성과는 새 글의 속도와 이해도로 따로 확인합니다.',
  evidence: '반복읽기의 같은 글 효과와 새 글 전이는 구분해 해석해야 합니다.',

  render(root, lang, exit, options = {}) {
    const name = t(this.nameKey);
    const why = t(this.whyKey);
    const normalizedOptions = normalizeDrillOptions(options);
    const preset = normalizedOptions.customText;
    const context = attemptContext(normalizedOptions);
    let tier = preferredTier(lang, { hardest: true });

    const setup = () => {
      if (preset) return begin(preset, true);
      mount(root, drillHeader(name, exit, why),
        h('div', { class: 'card fade-in' },
          h('h2', { class: 'h2' }, t('drill.conquer.title')),
          h('p', { class: 'muted' }, t('drill.conquer.instructions')),
          h('div', { class: 'note small' }, t('drill.conquer.no_gate_note')),
          tierPicker(lang, tier, next => { tier = next; setup(); }),
          h('div', { class: 'btnrow', style: { marginTop: '14px' } },
            h('button', { class: 'btn btn--primary btn--lg', onClick: () => {
              const p = pickPracticePassage(lang, { tier });
              if (p) begin(p, false);
            } }, t('drill.conquer.start')))));
    };

    const begin = (p, isPreset) => {
      const novelAtStart = p.id ? markPassageStarted(p) : false;
      phase1(p, isPreset, p.lang || lang, novelAtStart);
    };

    const phase1 = (p, isPreset, language, novelAtStart) => {
      const gloss = glossMap(language);
      const zhTerms = language === 'zh' ? content.data().vocabZh.items.map(item => item.hanzi) : [];
      const tokens = tokenizeStudyUnits(p.text, language, zhTerms);
      const unknown = new Set();
      const tokenSpans = [];
      const countEl = h('span', { class: 'stat__num' }, '0');
      const glossPanel = h('div', { class: 'stack', style: { marginTop: '10px' } });
      const refresh = () => {
        countEl.textContent = String(unknown.size);
        tokenSpans.forEach(({ el, key }) => {
          if (!key) return;
          const selected = unknown.has(key);
          el.classList.toggle('unk', selected);
          el.setAttribute('aria-pressed', selected ? 'true' : 'false');
        });
        const list = [...unknown];
        mount(glossPanel, list.length
          ? h('div', { class: 'note small' }, h('b', null, t('drill.conquer.unknown_count', { count: list.length })),
            ...list.slice(0, 40).map(key => h('span', { class: 'chip', style: { margin: '2px' } },
              gloss.get(key) ? t('drill.conquer.gloss_item', { item: key, gloss: gloss.get(key) }) : t('drill.conquer.lookup_item', { item: key }))))
          : h('div', { class: 'note small muted' }, t('drill.conquer.tap_unknown')));
      };
      const wrap = h('div', { class: 'reader-wrap' });
      tokens.forEach(token => {
        if (!token.key) { wrap.append(document.createTextNode(token.text)); return; }
        const el = h('button', {
          type: 'button', class: 'tok',
          style: { background: 'transparent', border: '0', padding: '1px', color: 'inherit', lineHeight: 'inherit' },
          'aria-pressed': 'false',
          onClick: () => {
            if (unknown.has(token.key)) unknown.delete(token.key); else unknown.add(token.key);
            refresh();
          },
        }, token.text);
        tokenSpans.push({ el, key: token.key });
        wrap.append(el);
      });
      const proceed = () => {
        unknown.forEach(key => store.srReview(`conquer-vocab-${language}`, key, 0));
        const host = h('div');
        const item = isPreset ? content.autoCloze(p.text, language, 1)[0] : p.gist;
        if (!item) return phase2(p, isPreset, language, novelAtStart, null);
        mount(root, drillHeader(t('drill.conquer.initial_check'), exit, null), host);
        askMCQ(host, item).then(answer => showCheck(p, isPreset, language, novelAtStart, answer.correct));
      };
      mount(root, drillHeader(t('drill.conquer.phase1_title'), exit, why),
        h('div', { class: 'hud' },
          h('span', { class: 'chip' }, t('drill.conquer.mark_unknown')),
          h('div', { class: 'stat', style: { alignItems: 'flex-end' } }, countEl, h('span', { class: 'stat__lbl' }, t('drill.conquer.study_items')))),
        h('div', { class: 'note small' }, t(language === 'zh' ? 'drill.conquer.zh_unit_note' : 'drill.conquer.en_unit_note')),
        h('div', { class: 'card', style: { marginTop: '8px' } }, h('div', { class: 'eyebrow' }, p.title || t('drill.shared.passage')),
          h('div', { class: 'reader', lang: language === 'zh' ? 'zh-Hans' : 'en', 'data-lang': language }, wrap)),
        glossPanel,
        h('div', { class: 'btnrow', style: { marginTop: '12px' } },
          h('button', { class: 'btn btn--primary btn--lg', onClick: proceed }, t('drill.conquer.finish_phase1'))));
      refresh();
    };

    const showCheck = (p, isPreset, language, novelAtStart, correct) => {
      mount(root, drillHeader(name, exit, null),
        h('div', { class: 'card fade-in' },
          h('div', { class: 'note ' + (correct ? 'note--good' : 'note--warn') },
            t(correct ? 'drill.conquer.check_passed' : 'drill.conquer.check_missed')),
          h('p', { class: 'small muted' }, t('drill.conquer.check_not_gate')),
          h('div', { class: 'btnrow', style: { marginTop: '12px' } },
            h('button', { class: 'btn btn--primary btn--lg', onClick: () => phase2(p, isPreset, language, novelAtStart, correct) }, t('drill.conquer.start_repeats')),
            h('button', { class: 'btn btn--ghost', onClick: () => phase1(p, isPreset, language, novelAtStart) }, t('drill.conquer.review_again')))));
    };

    const phase2 = (p, isPreset, language, novelAtStart, initialCorrect) => {
      const units = p.unit_count || countUnits(p.text, language);
      const questionPool = isPreset ? content.autoCloze(p.text, language, CONQUER_PASSES) : (p.questions || []).slice();
      const passes = [];
      const runPass = index => {
        const timerEl = drillTimerElement();
        const timer = createDrillTimer(ms => { timerEl.textContent = fmtClock(ms); });
        let paused = false;
        const reader = h('div', { class: 'reader', lang: language === 'zh' ? 'zh-Hans' : 'en', 'data-lang': language },
          h('div', { class: 'reader-wrap' }, p.text));
        const pauseButton = h('button', { class: 'btn btn--ghost', onClick: () => {
          if (paused) { paused = false; timer.resume(); reader.style.visibility = ''; pauseButton.textContent = t('drill.shared.pause'); }
          else { paused = true; timer.pause(); reader.style.visibility = 'hidden'; pauseButton.textContent = t('drill.shared.resume'); }
        } }, t('drill.shared.pause'));
        const done = () => {
          if (paused) return;
          const elapsedMs = timer.stop();
          const rate = elapsedMs > 0 ? units / (elapsedMs / 60000) : 0;
          const timing = timingValidity(units, elapsedMs, language);
          const item = questionPool[index % Math.max(1, questionPool.length)] || null;
          if (!item) {
            passes.push({ elapsedMs, rate, timingValid: timing.timingValid, answer: null, item: null });
            return index + 1 < CONQUER_PASSES ? runPass(index + 1) : savePasses();
          }
          const host = h('div');
          mount(root, drillHeader(t('drill.conquer.mini_check', { current: index + 1, total: CONQUER_PASSES }), exit, null), host);
          askMCQ(host, item).then(answer => {
            passes.push({ elapsedMs, rate, timingValid: timing.timingValid, answer, item });
            if (index + 1 < CONQUER_PASSES) runPass(index + 1); else savePasses();
          });
        };
        mount(root, drillHeader(t('drill.conquer.repeat_title', { current: index + 1, total: CONQUER_PASSES }), () => { timer.stop(); exit(); }, why),
          h('div', { class: 'hud' }, h('span', { class: 'chip' }, t('drill.conquer.repeat_chip')), timerEl),
          h('div', { class: 'card' }, h('div', { class: 'eyebrow' }, p.title || t('drill.shared.passage')), reader),
          h('div', { class: 'btnrow', style: { marginTop: '12px' } },
            h('button', { class: 'btn btn--primary btn--lg', onClick: done }, t('drill.conquer.finish_repeat')),
            pauseButton));
      };
      const savePasses = () => {
        askFatigue(root, t('drill.conquer.repeat_fatigue'), exit).then(fatigue => {
          const saves = passes.map((pass, index) => {
            const answers = pass.answer ? [pass.answer] : [];
            const items = pass.item ? [pass.item] : [];
            return recordAttempt({
              drill: 'conquer', submode: 'repeat', benchmark: false,
              lang: language, tier: p.tier || currentDifficulty(language), difficulty: currentDifficulty(language),
              passageId: p.id || null, sourcePassageId: p.id || null, transferPassageId: null,
              novelAtStart: index === 0 ? novelAtStart : false,
              assisted: true, completed: true, repetition: index + 1,
              units, elapsedMs: Math.max(1, Math.round(pass.elapsedMs)), rate: Math.max(1, Math.round(pass.rate)), timingValid: pass.timingValid,
              correct: pass.answer ? (pass.answer.correct ? 1 : 0) : null,
              total: pass.answer ? 1 : null,
              comprehension: pass.answer ? (pass.answer.correct ? 1 : 0) : null,
              questionTypes: questionTypeBreakdown(items, answers),
              fatigue,
              initialCheckCorrect: initialCorrect,
              ...context,
            });
          });
          showRepeatResult(saves);
        });
      };
      const showRepeatResult = saves => {
        const rates = passes.map(pass => Math.round(pass.rate));
        mount(root, drillHeader(t('drill.conquer.repeat_result'), exit, null),
          h('div', { class: 'card fade-in center' },
            h('p', { class: 'eyebrow' }, t('drill.conquer.same_text_curve')),
            sparkline(rates, 300, 60),
            h('p', { class: 'muted small' }, `${rates.join(' → ')} ${unitLabel(language)}`),
            h('p', { class: 'small muted' }, t('drill.conquer.mini_results', { marks: passes.map(pass => pass.answer ? (pass.answer.correct ? '○' : '×') : '?').join(' ') })),
            ...saves.map(attemptErrorNote).filter(Boolean),
            isPreset
              ? h('div', { class: 'stack', style: { marginTop: '8px' } },
                h('p', { class: 'small muted' }, t('drill.conquer.custom_no_transfer')),
                h('button', { class: 'btn btn--ghost', onClick: exit }, t('drill.shared.finish')))
              : h('button', { class: 'btn btn--primary btn--lg', style: { marginTop: '10px' }, onClick: transfer }, t('drill.conquer.start_transfer'))));
      };
      const transfer = () => {
        const target = pickRelatedPracticePassage(p, [p.id]);
        if (!target) {
          mount(root, drillHeader(name, exit, null), resultCard([], setup, exit,
            h('div', { class: 'note note--warn' }, t('drill.conquer.no_unseen_transfer'))));
          return;
        }
        const targetNovel = markPassageStarted(target);
        const targetUnits = target.unit_count || countUnits(target.text, language);
        const timerEl = drillTimerElement();
        const timer = createDrillTimer(ms => { timerEl.textContent = fmtClock(ms); });
        let paused = false;
        const reader = h('div', { class: 'reader', lang: language === 'zh' ? 'zh-Hans' : 'en', 'data-lang': language },
          h('div', { class: 'reader-wrap' }, target.text));
        const pauseButton = h('button', { class: 'btn btn--ghost', onClick: () => {
          if (paused) { paused = false; timer.resume(); reader.style.visibility = ''; pauseButton.textContent = t('drill.shared.pause'); }
          else { paused = true; timer.pause(); reader.style.visibility = 'hidden'; pauseButton.textContent = t('drill.shared.resume'); }
        } }, t('drill.shared.pause'));
        const done = () => {
          if (paused) return;
          const elapsedMs = timer.stop();
          const rate = elapsedMs > 0 ? targetUnits / (elapsedMs / 60000) : 0;
          const host = h('div');
          mount(root, drillHeader(t('drill.conquer.transfer_quiz'), exit, null), host);
          compQuiz(host, (target.questions || []).slice()).then(result => saveTransfer(target, targetNovel, targetUnits, elapsedMs, rate, result));
        };
        mount(root, drillHeader(t('drill.conquer.transfer_title'), () => { timer.stop(); exit(); }, why),
          h('div', { class: 'hud' }, h('span', { class: 'chip' }, t('drill.conquer.unseen_transfer')), timerEl),
          h('div', { class: 'card' }, h('div', { class: 'eyebrow' }, target.title || t('drill.shared.passage')), reader),
          h('div', { class: 'btnrow', style: { marginTop: '12px' } },
            h('button', { class: 'btn btn--primary btn--lg', onClick: done }, t('drill.conquer.finish_transfer')),
            pauseButton));
      };
      const saveTransfer = (target, targetNovel, targetUnits, elapsedMs, rate, result) => {
        askFatigue(root, t('drill.conquer.transfer_fatigue'), exit).then(fatigue => {
          const timing = timingValidity(targetUnits, elapsedMs, language);
          const saved = recordAttempt({
            drill: 'conquer', submode: 'transfer_practice', benchmark: false,
            lang: language, tier: target.tier || currentDifficulty(language), difficulty: currentDifficulty(language),
            passageId: target.id, sourcePassageId: p.id, transferPassageId: target.id,
            novelAtStart: targetNovel, assisted: false, completed: true,
            units: targetUnits, elapsedMs: Math.max(1, Math.round(elapsedMs)), rate: Math.max(1, Math.round(rate)), timingValid: timing.timingValid,
            correct: result.correct, total: result.total, comprehension: result.frac,
            questionTypes: result.questionTypes, fatigue,
            ...context,
          });
          mount(root, drillHeader(name, exit, null), resultCard([
            [Math.round(rate) + '', unitLabel(language), t('drill.conquer.transfer_rate')],
            [Math.round(result.frac * 100) + '%', t('drill.shared.comprehension'), `${result.correct}/${result.total}`],
          ], setup, exit, h('div', { class: 'stack' },
            !timing.timingValid ? h('div', { class: 'note note--warn' }, t('drill.shared.timing_invalid', { seconds: Math.ceil(timing.minimumMs / 1000) })) : null,
            h('p', { class: 'small muted' }, t('drill.conquer.transfer_note')),
            attemptErrorNote(saved))));
        });
      };
      runPass(0);
    };

    setup();
  },
};
