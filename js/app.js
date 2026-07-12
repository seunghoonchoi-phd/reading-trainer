// ===== app.js: shell, four-step program, settings, and progress =====
import {
  h, mount, $, $$, clear, countUnits, startTimer, fmtClock, sparkline,
  median, setPressed,
} from './util.js';
import * as store from './store.js';
import * as content from './content.js';
import * as metrics from './metrics.js';
import * as program from './program.js';
import {
  DIFFICULTIES, DIFFICULTY_ORDER, difficultyLabel,
} from './levels.js';
import { DRILLS, DRILL_BY_ID } from './drills/index.js';
import { renderTheory } from './theory.js';
import {
  compQuiz, resultCard, setTeardown, runTeardown, askFatigue,
  recordAttempt, attemptErrorNote, timingValidity,
} from './drills/shared.js';
import conquer from './drills/conquer.js';
import triage from './drills/triage.js';
import { icon, iconSvg, DRILL_ICON } from './icons.js';
import {
  initI18n, getUILang, setUILang, t, registerMessages, translateDocument,
} from './i18n.js';

registerMessages('ko', {
  'app.loading': '콘텐츠 불러오는 중…',
  'app.theme.light': '밝게 전환',
  'app.theme.dark': '어둡게 전환',
  'app.leave': '진행 중인 훈련을 중단할까요? 이번 시도는 완료 기록에 들어가지 않습니다.',
  'app.unit.en': 'WPM',
  'app.unit.zh': '자/분',
  'app.common.start': '시작',
  'app.common.again': '다시',
  'app.common.done': '완료',
  'app.common.open': '열기',
  'app.common.save': '저장',
  'app.common.cancel': '취소',
  'app.common.error': '문제가 생겼습니다.',
  'app.common.no_passage': '조건에 맞는 글이 없습니다.',
  'app.common.not_available': '없음',
  'app.common.storage_error': '브라우저 저장공간에 기록하지 못했습니다. 저장 용량과 브라우저 설정을 확인해 주세요.',
  'app.recovery.title': '저장 데이터 복구가 필요합니다',
  'app.recovery.body': '기존 저장 데이터가 손상되었거나 더 새로운 버전이라 현재 앱이 안전하게 읽을 수 없습니다. 앱은 원문을 덮어쓰지 않았고, 가능한 경우 별도 복구 키에도 보존했습니다. 먼저 원문 백업을 내려받은 뒤 새 데이터로 시작할 수 있습니다.',
  'app.recovery.key': '브라우저 복구 키: {key}',
  'app.recovery.key_unavailable': '브라우저 복구 키를 만들지 못했지만, 이 화면을 닫기 전에는 원문 백업을 내려받을 수 있습니다.',
  'app.recovery.download': '읽지 못한 원문 백업 받기',
  'app.recovery.start_fresh': '백업 후 새로 시작',
  'app.recovery.confirm1': '원문 백업을 확인했나요? 기존 리드패스트 저장 키를 새 데이터로 바꿉니다.',
  'app.recovery.confirm2': '별도 복구 키와 내려받은 파일은 남습니다. 정말 새로 시작할까요?',
  'app.difficulty.title': '임시 시작 난이도를 고르세요',
  'app.difficulty.lead': '이 값은 자격 등급이 아닙니다. 먼저 읽기 편한 글부터 시작하고, 처음 보는 글 기록이 3회 쌓이면 앱이 새 난이도를 제안합니다.',
  'app.difficulty.badge': '앱 난이도',
  'app.difficulty.choose': '이 난이도로 시작',
  'app.difficulty.library': '먼저 전체 훈련 보기',
  'app.home.eyebrow': '오늘의 훈련',
  'app.home.title': '오늘의 10분',
  'app.home.lead': '짧게 준비하고, 한 가지에 집중한 뒤, 다른 글이나 인출로 끝냅니다.',
  'app.home.phase': '현재 단계',
  'app.home.streak': '연속일',
  'app.home.maintained': '이해 유지 속도',
  'app.home.need_data': '처음 보는 글 기록이 더 필요합니다',
  'app.home.samples': '유효 기록 {count}회',
  'app.home.today_count': '오늘 완료 {count}/3',
  'app.home.all_unlocked': '모든 훈련은 언제든 직접 열 수 있습니다.',
  'app.home.recommend_title': '시작 난이도 제안',
  'app.home.recommend_body': '처음 보는 글 3회의 결과로 앱 난이도 {difficulty}를 임시 제안합니다. 자동으로 바꾸지 않습니다.',
  'app.home.recommend_apply': '제안 적용',
  'app.library.en.title': '영어 지문',
  'app.library.zh.title': '중국어 지문',
  'app.library.en.lead': '훈련에 쓰는 영어 지문을 난이도별로 모았습니다. 모든 지문의 원문과 한국어 전문을 한 화면에서 함께 볼 수 있습니다.',
  'app.library.zh.lead': '훈련에 쓰는 중국어 지문과 단어 분할 문장을 난이도별로 모았습니다. 모든 문장의 원문과 한국어 전문을 한 화면에서 함께 볼 수 있습니다.',
  'app.library.count': '총 {count}개',
  'app.library.difficulty': '난이도 {tier}',
  'app.library.translation': '한국어 전문 보기',
  'app.library.translation_title': '한국어 전문',
  'app.library.translation_loading': '한국어 전문을 불러오는 중입니다…',
  'app.library.translation_failed': '번역을 불러오지 못했습니다. 인터넷 연결을 확인한 뒤 다시 눌러 주세요.',
  'app.library.translation_note': '이 번역은 단어 때문에 멈추지 않도록 돕는 기계 번역입니다.',
  'app.library.source': '원문',
  'app.library.korean': '한국어 전문',
  'app.library.translation_missing': '한국어 전문을 준비하지 못했습니다.',
  'app.library.sentences_title': '중국어 단어 분할 문장',
  'app.library.sentences_lead': '중국어 단어 분할 훈련에서 쓰는 모든 문장입니다.',
  'app.plan.prepare': '준비',
  'app.plan.focus': '본훈련',
  'app.plan.transfer': '전이·인출',
  'app.plan.minutes': '약 {minutes}분',
  'app.plan.repeat': '한 번 더',
  'app.plan.reason.prepare.baseline': '문단 첫 문장으로 글의 방향을 짧게 확인한 뒤 기준선 읽기를 시작합니다.',
  'app.plan.reason.focus.baseline': '처음 보는 글을 도움 없이 읽고 현재 속도와 이해를 잽니다.',
  'app.plan.reason.transfer.baseline': '방금 읽은 내용을 보지 않고 꺼내 봅니다.',
  'app.plan.reason.prepare.weakness': '본훈련 전에 문단 구조를 짧게 확인합니다.',
  'app.plan.reason.focus.weakness': '최근 오답에서 가장 약한 한 부분만 연습합니다.',
  'app.plan.reason.transfer.weakness': '연습 뒤 기억에서 핵심을 다시 꺼냅니다.',
  'app.plan.reason.prepare.transfer': '새 글 전이 전에 앞서 읽은 내용을 짧게 떠올립니다.',
  'app.plan.reason.focus.transfer': '같은 글 연습 뒤 처음 보는 관련 글에서 다시 확인합니다.',
  'app.plan.reason.transfer.transfer': '도움 없는 정확 읽기로 전이 결과를 한 번 더 확인합니다.',
  'app.plan.reason.prepare.reassessment': '주간 재측정 전에 문단 구조를 짧게 확인합니다.',
  'app.plan.reason.focus.reassessment': '처음 보는 글로 이번 주 속도와 이해를 다시 잽니다.',
  'app.plan.reason.transfer.reassessment': '측정한 내용을 보지 않고 다시 꺼내 봅니다.',
  'app.plan.reason.prepare.maintenance': '재측정일까지 문단 첫 문장으로 글의 방향을 확인합니다.',
  'app.plan.reason.focus.maintenance': '새 평가 글을 쓰지 않고 최근에 약했던 부분을 유지합니다.',
  'app.plan.reason.transfer.maintenance': '이미 읽은 글의 핵심을 보지 않고 다시 꺼냅니다.',
  'app.phase.baseline': '현재 상태 확인',
  'app.phase.weakness': '약한 부분 연습',
  'app.phase.transfer': '처음 보는 글 전이',
  'app.phase.reassessment': '주간 재측정',
  'app.phase.pending': '예정',
  'app.phase.active': '지금',
  'app.phase.scheduled': '재측정일 대기',
  'app.phase.done': '완료',
  'app.phase.progress': '{done}/{goal}',
  'app.phase.next_date': '{date}부터 재측정',
  'app.train.title': '훈련',
  'app.train.lead': '현재 상태를 확인하고, 처음 보는 글에서 다시 확인합니다. 필요한 훈련은 아래 목록에서 언제든 바로 시작할 수 있습니다.',
  'app.train.cycle': '이번 훈련 순환',
  'app.train.library': '전체 훈련 도구',
  'app.train.library_help': '잠금은 없습니다. 두 단계는 추천 순서이고, 목록은 직접 연습할 때 씁니다.',
  'app.category.core': '핵심 훈련',
  'app.category.language_support': '언어별 보조',
  'app.category.practice': '연습·실험',
  'app.category.tool': '실전 도구',
  'app.mytexts.title': '내 글',
  'app.mytexts.lead': '읽고 있는 영어·중국어 글을 붙여넣어 연습할 수 있습니다. 자동 문제는 검증 문항이 아니므로 대표 기록에는 쓰지 않습니다.',
  'app.mytexts.form_title': '새 글 저장',
  'app.mytexts.title_label': '제목',
  'app.mytexts.title_placeholder': '제목은 선택입니다',
  'app.mytexts.body_label': '본문',
  'app.mytexts.body_placeholder.en': '영어 책이나 논문의 단락을 붙여넣으세요.',
  'app.mytexts.body_placeholder.zh': '중국어 책이나 논문의 단락을 붙여넣으세요.',
  'app.mytexts.limit': '한 글 100,000자, 전체 1,000,000자까지 저장합니다. 현재 {count}자 입력했습니다.',
  'app.mytexts.saved': '저장한 글',
  'app.mytexts.empty': '아직 저장한 글이 없습니다.',
  'app.mytexts.remove': '이 글을 브라우저 저장공간에서 지울까요?',
  'app.mytexts.remove_label': '글 삭제',
  'app.mytexts.read': '속도·이해 확인',
  'app.mytexts.conquer': '반복읽기 연습',
  'app.mytexts.triage': '논문 3단계 도구',
  'app.mytexts.privacy': '붙여넣은 글은 이 브라우저 안에만 저장됩니다. 앱 화면은 제3자 분석 스크립트를 불러오지 않습니다.',
  'app.custom.title': '내 글 읽기',
  'app.custom.instructions': '평소처럼 읽으세요. 다 읽으면 자동 빈칸 문제로 스스로 확인합니다.',
  'app.custom.finish': '다 읽음 · 이해 확인',
  'app.custom.quiz': '자동 문제 · 자기 점검',
  'app.custom.result': '자동 문제 결과는 대표 속도나 난이도 제안에 들어가지 않습니다.',
  'app.custom.no_quiz': '이 글에서는 자동 문제를 만들지 못해 속도만 저장했습니다.',
  'app.progress.title': '기록',
  'app.progress.lead': '속도와 이해를 따로 보고, 처음 보는 글에서 유지된 결과만 대표값으로 봅니다.',
  'app.progress.headline': '이해 유지 속도',
  'app.progress.headline_note': '처음 보는 글을 도움 없이 읽고 이해 80% 이상을 얻은 최근 기록의 중앙값',
  'app.progress.transfer': '새 글 전이 중앙값',
  'app.progress.transfer_note': '이해 80% 이상 {qualified}/{total}회',
  'app.progress.accuracy': '최근 정확 읽기',
  'app.progress.rate': '읽은 속도',
  'app.progress.comprehension': '이해도',
  'app.progress.rate_curve': '속도 변화',
  'app.progress.comp_curve': '이해 변화',
  'app.progress.question_types': '문항 유형별 정확도',
  'app.progress.main_idea': '중심 생각',
  'app.progress.inference': '추론',
  'app.progress.detail': '세부 내용',
  'app.progress.other': '그 밖의 문항',
  'app.progress.mode_results': '읽는 목적별 결과',
  'app.progress.mode.accuracy': '정확히 읽기',
  'app.progress.mode.gist': '핵심 파악',
  'app.progress.mode.locate': '정보 찾기',
  'app.progress.adjustment': '다음 조절',
  'app.progress.adjust.increase': '이해가 두 번 유지되고 피로가 낮았습니다. 다음 목표 속도를 약 5% 올립니다.',
  'app.progress.adjust.hold': '속도와 난이도를 그대로 두고 기록을 더 모읍니다.',
  'app.progress.adjust.decrease': '이해가 60% 미만이거나 피로가 높았습니다. 다음에는 속도 한 축만 낮춥니다.',
  'app.progress.total': '새 형식 완료 기록 {count}회',
  'app.progress.legacy': '예전 기록은 백업으로 보존하지만 새 대표값과 단계 판정에는 쓰지 않습니다.',
  'app.settings.title': '설정',
  'app.settings.lead': '훈련 언어와 화면 언어를 분리하고, 읽기 화면과 타이머를 직접 조절할 수 있습니다.',
  'app.settings.language': '언어',
  'app.settings.ui_language': '화면 언어',
  'app.settings.training_language': '훈련 언어',
  'app.settings.korean': '한국어',
  'app.settings.english': 'English',
  'app.settings.difficulty': '앱 난이도',
  'app.settings.difficulty_help': '글의 난이도 1~6입니다. 언어 자격 등급이 아닙니다.',
  'app.settings.display': '읽기 화면',
  'app.settings.font_size': '본문 글자 크기',
  'app.settings.line_height': '줄 간격',
  'app.settings.width': '읽기 폭',
  'app.settings.reduce_motion': '움직임 줄이기',
  'app.settings.timer': '타이머',
  'app.settings.timer_visible': '읽는 동안 시간 숫자 보기',
  'app.settings.gist_seconds': '핵심 파악 기본 시간',
  'app.settings.seconds': '{value}초',
  'app.settings.theme': '화면 밝기',
  'app.settings.auto': '자동',
  'app.settings.light': '밝게',
  'app.settings.dark': '어둡게',
  'app.settings.data': '데이터',
  'app.settings.data_help': '기록과 내 글은 이 브라우저에 저장됩니다. 기기를 바꿀 때는 백업 파일을 옮기세요.',
  'app.settings.export': '백업 내보내기',
  'app.settings.import': '백업 가져오기',
  'app.settings.imported': '백업을 가져왔습니다.',
  'app.settings.import_failed': '백업을 가져오지 못했습니다: {reason}',
  'app.settings.reset_progress': '훈련 기록 초기화',
  'app.settings.reset_progress_confirm': '새 기록과 예전 훈련 기록을 초기화할까요? 내 글과 설정은 남습니다.',
  'app.settings.reset_all': '모든 로컬 데이터 지우기',
  'app.settings.reset_all_confirm1': '붙여넣은 글을 포함해 이 브라우저의 리드패스트 데이터를 모두 지울까요?',
  'app.settings.reset_all_confirm2': '이 작업은 되돌릴 수 없습니다. 정말 지울까요?',
  'app.settings.install': '앱으로 설치',
  'app.settings.install_help': '홈 화면에 추가하면 처음 불러온 뒤에는 오프라인에서도 쓸 수 있습니다.',
  'app.settings.install_button': '설치',
  'app.settings.install_manual': '휴대폰에서는 브라우저 공유 메뉴의 “홈 화면에 추가”를, PC에서는 주소창의 설치 아이콘을 누르세요.',
  'app.settings.privacy': '개인정보와 붙여넣은 글',
  'app.settings.privacy_body': '앱은 계정이나 서버 저장을 쓰지 않습니다. 붙여넣은 글은 현재 브라우저에만 남고, 앱 화면에는 제3자 분석 자바스크립트가 없습니다.',
  'app.settings.about': '만든 사람',
  'app.settings.about_body': '재료공학 연구자 최승훈이 영어·중국어 글을 읽을 때 쓰려고 만들었습니다. 속도와 이해를 따로 기록하고, 처음 보는 글에서 다시 확인하도록 설계했습니다.',
  'app.settings.source': '소스 코드',
  'app.settings.principles': '원리·출처',
});

registerMessages('en', {
  'app.loading': 'Loading content…',
  'app.theme.light': 'Switch to light theme',
  'app.theme.dark': 'Switch to dark theme',
  'app.leave': 'Stop the current practice? This attempt will not count as completed.',
  'app.unit.en': 'WPM',
  'app.unit.zh': 'characters/min',
  'app.common.start': 'Start',
  'app.common.again': 'Again',
  'app.common.done': 'Done',
  'app.common.open': 'Open',
  'app.common.save': 'Save',
  'app.common.cancel': 'Cancel',
  'app.common.error': 'Something went wrong.',
  'app.common.no_passage': 'No text matches these conditions.',
  'app.common.not_available': 'N/A',
  'app.common.storage_error': 'The browser could not save this change. Check available storage and browser settings.',
  'app.recovery.title': 'Stored data needs recovery',
  'app.recovery.body': 'The existing saved data may be damaged or from a newer version, so this app cannot read it safely. ReadFast did not overwrite it. When browser storage allowed it, the raw text was also copied to a separate recovery key. Download the raw backup before starting with fresh data.',
  'app.recovery.key': 'Browser recovery key: {key}',
  'app.recovery.key_unavailable': 'A browser recovery key could not be created, but the raw backup can still be downloaded before you leave this screen.',
  'app.recovery.download': 'Download unreadable raw backup',
  'app.recovery.start_fresh': 'Start fresh after backup',
  'app.recovery.confirm1': 'Have you checked the raw backup? This will replace the main ReadFast storage key with fresh data.',
  'app.recovery.confirm2': 'The separate recovery key and downloaded file will remain. Start fresh now?',
  'app.difficulty.title': 'Choose a provisional starting difficulty',
  'app.difficulty.lead': 'This is not a language certificate level. Start with a comfortable text. After three unseen attempts, the app can suggest a new provisional difficulty.',
  'app.difficulty.badge': 'App difficulty',
  'app.difficulty.choose': 'Start here',
  'app.difficulty.library': 'Browse all practice first',
  'app.home.eyebrow': 'Today’s practice',
  'app.home.title': 'Your ten-minute session',
  'app.home.lead': 'Prepare briefly, focus on one need, then finish with a different text or retrieval.',
  'app.home.phase': 'Current step',
  'app.home.streak': 'day streak',
  'app.home.maintained': 'maintained-comprehension rate',
  'app.home.need_data': 'More unseen-text attempts are needed',
  'app.home.samples': '{count} qualifying attempts',
  'app.home.today_count': '{count}/3 completed today',
  'app.home.all_unlocked': 'Every practice tool remains directly available.',
  'app.home.recommend_title': 'Starting-difficulty suggestion',
  'app.home.recommend_body': 'Three unseen-text attempts suggest app difficulty {difficulty}. The app will not change it automatically.',
  'app.home.recommend_apply': 'Apply suggestion',
  'app.library.en.title': 'English texts',
  'app.library.zh.title': 'Chinese texts',
  'app.library.en.lead': 'All English passages used in training, grouped by difficulty. The original and the full Korean translation appear together on this page.',
  'app.library.zh.lead': 'All Chinese passages and word-segmentation sentences used in training, grouped by difficulty. The original and the full Korean translation appear together on this page.',
  'app.library.count': '{count} total',
  'app.library.difficulty': 'Difficulty {tier}',
  'app.library.translation': 'View Korean translation',
  'app.library.translation_title': 'Korean full translation',
  'app.library.translation_loading': 'Loading Korean translation…',
  'app.library.translation_failed': 'The translation could not be loaded. Please check the internet connection and try again.',
  'app.library.translation_note': 'This machine translation is a support tool for vocabulary bottlenecks.',
  'app.library.source': 'Original text',
  'app.library.korean': 'Korean full translation',
  'app.library.translation_missing': 'A Korean full translation is unavailable.',
  'app.library.sentences_title': 'Chinese word-segmentation sentences',
  'app.library.sentences_lead': 'Every sentence used in Chinese word-segmentation practice.',
  'app.plan.prepare': 'Prepare',
  'app.plan.focus': 'Focus',
  'app.plan.transfer': 'Transfer or retrieve',
  'app.plan.minutes': 'about {minutes} min',
  'app.plan.repeat': 'Repeat',
  'app.plan.reason.prepare.baseline': 'Preview paragraph openings before the baseline read.',
  'app.plan.reason.focus.baseline': 'Read an unseen text without help and measure rate and comprehension.',
  'app.plan.reason.transfer.baseline': 'Retrieve the main points without looking back.',
  'app.plan.reason.prepare.weakness': 'Preview paragraph structure before focused practice.',
  'app.plan.reason.focus.weakness': 'Practice only the weakest area in recent answers.',
  'app.plan.reason.transfer.weakness': 'Retrieve the key information after practice.',
  'app.plan.reason.prepare.transfer': 'Recall the prior text briefly before the transfer check.',
  'app.plan.reason.focus.transfer': 'After rereading practice, check a related unseen text.',
  'app.plan.reason.transfer.transfer': 'Use an unassisted accurate read for another transfer check.',
  'app.plan.reason.prepare.reassessment': 'Preview paragraph structure before weekly reassessment.',
  'app.plan.reason.focus.reassessment': 'Measure this week’s rate and comprehension on an unseen text.',
  'app.plan.reason.transfer.reassessment': 'Retrieve what you measured without looking back.',
  'app.plan.reason.prepare.maintenance': 'Use paragraph openings to preview text while waiting for reassessment.',
  'app.plan.reason.focus.maintenance': 'Maintain a recent weak area without consuming a new assessment text.',
  'app.plan.reason.transfer.maintenance': 'Retrieve the main points of a text you have already read.',
  'app.phase.baseline': 'Check the current level',
  'app.phase.weakness': 'Practice a weak point',
  'app.phase.transfer': 'Transfer to an unseen text',
  'app.phase.reassessment': 'Weekly reassessment',
  'app.phase.pending': 'Upcoming',
  'app.phase.active': 'Current',
  'app.phase.scheduled': 'Waiting for reassessment',
  'app.phase.done': 'Done',
  'app.phase.progress': '{done}/{goal}',
  'app.phase.next_date': 'Reassess from {date}',
  'app.train.title': 'Practice',
  'app.train.lead': 'Check your current level, then confirm it again with an unseen text. You can open any tool below whenever you need it.',
  'app.train.cycle': 'Current training cycle',
  'app.train.library': 'All practice tools',
  'app.train.library_help': 'Nothing is locked. The two steps are a recommended order; the library is always open.',
  'app.category.core': 'Core practice',
  'app.category.language_support': 'Language support',
  'app.category.practice': 'Practice and experiments',
  'app.category.tool': 'Practical tools',
  'app.mytexts.title': 'My texts',
  'app.mytexts.lead': 'Paste an English or Chinese text you are reading. Auto-generated questions are unvalidated and never affect headline results.',
  'app.mytexts.form_title': 'Save a new text',
  'app.mytexts.title_label': 'Title',
  'app.mytexts.title_placeholder': 'Title is optional',
  'app.mytexts.body_label': 'Text',
  'app.mytexts.body_placeholder.en': 'Paste a paragraph from an English book or paper.',
  'app.mytexts.body_placeholder.zh': 'Paste a paragraph from a Chinese book or paper.',
  'app.mytexts.limit': 'Up to 100,000 characters per text and 1,000,000 total. Current input: {count}.',
  'app.mytexts.saved': 'Saved texts',
  'app.mytexts.empty': 'No saved texts yet.',
  'app.mytexts.remove': 'Remove this text from browser storage?',
  'app.mytexts.remove_label': 'Remove text',
  'app.mytexts.read': 'Check rate and comprehension',
  'app.mytexts.conquer': 'Repeated-reading practice',
  'app.mytexts.triage': 'Three-pass paper tool',
  'app.mytexts.privacy': 'Pasted texts stay in this browser. The app screen loads no third-party analytics script.',
  'app.custom.title': 'Read my text',
  'app.custom.instructions': 'Read normally. An automatically generated cloze check follows.',
  'app.custom.finish': 'Finished · check comprehension',
  'app.custom.quiz': 'Automatic self-check',
  'app.custom.result': 'Automatic questions do not affect the headline rate or difficulty suggestion.',
  'app.custom.no_quiz': 'No automatic questions could be generated, so only the rate was stored.',
  'app.progress.title': 'Progress',
  'app.progress.lead': 'Rate and comprehension stay separate. Only performance that holds on unseen text contributes to the headline.',
  'app.progress.headline': 'Maintained-comprehension rate',
  'app.progress.headline_note': 'Median of recent unseen, unassisted attempts with at least 80% comprehension',
  'app.progress.transfer': 'Unseen-transfer median',
  'app.progress.transfer_note': '{qualified}/{total} attempts at 80% comprehension or higher',
  'app.progress.accuracy': 'Recent accurate reading',
  'app.progress.rate': 'Reading rate',
  'app.progress.comprehension': 'Comprehension',
  'app.progress.rate_curve': 'Rate over time',
  'app.progress.comp_curve': 'Comprehension over time',
  'app.progress.question_types': 'Accuracy by question type',
  'app.progress.main_idea': 'Main idea',
  'app.progress.inference': 'Inference',
  'app.progress.detail': 'Detail',
  'app.progress.other': 'Other questions',
  'app.progress.mode_results': 'Results by reading goal',
  'app.progress.mode.accuracy': 'Read accurately',
  'app.progress.mode.gist': 'Get the gist',
  'app.progress.mode.locate': 'Locate information',
  'app.progress.adjustment': 'Next adjustment',
  'app.progress.adjust.increase': 'Comprehension held twice with low fatigue. Raise the next target rate by about 5%.',
  'app.progress.adjust.hold': 'Keep rate and difficulty steady while collecting more attempts.',
  'app.progress.adjust.decrease': 'Comprehension was below 60% or fatigue was high. Lower only the rate next time.',
  'app.progress.total': '{count} completed v3 attempts',
  'app.progress.legacy': 'Legacy records remain in the backup but do not drive the new headline or cycle.',
  'app.settings.title': 'Settings',
  'app.settings.lead': 'Interface and practice languages are separate. You can also adjust the reading display and timers.',
  'app.settings.language': 'Languages',
  'app.settings.ui_language': 'Interface language',
  'app.settings.training_language': 'Practice language',
  'app.settings.korean': '한국어',
  'app.settings.english': 'English',
  'app.settings.difficulty': 'App difficulty',
  'app.settings.difficulty_help': 'A text-load scale from 1 to 6, not a language certificate level.',
  'app.settings.display': 'Reading display',
  'app.settings.font_size': 'Text size',
  'app.settings.line_height': 'Line spacing',
  'app.settings.width': 'Reading width',
  'app.settings.reduce_motion': 'Reduce motion',
  'app.settings.timer': 'Timer',
  'app.settings.timer_visible': 'Show elapsed time while reading',
  'app.settings.gist_seconds': 'Default gist time',
  'app.settings.seconds': '{value} sec',
  'app.settings.theme': 'Color theme',
  'app.settings.auto': 'Auto',
  'app.settings.light': 'Light',
  'app.settings.dark': 'Dark',
  'app.settings.data': 'Data',
  'app.settings.data_help': 'Records and pasted texts stay in this browser. Move a backup file when changing devices.',
  'app.settings.export': 'Export backup',
  'app.settings.import': 'Import backup',
  'app.settings.imported': 'Backup imported.',
  'app.settings.import_failed': 'Could not import the backup: {reason}',
  'app.settings.reset_progress': 'Reset training records',
  'app.settings.reset_progress_confirm': 'Reset new and legacy training records? Pasted texts and settings will remain.',
  'app.settings.reset_all': 'Erase all local data',
  'app.settings.reset_all_confirm1': 'Erase all ReadFast data in this browser, including pasted texts?',
  'app.settings.reset_all_confirm2': 'This cannot be undone. Erase it?',
  'app.settings.install': 'Install the app',
  'app.settings.install_help': 'After the first successful load, an installed app can also work offline.',
  'app.settings.install_button': 'Install',
  'app.settings.install_manual': 'On a phone, use “Add to Home Screen.” On desktop, use the install icon in the address bar.',
  'app.settings.privacy': 'Privacy and pasted texts',
  'app.settings.privacy_body': 'The app has no account or server storage. Pasted texts remain in this browser, and the app screen contains no third-party analytics JavaScript.',
  'app.settings.about': 'About',
  'app.settings.about_body': 'Materials researcher Seunghoon Choi built ReadFast for reading English and Chinese texts. It records rate and comprehension separately and checks them again on unseen text.',
  'app.settings.source': 'Source code',
  'app.settings.principles': 'Principles and sources',
});

const m = (key, params) => t('app.' + key, params || {});
const view = $('#view');
const ROUTES = ['train', 'mytexts', 'library', 'theory', 'settings'];
const TAB_ICON = { train: 'train', mytexts: 'mytexts', library: 'mytexts', theory: 'theory' };
let lang = store.getSetting('lang') || 'en';
let route = 'train';
let drillActive = false;
let installPrompt = null;

function setDrillActive(active) {
  drillActive = active === true;
  document.body.classList.toggle('drill-mode', drillActive);
}

window.addEventListener('beforeinstallprompt', event => {
  event.preventDefault();
  installPrompt = event;
});

function unitLabel(value = lang) {
  return m(value === 'zh' ? 'unit.zh' : 'unit.en');
}

function locale() {
  return getUILang() === 'ko' ? 'ko-KR' : 'en-US';
}

function formatDate(value) {
  if (!value) return '';
  return new Intl.DateTimeFormat(locale(), { month: 'short', day: 'numeric' }).format(new Date(value));
}

function resolveTheme() {
  const setting = store.getSetting('theme');
  if (setting === 'light' || setting === 'dark') return setting;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function paintThemeToggle(theme) {
  const button = $('#themeToggle');
  if (!button) return;
  button.innerHTML = iconSvg(theme === 'dark' ? 'moon' : 'sun');
  button.setAttribute('title', m(theme === 'dark' ? 'theme.light' : 'theme.dark'));
}

function applyTheme() {
  const theme = resolveTheme();
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', theme === 'dark' ? '#14181d' : '#FCFBF9');
  paintThemeToggle(theme);
}

function applyReadingSettings() {
  const root = document.documentElement;
  const fontSize = Number(store.getSetting('readerFontSize')) || 20;
  const lineHeight = Number(store.getSetting('readerLineHeight')) || 1.75;
  const width = Number(store.getSetting('readerWidth')) || 68;
  root.style.setProperty('--reading-font-size', fontSize + 'px');
  root.style.setProperty('--reading-zh-font-size', Math.round(fontSize * 1.08) + 'px');
  root.style.setProperty('--reading-line-height', String(lineHeight));
  root.style.setProperty('--reading-zh-line-height', String(Math.max(lineHeight, 1.8)));
  root.style.setProperty('--reading-width', width + 'ch');
  root.dataset.reduceMotion = store.getSetting('reduceMotion') ? 'true' : 'false';
  root.dataset.timerVisible = store.getSetting('timerVisible') === false ? 'false' : 'true';
}

function refreshMeta() {
  document.title = getUILang() === 'ko'
    ? '리드패스트 | 읽기 속도와 이해 훈련'
    : 'ReadFast | Reading Rate and Comprehension Practice';
}

function paintTabIcons() {
  $$('.tab').forEach(tab => {
    const target = tab.querySelector('.tab__ico');
    if (target && TAB_ICON[tab.dataset.route]) target.innerHTML = iconSvg(TAB_ICON[tab.dataset.route]);
  });
  const logo = $('.appbar__logo');
  if (logo) logo.innerHTML = iconSvg('brand');
  const gear = $('#settingsBtn');
  if (gear) gear.innerHTML = iconSvg('gear');
}

function syncTrainingLanguage() {
  $$('.seg__btn[data-lang]').forEach(button => {
    setPressed(button, button.dataset.lang === lang);
    button.classList.toggle('is-active', button.dataset.lang === lang);
  });
}

function syncTabs() {
  $$('.tab').forEach(tab => {
    const active = tab.dataset.route === route;
    tab.classList.toggle('is-active', active);
    if (active) tab.setAttribute('aria-current', 'page');
    else tab.removeAttribute('aria-current');
  });
}

function confirmLeave() {
  if (!drillActive) return true;
  const approved = confirm(m('leave'));
  if (approved) {
    runTeardown();
    setDrillActive(false);
  }
  return approved;
}

window.addEventListener('beforeunload', event => {
  if (!drillActive) return;
  event.preventDefault();
  event.returnValue = '';
});

function go(next) {
  if (!ROUTES.includes(next)) return;
  if (drillActive && !confirmLeave()) return;
  route = next;
  if (location.hash.slice(1) !== next) location.hash = next;
  syncTabs();
  render();
}

function render() {
  if (store.getLoadIssue()) return renderRecoveryScreen();
  document.body.classList.remove('recovery-mode');
  runTeardown();
  setDrillActive(false);
  clear(view);
  window.scrollTo(0, 0);
  if (route === 'train') renderTrain();
  else if (route === 'mytexts') renderMyTexts();
  else if (route === 'library') renderLibrary();
  else if (route === 'theory') renderTheory(view);
  else renderSettings();
  translateDocument(view);
  view.focus({ preventScroll: true });
}

function renderRecoveryScreen() {
  const issue = store.getLoadIssue();
  if (!issue) return;
  runTeardown();
  setDrillActive(false);
  document.body.classList.add('recovery-mode');
  clear(view);
  const raw = store.getCorruptBackupText();
  const downloadRaw = () => {
    if (typeof raw !== 'string') return;
    const blob = new Blob([raw], { type: 'text/plain;charset=utf-8' });
    const anchor = h('a', { href: URL.createObjectURL(blob), download: 'readfast-corrupt-backup.txt' });
    document.body.append(anchor);
    anchor.click();
    URL.revokeObjectURL(anchor.href);
    anchor.remove();
  };
  const startFresh = () => {
    if (!confirm(m('recovery.confirm1')) || !confirm(m('recovery.confirm2'))) return;
    try {
      store.startFreshAfterCorruption();
      location.reload();
    } catch (error) {
      alert(error.message || m('common.storage_error'));
    }
  };
  mount(view, h('div', { class: 'fade-in recovery-panel' },
    h('section', { class: 'card' },
      h('h1', { class: 'h1' }, m('recovery.title')),
      h('p', { class: 'lead' }, m('recovery.body')),
      h('div', { class: 'note note--warn', role: 'alert' },
        issue.recoveryKey
          ? m('recovery.key', { key: issue.recoveryKey })
          : m('recovery.key_unavailable')),
      h('div', { class: 'btnrow', style: { marginTop: '16px' } },
        h('button', { class: 'btn btn--primary', disabled: typeof raw !== 'string', onClick: downloadRaw }, m('recovery.download')),
        h('button', { class: 'btn btn--ghost', onClick: startFresh }, m('recovery.start_fresh'))))));
  translateDocument(view);
  view.focus({ preventScroll: true });
}

function currentDifficulty(value = lang) {
  return store.getDifficulty(value);
}

function chooseDifficulty(difficulty, source = 'manual') {
  if (!store.setDifficulty(lang, difficulty, source)) {
    alert(m('common.storage_error'));
    return false;
  }
  render();
  return true;
}

function drillName(drill) {
  return drill?.nameKey ? t(drill.nameKey, {}, drill.name || drill.id) : (drill?.name || drill?.id || '');
}

function drillGoal(drill) {
  return drill?.goalKey ? t(drill.goalKey, {}, drill.goal || '') : (drill?.goal || '');
}

function launch(drill, options = {}) {
  if (!drill || !drill.langs?.includes(lang) || !confirmLeave()) return;
  const from = route === 'train' ? route : 'train';
  const exit = () => {
    runTeardown();
    setDrillActive(false);
    route = from;
    syncTabs();
    render();
  };
  runTeardown();
  setDrillActive(true);
  clear(view);
  window.scrollTo(0, 0);
  drill.render(view, lang, exit, options);
}

function renderDifficultyStart() {
  const cards = DIFFICULTY_ORDER.map(number => h('button', {
    class: 'levelcard',
    onClick: () => chooseDifficulty(number),
  },
  h('div', { class: 'levelcard__top' },
    h('span', { class: 'levelcard__name' }, m('difficulty.badge') + ' ' + number),
    h('span', { class: 'levelcard__sub' }, DIFFICULTIES[number].description[getUILang()])),
  h('span', { class: 'levelcard__desc' }, m('difficulty.choose'))));

  mount(view, h('div', { class: 'fade-in' },
    h('div', { class: 'hero' },
      h('div', { class: 'hero__eyebrow' }, icon('level', { size: 16 }), m('difficulty.badge')),
      h('h1', { class: 'hero__name' }, m('difficulty.title')),
      h('p', { class: 'hero__goal' }, m('difficulty.lead'))),
    h('div', { class: 'levelgrid', style: { marginTop: '16px' } }, ...cards),
    h('div', { class: 'linkrow' },
      h('a', { href: '#train', onClick: event => { event.preventDefault(); go('train'); } }, m('difficulty.library')))));
}

function planAttemptDone(item, cycle, todayAttempts) {
  return todayAttempts.some(attempt => {
    if (attempt.drill !== item.drillId || attempt.completed !== true) return false;
    if (!item.completionStage) return true;
    return program.qualifiesStageAttempt(attempt, item.completionStage, {
      nextReassessmentAt: cycle.nextReassessmentAt,
    });
  });
}

function phaseLabel(id) {
  return m('phase.' + id);
}

function phaseStateLabel(stage) {
  return m('phase.' + stage.status);
}

function renderHome() {
  if (!currentDifficulty()) return renderDifficultyStart();
  const cycle = program.cycleStatus(lang);
  const plan = program.buildDailyPlan(lang);
  const todayAttempts = store.attemptsToday(lang);
  const maintained = metrics.maintainedRate(store.attemptsFor(lang), { lang });
  const stableMaintainedRate = maintained.count >= 2 ? maintained.rate : null;
  const streak = store.streakFor(lang);
  const recommendation = program.difficultyRecommendation(lang);
  const done = plan.filter(item => planAttemptDone(item, cycle, todayAttempts)).length;

  const status = h('div', { class: 'today-status' },
    h('div', { class: 'status-metrics' },
      h('div', { class: 'metric' },
        h('span', { class: 'metric__num' }, icon('target', { size: 17 }), phaseLabel(cycle.phase)),
        h('span', { class: 'metric__lbl' }, m('home.phase'))),
      h('div', { class: 'metric' },
        h('span', { class: 'metric__num' }, String(streak.count || 0)),
        h('span', { class: 'metric__lbl' }, m('home.streak'))),
      h('div', { class: 'metric' },
        h('span', { class: 'metric__num' }, stableMaintainedRate == null ? m('common.not_available') : Math.round(stableMaintainedRate)),
        h('span', { class: 'metric__lbl' }, m('home.maintained') + ' · ' + unitLabel()))),
    h('button', { class: 'level-pill', onClick: () => go('settings') },
      icon('level', { size: 14 }), difficultyLabel(currentDifficulty(), getUILang())));

  const blocks = plan.map((item, index) => {
    const drill = DRILL_BY_ID[item.drillId];
    const isDone = planAttemptDone(item, cycle, todayAttempts);
    const options = item.slot === 'focus'
      ? {
        programStage: item.programStage,
        targeted: !!item.targeted,
        targetDrill: item.targetDrill,
        targetSubmode: item.targetSubmode,
        weaknessType: item.weaknessType,
        source: 'daily-plan',
      }
      : { source: 'daily-plan' };
    return h('article', { class: 'plan-block', 'data-status': isDone ? 'done' : 'pending' },
      h('span', { class: 'plan-block__index' }, isDone ? icon('check', { size: 16 }) : String(index + 1)),
      h('div', { class: 'plan-block__body' },
        h('div', { class: 'plan-block__head' },
          h('h2', { class: 'plan-block__title' }, m('plan.' + item.slot) + ' · ' + drillName(drill)),
          h('span', { class: 'plan-block__time' }, m('plan.minutes', { minutes: item.minutes }))),
        h('p', { class: 'plan-block__reason' }, m('plan.reason.' + item.reasonKey)),
        h('button', { class: 'btn' + (!isDone ? ' btn--primary' : ''), onClick: () => launch(drill, options) },
          isDone ? m('plan.repeat') : m('common.start'))));
  });

  const recommendationCard = recommendation.ready && recommendation.difficulty !== currentDifficulty()
    ? h('div', { class: 'note note--good' },
      h('div', { class: 'row spread' },
        h('div', null,
          h('b', null, m('home.recommend_title')),
          h('p', { class: 'small', style: { margin: '4px 0 0' } }, m('home.recommend_body', { difficulty: recommendation.difficulty }))),
        h('button', { class: 'btn', onClick: () => chooseDifficulty(recommendation.difficulty, 'benchmark-provisional') }, m('home.recommend_apply'))))
    : null;

  mount(view, h('div', { class: 'fade-in' },
    status,
    h('div', { class: 'hero', style: { marginTop: '16px' } },
      h('div', { class: 'hero__eyebrow' }, icon('today', { size: 15 }), m('home.eyebrow')),
      h('h1', { class: 'hero__name' }, m('home.title')),
      h('p', { class: 'hero__goal' }, m('home.lead')),
      h('div', { class: 'small muted', style: { marginTop: '10px' } }, m('home.today_count', { count: done }))),
    recommendationCard,
    h('div', { class: 'daily-plan', style: { marginTop: '14px' } }, ...blocks),
    maintained.count < 2
      ? h('p', { class: 'small muted' }, m('home.need_data') + ' · ' + m('home.samples', { count: maintained.count }))
      : h('p', { class: 'small muted' }, m('home.samples', { count: maintained.count })),
    h('div', { class: 'linkrow' },
      h('a', { href: '#train', onClick: event => { event.preventDefault(); go('train'); } }, m('home.all_unlocked')),
      h('a', { href: '#theory', onClick: event => { event.preventDefault(); go('theory'); } }, t('shell.nav.theory'))),
    content.data().isSeed ? h('div', { class: 'note note--warn' }, m('common.no_passage')) : null));
}

function renderCycle(cycle) {
  const visibleStages = cycle.stages.filter(stage => ['baseline', 'transfer'].includes(stage.id));
  return h('div', { class: 'training-cycle' }, ...visibleStages.map((stage, index) =>
    h('article', {
      class: 'cycle-step' + (stage.status === 'active' || stage.status === 'scheduled' ? ' is-current' : '') + (stage.status === 'done' ? ' is-done' : ''),
      'data-state': stage.status === 'done' ? 'done' : (stage.status === 'active' || stage.status === 'scheduled' ? 'current' : 'pending'),
    },
    h('span', { class: 'cycle-step__num' }, stage.status === 'done' ? icon('check', { size: 16 }) : String(index + 1)),
    h('div', null,
      h('h3', { class: 'cycle-step__title' }, phaseLabel(stage.id)),
      h('p', { class: 'cycle-step__meta' },
        phaseStateLabel(stage) + ' · ' + m('phase.progress', { done: stage.done, goal: stage.goal })),
      stage.id === 'reassessment' && stage.status === 'scheduled'
        ? h('p', { class: 'small muted' }, m('phase.next_date', { date: formatDate(cycle.nextReassessmentAt) }))
        : null))));
}

function drillTile(drill) {
  return h('button', { class: 'tile', onClick: () => launch(drill) },
    h('div', { class: 'tile__top' },
      h('span', { class: 'iconchip' }, icon(DRILL_ICON[drill.id] || drill.id)),
      h('span', { class: 'tile__name' }, drillName(drill))),
    h('span', { class: 'tile__goal' }, drillGoal(drill)));
}

function renderTrain() {
  const cycle = program.cycleStatus(lang);
  const categories = ['core', 'language_support', 'practice', 'tool'];
  const groups = categories.map(category => {
    const drills = DRILLS.filter(drill => drill.langs.includes(lang) && (drill.category || 'practice') === category);
    if (!drills.length) return null;
    return h('section', null,
      h('p', { class: 'track-label' }, m('category.' + category)),
      h('div', { class: 'tiles' }, ...drills.map(drillTile)));
  }).filter(Boolean);

  mount(view, h('div', { class: 'fade-in' },
    h('h1', { class: 'h1' }, m('train.title')),
    h('p', { class: 'lead' }, m('train.lead')),
    h('section', { class: 'card' },
      h('h2', { class: 'h2' }, m('train.cycle')),
      renderCycle(cycle)),
    h('details', { class: 'drill-library', open: true },
      h('summary', null, m('train.library')),
      h('div', { class: 'drill-library__body' },
        h('p', { class: 'small muted' }, m('train.library_help')),
        ...groups))));
}

function libraryPassageCard(passage, libraryLang) {
  const unit = libraryLang === 'zh' ? '자' : 'words';
  const translated = content.koreanTranslationTextFor(passage) || m('library.translation_missing');
  return h('article', { class: 'card library-passage' },
    h('div', { class: 'row spread' },
      h('strong', null, passage.title || m('common.no_passage')),
      h('span', { class: 'small muted' }, `${passage.unit_count || countUnits(passage.text, libraryLang)} ${unit}`)),
    h('div', { class: 'library-passage__pair' },
      h('section', null,
        h('h3', { class: 'library-passage__heading' }, m('library.source')),
        h('div', { class: 'library-passage__text', lang: libraryLang === 'zh' ? 'zh-Hans' : 'en', 'data-lang': libraryLang }, passage.text)),
      h('section', null,
        h('h3', { class: 'library-passage__heading' }, m('library.korean')),
        h('div', { class: 'library-passage__text library-passage__text--ko', lang: 'ko' }, translated))));
}

function renderLibrary() {
  const libraryLang = lang;
  const passages = content.passagesFor(libraryLang).slice().sort((a, b) => a.tier - b.tier || String(a.id).localeCompare(String(b.id)));
  const tiers = [...new Set(passages.map(passage => passage.tier))];
  const groups = tiers.map(tier => {
    const rows = passages.filter(passage => passage.tier === tier);
    return h('section', { style: { marginTop: '24px' } },
      h('div', { class: 'row spread' },
        h('h2', { class: 'h2', style: { margin: 0 } }, m('library.difficulty', { tier })),
        h('span', { class: 'small muted' }, m('library.count', { count: rows.length }))),
      h('div', { class: 'stack', style: { marginTop: '10px' } }, ...rows.map(passage => libraryPassageCard(passage, libraryLang))));
  });
  const segmentation = libraryLang === 'zh' ? (content.data()?.segZh?.sentences || []).map((item, index) =>
    libraryPassageCard({ id: `zhseg-library-${index}`, title: item.text, text: item.text, lang: 'zh', unit_count: countUnits(item.text, 'zh') }, 'zh')) : [];
  mount(view, h('div', { class: 'fade-in' },
    h('h1', { class: 'h1' }, m(`library.${libraryLang}.title`)),
    h('p', { class: 'lead' }, m(`library.${libraryLang}.lead`)),
    h('p', { class: 'small muted' }, m('library.count', { count: passages.length })),
    ...groups,
    segmentation.length ? h('section', { style: { marginTop: '28px' } },
      h('h2', { class: 'h2' }, m('library.sentences_title')),
      h('p', { class: 'small muted' }, m('library.sentences_lead')),
      h('div', { class: 'stack', style: { marginTop: '10px' } }, ...segmentation)) : null));
}

function detectLang(text) {
  return /[㐀-鿿]/.test(text) ? 'zh' : 'en';
}

function renderMyTexts() {
  const titleInput = h('input', { type: 'text', placeholder: m('mytexts.title_placeholder') });
  const bodyInput = h('textarea', { placeholder: m('mytexts.body_placeholder.' + lang), maxlength: store.MY_TEXT_MAX_CHARS });
  const counter = h('p', { class: 'small muted' }, m('mytexts.limit', { count: 0 }));
  const errorBox = h('div');
  bodyInput.addEventListener('input', () => {
    counter.textContent = m('mytexts.limit', { count: bodyInput.value.length });
  });
  const saveText = () => {
    const text = bodyInput.value.trim();
    try {
      const textLang = detectLang(text);
      store.addMyText({
        title: titleInput.value.trim() || text.slice(0, 36),
        text,
        lang: textLang,
        unit_count: countUnits(text, textLang),
      });
      renderMyTexts();
    } catch (error) {
      mount(errorBox, h('div', { class: 'storage-alert note note--warn', role: 'alert' }, error.message || m('common.storage_error')));
    }
  };

  const rows = store.myTexts();
  const cards = rows.length ? rows.map(row => h('article', { class: 'card' },
    h('div', { class: 'row spread' },
      h('div', null,
        h('h2', { class: 'h2', style: { margin: 0 } }, row.title),
        h('p', { class: 'small muted', style: { margin: '4px 0 0' } },
          (row.lang === 'zh' ? '中文' : 'English') + ' · ' + row.unit_count + ' ' + (row.lang === 'zh' ? '字' : 'words'))),
      h('button', {
        class: 'iconbtn', title: m('mytexts.remove_label'), 'aria-label': m('mytexts.remove_label'),
        onClick: () => {
          if (!confirm(m('mytexts.remove'))) return;
          try { store.removeMyText(row.id); renderMyTexts(); }
          catch (error) { alert(error.message || m('common.storage_error')); }
        },
      }, icon('trash', { size: 18 }))),
    h('div', { class: 'btnrow', style: { marginTop: '12px' } },
      h('button', { class: 'btn btn--primary', onClick: () => runCustomReading(row) }, m('mytexts.read')),
      h('button', {
        class: 'btn',
        onClick: () => {
          clear(view);
          setDrillActive(true);
          conquer.render(view, row.lang, backToTexts, { customText: row });
        },
      }, m('mytexts.conquer')),
      h('button', {
        class: 'btn',
        onClick: () => {
          clear(view);
          setDrillActive(true);
          triage.render(view, row.lang, backToTexts, { customText: row });
        },
      }, m('mytexts.triage'))))) : [h('div', { class: 'empty' }, m('mytexts.empty'))];

  mount(view, h('div', { class: 'fade-in' },
    h('h1', { class: 'h1' }, m('mytexts.title')),
    h('p', { class: 'lead' }, m('mytexts.lead')),
    h('div', { class: 'privacy-card note' }, m('mytexts.privacy')),
    h('section', { class: 'card' },
      h('h2', { class: 'h2' }, m('mytexts.form_title')),
      h('label', { class: 'field' }, m('mytexts.title_label'), titleInput),
      h('label', { class: 'field', style: { marginTop: '12px' } }, m('mytexts.body_label'), bodyInput),
      counter,
      errorBox,
      h('div', { class: 'btnrow' }, h('button', { class: 'btn btn--primary', onClick: saveText }, m('common.save')))),
    h('p', { class: 'track-label' }, m('mytexts.saved')),
    ...cards));
}

function backToTexts() {
  runTeardown();
  setDrillActive(false);
  route = 'mytexts';
  syncTabs();
  renderMyTexts();
}

function fatigueValue(value) {
  if (Number.isInteger(value)) return value;
  return { low: 2, medium: 3, high: 5 }[value] || 3;
}

function runCustomReading(row) {
  clear(view);
  window.scrollTo(0, 0);
  setDrillActive(true);
  const units = row.unit_count || countUnits(row.text, row.lang);
  const startedAt = new Date().toISOString();
  const timerText = h('span', { class: 'hud__timer' }, '0:00');
  const timer = startTimer(ms => { timerText.textContent = fmtClock(ms); });
  setTeardown(() => timer.stop());

  const finishReading = () => {
    const elapsedMs = timer.stop();
    const rate = elapsedMs > 0 ? units / (elapsedMs / 60000) : 0;
    const items = content.autoCloze(row.text, row.lang, 4);
    const finish = quiz => {
      askFatigue(view, m('custom.title'), backToTexts).then(fatigue => {
        const timing = timingValidity(units, elapsedMs, row.lang);
        const difficulty = store.getDifficulty(row.lang) || 3;
        const saved = recordAttempt({
          lang: row.lang, difficulty, tier: difficulty,
          drill: 'mytext', submode: 'custom', benchmark: false,
          startedAt, completed: true, sourcePassageId: row.id,
          transferPassageId: null, novelAtStart: false, assisted: true,
          timingValid: timing.timingValid, units, elapsedMs: Math.round(elapsedMs),
          rate: Math.round(rate), correct: quiz?.correct ?? null, total: quiz?.total ?? null,
          questionTypes: quiz?.questionTypes || {}, fatigue: fatigueValue(fatigue),
        });
        setDrillActive(false);
        mount(view,
          resultCard([
            [Math.round(rate), unitLabel(row.lang), m('progress.rate')],
            [quiz ? Math.round(quiz.frac * 100) + '%' : m('common.not_available'), m('progress.comprehension'), quiz ? quiz.correct + '/' + quiz.total : ''],
          ], () => runCustomReading(row), backToTexts,
          h('div', { class: 'stack' },
            h('p', { class: 'small muted' }, quiz ? m('custom.result') : m('custom.no_quiz')),
            attemptErrorNote(saved))));
      });
    };
    if (!items.length) return finish(null);
    const host = h('div');
    mount(view, h('div', { class: 'hud' }, h('span', { class: 'chip' }, m('custom.quiz'))), host);
    compQuiz(host, items, m('custom.quiz')).then(finish);
  };

  mount(view,
    h('div', { class: 'hud' },
      h('button', { class: 'iconbtn', onClick: () => { timer.stop(); backToTexts(); }, 'aria-label': t('drill.shared.back') }, '‹'),
      h('span', { class: 'chip' }, units + ' ' + (row.lang === 'zh' ? '字' : 'words')),
      timerText),
    h('div', { class: 'note small' }, m('custom.instructions')),
    h('div', { class: 'card' },
      h('div', { class: 'eyebrow' }, row.title),
      h('div', { class: 'reader', lang: row.lang === 'zh' ? 'zh-Hans' : 'en', 'data-lang': row.lang },
        h('div', { class: 'reader-wrap' }, row.text))),
    h('div', { class: 'btnrow', style: { marginTop: '12px' } },
      h('button', { class: 'btn btn--primary btn--lg', onClick: finishReading }, m('custom.finish'))));
}

function metricCard(value, label, note, modifier = '') {
  return h('div', { class: 'result-metric ' + modifier },
    h('span', { class: 'result-metric__label' }, label),
    h('strong', { class: 'result-metric__value' }, value),
    note ? h('span', { class: 'result-metric__note' }, note) : null);
}

function renderProgress() {
  const attempts = store.attemptsFor(lang, { completed: true });
  const maintained = metrics.maintainedRate(attempts, { lang });
  const accurate = metrics.speedAndComprehension(attempts, { lang, submode: 'accuracy', limit: 12 });
  const types = metrics.questionTypeAccuracy(attempts, { lang, submode: 'accuracy' });
  const adjustment = metrics.recommendAdjustment(attempts, { lang });
  const accurateRows = attempts.filter(row => row.submode === 'accuracy' && row.timingValid !== false).slice(-12);
  const transferRows = attempts.filter(metrics.isColdTransferAttempt).slice(-12);
  const qualifiedTransferRows = transferRows.filter(row => (
    metrics.comprehensionOf(row) >= 0.8 && Number.isFinite(row.rate)
  ));
  const transferRates = qualifiedTransferRows.map(row => row.rate);
  const transferMedian = transferRates.length ? median(transferRates) : null;
  const modeRows = ['accuracy', 'gist', 'locate'].map(submode => ({
    submode,
    result: metrics.speedAndComprehension(attempts, { lang, submode, limit: 10 }),
  }));

  const breakdown = Object.entries(types).length
    ? Object.entries(types).map(([type, result]) => {
      const percent = result.accuracy == null ? 0 : Math.round(result.accuracy * 100);
      const known = ['main_idea', 'inference', 'detail'].includes(type) ? type : 'other';
      return h('div', { class: 'breakdown-row' },
        h('span', { class: 'breakdown-row__label' }, m('progress.' + known)),
        h('div', { class: 'breakdown-row__track' }, h('div', { class: 'breakdown-row__fill', style: { width: percent + '%' } })),
        h('strong', { class: 'breakdown-row__value' }, percent + '% · ' + result.correct + '/' + result.total));
    })
    : [h('p', { class: 'small muted' }, t('common.noData'))];

  const rateValues = accurateRows.map(row => row.rate).filter(Number.isFinite);
  const compValues = accurateRows.map(row => metrics.comprehensionOf(row)).filter(Number.isFinite).map(value => Math.round(value * 100));

  mount(view, h('div', { class: 'fade-in' },
    h('h1', { class: 'h1' }, m('progress.title')),
    h('p', { class: 'lead' }, m('progress.lead')),
    h('section', { class: 'card' },
      h('h2', { class: 'h2' }, m('progress.headline')),
      h('div', { class: 'result-grid' },
        metricCard(maintained.count < 2 || maintained.rate == null ? m('common.not_available') : Math.round(maintained.rate), unitLabel(), m('home.samples', { count: maintained.count }), 'result-metric--rate'),
        metricCard(
          transferMedian == null ? m('common.not_available') : Math.round(transferMedian),
          m('progress.transfer') + ' · ' + unitLabel(),
          m('progress.transfer_note', { qualified: qualifiedTransferRows.length, total: transferRows.length }),
          'result-metric--rate'),
        metricCard(accurate.meanComprehension == null ? m('common.not_available') : Math.round(accurate.meanComprehension * 100) + '%', m('progress.accuracy'), m('progress.comprehension'), 'result-metric--comprehension')),
      h('p', { class: 'small muted' }, m('progress.headline_note'))),
    h('div', { class: 'settings-grid' },
      h('section', { class: 'card setting-card' },
        h('h2', { class: 'h2' }, m('progress.rate_curve')),
        rateValues.length > 1 ? sparkline(rateValues, 340, 80) : h('p', { class: 'small muted' }, t('common.noData'))),
      h('section', { class: 'card setting-card' },
        h('h2', { class: 'h2' }, m('progress.comp_curve')),
        compValues.length > 1 ? sparkline(compValues, 340, 80) : h('p', { class: 'small muted' }, t('common.noData')))),
    h('section', { class: 'card question-breakdown' },
      h('h2', { class: 'h2' }, m('progress.question_types')),
      ...breakdown),
    h('section', { class: 'card' },
      h('h2', { class: 'h2' }, m('progress.mode_results')),
      h('div', { class: 'result-grid' }, ...modeRows.map(row =>
        metricCard(
          row.result.meanComprehension == null ? m('common.not_available') : Math.round(row.result.meanComprehension * 100) + '%',
          m('progress.mode.' + row.submode),
          row.result.medianRate == null ? '' : Math.round(row.result.medianRate) + ' ' + unitLabel(),
          'result-metric--comprehension')))),
    h('section', { class: 'card next-recommendation' },
      h('h2', { class: 'h2' }, m('progress.adjustment')),
      h('p', null, m('progress.adjust.' + adjustment.action))),
    h('p', { class: 'small muted' }, m('progress.total', { count: attempts.length }) + ' · ' + m('progress.legacy'))));
}

function choiceButton(label, active, onClick) {
  return h('button', {
    class: 'btn' + (active ? ' btn--primary' : ''),
    'aria-pressed': active ? 'true' : 'false',
    onClick,
  }, label);
}

function saveSetting(key, value, rerender = false) {
  if (!store.setSetting(key, value)) {
    alert(m('common.storage_error'));
    return false;
  }
  applyReadingSettings();
  if (rerender) renderSettings();
  return true;
}

function rangeSetting(key, label, min, max, step, value, formatter) {
  const id = 'setting-' + key;
  const output = h('output', { for: id }, formatter(value));
  const input = h('input', {
    id, type: 'range', min, max, step, value,
    onInput: event => {
      const next = Number(event.target.value);
      output.textContent = formatter(next);
      saveSetting(key, next);
    },
  });
  return h('div', { class: 'setting-row' },
    h('label', { class: 'setting-row__label', for: id }, label),
    h('div', { class: 'setting-row__control' }, input, output));
}

function renderSettings() {
  const theme = store.getSetting('theme') || 'auto';
  const difficulty = currentDifficulty();
  const fileInput = h('input', { type: 'file', accept: '.json,application/json', style: { display: 'none' } });
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    try {
      store.importJSON(await file.text());
      alert(m('settings.imported'));
      lang = store.getSetting('lang') || 'en';
      applyTheme();
      applyReadingSettings();
       go('train');
    } catch (error) {
      alert(m('settings.import_failed', { reason: error.code || error.message || m('common.error') }));
    }
  });

  const exportData = () => {
    const blob = new Blob([store.exportJSON()], { type: 'application/json' });
    const anchor = h('a', { href: URL.createObjectURL(blob), download: 'readfast-backup-v3.json' });
    document.body.append(anchor);
    anchor.click();
    URL.revokeObjectURL(anchor.href);
    anchor.remove();
  };

  mount(view, h('div', { class: 'fade-in' },
    h('h1', { class: 'h1' }, m('settings.title')),
    h('p', { class: 'lead' }, m('settings.lead')),
    h('div', { class: 'settings-grid' },
      h('section', { class: 'card setting-card' },
        h('h2', { class: 'h2' }, m('settings.language')),
        h('div', { class: 'setting-row' },
          h('span', { class: 'setting-row__label' }, m('settings.ui_language')),
          h('div', { class: 'choice-group setting-row__control' },
            choiceButton(m('settings.korean'), getUILang() === 'ko', () => setUILang('ko')),
            choiceButton(m('settings.english'), getUILang() === 'en', () => setUILang('en')))),
        h('div', { class: 'setting-row' },
          h('span', { class: 'setting-row__label' }, m('settings.training_language')),
          h('div', { class: 'choice-group setting-row__control' },
            choiceButton('English', lang === 'en', () => changeTrainingLanguage('en')),
            choiceButton('中文', lang === 'zh', () => changeTrainingLanguage('zh'))))),
      h('section', { class: 'card setting-card' },
        h('h2', { class: 'h2' }, m('settings.difficulty')),
        h('p', { class: 'small muted' }, m('settings.difficulty_help')),
        h('div', { class: 'choice-group', style: { marginTop: '10px' } },
          ...DIFFICULTY_ORDER.map(number => choiceButton(
            number + ' · ' + DIFFICULTIES[number].description[getUILang()],
            difficulty === number,
            () => chooseDifficulty(number))))),
      h('section', { class: 'card setting-card' },
        h('h2', { class: 'h2' }, m('settings.display')),
        rangeSetting('readerFontSize', m('settings.font_size'), 16, 30, 1, Number(store.getSetting('readerFontSize')) || 20, value => value + 'px'),
        rangeSetting('readerLineHeight', m('settings.line_height'), 1.4, 2.2, 0.1, Number(store.getSetting('readerLineHeight')) || 1.75, value => Number(value).toFixed(1)),
        rangeSetting('readerWidth', m('settings.width'), 42, 82, 2, Number(store.getSetting('readerWidth')) || 68, value => value + 'ch'),
        h('label', { class: 'setting-row' },
          h('span', { class: 'setting-row__label' }, m('settings.reduce_motion')),
          h('input', {
            type: 'checkbox', checked: !!store.getSetting('reduceMotion'),
            onChange: event => saveSetting('reduceMotion', event.target.checked),
          }))),
      h('section', { class: 'card setting-card timer-controls' },
        h('h2', { class: 'h2' }, m('settings.timer')),
        h('label', { class: 'setting-row' },
          h('span', { class: 'setting-row__label' }, m('settings.timer_visible')),
          h('input', {
            type: 'checkbox', checked: store.getSetting('timerVisible') !== false,
            onChange: event => saveSetting('timerVisible', event.target.checked),
          })),
        rangeSetting('gistSeconds', m('settings.gist_seconds'), 20, 180, 10, Number(store.getSetting('gistSeconds')) || 60, value => m('settings.seconds', { value }))),
      h('section', { class: 'card setting-card' },
        h('h2', { class: 'h2' }, m('settings.theme')),
        h('div', { class: 'choice-group' },
          ...['auto', 'light', 'dark'].map(value => choiceButton(m('settings.' + value), theme === value, () => {
            if (store.setSetting('theme', value)) {
              applyTheme();
              renderSettings();
            } else alert(m('common.storage_error'));
          }))))),
    h('section', { class: 'card privacy-card' },
      h('h2', { class: 'h2' }, m('settings.privacy')),
      h('p', null, m('settings.privacy_body'))),
    h('section', { class: 'card' },
      h('h2', { class: 'h2' }, m('settings.data')),
      h('p', { class: 'small muted' }, m('settings.data_help')),
      h('div', { class: 'btnrow' },
        h('button', { class: 'btn btn--primary', onClick: exportData }, m('settings.export')),
        h('button', { class: 'btn', onClick: () => fileInput.click() }, m('settings.import')),
        fileInput),
      h('hr', { class: 'sep' }),
      h('div', { class: 'btnrow' },
        h('button', {
          class: 'btn btn--ghost',
          onClick: () => {
            if (confirm(m('settings.reset_progress_confirm'))) {
              try {
                store.resetProgress();
                 go('train');
              } catch (error) {
                alert(error.message || m('common.storage_error'));
              }
            }
          },
        }, m('settings.reset_progress')),
        h('button', {
          class: 'btn btn--ghost',
          style: { color: 'var(--bad)' },
          onClick: () => {
            if (confirm(m('settings.reset_all_confirm1')) && confirm(m('settings.reset_all_confirm2'))) {
              try {
                store.resetEverything();
                 go('train');
              } catch (error) {
                alert(error.message || m('common.storage_error'));
              }
            }
          },
        }, m('settings.reset_all')))),
    h('section', { class: 'card' },
      h('h2', { class: 'h2' }, m('settings.install')),
      h('p', { class: 'small muted' }, installPrompt ? m('settings.install_help') : m('settings.install_manual')),
      installPrompt ? h('button', { class: 'btn btn--primary', onClick: () => installPrompt.prompt() }, icon('install', { size: 18 }), m('settings.install_button')) : null),
    h('section', { class: 'card' },
      h('h2', { class: 'h2' }, m('settings.about')),
      h('p', null, m('settings.about_body')),
      h('div', { class: 'linkrow' },
        h('a', { href: 'https://seunghoonchoi.com', target: '_blank', rel: 'noopener' }, 'seunghoonchoi.com'),
        h('a', { href: 'https://github.com/seunghoonchoi-phd/reading-trainer', target: '_blank', rel: 'noopener' }, m('settings.source')),
        h('a', { href: '#theory', onClick: event => { event.preventDefault(); go('theory'); } }, m('settings.principles'))))));
}

function changeTrainingLanguage(next) {
  if (next === lang || !['en', 'zh'].includes(next) || !confirmLeave()) return;
  if (!store.setSetting('lang', next)) {
    alert(m('common.storage_error'));
    return;
  }
  lang = next;
  syncTrainingLanguage();
  render();
}

$('.appbar__brand')?.addEventListener('click', () => go('train'));
$('#settingsBtn')?.addEventListener('click', () => go('settings'));
$('#uiLangToggle')?.addEventListener('click', event => {
  if (drillActive && !confirmLeave()) {
    event.preventDefault();
    event.stopImmediatePropagation();
  }
}, true);
$('#themeToggle')?.addEventListener('click', () => {
  const next = resolveTheme() === 'dark' ? 'light' : 'dark';
  if (store.setSetting('theme', next)) applyTheme();
  else alert(m('common.storage_error'));
});
$$('.tab').forEach(tab => tab.addEventListener('click', () => go(tab.dataset.route)));
$$('.seg__btn[data-lang]').forEach(button => button.addEventListener('click', () => changeTrainingLanguage(button.dataset.lang)));

window.addEventListener('hashchange', () => {
  const next = location.hash.slice(1);
  if (!ROUTES.includes(next) || next === route) return;
  if (!confirmLeave()) {
    location.hash = route;
    return;
  }
  route = next;
  syncTabs();
  render();
});

window.addEventListener('readfast:ui-language-change', () => {
  refreshMeta();
  paintThemeToggle(resolveTheme());
  render();
});

window.addEventListener('readfast:storage-error', () => {
  alert(m('common.storage_error'));
});

window.addEventListener('readfast:drill-state', event => setDrillActive(event.detail?.active === true));

window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change', () => {
  if ((store.getSetting('theme') || 'auto') === 'auto') applyTheme();
});

async function boot() {
  initI18n();
  refreshMeta();
  applyTheme();
  applyReadingSettings();
  paintTabIcons();
  const hash = location.hash.slice(1);
  if (hash === 'home') {
    route = 'train';
    history.replaceState(null, '', `${location.pathname}${location.search}#train`);
  } else if (ROUTES.includes(hash)) route = hash;
  syncTabs();
  syncTrainingLanguage();
  if (store.getLoadIssue()) {
    renderRecoveryScreen();
    return;
  }
  view.innerHTML = '<div class="empty">' + m('loading') + '</div>';
  await content.loadContent();
  render();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
}

boot();
