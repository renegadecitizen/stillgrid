// Stillgrid service worker — installable + offline app shell.
//
// Strategy:
//   - Navigations: network-first, fall back to cached "/" so an offline launch
//     still boots the SPA. (Online always gets fresh index.html, which carries
//     the current hashed asset URLs — avoids the stale-SPA trap.)
//   - Same-origin static assets + Google Fonts: stale-while-revalidate.
//   - /api/* and cross-origin analytics: network-only, never cached (puzzles are
//     dynamic and per-request; the in-progress puzzle is already playable offline
//     because its solution is embedded client-side).
//
// Bump CACHE_VERSION to force old caches out on the next activation.
const CACHE_VERSION = "stillgrid-v1";
const SHELL = ["/", "/manifest.webmanifest", "/favicon.svg", "/icon-192.png", "/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

function isFontHost(url) {
  return url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com";
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  const sameOrigin = url.origin === self.location.origin;

  // Dynamic API + anything cross-origin we don't explicitly handle: pass through.
  if (sameOrigin && url.pathname.startsWith("/api/")) return;
  if (!sameOrigin && !isFontHost(url)) return;

  // App navigations: network-first with offline app-shell fallback.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((resp) => {
          const copy = resp.clone();
          caches.open(CACHE_VERSION).then((c) => c.put("/", copy)).catch(() => {});
          return resp;
        })
        .catch(() => caches.match("/").then((r) => r || caches.match(request))),
    );
    return;
  }

  // Static assets + fonts: stale-while-revalidate.
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((resp) => {
          if (resp && (resp.ok || resp.type === "opaque")) {
            const copy = resp.clone();
            caches.open(CACHE_VERSION).then((c) => c.put(request, copy)).catch(() => {});
          }
          return resp;
        })
        .catch(() => cached);
      return cached || network;
    }),
  );
});
