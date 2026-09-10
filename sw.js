// sw.js — يفعّل العمل أوفلاين للمصحف الإلكتروني
const APP_CACHE = 'mushaf-app-v1';
const DATA_CACHE = 'mushaf-quran-data-v1'; // آيات القرآن لا تتغير، فنخزنها للأبد
const FONT_CACHE = 'mushaf-fonts-v1';

const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

// ---------- التثبيت: تخزين هيكل التطبيق ----------
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(APP_CACHE).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

// ---------- التفعيل: تنظيف النسخ القديمة من الكاش ----------
self.addEventListener('activate', (event) => {
  const keep = [APP_CACHE, DATA_CACHE, FONT_CACHE];
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.map((k) => (keep.includes(k) ? null : caches.delete(k))))
    )
  );
  self.clients.claim();
});

function isQuranApi(url) {
  return url.hostname === 'api.alquran.cloud';
}
function isFontAsset(url) {
  return url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // 1) بيانات القرآن من الـ API: كاش أولاً، وإن لم توجد اذهب للشبكة ثم خزّنها للأبد
  if (isQuranApi(url)) {
    event.respondWith(
      caches.open(DATA_CACHE).then(async (cache) => {
        const cached = await cache.match(req);
        if (cached) return cached;
        try {
          const res = await fetch(req);
          if (res && res.ok) cache.put(req, res.clone());
          return res;
        } catch (err) {
          return cached || Response.error();
        }
      })
    );
    return;
  }

  // 2) الخطوط من Google Fonts: كاش أولاً مع تحديث بالخلفية
  if (isFontAsset(url)) {
    event.respondWith(
      caches.open(FONT_CACHE).then(async (cache) => {
        const cached = await cache.match(req);
        const networkFetch = fetch(req)
          .then((res) => {
            if (res && res.ok) cache.put(req, res.clone());
            return res;
          })
          .catch(() => cached);
        return cached || networkFetch;
      })
    );
    return;
  }

  // 3) طلبات التنقل (فتح الصفحة): إن تعذّر الاتصال أعد index.html من الكاش
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).catch(() => caches.match('./index.html'))
    );
    return;
  }

  // 4) باقي ملفات التطبيق: كاش أولاً ثم الشبكة
  event.respondWith(
    caches.match(req).then((cached) => {
      return (
        cached ||
        fetch(req)
          .then((res) => {
            if (res && res.ok) {
              const resClone = res.clone();
              caches.open(APP_CACHE).then((cache) => cache.put(req, resClone));
            }
            return res;
          })
          .catch(() => cached)
      );
    })
  );
});
