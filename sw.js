// ===== service worker — offline app shell =====
const CACHE = 'readfast-v6';
const ASSETS = [
  './', './index.html', './css/styles.css',
  './js/app.js', './js/icons.js', './js/util.js', './js/store.js', './js/content.js', './js/theory.js',
  './js/drills/index.js', './js/drills/shared.js',
  './js/drills/vocab.js', './js/drills/conquer.js', './js/drills/err.js', './js/drills/repeated.js', './js/drills/modes.js',
  './js/drills/triage.js', './js/drills/retrieval.js', './js/drills/zhseg.js', './js/drills/zhchar.js', './js/drills/preview.js',
  './data/passages.json', './data/vocab_en.json', './data/vocab_zh.json', './data/seg_zh.json',
  './manifest.webmanifest', './icon.svg',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then(hit => hit || fetch(e.request).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {});
      return res;
    }).catch(() => caches.match('./index.html')))
  );
});
