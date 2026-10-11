/*
 * WorkNest service worker (2026-10-11). Deliberately small:
 *  - Signed-in pages are never cached — your data stays on the server and is
 *    never stale or left on a shared phone. Pages always come from the network.
 *  - If a page can't load because you're offline, show /offline.html instead of
 *    the browser's error screen.
 * Bump VERSION when offline.html or the icons change.
 */
const VERSION = "worknest-v1";
const OFFLINE_URL = "/offline.html";
const PRECACHE = [OFFLINE_URL, "/icons/icon-192.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(VERSION).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== VERSION).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  // Only page navigations get the offline fallback; everything else goes
  // straight to the network as if there were no service worker.
  if (event.request.mode !== "navigate") return;
  event.respondWith(
    fetch(event.request).catch(async () => (await caches.match(OFFLINE_URL)) ?? Response.error()),
  );
});
