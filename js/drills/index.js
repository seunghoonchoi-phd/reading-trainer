// ===== drills/index.js — registry, ordered by the skill ladder: coverage → phrase/sentence fluency → rate → strategy =====
import vocab from './vocab.js';
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

export const DRILLS = [vocab, chunk, sentence, conquer, err, repeated, context, modes, triage, retrieval, zhseg, zhchar, preview];
export const DRILL_BY_ID = Object.fromEntries(DRILLS.map(d => [d.id, d]));

// track order for the free-play catalog — coverage first (the app's own program)
export const TRACKS = ['커버리지', '유창성 기초', '속도', '전략', '중국어', '구조 활용'];
