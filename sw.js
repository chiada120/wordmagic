/* ============================================================
   WordMagic Service Worker
   策略：app shell cache-first，離線可開
   每次修改主檔案後，請把 CACHE_VERSION 加一以觸發更新
   ============================================================ */
const CACHE_VERSION = 'wordmagic-v1';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icon.svg',
  './data/extra.js'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then(cache => cache.addAll(APP_SHELL).catch(() => {}))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(names =>
      Promise.all(names.filter(n => n !== CACHE_VERSION).map(n => caches.delete(n)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  event.respondWith(
    caches.match(req).then(cached => {
      if (cached) return cached;
      return fetch(req).then(resp => {
        // 同網域 GET 才存進 cache
        if (resp && resp.ok && new URL(req.url).origin === location.origin) {
          const copy = resp.clone();
          caches.open(CACHE_VERSION).then(cache => cache.put(req, copy));
        }
        return resp;
      }).catch(() => cached);
    })
  );
});
