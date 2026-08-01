const BUILD_ID = new URL(self.location.href).searchParams.get("v")?.replace(/[^A-Za-z0-9._-]/g, "_") || "development";
const CACHE_NAME = `dsp-idle-shell-${BUILD_ID}`;
const APP_SHELL = ["/", "/index.html", "/manifest.webmanifest", "/icon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;
  if (event.request.mode === "navigate") {
    event.respondWith(fetch(event.request).then((response) => {
      // Clone synchronously while the response body is still untouched. A
      // delayed clone inside the cache promise races the page consumer and
      // produces "Response body is already used" in Chromium.
      const cacheCopy = response.ok ? response.clone() : null;
      if (cacheCopy) void caches.open(CACHE_NAME).then((cache) => cache.put("/index.html", cacheCopy)).catch(() => undefined);
      return response;
    }).catch(() => caches.match("/index.html")));
    return;
  }
  event.respondWith(caches.match(event.request).then((cached) => {
    const network = fetch(event.request).then((response) => {
      const cacheCopy = response.ok ? response.clone() : null;
      if (cacheCopy) void caches.open(CACHE_NAME).then((cache) => cache.put(event.request, cacheCopy)).catch(() => undefined);
      return response;
    }).catch(() => cached ?? Response.error());
    return cached ?? network;
  }));
});
