/**
 * Nexus CRM — kill-switch service worker.
 *
 * The previous caching service worker served a stale app shell (cache-first on
 * navigations), which pinned users to an old build even through hard refreshes
 * and broke post-deploy login. Browsers always revalidate the sw.js script on
 * navigation, so shipping this self-unregistering worker reliably evicts the old
 * one: on activate it deletes every cache, unregisters itself, and reloads open
 * tabs so they fetch fresh HTML directly from the network.
 *
 * PWA offline caching can be reintroduced later with a network-first strategy
 * for navigations + a versioned precache — not the cache-first shell that caused
 * the stale-app problem.
 */
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      try {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      } catch {
        /* ignore */
      }
      try {
        await self.registration.unregister();
      } catch {
        /* ignore */
      }
      try {
        const clients = await self.clients.matchAll({ type: 'window' });
        for (const client of clients) {
          client.navigate(client.url);
        }
      } catch {
        /* ignore */
      }
    })()
  );
});

// Pass every request straight through to the network — never serve from cache.
self.addEventListener('fetch', () => {});
