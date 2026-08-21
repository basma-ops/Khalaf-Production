// Khalaf field worker — service worker. Caches the app shell + a small
// allow-list of GET endpoints so the field UI loads in terraced groves
// where signal drops to zero. Mutations are NOT intercepted here — they
// are queued by the in-app IndexedDB outbox (see lib/offline-drain.ts)
// because that gives us a visible queue and per-item retry. Photo PUTs
// to object storage are also not intercepted.

const CACHE_VERSION = "khalaf-field-v1";
const SHELL_CACHE = `${CACHE_VERSION}-shell`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;

// Path-prefix this build is mounted under. Derived dynamically from the
// SW's own location (e.g. https://host/field/sw.js → "/field/") so the
// same file works under any deployment base path without a rebuild.
const BASE = new URL("./", self.location.href).pathname;

// Endpoints whose latest successful response we cache so workers can
// open the app cold while offline and still see meaningful content.
const READ_THROUGH = [
  "/api/tasks",
  "/api/trees",
  "/api/groves",
  "/api/users/me",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) =>
      cache.addAll([BASE, BASE + "index.html"]).catch(() => {
        // Vite dev server may 404 these on first install; not fatal.
      }),
    ),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => !k.startsWith(CACHE_VERSION))
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  // Same-origin only — never proxy storage / CDN URLs.
  if (url.origin !== self.location.origin) return;

  // App-shell navigation: return cached index.html when offline so the
  // worker can still open the PWA cold.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req).catch(() =>
        caches
          .match(BASE + "index.html")
          .then((r) => r ?? caches.match(BASE) ?? new Response("offline", { status: 503 })),
      ),
    );
    return;
  }

  // Static built assets (vite emits hashed filenames under /field/assets/).
  if (url.pathname.startsWith(BASE) && /\.(js|css|woff2?|svg|png|jpg|webp|ico)$/.test(url.pathname)) {
    event.respondWith(
      caches.match(req).then((cached) => {
        const network = fetch(req)
          .then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(SHELL_CACHE).then((c) => c.put(req, copy));
            }
            return res;
          })
          .catch(() => cached ?? Response.error());
        return cached ?? network;
      }),
    );
    return;
  }

  // Read-through cache for the small allow-list of API GETs.
  if (READ_THROUGH.some((p) => url.pathname === p || url.pathname.startsWith(p + "/"))) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(RUNTIME_CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() =>
          caches.match(req).then((cached) => cached ?? new Response(JSON.stringify({ offline: true }), {
            status: 503,
            headers: { "Content-Type": "application/json" },
          })),
        ),
    );
  }
});
