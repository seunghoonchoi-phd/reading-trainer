// ===== icons.js — one unified line-icon language (academic, currentColor) =====
// Replaces the old emoji (tiles) + geometric-glyph (tabs) double system.
const SVG = (inner, sw = 1.7) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${inner}</svg>`;

export const ICONS = {
  /* ---- drills (keyed by drill id) ---- */
  vocab:     SVG('<path d="M13 3 5 13h6l-1 8 8-11h-6l1-7Z"/>'),                                   // bolt — recognition speed
  conquer:   SVG('<path d="M3 20h18"/><path d="m4 20 6-13 4 7 2-3 4 9"/><path d="M10 7V3l4 2-4 2"/>'), // peak + summit flag
  err:       SVG('<path d="M12 6c-1.7-1.1-3.8-1.8-6-1.8-1 0-2 .15-3 .4v13.2c1-.25 2-.4 3-.4 2.2 0 4.3.7 6 1.8 1.7-1.1 3.8-1.8 6-1.8 1 0 2 .15 3 .4V4.6c-1-.25-2-.4-3-.4-2.2 0-4.3.7-6 1.8Z"/><path d="M12 6v13.2"/>'), // open book
  repeated:  SVG('<path d="M3 11a8.5 8.5 0 0 1 14.5-5L20 8"/><path d="M20 3.5V8h-4.5"/><path d="M21 13a8.5 8.5 0 0 1-14.5 5L4 16"/><path d="M4 20.5V16h4.5"/>'), // loop
  modes:     SVG('<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3.1"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>'), // target — choose depth
  triage:    SVG('<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z"/><path d="M14 3v5h5"/><path d="M8.5 12.5h7M8.5 16h4"/>'), // paper, 3-pass
  retrieval: SVG('<path d="M9.5 18h5"/><path d="M10 21h4"/><path d="M12 3a6 6 0 0 0-3.8 10.6c.5.5.8 1.1.8 1.8V16h6v-.6c0-.7.3-1.3.8-1.8A6 6 0 0 0 12 3Z"/>'), // bulb — recall
  zhseg:     SVG('<path d="M12 3.5v17"/><path d="M6.5 7.5v9M17.5 7.5v9" stroke-dasharray="2.2 3"/>'), // word boundary
  zhchar:    SVG('<rect x="4" y="4" width="16" height="16" rx="1.5"/><path d="M12 4v16M4 12h16"/>'), // 田 — character grid
  preview:   SVG('<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="2.8"/>'), // eye — preview/use span

  /* ---- primary tabs ---- */
  today:     SVG('<rect x="3.5" y="4.5" width="17" height="16" rx="2"/><path d="M3.5 9h17M8 2.5v4M16 2.5v4"/><path d="m8.7 14.5 2.2 2.2 4.4-4.4"/>'), // calendar-check
  train:     SVG('<rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5"/>'), // catalog grid
  mytexts:   SVG('<path d="M15.5 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V6.5Z"/><path d="M15.5 3v3.5H19"/><path d="M8.5 13h7M8.5 16.5h4.5"/>'), // file-text
  progress:  SVG('<path d="M4 4v15.5a.5.5 0 0 0 .5.5H20"/><path d="m7 14.5 3.2-3.8 3 2.2 5-6.4"/>'), // trend up
  theory:    SVG('<path d="M9.5 3h5l-.4 4.6a4 4 0 0 1 2.4 3.65V19a2 2 0 0 1-2 2h-7a2 2 0 0 1-2-2v-7.75a4 4 0 0 1 2.4-3.65L9.5 3Z"/><path d="M8.6 14h6.8"/>'), // flask — evidence/principles

  /* ---- ui glyphs ---- */
  flame:     SVG('<path d="M12.5 2.5c.4 2.2-1 3.6-1.9 4.6C9.4 8.5 8.5 9.7 8.5 11.5a3.5 3.5 0 0 0 7 0c0-1-.3-1.9-.8-2.7.9.5 1.6 1.4 1.6 2.9a4.9 4.9 0 0 1-9.8 0c0-3 2-4.6 3.3-6 1-1 1.7-2 1-3.2 .6.2 1.2.6 1.7 1.2Z"/>', 1.3),
  arrow:     SVG('<path d="M5 12h13.5M12.5 6l6 6-6 6"/>', 2),
  chevron:   SVG('<path d="m9.5 5.5 6.5 6.5-6.5 6.5"/>', 2.1),
  check:     SVG('<path d="M4.5 12.5 9.5 17.5 19.5 6.5"/>', 2.3),
  lock:      SVG('<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V7a4 4 0 0 1 8 0v3.5"/>'),
  play:      SVG('<path d="M7 4.8v14.4a.6.6 0 0 0 .92.5l11-7.2a.6.6 0 0 0 0-1L7.92 4.3A.6.6 0 0 0 7 4.8Z" fill="currentColor" stroke="none"/>'),
  trash:     SVG('<path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6.5 7l1 12.5a1.5 1.5 0 0 0 1.5 1.4h6a1.5 1.5 0 0 0 1.5-1.4L18.5 7M10 11v6M14 11v6"/>'),
  back:      SVG('<path d="M15 5l-7 7 7 7"/>', 2),
  globe:     SVG('<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.3 2.3 3.5 5.3 3.5 8.5S14.3 18.2 12 20.5C9.7 18.2 8.5 15.2 8.5 12S9.7 5.8 12 3.5Z"/>'),
  dot:       SVG('<circle cx="12" cy="12" r="3.4" fill="currentColor" stroke="none"/>'),
};

// drill id -> icon name (ids already match ICONS keys, but keep an explicit map for safety)
export const DRILL_ICON = {
  vocab: 'vocab', conquer: 'conquer', err: 'err', repeated: 'repeated', modes: 'modes',
  triage: 'triage', retrieval: 'retrieval', zhseg: 'zhseg', zhchar: 'zhchar', preview: 'preview',
};

export function icon(name, opts = {}) {
  const span = document.createElement('span');
  span.className = 'icon' + (opts.cls ? ' ' + opts.cls : '');
  span.innerHTML = ICONS[name] || ICONS.dot;
  if (opts.size) span.style.setProperty('--isz', opts.size + 'px');
  return span;
}
export function iconSvg(name) { return ICONS[name] || ICONS.dot; }
