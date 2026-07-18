/* SS-75 CMP service worker.
 *
 * Deliberately minimal for an authenticated, data-driven app:
 *  - Page navigations: network-first, offline fallback page. Pages are
 *    per-user (auth) and must always be fresh — they are NEVER cached.
 *  - Hashed build assets (/_next/static) + static icons: cache-first —
 *    content-hashed filenames make them immutable.
 *  - /api/* and cross-origin (Supabase, Gemini) requests are untouched.
 *
 * Bump VERSION to invalidate every cache on the next deploy of this file.
 */
const VERSION = "v1";
const CACHE = "ss75-cmp-" + VERSION;
const OFFLINE_URL = "/offline.html";
const PRECACHE = [OFFLINE_URL, "/icons/icon-192.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // Supabase / Gemini
  if (url.pathname.startsWith("/api/")) return; // never cache API data

  // Navigations: network-first with a branded offline fallback.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req).catch(() =>
        caches.match(OFFLINE_URL).then((hit) => hit || Response.error())
      )
    );
    return;
  }

  // Immutable static assets: cache-first, populate on miss.
  const isStatic =
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    /\.(?:svg|png|ico|woff2?)$/.test(url.pathname);
  if (isStatic) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(CACHE).then((cache) => cache.put(req, copy));
            }
            return res;
          })
      )
    );
  }
});
