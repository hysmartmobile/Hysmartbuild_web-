/* HySmart Build service worker.
 * Cache only the public application shell and fingerprinted static assets.
 * Never cache API responses, authenticated page data, or arbitrary same-origin GETs.
 */
const CACHE_PREFIX = 'hysmart-shell-';
const CACHE_NAME = `${CACHE_PREFIX}v5.7.8-rc34`;
const SHELL = ['/', '/manifest.webmanifest', '/icon.svg', '/icon-192.png', '/icon-512.png', '/images/hysmart-onboarding.webp', '/images/hysmart-login.webp', '/images/hysmart-signup.webp'];
const STATIC_PREFIXES = ['/assets/'];
const STATIC_FILES = new Set(['/manifest.webmanifest', '/icon.svg', '/icon-192.png', '/icon-512.png', '/images/hysmart-onboarding.webp', '/images/hysmart-login.webp', '/images/hysmart-signup.webp']);

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys
        .filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
        .map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;

  // App navigation: prefer the live app shell; use the cached shell only offline.
  // Do not cache route-specific responses under their route URLs.
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (response && response.ok) {
          const cache = await caches.open(CACHE_NAME);
          await cache.put('/', response.clone());
        }
        return response;
      } catch {
        return (await caches.match('/')) || new Response('HySmart Build is offline. Reconnect and try again.', {
          status: 503,
          statusText: 'Offline',
          headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' }
        });
      }
    })());
    return;
  }

  // Cache only fingerprinted build assets and explicitly public shell resources.
  const isBuildAsset = STATIC_PREFIXES.some(prefix => url.pathname.startsWith(prefix));
  if (!isBuildAsset && !STATIC_FILES.has(url.pathname)) return;

  event.respondWith((async () => {
    const cached = await caches.match(request);
    if (cached) return cached;
    try {
      const response = await fetch(request);
      if (response && response.ok && response.type === 'basic') {
        const cache = await caches.open(CACHE_NAME);
        await cache.put(request, response.clone());
      }
      return response;
    } catch {
      return new Response('This resource is not available offline.', {
        status: 503,
        statusText: 'Offline',
        headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' }
      });
    }
  })());
});
