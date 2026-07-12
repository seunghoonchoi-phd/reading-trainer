// ===== drills/retrieval.js — self-explanation and delayed retrieval practice =====
import { h, mount } from '../util.js';
import * as content from '../content.js?v=20260713-35';
import * as store from '../store.js';
import { t } from '../i18n.js';
import {
  drillHeader, trainingRationale, compQuiz, resultCard, tierPicker, preferredTier,
  markPassageStarted, recordAttempt, attemptErrorNote, attemptContext, currentDifficulty,
  pickPracticePassage, recentPracticePassageIds,
} from './shared.js';

export function validRetrievalText(value, minimum = 10) {
  return typeof value === 'string' && value.trim().replace(/\s+/g, ' ').length >= minimum;
}

export default {
  id: 'retrieval',
  nameKey: 'drill.retrieval.name',
  goalKey: 'drill.retrieval.goal',
  whyKey: 'drill.retrieval.why',
  evidenceKey: 'drill.retrieval.evidence',
  category: 'practice', categoryKey: 'drill.category.practice',
  name: '자기설명과 인출', icon: '🧠', track: '연습',
  goal: '글을 덮고 떠올린 뒤 자기 말로 설명하고 결과를 원문 핵심과 비교합니다.',
  langs: ['en', 'zh'],
  why: '빈칸을 채우지 않은 채 다음으로 넘어가면 인출 연습이 되지 않으며, 결과를 비교해야 이해 착각을 발견할 수 있습니다.',
  evidence: '인출과 분산 연습은 장기 기억에 도움이 되고 자기설명은 이해 점검에 쓰일 수 있습니다.',

  render(root, lang, exit, options = {}) {
    const name = t(this.nameKey);
    const why = trainingRationale(this.id, t(this.whyKey));
    const context = attemptContext(options);
    const difficulty = currentDifficulty(lang);
    let tier = preferredTier(lang);
    const deck = `retr-${lang}`;

    const setup = () => {
      const due = store.srDueList(deck, content.passagesFor(lang).map(passage => passage.id));
      mount(root, drillHeader(name, exit, why),
        h('div', { class: 'card fade-in' },
          h('h2', { class: 'h2' }, t('drill.retrieval.title')),
          h('p', { class: 'muted' }, t('drill.retrieval.instructions')),
          due.length ? h('div', { class: 'note note--good' }, t('drill.retrieval.due_count', { count: due.length })) : null,
          tierPicker(lang, tier, next => { tier = next; setup(); }),
          h('div', { class: 'btnrow', style: { marginTop: '14px' } },
            h('button', { class: 'btn btn--primary btn--lg', onClick: () => read(due[0]) }, due.length ? t('drill.retrieval.start_review') : t('drill.retrieval.start')))));
    };

    const read = dueId => {
      const p = dueId
        ? content.passagesFor(lang).find(item => item.id === dueId)
        : pickPracticePassage(lang, { tier, preferredIds: recentPracticePassageIds(lang) });
      if (!p) return setup();
      const novelAtStart = markPassageStarted(p);
      mount(root, drillHeader(t('drill.retrieval.read_title'), exit, why),
        h('div', { class: 'note note--good' }, t('drill.retrieval.read_note')),
        h('div', { class: 'card', style: { marginTop: '10px' } }, h('div', { class: 'eyebrow' }, p.title || t('drill.shared.passage')),
          h('div', { class: 'reader', lang: lang === 'zh' ? 'zh-Hans' : 'en', 'data-lang': lang }, h('div', { class: 'reader-wrap' }, p.text))),
        h('div', { class: 'btnrow', style: { marginTop: '12px' } },
          h('button', { class: 'btn btn--primary btn--lg', onClick: () => recall(p, novelAtStart) }, t('drill.retrieval.hide_and_recall'))));
    };

    const recall = (p, novelAtStart) => {
      const input = h('textarea', { placeholder: t('drill.retrieval.recall_placeholder') });
      const next = h('button', { class: 'btn btn--primary', disabled: true, onClick: () => explain(p, novelAtStart, input.value) }, t('drill.shared.next'));
      input.addEventListener('input', () => { next.disabled = !validRetrievalText(input.value, 10); });
      mount(root, drillHeader(t('drill.retrieval.recall_title'), exit, why),
        h('div', { class: 'note' }, t('drill.retrieval.recall_note')),
        h('div', { style: { marginTop: '10px' } }, input, h('div', { class: 'btnrow', style: { marginTop: '10px' } }, next)));
    };

    const explain = (p, novelAtStart, recallText) => {
      let assisted = false;
      const input = h('textarea', { rows: 3, placeholder: t('drill.retrieval.explain_placeholder') });
      const original = h('details', { class: 'why' },
        h('summary', null, t('drill.retrieval.show_original')),
        h('div', null, h('div', { class: 'reader', lang: lang === 'zh' ? 'zh-Hans' : 'en', 'data-lang': lang }, h('div', { class: 'reader-wrap' }, p.text))));
      original.addEventListener('toggle', () => { if (original.open) assisted = true; });
      const quizButton = h('button', { class: 'btn btn--primary', disabled: true, onClick: () => quiz(p, novelAtStart, recallText, input.value, assisted) }, t('drill.retrieval.start_quiz'));
      input.addEventListener('input', () => { quizButton.disabled = !validRetrievalText(input.value, 15); });
      mount(root, drillHeader(t('drill.retrieval.explain_title'), exit, why),
        h('div', { class: 'note' }, t('drill.retrieval.explain_note')),
        h('div', { style: { marginTop: '10px' } }, input),
        h('div', { style: { marginTop: '8px' } }, original),
        h('div', { class: 'btnrow', style: { marginTop: '10px' } }, quizButton));
    };

    const quiz = (p, novelAtStart, recallText, explanationText, assisted) => {
      const host = h('div');
      mount(root, drillHeader(t('drill.retrieval.quiz_title'), exit, null), host);
      compQuiz(host, (p.questions || []).slice(), t('drill.retrieval.quiz_title')).then(result => {
        const grade = result.frac >= 0.85 ? 3 : result.frac >= 0.6 ? 2 : result.frac >= 0.4 ? 1 : 0;
        store.srReview(deck, p.id, grade);
        const card = store.srCard(deck, p.id);
        const saved = recordAttempt({
          drill: 'retrieval', submode: 'self_explanation', benchmark: false,
          lang, tier: p.tier || tier, difficulty,
          passageId: p.id, sourcePassageId: p.id, transferPassageId: null,
          novelAtStart, assisted, completed: true,
          units: null, elapsedMs: null, rate: null, timingValid: true,
          correct: result.correct, total: result.total, comprehension: result.frac,
          questionTypes: result.questionTypes, fatigue: null,
          recallLength: recallText.trim().length,
          explanationLength: explanationText.trim().length,
          // 사용자 작성 본문은 attempt에 저장하지 않는다.
          ...context,
        });
        const gistAnswer = p.gist && p.gist.options ? p.gist.options[p.gist.answer] : t('drill.retrieval.no_gist_answer');
        const comparison = h('details', { class: 'why', open: true },
          h('summary', null, t('drill.retrieval.compare_title')),
          h('div', { class: 'stack' },
            h('div', null, h('b', null, t('drill.retrieval.your_recall')), h('p', null, recallText)),
            h('div', null, h('b', null, t('drill.retrieval.your_explanation')), h('p', null, explanationText)),
            h('div', null, h('b', null, t('drill.retrieval.passage_main_idea')), h('p', null, gistAnswer))));
        mount(root, drillHeader(name, exit, null), resultCard([
          [Math.round(result.frac * 100) + '%', t('drill.retrieval.retrieval_accuracy'), `${result.correct}/${result.total}`],
          [card.interval >= 1 ? t('drill.retrieval.days_later', { days: card.interval }) : t('drill.retrieval.soon'), t('drill.retrieval.next_review')],
        ], setup, exit, h('div', { class: 'stack' }, comparison, attemptErrorNote(saved))));
      });
    };
    setup();
  },
};
