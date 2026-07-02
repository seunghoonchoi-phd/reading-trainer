// ===== theory.js — 「원리」 tab. Content distilled from the verified research dossier. =====
import { h } from './util.js';
import { DRILLS } from './drills/index.js';
import { icon, DRILL_ICON } from './icons.js';

const BADGE = { strong: ['강한 근거', 'strong'], moderate: ['중간 근거', 'moderate'], weak: ['약한 근거', 'weak'], contested: ['논쟁 중', 'contested'], debunked: ['반증됨', 'debunked'] };
function badge(level) { const [t, c] = BADGE[level] || ['', 'neutral']; return h('span', { class: 'badge badge--' + c }, t); }

const MYTHS = [
  { t: '눈을 훈련하면 시야폭이 넓어져 한 줄/한 단락을 한눈에 읽는다', d: '지각폭은 주의(attention) 기반이라 고정돼 있습니다. 영어는 고정점 오른쪽 ~14–15자가 보여도 단어로 식별되는 건 ~7–8자뿐, 중국어는 오른쪽 ~3자. 주변 글자를 확대해도 폭은 안 커졌습니다(주변시 확대 실험 실패). 한눈에 읽는 느낌은 폭이 아니라 어휘 인지가 빨라진 결과입니다.' },
  { t: 'RSVP·Spritz처럼 단어를 한 곳에 깜빡이면 공짜로 빨라진다', d: '회귀·미리보기·읽는이 주도 고정시간을 없애 고속에서 이해가 무너지고 피로가 커집니다. 중국어 글자 단위 깜빡임이 최악. 페이서를 쓰더라도 정상 레이아웃 위 하이라이트 + 이해도 게이트 + 언제든 되돌리기여야 합니다.' },
  { t: '속발음(머릿속 소리)을 없애야 빨라진다', d: '속발음은 구조적이라 가장 빠른 독자에게도 EMG/fMRI로 관찰됩니다. 억제하면 특히 어려운 글에서 이해가 떨어집니다. 가능한 건 난이도에 맞춘 음운부하 페이싱뿐, "내면의 목소리 죽이기"가 아닙니다.' },
  { t: '"절대 뒤로 보지 마라" — 회귀를 없애라', d: '회귀(고정의 ~10–15%)는 기능적 재독입니다. 막으면 일반 텍스트에서도 이해가 떨어집니다. 불안성 되돌이만 줄이고 의미 있는 재독은 보존·권장합니다.' },
  { t: '완전한 이해로 600~1000+ WPM(또는 1만 WPM·포토리딩)이 가능하다', d: '물리적으로 불가능. 그런 시연은 훑기/책장 넘기기이고 이해는 우연 수준입니다. 정상 묵독은 비문학 ~238, 소설 ~260 WPM(Brysbaert 2019), ~400+는 밀도 높은 글의 훑기/무리 경계입니다.' },
  { t: '슐테 표·안구운동 체조·타키스토스코프로 읽기 속도가 곱절 된다', d: '눈 운동은 읽기 시간의 ~10%일 뿐이라 병목이 아닙니다. 시각탐색·재인 훈련은 이해하며 읽는 속도로 전이되지 않습니다. 손가락 페이싱은 기껏해야 주의 보조이지 속도 배율기가 아닙니다.' },
  { t: '뇌 훈련으로 집중력·IQ·생산성까지 좋아진다(원거리 전이)', d: '원거리 전이는 근거 없음(Simons 2016; Sala & Gobet 2019). 이 앱은 근거리 읽기 향상만 주장하고, 학습 안 한 새 지문 벤치마크로 정직하게 측정합니다.' },
  { t: '한자는 그림처럼 통째로 외우면 된다 / 부수만 알면 다 읽는다', d: '숙련된 한자 읽기는 분석적·하위어휘적입니다. 부수는 의미가 투명한 형성자에서만 도움이 되고, 불투명 글자에 과도하게 적용하면 오히려 방해됩니다. 병음(소리)을 건너뛰면 안 됩니다 — 하위어휘 음운은 재인의 일부입니다.' },
];

const OVERLOAD = [
  ['합법적 부하', '이해 충실도만 빼고 모든 축을 과부하해도 됩니다. 속도는 관찰하는 출력이지 강제하는 입력이 아닙니다. 이해 미니체크가 기준 아래로 떨어지면 자동으로 deload(완화) — 밀어붙이지 않습니다. 힘이 엔진이 아니라, 이해하며 성공적으로 반복하는 것이 엔진입니다.'],
  ['어떤 축을 미나', '어휘 난이도 · 글 밀도 · 길이 · 시간 압박 · 인출 부하 — 이것들을 한 세션에 하나씩만 올립니다(실패 진단을 위해 두 축 동시 금지). 눈 속도는 절대 과부하 대상이 아닙니다(이해 붕괴 = 훑기, 전이 0).'],
  ['같은 글 vs 새 글', '같은 글 반복은 그 글에서 확실히 빨라지고 정확해집니다(반복읽기 같은지문 효과크기 ≈ 0.83 유창성 / 0.67 이해). 새 글로의 전이는 더 약하고, 2언어에서는 속도는 어느 정도 전이돼도 이해 전이는 들쭉날쭉(저숙련일수록 종종 0)합니다. 그래서 관련 글로 차갑게 측정합니다.'],
  ['회복 · 간격 · 수면', '간격 학습은 벼락치기를 이기는 가장 재현된 발견 중 하나이고, 효과는 나중 시험에서 드러납니다(당일이 아니라). 수면은 새로 익힌 단어·의미를 공고화합니다. 다만 수면이 읽기 속도를 빠르게 한다는 근거는 약합니다 — 속도는 절차적 기술입니다. 그래서 일정만 잡고 과장하지 않습니다.'],
  ['측정의 정직함', '속도와 이해를 항상 두 숫자로 따로 보여줍니다. 이해가 떨어진 속도 기록은 향상이 아니라 그 반대입니다. “정복”은 차가운 새 글에서 이해가 유지될 때만 인정합니다.'],
  ['근거의 한계 (정직한 고지)', '가장 깊은 반복읽기 근거는 대부분 모국어·아동·부진 독자에게서 나왔습니다. 고급 성인 2언어 독자에겐 이 프로토콜이 이론적으로 타당하나 직접 근거는 얇습니다(소표본·단일 사례). 그래서 이 앱은 모집단 평균을 약속하지 않고 당신에게 A/B하며 당신의 전이 곡선을 추적합니다.'],
];

const SOURCES = [
  'Rayner, K., Schotter, E. R., Masson, M. E. J., Potter, M. C., & Treiman, R. (2016). So Much to Read, So Little Time. Psychological Science in the Public Interest, 17(1).',
  'McConkie, G. W., & Rayner, K. (1975). The span of the effective stimulus during a fixation in reading. Perception & Psychophysics.',
  'Schotter, E. R., Tran, R., & Rayner, K. (2014). Don\'t Believe What You Read (Only Once): regressions and comprehension. Psychological Science.',
  'Brysbaert, M. (2019). How many words do we read per minute? A review. Journal of Memory and Language.',
  'Miyata, H., et al. (2012). PLOS ONE — high reported reading "speed" co-occurring with near-chance comprehension (a caution on speed-reading validity).',
  'Hu, M., & Nation, P. (2000). Unknown vocabulary density and reading comprehension. Reading in a Foreign Language. (refined by Kremmel et al., 2023)',
  'Nation, I. S. P. (2006). How large a vocabulary is needed for reading and listening? Canadian Modern Language Review.',
  'Dunlosky, J., et al. (2013). Improving Students\' Learning With Effective Learning Techniques. Psychological Science in the Public Interest.',
  'Cepeda, N. J., et al. (2006/2008). Distributed practice / optimal spacing. Psychological Bulletin / Psychological Science.',
  'Therrien, W. J. (2004). Fluency and comprehension gains from repeated reading: a meta-analysis. Remedial and Special Education.',
  'LaBerge, D., & Samuels, S. J. (1974). Toward a theory of automatic information processing in reading. Cognitive Psychology.',
  'Keshav, S. (2007). How to Read a Paper. ACM SIGCOMM Computer Communication Review.',
  'Inhoff, A. W., & Liu, W. (1998). The perceptual span during reading of Chinese. JEP:HPP.',
  'Seymour, P. H. K., et al. (2003). Foundation literacy acquisition in European orthographies (orthographic depth). British Journal of Psychology.',
  'Simons, D. J., et al. (2016). Do "Brain-Training" Programs Work? Psychological Science in the Public Interest.',
];

function section(id, title, ...body) {
  return h('section', { id, class: 'card', style: { scrollMarginTop: '120px' } }, h('h2', { class: 'h2' }, title), ...body);
}

export function renderTheory(root) {
  const toc = h('div', { class: 'toc' },
    ...[['model', '작동 모델'], ['l1', '한국어는 왜 빠른가'], ['levers', '진짜 레버'], ['overload', '과부하·회복'], ['drills', '드릴별 근거'], ['myths', '속독 미신'], ['sources', '출처']]
      .map(([id, t]) => h('a', { href: '#' + id }, t)));

  const intro = h('div', { class: 'card', style: { borderLeft: '4px solid var(--accent)' } },
    h('p', { class: 'eyebrow' }, '이 앱이 따르는 단 하나의 원칙'),
    h('p', { style: { fontSize: '1.15rem', fontWeight: '700', margin: '0 0 8px' } },
      '읽기 속도의 병목은 “눈”이 아니라 “뇌의 어휘 처리”다.'),
    h('p', { class: 'muted', style: { margin: 0 } },
      '눈 운동은 읽기 시간의 약 10%일 뿐입니다. 그래서 이 앱은 시야폭을 넓히려 하지 않고, 단어 인지의 자동화·어휘 커버리지를 키웁니다. 그 결과로 체감 시야가 넓어지고 “한눈에 들어오는” 느낌이 따라옵니다.'));

  // ---- reading model with a fixation demo ----
  const demoSentence = h('div', { class: 'fixation-demo' },
    h('span', { class: 'span-blur' }, 'Skilled '),
    h('span', { class: 'span-now' }, h('span', { class: 'fx' }, 'reading'), ' is a'),
    h('span', { class: 'span-blur' }, ' series of brief stops connected by quick jumps.'));

  const model = section('model', '읽기의 작동 모델',
    h('p', null, '읽기는 매끄러운 미끄러짐이 아니라 ', h('b', null, '짧은 멈춤(고정, ~200–250ms)'), '과 ', h('b', null, '빠른 도약(사케이드, ~7–9자)'), '의 연속입니다. 새 정보는 고정하는 동안에만 들어오고, 도약 중엔 시야가 억제됩니다.'),
    demoSentence,
    h('p', { class: 'small muted' }, '↑ 한 번 고정할 때 또렷이 식별되는 건 응시 단어와 다음 한 단어 정도(영어 ~7–8자). 나머지 넓은 영역은 단어 경계 파악·다음 도약 계획용일 뿐 “읽히지” 않습니다.'),
    h('div', { class: 'stat-row', style: { marginTop: '8px' } },
      stat('~7–8자', '영어 단어식별 폭 (오른쪽)'),
      stat('~3자', '중국어 식별 폭 (오른쪽)'),
      stat('~10%', '전체 읽기 중 눈 운동 비중'),
      stat('~238/260', '정상 묵독 WPM (비문학/소설)')),
    h('p', { class: 'note note--warn', style: { marginTop: '12px' } }, '그래서 “1초에 한 단락을 한눈에 파악”은 물리적으로 불가능합니다. 1초면 4–5번 고정, 즉 4–5단어를 이해하는 게 한계입니다. 빨라지는 길은 폭이 아니라 단어를 더 빨리 알아보는 것.'));

  const l1 = section('l1', '왜 한국어는 1초 만에 잡히나',
    h('p', null, '시야폭이 넓어서가 아닙니다. 모국어는 ', h('b', null, '단어 인지가 완전 자동화'), '돼 있고, 글에 모르는 단어가 거의 없습니다(커버리지 ≈ 100%). 두 조건이 갖춰지면 같은 고정 횟수로도 의미가 즉시 통합돼 “한눈에 들어오는” 느낌이 됩니다.'),
    h('p', null, '영어·중국어가 느린 진짜 이유: (1) 단어 인지가 아직 노력형이라 느리고 들쭉날쭉, (2) 아는 단어 비율(커버리지)이 95–98%에 못 미침, (3) 표기 체계가 더 어려움 — 영어는 철자-소리 대응이 깊고(deep), 중국어는 형태음절 문자에 띄어쓰기까지 없음(한글은 얕고 규칙적).'),
    h('p', { class: 'note note--good' }, '결론: 영·중을 한국어처럼 만들려면 “눈 훈련”이 아니라 ', h('b', null, '어휘 자동화 + 커버리지 95–98%'), '를 먼저 채워야 합니다. 이 앱의 순서가 “커버리지 우선 → 속도”인 이유입니다.'));

  const leverItems = [
    ['빈도순 어휘 + 인지속도 자동화', 'strong', '읽기의 병목인 어휘 접근을 직접 공략. 빈도 높은 단어부터 간격반복으로 재인 속도(RT)와 안정성을 높입니다(Cepeda 2006/08, Dunlosky 2013 HIGH).'],
    ['커버리지 95–98% 확보', 'moderate', '이해는 아는 단어 비율에 좌우됩니다. 95–98%는 고정 상수가 아닌 가이드 밴드(Hu & Nation; Kremmel 2023). 속도 훈련은 커버리지가 찬 글에서만 효과가 큽니다.'],
    ['반복읽기(전이 검사 포함)', 'moderate', '같은 지문을 3–4회 읽어 자동성을 키우되, 진짜 향상은 어휘·주제가 겹치는 새 지문 성적으로만 인정(Therrien 2004; LaBerge & Samuels 1974).'],
    ['인출 연습 + 간격', 'strong', '다시 읽기·형광펜·요약보다 “덮고 떠올리기(인출)”와 지연 복습이 영속 학습에 강력(Roediger & Karpicke; Dunlosky HIGH).'],
    ['이해도 게이트(ERR)', 'strong', '속도 단독은 훑기로 조작 가능. 모든 속도 시도에 이해 문제를 묶어 ERR = WPM × 이해율로만 점수화합니다.'],
  ];
  const levers = section('levers', '전이가 검증된 진짜 레버',
    h('div', { class: 'stack' }, ...leverItems.map(([t, lv, d]) =>
      h('div', { class: 'note' }, h('div', { class: 'row spread', style: { marginBottom: '4px' } }, h('b', null, t), badge(lv)), h('span', { class: 'muted' }, d)))));

  const overload = section('overload', '과부하 → 회복 → 강화',
    h('p', { class: 'muted small' }, '한계 위로 부하를 걸고 회복으로 강화하는 방식 — 단, 부하 “축”을 바로잡아야 효과가 납니다. 핵심 규칙: 속도가 아니라 부하를 과부하한다.'),
    ...OVERLOAD.map(([t, d]) => h('div', { class: 'note', style: { marginBottom: '10px' } }, h('b', null, t), h('div', { class: 'small muted', style: { marginTop: '4px' } }, d))));

  // ---- per-drill evidence ----
  const drillCards = DRILLS.map(d => h('div', { class: 'note', style: { marginBottom: '10px' } },
    h('div', { class: 'row', style: { gap: '8px', marginBottom: '4px' } }, icon(DRILL_ICON[d.id] || 'dot', { size: 18 }), h('b', null, d.name)),
    h('div', { class: 'small muted' }, d.why || d.goal),
    d.evidence ? h('div', { class: 'small', style: { marginTop: '4px', color: 'var(--ink-faint)' } }, '근거: ' + d.evidence) : null));
  const drills = section('drills', '드릴별 근거', ...drillCards);

  const myths = section('myths', '속독 미신 — 이 앱이 하지 않는 것',
    h('p', { class: 'muted small' }, '아래는 상업 속독에서 흔하지만 근거가 없거나 반증된 주장입니다. 이 앱은 이것들을 팔지 않습니다.'),
    ...MYTHS.map(m => h('div', { class: 'note note--myth', style: { marginBottom: '10px' } },
      h('div', { class: 'row', style: { gap: '8px', marginBottom: '4px' } }, h('span', null, '✕'), h('b', null, m.t)),
      h('div', { class: 'small' }, m.d))));

  const sources = section('sources', '출처',
    h('ul', { class: 'srcs' }, ...SOURCES.map(s => h('li', null, s))),
    h('p', { class: 'small muted', style: { marginTop: '8px' } }, '※ 2025 개인별 속도-정확도 한계 연구와 405 WPM 변곡점, 85% 규칙 등은 미확정/차용 개념으로 보고, 개인 한계는 앱이 경험적으로(staircase) 직접 측정합니다.'));

  root.append(
    h('div', { class: 'fade-in' },
      h('h1', { class: 'h1' }, '원리'),
      h('p', { class: 'lead' }, '왜 이 훈련이 통하는지 알고 하면 효과가 올라갑니다. 메커니즘을 이해한 채 연습하세요.'),
      toc, intro, model, l1, levers, overload, drills, myths, sources));
}

function stat(num, lbl) { return h('div', { class: 'stat' }, h('span', { class: 'stat__num' }, num), h('span', { class: 'stat__lbl' }, lbl)); }
