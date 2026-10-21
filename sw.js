// Public shell only. Financial responses and sessions are never cached here.
const CACHE = 'vnn-shell-__BUILD_ID__';
const SHELL = ['./index.html', './app.js?v=__BUILD_ID__',
  './contract.css?v=__BUILD_ID__', './sync-config.js?v=__BUILD_ID__',
  './core.js', './corefix.js', './manifest.webmanifest'];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
  // Public shell only: activate a fully downloaded release without waiting for stale Safari tabs.
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys
    .filter(key => (key.startsWith('vnn-shell-') || key.startsWith('vnn-next-shell-')) && key !== CACHE)
    .map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  const scope = new URL(self.registration.scope);
  if (request.method !== 'GET' || url.origin !== scope.origin ||
      !url.pathname.startsWith(scope.pathname) || url.pathname.includes('/api/')) return;
  const relative = url.pathname.slice(scope.pathname.length);
  // This endpoint is the network-only release signal, never a cached shell file.
  if (relative === 'version.json') return;
  if (request.mode === 'navigate' && url.searchParams.has('vnn_release')) return;
  if (!['', 'index.html', 'app.js', 'core.js', 'corefix.js', 'contract.css',
    'sync-config.js', 'manifest.webmanifest'].includes(relative) && !relative.startsWith('assets/')) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const response = await fetch(new Request(request, {cache:'no-store'}));
      if (response.ok && response.type !== 'opaque') {
        // Safari can reject CacheStorage writes while the network is healthy.
        // A cache quota error must never turn a successful response into "offline".
        try { await cache.put(request, response.clone()); } catch { /* Online response wins. */ }
      }
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
