// Cache only the public offline shell. Never cache sessions, private HTML, APIs or RSC.
const SHELL = 'ycd-offline-shell-v1';
const ASSETS = ['/offline.html', '/offline.css', '/offline.js', '/offline-store.js', '/brand/ycd-logo-source.svg', '/brand/app-icon-192.png'];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(SHELL).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('ycd-offline-shell-') && key !== SHELL).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  if (ASSETS.includes(url.pathname) && !url.search) {
    event.respondWith(caches.open(SHELL).then(async cache => (await cache.match(event.request)) || fetch(event.request)));
    return;
  }
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).catch(async () => {
      const cache = await caches.open(SHELL);
      return (await cache.match('/offline.html')) || new Response('لا يوجد اتصال. جهّز الجهاز بالإنترنت أولًا.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    }));
  }
});
