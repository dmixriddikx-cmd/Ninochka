// Public shell only. Financial responses and sessions are never cached here.
const CACHE = 'vnn-next-shell-__BUILD_ID__';
const SHELL = ['./', './index.html', './app.js?v=__BUILD_ID__',
  './contract.css?v=__BUILD_ID__', './sync-config.js?v=__BUILD_ID__',
  './core.js', './corefix.js', './manifest.webmanifest',
  './assets/vnn-icon.svg', './assets/vnn-icon-180.png',
  './assets/vnn-icon-192.png', './assets/vnn-icon-512.png',
  './assets/final-dark-hero.b64', './assets/final-light-home.b64',
  './assets/storage-approved.b64', './assets/week-empty-approved.b64'];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)));
  // No skipWaiting: existing tabs finish on their current application version.
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys
    .filter(key => key.startsWith('vnn-next-shell-') && key !== CACHE)
    .map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  const scope = new URL(self.registration.scope);
  if (request.method !== 'GET' || url.origin !== scope.origin ||
      !url.pathname.startsWith(scope.pathname) || url.pathname.includes('/api/')) return;
  const relative = url.pathname.slice(scope.pathname.length);
  if (!['', 'index.html', 'app.js', 'core.js', 'corefix.js', 'contract.css',
    'sync-config.js', 'manifest.webmanifest'].includes(relative) && !relative.startsWith('assets/')) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const response = await fetch(request);
      if (response.ok && response.type !== 'opaque') await cache.put(request, response.clone());
      return response;
    } catch (error) {
      const cached = await cache.match(request);
      if (cached) return cached;
      if (request.mode === 'navigate') {
        const shell = await cache.match('./index.html');
        if (shell) return shell;
      }
      throw error;
    }
  })());
});
