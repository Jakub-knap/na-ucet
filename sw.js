// ============================================================
// Na účet — Service Worker (offline podpora)
// Pri KAŽDEJ zmene súborov appky zvýš číslo verzie nižšie,
// aby si používatelia stiahli novú verziu (inak im ostane stará z cache).
// ============================================================
const CACHE = 'na-ucet-v12';

// App shell — súbory potrebné, aby sa appka načítala aj offline.
const APP_SHELL = [
  '/',
  '/index.html',
  '/app',
  '/app.html',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  // Externé knižnice (bez nich sa appka offline nespustí)
  'https://www.gstatic.com/firebasejs/9.22.2/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/9.22.2/firebase-auth-compat.js',
  'https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore-compat.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'
];

// ── INSTALL: prednačítaj app shell ──
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE).then(cache =>
      // addAll zlyhá celé, ak jeden súbor zlyhá → pridávame radšej po jednom
      Promise.allSettled(APP_SHELL.map(url => cache.add(url)))
    ).then(() => self.skipWaiting())
  );
});

// ── ACTIVATE: zmaž staré verzie cache ──
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// ── FETCH ──
self.addEventListener('fetch', event => {
  const req = event.request;
  const url = new URL(req.url);

  // Len GET požiadavky cacheujeme
  if (req.method !== 'GET') return;

  // Firebase / Google API NEcacheovať cez SW.
  // Offline réžiu týchto dát rieši Firestore SDK sám (IndexedDB + fronta zápisov).
  if (
    url.hostname.includes('firestore.googleapis.com') ||
    url.hostname.includes('firebase') ||
    url.hostname.includes('googleapis.com') ||
    url.hostname.includes('google.com') ||
    url.hostname.includes('gstatic.com') && url.pathname.includes('/identity/')
  ) {
    return; // necháme prejsť priamo na sieť
  }

  // Navigácia (otvorenie stránky, napr. /app): najprv sieť, pri výpadku cache.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then(res => {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy));
          return res;
        })
        .catch(() =>
          caches.match(req).then(r => r || caches.match('/app.html') || caches.match('/index.html'))
        )
    );
    return;
  }

  // Ostatné (skripty, ikony, manifest): cache-first, na pozadí obnov z webu.
  event.respondWith(
    caches.match(req).then(cached => {
      const network = fetch(req)
        .then(res => {
          if (res && res.status === 200) {
            const copy = res.clone();
            caches.open(CACHE).then(c => c.put(req, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
