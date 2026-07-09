// ===== drills/triage.js — optional three-pass paper-reading tool =====
import { h, mount, fmtClock } from '../util.js';
import * as content from '../content.js';
import { splitParagraphs, splitSentences } from '../content.js';
import { t } from '../i18n.js';
import {
  drillHeader, resultCard, createDrillTimer, drillTimerElement,
  preferredTier, normalizeDrillOptions, markPassageStarted,
  recordAttempt, attemptErrorNote, attemptContext, currentDifficulty,
  pickPracticePassage, recentPracticePassageIds,
} from './shared.js';

const FIVE_C = ['category', 'context', 'correctness', 'contributions', 'clarity'];

export function hasMeaningfulText(value, minimum = 10) {
  return typeof value === 'string' && value.trim().replace(/\s+/g, ' ').length >= minimum;
}

export default {
  id: 'triage',
  nameKey: 'drill.triage.name',
  goalKey: 'drill.triage.goal',
  whyKey: 'drill.triage.why',
  evidenceKey: 'drill.triage.evidence',
  category: 'tool', categoryKey: 'drill.category.tool',
  name: '논문 3패스 도구', icon: '📄', track: '실전 도구',
  goal: '논문에 쓸 읽기 깊이를 1패스, 2패스, 3패스로 나눕니다.',
  langs: ['en', 'zh'],
  why: '이 도구는 시간을 어디에 쓸지 돕지만, 속독 숙련을 판정하는 관문은 아닙니다.',
  evidence: '세 번 읽기 방식은 논문 읽기 실무에서 제안된 휴리스틱입니다.',

  render(root, lang, exit, options = {}) {
    const normalizedOptions = normalizeDrillOptions(options);
    const customText = normalizedOptions.customText;
    const context = attemptContext(normalizedOptions);
    const name = t(this.nameKey);
    const why = t(this.whyKey);
    const source = customText || pickPracticePassage(lang, {
      tier: preferredTier(lang, { hardest: true }),
      preferredIds: recentPracticePassageIds(lang),
    });
    if (!source) {
      mount(root, drillHeader(name, exit), h('div', { class: 'empty' }, t('drill.triage.no_source')));
      return;
    }
    const language = source.lang || lang;
    const difficulty = currentDifficulty(language);
    const paragraphs = splitParagraphs(source.text);
    const novelAtStart = source.id ? markPassageStarted(source) : false;
    let pass1Notes = 0;
    let pass2Summary = '';
    let pass3Critique = '';

    const finish = depth => {
      const saved = recordAttempt({
        drill: 'triage', submode: 'paper_tool', benchmark: false,
        lang: language, tier: source.tier || difficulty, difficulty,
        passageId: source.id || null, sourcePassageId: source.id || null, transferPassageId: null,
        novelAtStart, assisted: true, completed: true,
        units: null, elapsedMs: null, rate: null, timingValid: true,
        correct: null, total: null, comprehension: null, questionTypes: {}, fatigue: null,
        depth, pass1Notes,
        // 사용자 메모 본문은 attempt에 복사하지 않는다.
        hasPass2Summary: hasMeaningfulText(pass2Summary),
        hasPass3Critique: hasMeaningfulText(pass3Critique, 20),
        ...context,
      });
      mount(root, drillHeader(name, exit, null), resultCard([
        ['✓', t('drill.triage.completed'), t('drill.triage.depth_result', { depth })],
      ], pass1, exit, h('div', { class: 'stack' },
        h('p', { class: 'small muted' }, t('drill.triage.result_note')),
        attemptErrorNote(saved))));
    };

    const pass1 = () => {
      const seconds = Math.min(300, Math.max(40, Math.round((source.unit_count || 300) / 4)));
      const timerEl = drillTimerElement(fmtClock(seconds * 1000));
      let paused = false;
      const timer = createDrillTimer(ms => { timerEl.textContent = fmtClock(Math.max(0, seconds * 1000 - ms)); });
      const leads = paragraphs.map(paragraph => splitSentences(paragraph, language)[0] || paragraph).filter(Boolean);
      const fields = FIVE_C.map(key => {
        const input = h('textarea', { rows: 1, style: { minHeight: '42px' }, dataset: { c: key } });
        input.addEventListener('input', updateButtons);
        return { key, input, node: h('label', { class: 'field', style: { display: 'block', marginBottom: '8px' } },
          t(`drill.triage.${key}_label`), h('span', { class: 'small muted' }, ` ${t(`drill.triage.${key}_hint`)}`), input) };
      });
      const deepButton = h('button', { class: 'btn btn--primary', disabled: true, onClick: () => decide(true) }, t('drill.triage.go_pass2'));
      const stopButton = h('button', { class: 'btn', disabled: true, onClick: () => decide(false) }, t('drill.triage.stop_after_pass1'));
      const pauseButton = h('button', { class: 'btn btn--ghost', onClick: () => {
        if (paused) { paused = false; timer.resume(); pauseButton.textContent = t('drill.shared.pause'); }
        else { paused = true; timer.pause(); pauseButton.textContent = t('drill.shared.resume'); }
      } }, t('drill.shared.pause'));
      function updateButtons() {
        pass1Notes = fields.filter(field => hasMeaningfulText(field.input.value, 3)).length;
        const ready = pass1Notes >= 3;
        deepButton.disabled = !ready;
        stopButton.disabled = !ready;
      }
      function decide(deep) {
        timer.stop();
        if (deep) pass2(); else finish(1);
      }
      mount(root, drillHeader(t('drill.triage.pass1_title'), () => { timer.stop(); exit(); }, why),
        h('div', { class: 'hud' }, h('span', { class: 'chip' }, t('drill.triage.structure_only')), timerEl),
        h('div', { class: 'card' }, h('div', { class: 'eyebrow' }, source.title || t('drill.shared.passage')),
          h('div', { class: 'reader', lang: language === 'zh' ? 'zh-Hans' : 'en', 'data-lang': language },
            h('div', { class: 'reader-wrap' }, ...leads.map(sentence => h('p', { style: { margin: '0 0 .5em' } }, `• ${sentence}`))))),
        h('div', { class: 'card', style: { marginTop: '12px' } }, h('div', { class: 'eyebrow' }, t('drill.triage.five_c_notes')), ...fields.map(field => field.node)),
        h('div', { class: 'btnrow' }, deepButton, stopButton, pauseButton));
    };

    const pass2 = () => {
      const input = h('textarea', { rows: 2, placeholder: t('drill.triage.pass2_placeholder') });
      const pass3Button = h('button', { class: 'btn btn--primary', disabled: true, onClick: pass3 }, t('drill.triage.go_pass3'));
      const finishButton = h('button', { class: 'btn', disabled: true, onClick: () => finish(2) }, t('drill.triage.stop_after_pass2'));
      input.addEventListener('input', () => {
        pass2Summary = input.value;
        const ready = hasMeaningfulText(pass2Summary);
        pass3Button.disabled = !ready;
        finishButton.disabled = !ready;
      });
      mount(root, drillHeader(t('drill.triage.pass2_title'), exit, why),
        h('div', { class: 'note' }, t('drill.triage.pass2_note')),
        h('div', { class: 'card', style: { marginTop: '10px', maxHeight: '46vh', overflow: 'auto' } },
          h('div', { class: 'reader', lang: language === 'zh' ? 'zh-Hans' : 'en', 'data-lang': language }, h('div', { class: 'reader-wrap' }, source.text))),
        h('div', { style: { marginTop: '12px' } }, h('label', { class: 'field' }, t('drill.triage.contribution_sentence'), input),
          h('div', { class: 'btnrow', style: { marginTop: '10px' } }, pass3Button, finishButton)));
    };

    const pass3 = () => {
      const input = h('textarea', { rows: 4, placeholder: t('drill.triage.pass3_placeholder') });
      const doneButton = h('button', { class: 'btn btn--primary', style: { marginTop: '10px' }, disabled: true, onClick: () => finish(3) }, t('drill.shared.finish'));
      input.addEventListener('input', () => {
        pass3Critique = input.value;
        doneButton.disabled = !hasMeaningfulText(pass3Critique, 20);
      });
      mount(root, drillHeader(t('drill.triage.pass3_title'), exit, why),
        h('div', { class: 'note' }, t('drill.triage.pass3_note')),
        h('div', { style: { marginTop: '10px' } }, h('label', { class: 'field' }, t('drill.triage.reconstruct_and_critique'), input), doneButton));
    };

    pass1();
  },
};
