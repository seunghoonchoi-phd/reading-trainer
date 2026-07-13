// ===== drills/context.js — context inference practice =====
import { h, mount } from '../util.js';
import * as content from '../content.js?v=20260713-36';
import { t } from '../i18n.js';
import {
  drillHeader, trainingRationale, compQuiz, resultCard, tierPicker, preferredTier,
  markPassageStarted, recordAttempt, attemptErrorNote, attemptContext, currentDifficulty,
  pickPracticePassage,
} from './shared.js';

export default {
  id: 'context',
  nameKey: 'drill.context.name',
  goalKey: 'drill.context.goal',
  whyKey: 'drill.context.why',
  evidenceKey: 'drill.context.evidence',
  category: 'practice', categoryKey: 'drill.category.practice',
  name: '문맥 추론', icon: '?', track: '연습',
  goal: '낯선 표현을 만났을 때 앞뒤 문맥으로 가능한 뜻을 좁힙니다.',
  langs: ['en', 'zh'],
  why: '자동으로 만든 빈칸 문항은 문맥 활용 연습이지만 전체 독해 숙련을 판정하지는 않습니다.',
  evidence: '문맥을 이용한 어휘 추론은 읽기 전략의 하나입니다.',

  render(root, lang, exit, options = {}) {
    const name = t(this.nameKey);
    const why = trainingRationale(this.id, t(this.whyKey));
    const context = attemptContext(options);
    const difficulty = currentDifficulty(lang);
    let tier = preferredTier(lang);
    const setup = () => mount(root, drillHeader(name, exit, why),
      h('div', { class: 'card fade-in' },
        h('h2', { class: 'h2' }, t('drill.context.title')),
        h('p', { class: 'muted' }, t('drill.context.instructions')),
        tierPicker(lang, tier, next => { tier = next; setup(); }),
        h('div', { class: 'btnrow', style: { marginTop: '14px' } },
          h('button', { class: 'btn btn--primary btn--lg', onClick: run }, t('drill.context.start')))));
    const run = () => {
      const p = pickPracticePassage(lang, { tier });
      if (!p) return setup();
      const novelAtStart = markPassageStarted(p);
      const items = content.autoCloze(p.text, lang, 6);
      if (items.length < 4) {
        mount(root, drillHeader(name, exit), h('div', { class: 'empty' }, t('drill.context.not_enough_items')));
        return;
      }
      const host = h('div');
      mount(root, drillHeader(t('drill.context.quiz_title', { title: p.title || t('drill.shared.passage') }), exit, why), host);
      compQuiz(host, items, t('drill.context.name')).then(result => {
        const saved = recordAttempt({
          drill: 'context', submode: 'cloze', benchmark: false,
          lang, tier: p.tier || tier, difficulty,
          passageId: p.id, sourcePassageId: p.id, transferPassageId: null,
          novelAtStart, assisted: true, completed: true,
          units: items.length, elapsedMs: null, rate: null, timingValid: true,
          correct: result.correct, total: result.total, comprehension: null,
          questionTypes: { context_inference: { correct: result.correct, total: result.total } },
          fatigue: null,
          ...context,
        });
        mount(root, drillHeader(name, exit, null), resultCard([
          [`${result.correct}/${result.total}`, t('drill.shared.accuracy')],
        ], () => this.render(root, lang, exit, options), exit, h('div', { class: 'stack' },
          h('p', { class: 'small muted' }, t(result.frac >= 0.75 ? 'drill.context.good_feedback' : 'drill.context.retry_feedback')),
          attemptErrorNote(saved))));
      });
    };
    setup();
  },
};
