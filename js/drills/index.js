// ===== drills/index.js — registry, ordered by the coverage-first → rate → strategy program =====
import vocab from './vocab.js';
import conquer from './conquer.js';
import err from './err.js';
import repeated from './repeated.js';
import modes from './modes.js';
import triage from './triage.js';
import retrieval from './retrieval.js';
import zhseg from './zhseg.js';
import zhchar from './zhchar.js';
import preview from './preview.js';

export const DRILLS = [vocab, conquer, err, repeated, modes, triage, retrieval, zhseg, zhchar, preview];
export const DRILL_BY_ID = Object.fromEntries(DRILLS.map(d => [d.id, d]));

// track order for the catalog — coverage first (the app's own program)
export const TRACKS = ['커버리지', '속도', '전략', '중국어', '구조 활용'];
