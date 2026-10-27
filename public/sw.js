// Carnet service worker: caches the app for offline use.
// /api calls (prices, sync) always go to the network. No personal data here.
const CACHE = 'carnet-v1.8.0';
const SHELL = [
  './', 'index.html', 'app.css', 'manifest.webmanifest',
  'js/app.js', 'js/format.js', 'js/store.js', 'js/importer.js', 'js/importer-linxea.js', 'js/xlsx.js', 'js/importer-ce.js', 'js/pdf.js', 'js/compute.js', 'js/library.js', 'js/chart.js', 'js/sync.js', 'js/i18n.js', 'js/i18n-en.js',
  'fonts/Lora-Variable.woff', 'fonts/Lora-Italic-Variable.woff',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png', 'icons/favicon.svg',
];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname.includes('/api/')) return;
  // network first (to receive updates), cache as fallback
  e.respondWith(
    fetch(e.request).then(r => {
      if (r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
      return r;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match('index.html')))
  );
});
