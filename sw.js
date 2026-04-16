// sw.js — Service Worker for 商品收藏 PWA
const CACHE_NAME  = 'wishlist-v1';
const FONT_CACHE  = 'wishlist-fonts-v1';

// 核心靜態資源：App Shell
const SHELL_URLS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

// ── Install：快取 App Shell ─────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(SHELL_URLS))
  );
  self.skipWaiting();
});

// ── Activate：清除舊版快取 ──────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== CACHE_NAME && k !== FONT_CACHE)
          .map(k => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// ── Fetch：分策略處理 ───────────────────────────────────────
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Firebase 請求：不快取，直接 network
  if (
    url.hostname.includes('firebaseio.com') ||
    url.hostname.includes('firestore.googleapis.com') ||
    url.hostname.includes('firebase.googleapis.com') ||
    url.hostname.includes('firebasestorage.googleapis.com') ||
    url.hostname.includes('identitytoolkit.googleapis.com') ||
    url.hostname.includes('gstatic.com')
  ) {
    event.respondWith(fetch(request));
    return;
  }

  // Google Fonts：Cache-first（字型幾乎不變）
  if (
    url.hostname.includes('fonts.googleapis.com') ||
    url.hostname.includes('fonts.gstatic.com')
  ) {
    event.respondWith(
      caches.open(FONT_CACHE).then(cache =>
        cache.match(request).then(cached => {
          if (cached) return cached;
          return fetch(request).then(res => {
            cache.put(request, res.clone());
            return res;
          });
        })
      )
    );
    return;
  }

  // App Shell & 靜態資源：Cache-first，miss 則 network
  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached;

      return fetch(request)
        .then(res => {
          // 只快取同源 GET 請求
          if (
            res.ok &&
            request.method === 'GET' &&
            url.origin === self.location.origin
          ) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then(c => c.put(request, clone));
          }
          return res;
        })
        .catch(() => {
          // 離線 fallback：回傳快取的首頁
          if (request.destination === 'document') {
            return caches.match('/index.html');
          }
        });
    })
  );
});

// ── Background Sync（可選）──────────────────────────────────
self.addEventListener('sync', event => {
  if (event.tag === 'sync-items') {
    // Firebase SDK 本身已有離線佇列機制，這裡留作擴充用
    event.waitUntil(Promise.resolve());
  }
});
