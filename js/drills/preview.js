// ===== drills/preview.js — paragraph-opening preview practice =====
import { h, mount } from '../util.js';
import * as content from '../content.js?v=20260713-34';
import { splitParagraphs, splitSentences } from '../content.js?v=20260713-34';
import { t } from '../i18n.js';
import {
  drillHeader, trainingRationale, askMCQ, resultCard, tierPicker, preferredTier,
  markPassageStarted, recordAttempt, attemptErrorNote, attemptContext, currentDifficulty,
  pickPracticePassage,
} from './shared.js';

export default {
  id: 'preview',
  nameKey: 'drill.preview.name',
  goalKey: 'drill.preview.goal',
  whyKey: 'drill.preview.why',
  evidenceKey: 'drill.preview.evidence',
  category: 'practice', categoryKey: 'drill.category.practice',
  name: '문단 미리보기', icon: '⟶', track: '연습',
  goal: '문단의 첫 문장을 보고 글의 방향을 예측한 뒤 전체 글과 비교합니다.',
  langs: ['en', 'zh'],
  why: '문단 구조를 활용하는 연습이며 시야가 넓어진다고 주장하지 않습니다.',
  evidence: '문단 앞부분을 활용한 예측은 선택적으로 읽을 곳을 정하는 데 도움을 줄 수 있습니다.',

  render(root, lang, exit, options = {}) {
    const name = t(this.nameKey);
    const why = trainingRationale(this.id, t(this.whyKey));
    const context = attemptContext(options);
    const difficulty = currentDifficulty(lang);
    let tier = preferredTier(lang);

    const setup = () => mount(root, drillHeader(name, exit, why),
      h('div', { class: 'card fade-in' },
        h('h2', { class: 'h2' }, t('drill.preview.title')),
        h('p', { class: 'muted' }, t('drill.preview.instructions')),
        h('div', { class: 'note note--warn' }, t('drill.preview.scope_note')),
        tierPicker(lang, tier, next => { tier = next; setup(); }),
        h('div', { class: 'btnrow', style: { marginTop: '14px' } },
          h('button', { class: 'btn btn--primary btn--lg', onClick: forage }, t('drill.preview.start')))));

    const forage = () => {
      const p = pickPracticePassage(lang, { tier });
      if (!p) return setup();
      const novelAtStart = markPassageStarted(p);
      const leads = splitParagraphs(p.text).map(paragraph => splitSentences(paragraph, lang)[0] || paragraph);
      mount(root, drillHeader(t('drill.preview.leads_title'), exit, why),
        h('div', { class: 'hud' }, h('span', { class: 'chip' }, t('drill.preview.leads_only'))),
        h('div', { class: 'card' },
          h('div', { class: 'reader', lang: lang === 'zh' ? 'zh-Hans' : 'en', 'data-lang': lang },
            h('div', { class: 'reader-wrap' }, ...leads.map(sentence => h('p', null, sentence,
              h('span', { class: 'span-blur', style: { userSelect: 'none' } }, t(lang === 'zh' ? 'drill.preview.hidden_zh' : 'drill.preview.hidden_en'))))))),
        h('div', { class: 'btnrow', style: { marginTop: '12px' } },
          h('button', { class: 'btn btn--primary', onClick: () => predict(p, novelAtStart) }, t('drill.preview.predict'))));
    };

    const predict = (p, novelAtStart) => {
      const host = h('div');
      mount(root, drillHeader(t('drill.preview.predict_title'), exit, null),
        h('div', { class: 'note' }, t('drill.preview.predict_note')), host);
      askMCQ(host, p.gist).then(answer => reveal(p, novelAtStart, answer.correct));
    };

    const reveal = (p, novelAtStart, correct) => {
      const saved = recordAttempt({
        drill: 'preview', submode: 'paragraph_preview', benchmark: false,
        lang, tier: p.tier || tier, difficulty,
        passageId: p.id, sourcePassageId: p.id, transferPassageId: null,
        novelAtStart, assisted: true, completed: true,
        units: null, elapsedMs: null, rate: null, timingValid: true,
        correct: correct ? 1 : 0, total: 1, comprehension: null,
        questionTypes: { main_idea: { correct: correct ? 1 : 0, total: 1 } },
        fatigue: null,
        ...context,
      });
      mount(root, drillHeader(t('drill.preview.reveal_title'), exit, null),
        h('div', { class: 'card' },
          h('div', { class: 'note ' + (correct ? 'note--good' : 'note--warn') }, t(correct ? 'drill.preview.correct_feedback' : 'drill.preview.incorrect_feedback')),
          h('div', { class: 'reader', lang: lang === 'zh' ? 'zh-Hans' : 'en', 'data-lang': lang, style: { marginTop: '12px' } }, h('div', { class: 'reader-wrap' }, p.text))),
        resultCard([[correct ? '✓' : '✕', t('drill.preview.result_label')]], () => this.render(root, lang, exit, options), exit,
          h('div', { class: 'stack' }, h('p', { class: 'small muted' }, t('drill.preview.result_note')), attemptErrorNote(saved))));
    };

    setup();
  },
};
