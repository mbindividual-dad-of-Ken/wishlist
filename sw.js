// sw.js — 商品收藏 PWA（v2，2026-07-05）
// 【修正】原 SW 為 Firebase 版架構且使用絕對路徑：
//   1) SHELL_URLS 用 '/'，部署在 GitHub Pages 子路徑時 addAll 404 → install 失敗，SW 從未生效
//   2) index.html cache-first 且快取名固定 → 一旦生效，用戶將永遠收不到更新（Manda 同款問題）
// 改為：相對路徑 + 導覽請求 stale-while-revalidate + 跨域一律直連網路（GAS API 不經快取）
const CACHE = 'wishlist-swr-v1';
const FONT_CACHE = 'wishlist-fonts-v1';
const SHELL = ['./', './index.html', './manifest.json', './icons/icon-192.png', './icons/icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE && k !== FONT_CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return; // 寫入（POST）一律直連
  const url = new URL(req.url);

  // Google Fonts：cache-first（字型幾乎不變）
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(
      caches.open(FONT_CACHE).then(c =>
        c.match(req).then(hit => hit || fetch(req).then(res => { c.put(req, res.clone()); return res; }))
      )
    );
    return;
  }

  // 其他跨域（含 script.google.com / googleusercontent GAS API、Drive 縮圖）：直連網路
  if (url.origin !== self.location.origin) return;

  // 導覽請求：stale-while-revalidate — 立即回快取，背景更新下一次生效
  if (req.mode === 'navigate') {
    e.respondWith(
      caches.open(CACHE).then(c =>
        c.match('./index.html').then(hit => {
          const net = fetch(req).then(res => { if (res.ok) c.put('./index.html', res.clone()); return res; }).catch(() => hit);
          return hit || net;
        })
      )
    );
    return;
  }

  // 同源靜態資源：cache-first，miss 則回源並補快取
  e.respondWith(
    caches.match(req).then(hit => hit || fetch(req).then(res => {
      if (res.ok) { const clone = res.clone(); caches.open(CACHE).then(c => c.put(req, clone)); }
      return res;
    }))
  );
});
