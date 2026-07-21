/* Nexus CRM PWA service worker: static assets only; authenticated data is never cached. */
const CACHE_PREFIX = 'nexus-pwa-';
const CACHE_NAME = `${CACHE_PREFIX}v1`;
const OFFLINE_URL = '/offline.html';
const PRECACHE_URLS = [
  OFFLINE_URL,
  '/favicon.svg',
  '/nexus-maskable.svg',
  '/manifest.webmanifest',
];
const PUBLIC_ASSET_PATHS = new Set(PRECACHE_URLS);

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys
        .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
        .map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

function isPrivatePath(pathname) {
  return pathname === '/api' || pathname.startsWith('/api/') ||
    pathname === '/bff' || pathname.startsWith('/bff/');
}

function isCacheableStaticRequest(request, url) {
  if (request.method !== 'GET' || url.origin !== self.location.origin) return false;
  if (isPrivatePath(url.pathname) || request.headers.has('authorization')) return false;
  return url.pathname.startsWith('/_next/static/') || PUBLIC_ASSET_PATHS.has(url.pathname);
}

async function networkFirstNavigation(request) {
  try {
    // HTML can contain tenant/user data. Return it from the network but never cache it.
    return await fetch(request);
  } catch {
    return (await caches.match(OFFLINE_URL, { ignoreSearch: true })) ||
      new Response('Nexus CRM is offline.', {
        status: 503,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      });
  }
}

async function cacheFirstStatic(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  const cacheControl = response.headers.get('cache-control') || '';
  if (response.ok && !/\b(?:private|no-store)\b/i.test(cacheControl)) {
    const cache = await caches.open(CACHE_NAME);
    await cache.put(request, response.clone());
  }
  return response;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.mode === 'navigate') {
    event.respondWith(networkFirstNavigation(request));
    return;
  }

  if (isCacheableStaticRequest(request, url)) {
    event.respondWith(cacheFirstStatic(request));
  }
});
