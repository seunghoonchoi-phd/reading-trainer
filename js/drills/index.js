// ===== drills/index.js — unlocked catalog grouped by training role =====
import chunk from './chunk.js';
import sentence from './sentence.js';
import conquer from './conquer.js';
import err from './err.js';
import repeated from './repeated.js';
import context from './context.js';
import modes from './modes.js';
import triage from './triage.js';
import retrieval from './retrieval.js';
import zhseg from './zhseg.js';
import zhchar from './zhchar.js';
import preview from './preview.js';
import { registerDrillMessages, DRILL_MESSAGES } from './messages.js';

registerDrillMessages();
export { DRILL_MESSAGES };

export const DRILLS = [
  err, repeated, modes,
  chunk, zhchar, zhseg,
  conquer, sentence, context, retrieval, preview,
  triage,
];
export const DRILL_BY_ID = Object.fromEntries(DRILLS.map(d => [d.id, d]));

export const CATEGORY_ORDER = ['core', 'language_support', 'practice', 'tool'];
export const CATEGORY_KEYS = {
  core: 'drill.category.core',
  language_support: 'drill.category.language_support',
  practice: 'drill.category.practice',
  tool: 'drill.category.tool',
};

// Legacy app.js compatibility. New UI should use CATEGORY_ORDER/CATEGORY_KEYS.
export const TRACKS = ['핵심 훈련', '언어 보조', '연습', '실전 도구'];
