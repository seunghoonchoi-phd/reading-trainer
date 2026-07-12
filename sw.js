// ===== service worker: bounded same-origin offline cache =====
const CACHE_PREFIX = 'readfast-';
const PRECACHE = 'readfast-precache-v27';
const RUNTIME = 'readfast-runtime-v27';
const RUNTIME_LIMIT = 48;

// This array is parsed by _build/test-assets.mjs. Keep it as valid JSON.
const PRECACHE_ASSETS = [
  "./",
  "./index.html",
  "./css/styles.css",
  "./js/app.js",
  "./js/icons.js",
  "./js/util.js",
  "./js/i18n.js",
  "./js/store.js",
  "./js/content.js",
  "./js/theory.js",
  "./js/levels.js",
  "./js/progression.js",
  "./js/metrics.js",
  "./js/program.js",
  "./js/drills/index.js",
  "./js/drills/shared.js",
  "./js/drills/messages.js",
  "./js/drills/chunk.js",
  "./js/drills/sentence.js",
  "./js/drills/context.js",
  "./js/drills/conquer.js",
  "./js/drills/err.js",
  "./js/drills/repeated.js",
  "./js/drills/modes.js",
  "./js/drills/triage.js",
  "./js/drills/retrieval.js",
  "./js/drills/zhseg.js",
  "./js/drills/zhchar.js",
  "./js/drills/preview.js",
  "./data/passages.json",
  "./data/korean_translations.json",
  "./data/vocab_en.json",
  "./data/vocab_zh.json",
  "./data/seg_zh.json",
  "./manifest.webmanifest",
  "./icon.svg",
  "./icons/icon-180.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png",
  "./og.png"
];

const STATIC_DESTINATIONS = new Set(['script', 'style', 'image', 'font', 'manifest']);
const STATIC_PATH = /\.(?:css|js|json|png|jpe?g|svg|webp|woff2?|webmanifest)$/i;

function cacheable(response) {
  return response?.ok && (response.type === 'basic' || response.type === 'default');
}

function isStaticRequest(request, url) {
  return STATIC_DESTINATIONS.has(request.destination) || STATIC_PATH.test(url.pathname);
}

async function trimCache(cacheName, limit) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  const overflow = keys.length - limit;
  if (overflow > 0) await Promise.all(keys.slice(0, overflow).map(key => cache.delete(key)));
}

async function remember(request, response) {
  if (!cacheable(response)) return;
  const cache = await caches.open(RUNTIME);
  await cache.put(request, response.clone());
  await trimCache(RUNTIME, RUNTIME_LIMIT);
}

async function networkFirst(request, fallbackRequest = request) {
  try {
    const response = await fetch(request);
    await remember(request, response);
    return response;
  } catch {
    return (await caches.match(fallbackRequest, { ignoreSearch: true })) || Response.error();
  }
}

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(PRECACHE);
    await cache.addAll(PRECACHE_ASSETS);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names
      .filter(name => name.startsWith(CACHE_PREFIX) && name !== PRECACHE && name !== RUNTIME)
      .map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request, './index.html'));
    return;
  }

  if (isStaticRequest(request, url)) event.respondWith(networkFirst(request));
});
