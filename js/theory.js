// ===== theory.js: research boundaries and product rules in plain language =====
import { h } from './util.js';
import { t } from './i18n.js';

const TOC = [
  ['measure', 'theory.toc.measure'],
  ['cycle', 'theory.toc.cycle'],
  ['goals', 'theory.toc.goals'],
  ['transfer', 'theory.toc.transfer'],
  ['policy', 'theory.toc.policy'],
  ['supports', 'theory.toc.supports'],
  ['claims', 'theory.toc.claims'],
  ['sources', 'theory.toc.sources'],
];

const SOURCES = [
  {
    title: 'Rayner et al. (2016), So Much to Read, So Little Time',
    noteKey: 'theory.sources.rayner',
    href: 'https://journals.sagepub.com/doi/10.1177/1529100615623267',
  },
  {
    title: 'Schotter, Tran, and Rayner (2014), Don\'t Believe What You Read (Only Once)',
    noteKey: 'theory.sources.schotter',
    href: 'https://journals.sagepub.com/doi/10.1177/0956797614531148',
  },
  {
    title: 'Benedetto et al. (2015), Rapid serial visual presentation and reading',
    noteKey: 'theory.sources.benedetto',
    href: 'https://www.sciencedirect.com/science/article/abs/pii/S0747563214007663',
  },
  {
    title: 'Skinner et al. (2009), Validity of combined reading-rate scores',
    noteKey: 'theory.sources.skinner',
    href: 'https://onlinelibrary.wiley.com/doi/abs/10.1002/pits.20442',
  },
  {
    title: 'Therrien (2004), Repeated reading meta-analysis',
    noteKey: 'theory.sources.therrien',
    href: 'https://doi.org/10.1177/07419325040250040801',
  },
  {
    title: 'Dunlosky et al. (2013), Improving Students\' Learning',
    noteKey: 'theory.sources.dunlosky',
    href: 'https://journals.sagepub.com/doi/10.1177/1529100612453266',
  },
];

function section(id, titleKey, ...body) {
  return h('section', { id, class: 'card theory-section' },
    h('h2', { class: 'h2' }, t(titleKey)),
    ...body);
}

function explanation(titleKey, bodyKey, extraClass = '') {
  return h('article', { class: `explain-card ${extraClass}`.trim() },
    h('h3', { class: 'explain-card__title' }, t(titleKey)),
    h('p', { class: 'explain-card__body' }, t(bodyKey)));
}

function stat(value, labelKey) {
  return h('div', { class: 'stat' },
    h('span', { class: 'stat__num' }, value),
    h('span', { class: 'stat__lbl' }, t(labelKey)));
}

export function renderTheory(root) {
  const toc = h('nav', { class: 'toc', 'aria-label': t('theory.pageTitle') },
    ...TOC.map(([id, key]) => h('a', { href: `#${id}` }, t(key))));

  const intro = h('div', { class: 'card card--principle' },
    h('p', { class: 'eyebrow' }, t('theory.intro.label')),
    h('p', { class: 'principle-title' }, t('theory.intro.title')),
    h('p', { class: 'muted principle-body' }, t('theory.intro.body')));

  const measure = section('measure', 'theory.measure.title',
    h('p', null, t('theory.measure.p1')),
    h('p', null, t('theory.measure.p2')),
    h('div', { class: 'stat-row stat-row--four' },
      stat(t('theory.measure.rateValue'), 'theory.measure.rate'),
      stat(t('theory.measure.comprehensionValue'), 'theory.measure.comprehension'),
      stat(t('theory.measure.fatigueValue'), 'theory.measure.fatigue'),
      stat(t('theory.measure.transferValue'), 'theory.measure.transfer')));

  const cycle = section('cycle', 'theory.cycle.title',
    h('div', { class: 'explain-grid explain-grid--two' },
      explanation('theory.cycle.baseline.title', 'theory.cycle.baseline.body'),
      explanation('theory.cycle.practice.title', 'theory.cycle.practice.body'),
      explanation('theory.cycle.transfer.title', 'theory.cycle.transfer.body'),
      explanation('theory.cycle.recheck.title', 'theory.cycle.recheck.body')));

  const goals = section('goals', 'theory.goals.title',
    h('div', { class: 'explain-grid explain-grid--three' },
      explanation('theory.goals.accurate.title', 'theory.goals.accurate.body'),
      explanation('theory.goals.gist.title', 'theory.goals.gist.body'),
      explanation('theory.goals.locate.title', 'theory.goals.locate.body')));

  const transfer = section('transfer', 'theory.transfer.title',
    h('p', null, t('theory.transfer.p1')),
    h('p', null, t('theory.transfer.p2')),
    h('p', { class: 'note note--good' }, t('theory.transfer.note')));

  const policy = section('policy', 'theory.policy.title',
    h('div', { class: 'policy-grid' },
      h('article', { class: 'policy-card policy-card--research' },
        h('h3', { class: 'policy-card__label' }, t('theory.policy.researchLabel')),
        h('p', null, t('theory.policy.research'))),
      h('article', { class: 'policy-card policy-card--product' },
        h('h3', { class: 'policy-card__label' }, t('theory.policy.productLabel')),
        h('p', null, t('theory.policy.product')))),
    h('p', { class: 'note note--warn' }, t('theory.policy.caution')));

  const supports = section('supports', 'theory.supports.title',
    h('div', { class: 'explain-grid explain-grid--two' },
      explanation('theory.supports.vocab.title', 'theory.supports.vocab.body'),
      explanation('theory.supports.repeat.title', 'theory.supports.repeat.body'),
      explanation('theory.supports.language.title', 'theory.supports.language.body'),
      explanation('theory.supports.tools.title', 'theory.supports.tools.body')));

  const claims = section('claims', 'theory.claims.title',
    h('ul', { class: 'claim-list' },
      ...['p1', 'p2', 'p3', 'p4'].map(key => h('li', null, t(`theory.claims.${key}`)))));

  const sources = section('sources', 'theory.sources.title',
    h('p', { class: 'muted' }, t('theory.sources.note')),
    h('ol', { class: 'srcs source-list' },
      ...SOURCES.map(source => h('li', null,
        h('a', { href: source.href, target: '_blank', rel: 'noreferrer noopener' }, source.title),
        h('span', null, t(source.noteKey))))));

  root.append(h('div', { class: 'fade-in theory-page' },
    h('h1', { class: 'h1' }, t('theory.pageTitle')),
    h('p', { class: 'lead' }, t('theory.pageLead')),
    toc,
    intro,
    measure,
    cycle,
    goals,
    transfer,
    policy,
    supports,
    claims,
    sources));
}
