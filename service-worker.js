/* Godsbound — offline cache (roadmap S2, 2026-07-29).
 *
 * INSTALL/CACHE PLUMBING ONLY. No gameplay logic may live in this file — that is the
 * explicit condition Willem attached to the second single-file exception (CLAUDE.md,
 * Q3 answered 2026-07-29). All game code stays inside godsbound_beta.html.
 *
 * Strategy: cache-first, network fallback. The game makes no network calls of its own
 * (it is 100% offline by design), so there is no live data that could go stale behind
 * the cache and no revalidation logic is warranted.
 *
 * UPDATING: bump CACHE_NAME and the matching version in release-manifest.json whenever
 * the HTML or any asset changes. The release validator rejects a mismatch. Old caches
 * are deleted on activate.
 *
 * The precache list is deliberately SHORT: the shell plus the icons. The ~192 sprite
 * PNGs are NOT precached — that would mean a multi-megabyte download before the first
 * frame. They are cached lazily in fetch() as the game actually requests them, so a
 * player who has loaded the game once has everything they touched available offline.
 */
const CACHE_NAME = "godsbound-v24";

const PRECACHE = [
  "./",
  "./index.html",
  "./manifest.json",
  "./assets/icons/icon-192.png",
  "./assets/icons/icon-512.png",
  "./assets/icons/icon-maskable-512.png",
  "./assets/icons/apple-touch-icon.png"
];

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    /* The release builder always publishes the shell as index.html. A missing core file
       must abort this install so the previous working service worker remains active. */
    await cache.addAll(PRECACHE.map(url => new Request(url, { cache: "reload" })));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", event => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // never cache cross-origin

  event.respondWith((async () => {
    const cached = await caches.match(req);
    if (cached) return cached;
    try {
      const res = await fetch(req);
      /* Lazily cache same-origin successes — this is what pulls the sprite PNGs in as
         the game requests them. Opaque/error responses are passed through uncached. */
      if (res && res.status === 200 && res.type === "basic") {
        const cache = await caches.open(CACHE_NAME);
        cache.put(req, res.clone());
      }
      return res;
    } catch (err) {
      /* Offline and not in cache. For a navigation, fall back to the cached shell so the
         app still opens; otherwise let the failure surface. */
      if (req.mode === "navigate") {
        const shell = (await caches.match("./index.html"))
          || (await caches.match("./"));
        if (shell) return shell;
      }
      throw err;
    }
  })());
});
