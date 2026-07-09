// ===== util.js: DOM helpers, timing, math =====

export function h(tag, attrs, ...kids) {
  const e = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'class') e.className = v;
      else if (k === 'html') e.innerHTML = v;
      else if (k === 'text') e.textContent = v;
      else if (k === 'dataset') Object.assign(e.dataset, v);
      else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
      else e.setAttribute(k, v);
    }
  }
  for (const kid of kids.flat()) {
    if (kid == null || kid === false) continue;
    e.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return e;
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
export function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); return node; }
export function mount(root, ...nodes) { clear(root); nodes.flat().forEach(n => n && root.append(n)); return root; }

export function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
export const sample = (arr, n) => shuffle(arr).slice(0, n);
export const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
export const sum = (arr) => arr.reduce((s, x) => s + x, 0);
export const mean = (arr) => (arr.length ? sum(arr) / arr.length : 0);
export function median(arr) {
  if (!arr.length) return 0;
  const a = arr.slice().sort((x, y) => x - y);
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}
export function stdev(arr) {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  return Math.sqrt(sum(arr.map(x => (x - m) ** 2)) / (arr.length - 1));
}

// word / character counting
export function countUnits(text, lang) {
  if (lang === 'zh') return (text.match(/[㐀-鿿]/g) || []).length;
  return (text.trim().match(/\S+/g) || []).length;
}

export function fmtClock(ms) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}
export function fmtDate(ts) {
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}
// Local calendar day. Using toISOString() moves late-night sessions to the next day in UTC-based zones.
export function todayKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
export const now = () => Date.now();

const perfNow = () => globalThis.performance?.now?.() ?? Date.now();
const requestFrame = callback => (
  typeof globalThis.requestAnimationFrame === 'function'
    ? globalThis.requestAnimationFrame(callback)
    : globalThis.setTimeout(() => callback(perfNow()), 16)
);
const cancelFrame = handle => {
  if (handle == null) return;
  if (typeof globalThis.cancelAnimationFrame === 'function') globalThis.cancelAnimationFrame(handle);
  else globalThis.clearTimeout(handle);
};

// Pausable timer. Paused time is excluded from elapsed(), and AbortSignal stops every pending tick.
export function createTimer(onTick, options = {}) {
  const { signal, tickMs = 100, autoStart = true } = options;
  let accumulated = 0;
  let startedAt = null;
  let frame = null;
  let lastTickAt = -Infinity;
  let paused = !autoStart;
  let stopped = false;

  const elapsedAt = (timestamp = perfNow()) => (
    accumulated + (!paused && !stopped && startedAt != null ? timestamp - startedAt : 0)
  );

  const emit = (timestamp, force = false) => {
    if (typeof onTick !== 'function') return;
    if (force || timestamp - lastTickAt >= tickMs) {
      lastTickAt = timestamp;
      onTick(elapsedAt(timestamp));
    }
  };

  const loop = timestamp => {
    if (stopped || paused) return;
    emit(timestamp);
    frame = requestFrame(loop);
  };

  const pause = () => {
    if (stopped || paused) return accumulated;
    const timestamp = perfNow();
    accumulated = elapsedAt(timestamp);
    startedAt = null;
    paused = true;
    cancelFrame(frame);
    frame = null;
    emit(timestamp, true);
    return accumulated;
  };

  const resume = () => {
    if (stopped || !paused) return elapsedAt();
    paused = false;
    startedAt = perfNow();
    lastTickAt = -Infinity;
    emit(startedAt, true);
    frame = requestFrame(loop);
    return accumulated;
  };

  const stop = () => {
    if (stopped) return accumulated;
    if (!paused) accumulated = elapsedAt();
    stopped = true;
    paused = false;
    startedAt = null;
    cancelFrame(frame);
    frame = null;
    signal?.removeEventListener?.('abort', stop);
    if (typeof onTick === 'function') onTick(accumulated);
    return accumulated;
  };

  const api = {
    pause,
    resume,
    stop,
    elapsed: () => elapsedAt(),
    isPaused: () => paused,
    isStopped: () => stopped,
  };

  if (signal?.aborted) stopped = true;
  else signal?.addEventListener?.('abort', stop, { once: true });
  if (!stopped && autoStart) {
    startedAt = perfNow();
    emit(startedAt, true);
    frame = requestFrame(loop);
  }
  return api;
}

// Backward-compatible alias used by existing drills.
export function startTimer(onTick, options) {
  return createTimer(onTick, options);
}

export function abortableDelay(ms, options = {}) {
  const { signal } = options;
  const abortedError = () => signal?.reason || (
    typeof globalThis.DOMException === 'function'
      ? new DOMException('Aborted', 'AbortError')
      : Object.assign(new Error('Aborted'), { name: 'AbortError' })
  );
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortedError());
      return;
    }
    const onAbort = () => {
      globalThis.clearTimeout(handle);
      reject(abortedError());
    };
    const handle = globalThis.setTimeout(() => {
      signal?.removeEventListener?.('abort', onAbort);
      resolve();
    }, Math.max(0, ms));
    signal?.addEventListener?.('abort', onAbort, { once: true });
  });
}

export function setPressed(element, pressed) {
  if (!element) return false;
  const on = Boolean(pressed);
  element.setAttribute('aria-pressed', String(on));
  element.classList.toggle('is-active', on);
  return on;
}

// SVG sparkline path from numeric series
export function sparkline(values, w = 280, hgt = 56, pad = 4) {
  if (!values.length) return h('div', { class: 'muted small' }, '데이터 없음');
  const min = Math.min(...values), max = Math.max(...values);
  const range = max - min || 1;
  const step = values.length > 1 ? (w - pad * 2) / (values.length - 1) : 0;
  const x = i => pad + i * step;
  const y = v => hgt - pad - ((v - min) / range) * (hgt - pad * 2);
  const line = values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
  const area = `${line} L${x(values.length - 1).toFixed(1)} ${hgt - pad} L${x(0).toFixed(1)} ${hgt - pad} Z`;
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('class', 'spark'); svg.setAttribute('viewBox', `0 0 ${w} ${hgt}`); svg.setAttribute('preserveAspectRatio', 'none');
  const pa = document.createElementNS(ns, 'path'); pa.setAttribute('class', 'area'); pa.setAttribute('d', area);
  const pl = document.createElementNS(ns, 'path'); pl.setAttribute('d', line);
  svg.append(pa, pl);
  return svg;
}

export function letterFor(i) { return 'ABCD'[i] || String(i + 1); }

// normalize a string for loose comparison (scan answers)
export function norm(s) { return String(s).trim().toLowerCase().replace(/[\s.,!?;:'"·。，、！？]+/g, ''); }
