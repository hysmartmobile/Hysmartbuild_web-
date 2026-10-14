/* HySmart Build PWA service worker.
 * Cache only the public app shell and same-origin static build assets.
 * Authenticated API responses, user data, and non-GET requests are never cached.
 */
'use strict';

const CACHE_PREFIX = 'hysmart-pwa-shell-';
const CACHE_NAME = `${CACHE_PREFIX}5.13.2-guided-onboarding`;
const SHELL_KEY = new URL('/__hysmart_public_app_shell__', self.location.origin).href;
const SHELL_ASSETS = [
  '/index.html',
  '/manifest.webmanifest',
  '/icon.svg',
  '/icon-192.png',
  '/icon-512.png',
  '/images/hysmart-onboarding.webp',
  '/images/hysmart-login.webp',
  '/images/hysmart-signup.webp'
];
const CACHEABLE_PUBLIC_FILES = new Set(SHELL_ASSETS.slice(1));
const isSameOrigin = (url) => url.origin === self.location.origin;
const isStaticBuildAsset = (pathname) => pathname.startsWith('/assets/');

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    // Cache the document under a private synthetic key so a deep route's response
    // can never accidentally replace the offline application shell.
    const shellResponse = await fetch('/index.html', { cache: 'reload', credentials: 'same-origin' });
    if (!shellResponse.ok) throw new Error(`Unable to precache app shell (${shellResponse.status})`);
    await cache.put(SHELL_KEY, shellResponse.clone());
    await Promise.all(SHELL_ASSETS.slice(1).map(async (path) => {
      try {
        const response = await fetch(path, { cache: 'reload', credentials: 'same-origin' });
        if (response.ok && response.type === 'basic') await cache.put(path, response);
      } catch {
        // A missing optional illustration should not prevent installation of the PWA.
      }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
      .map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (!isSameOrigin(url)) return;
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/auth/')) return;
  if (request.headers.has('authorization')) return;

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        const contentType = response.headers.get('content-type') || '';
        if (response.ok && contentType.includes('text/html')) {
          const cache = await caches.open(CACHE_NAME);
          await cache.put(SHELL_KEY, response.clone());
        }
        return response;
      } catch {
        const cachedShell = await caches.match(SHELL_KEY);
        if (cachedShell) return cachedShell;
        return new Response('HySmart Build is offline. Reconnect to open your workspace.', {
          status: 503,
          statusText: 'Offline',
          headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' }
        });
      }
    })());
    return;
  }

  const isKnownPublicFile = CACHEABLE_PUBLIC_FILES.has(url.pathname);
  if (!isStaticBuildAsset(url.pathname) && !isKnownPublicFile) return;

  event.respondWith((async () => {
    const cached = await caches.match(request);
    if (cached) return cached;
    try {
      const response = await fetch(request);
      if (response.ok && response.type === 'basic') {
        const cache = await caches.open(CACHE_NAME);
        await cache.put(request, response.clone());
      }
      return response;
    } catch {
      return new Response('This app resource is not available offline.', {
        status: 503,
        statusText: 'Offline',
        headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' }
      });
    }
  })());
});
