/// Rezeptmeister Service Worker
/// Hand-written — no build step required.

const CACHE_NAME = "rezeptmeister-v3";
const OFFLINE_URL = "/offline";

// Assets to pre-cache on install.
// /einkaufsliste is auth-gated, so it is precached best-effort (see precache()).
const PRECACHE_URLS = [OFFLINE_URL, "/einkaufsliste"];

// ── Install ──────────────────────────────────────────────────────────────────

self.addEventListener("install", (event) => {
  event.waitUntil(precache().then(() => self.skipWaiting()));
});

// cache.addAll() would abort the whole install if a single URL fails — and
// /einkaufsliste redirects to the login page whenever no session cookie is
// present. Fetch each URL on its own, skip redirects so no login page ends up
// cached under an app URL, and never let a failure block activation.
async function precache() {
  const cache = await caches.open(CACHE_NAME);
  await Promise.all(
    PRECACHE_URLS.map(async (url) => {
      try {
        const response = await fetch(url, { credentials: "same-origin" });
        if (response.ok && !response.redirected) {
          await cache.put(url, response);
        }
      } catch {
        // Offline during install — navigationHandler still degrades gracefully.
      }
    }),
  );
}

// ── Activate ─────────────────────────────────────────────────────────────────

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

// ── Fetch ────────────────────────────────────────────────────────────────────

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle same-origin requests
  if (url.origin !== self.location.origin) return;

  // Skip non-GET
  if (request.method !== "GET") return;

  // Strategy 1: CacheFirst for static assets (hashed by Next.js)
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // Strategy 2: CacheFirst for uploaded images
  if (url.pathname.startsWith("/uploads/")) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // Strategy 3: CacheFirst for PWA icons
  if (url.pathname.startsWith("/icons/")) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // API routes: never cache — they carry auth-scoped data.
  // Offline recipe data is served from IndexedDB, not Cache Storage.
  if (url.pathname.startsWith("/api/")) {
    return; // let the browser handle it (network-only)
  }

  // Strategy 4: Navigation requests — NetworkFirst with offline fallback
  if (request.mode === "navigate") {
    event.respondWith(navigationHandler(request));
    return;
  }

  // Default: NetworkFirst
  event.respondWith(networkFirst(request));
});

// ── Caching Strategies ───────────────────────────────────────────────────────

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response("Offline", { status: 503 });
  }
}

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    return cached || new Response("Offline", { status: 503 });
  }
}

async function navigationHandler(request) {
  try {
    const response = await fetch(request);
    return response;
  } catch {
    // Offline — prefer a precached copy of this very page (e.g. /einkaufsliste),
    // otherwise fall back to the generic offline page.
    const cached = await caches.match(request, { ignoreSearch: true });
    if (cached) return cached;

    const offline = await caches.match(OFFLINE_URL);
    return offline || new Response("Offline", { status: 503 });
  }
}

// ── Message Handler ──────────────────────────────────────────────────────────

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }

  // On logout: wipe all cached responses so no auth data leaks across sessions.
  if (event.data?.type === "CLEAR_CACHES") {
    caches
      .keys()
      .then((keys) => Promise.all(keys.map((k) => caches.delete(k))));
  }
});
