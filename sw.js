/* ============================================================
   WordMagic Service Worker — v2
   策略（不再需要每次 push 都手動 bump CACHE_VERSION）：
   - HTML 頁面（含 navigation）：network-first
       永遠先抓網路最新版本；網路掛掉才用快取（離線保護）
   - 靜態資源（data/*.js, *.json, icon, css/js）：stale-while-revalidate
       立刻回快取 → 同時背景抓新版回來更新快取；下次開啟自動拿到新內容
   - 外部資源（CDN / API）：network-only（不快取，避免污染）
   ============================================================ */
const CACHE_VERSION = 'wordmagic-v2';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icon.svg',
  './data/extra.js'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then(cache => cache.addAll(APP_SHELL).catch(() => {}))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(names => Promise.all(names.filter(n => n !== CACHE_VERSION).map(n => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

/* 是否為 HTML / navigation 請求（要 network-first） */
function isHtmlRequest(req) {
  if (req.mode === 'navigate') return true;
  const accept = req.headers.get('accept') || '';
  return accept.includes('text/html');
}

/* 是否為同網域可快取的靜態資源 */
function isSameOriginAsset(req) {
  try { return new URL(req.url).origin === location.origin; }
  catch { return false; }
}

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  // 1. HTML / navigation → network-first
  if (isHtmlRequest(req)) {
    event.respondWith(
      fetch(req)
        .then(resp => {
          // 抓到的最新 HTML 順手存入快取（離線保護）
          if (resp && resp.ok && isSameOriginAsset(req)) {
            const copy = resp.clone();
            caches.open(CACHE_VERSION).then(c => c.put(req, copy));
          }
          return resp;
        })
        .catch(() => caches.match(req).then(cached => cached || caches.match('./index.html')))
    );
    return;
  }

  // 2. 跨網域資源 → 直接走網路，不快取
  if (!isSameOriginAsset(req)) {
    event.respondWith(fetch(req).catch(() => caches.match(req)));
    return;
  }

  // 3. 同網域靜態資源 → stale-while-revalidate
  event.respondWith(
    caches.match(req).then(cached => {
      const fetchPromise = fetch(req)
        .then(resp => {
          if (resp && resp.ok) {
            const copy = resp.clone();
            caches.open(CACHE_VERSION).then(c => c.put(req, copy));
          }
          return resp;
        })
        .catch(() => cached);   // 離線時退回快取
      // 立刻回快取（如有）→ 同時讓 fetchPromise 在背景跑
      return cached || fetchPromise;
    })
  );
});

/* 允許頁面主動觸發跳過等待（例如 UI 上有「立刻更新」按鈕時可用） */
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});
