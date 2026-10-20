// Service worker de Carnet : met l'application en cache pour l'usage hors ligne.
// Les appels /api (cours, synchronisation) passent toujours par le réseau. Aucune donnée personnelle ici.
const CACHE = 'carnet-v1.2.0';
const SHELL = [
  './', 'index.html', 'app.css', 'manifest.webmanifest',
  'js/app.js', 'js/format.js', 'js/store.js', 'js/importer.js', 'js/compute.js', 'js/library.js', 'js/chart.js', 'js/sync.js',
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
  // réseau d'abord (pour recevoir les mises à jour), cache en secours
  e.respondWith(
    fetch(e.request).then(r => {
      if (r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
      return r;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match('index.html')))
  );
});
