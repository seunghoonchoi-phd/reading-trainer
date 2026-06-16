// ===== util.js — DOM helpers, timing, math =====

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
export const todayKey = () => new Date().toISOString().slice(0, 10);
export const now = () => Date.now();

// running timer that calls onTick(ms) ~10x/s; returns { stop() -> elapsedMs }
export function startTimer(onTick) {
  const t0 = performance.now();
  let raf, stopped = false;
  const loop = () => {
    if (stopped) return;
    onTick && onTick(performance.now() - t0);
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);
  return {
    stop() { stopped = true; cancelAnimationFrame(raf); return performance.now() - t0; },
    elapsed() { return performance.now() - t0; },
  };
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
