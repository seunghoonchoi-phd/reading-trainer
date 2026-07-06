// ===== service worker — offline app shell =====
// 파일 추가/삭제/개명 시 반드시 ASSETS 동기화 + CACHE 버전 bump (addAll은 하나만 404여도 통째로 실패)
const CACHE = 'readfast-v12';
const ASSETS = [
  './', './index.html', './css/styles.css',
  './js/app.js', './js/icons.js', './js/util.js', './js/store.js', './js/content.js', './js/theory.js', './js/levels.js', './js/progression.js',
  './js/drills/index.js', './js/drills/shared.js',
  './js/drills/vocab.js', './js/drills/chunk.js', './js/drills/sentence.js', './js/drills/context.js',
  './js/drills/conquer.js', './js/drills/err.js', './js/drills/repeated.js', './js/drills/modes.js',
  './js/drills/triage.js', './js/drills/retrieval.js', './js/drills/zhseg.js', './js/drills/zhchar.js', './js/drills/preview.js',
  './data/passages.json', './data/vocab_en.json', './data/vocab_zh.json', './data/seg_zh.json',
  './manifest.webmanifest', './icon.svg',
  './icons/icon-180.png', './icons/icon-192.png', './icons/icon-512.png', './icons/icon-maskable-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
// network-first: always try fresh (so deploys never serve a stale/mismatched module mix);
// fall back to cache only when offline. index.html fallback은 페이지 이동(navigate)에만 —
// 데이터/모듈 요청이 HTML로 둔갑해 조용히 깨지는 것을 막는다.
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {});
      return res;
    }).catch(() => caches.match(e.request).then(hit => {
      if (hit) return hit;
      if (e.request.mode === 'navigate') return caches.match('./index.html');
      return Response.error();
    }))
  );
});
