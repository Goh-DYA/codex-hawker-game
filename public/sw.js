const BUILD_ID = "hawker-simulator-1.0.0-3e25823ed59c";
const CACHE_PREFIX = "hawker-simulator-";
const SHELL_CACHE = `${BUILD_ID}-shell`;
const RUNTIME_CACHE = `${BUILD_ID}-runtime`;
const CORE = ["/", "/offline.html", "/manifest.webmanifest", "/icons/icon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(SHELL_CACHE).then((cache) => cache.addAll(CORE)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith(CACHE_PREFIX) && !key.startsWith(BUILD_ID))
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "ACTIVATE_UPDATE") {
    self.skipWaiting();
    return;
  }
  if (event.data?.type === "WARM_CACHE" && Array.isArray(event.data.urls)) {
    const sameOriginUrls = event.data.urls.filter((value) => {
      try {
        return new URL(value, self.location.origin).origin === self.location.origin;
      } catch {
        return false;
      }
    });
    event.waitUntil(
      caches.open(RUNTIME_CACHE).then(async (cache) => {
        const results = await Promise.allSettled(
          sameOriginUrls.map(async (url) => {
            if (await cache.match(url)) return;
            await cache.add(url);
          }),
        );
        const failed = results.filter((result) => result.status === "rejected").length;
        event.ports[0]?.postMessage({ ok: failed === 0, failed, cached: results.length - failed });
      }),
    );
  }
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const response = await fetch(request);
          if (
            response.ok &&
            url.pathname === "/" &&
            response.headers.get("content-type")?.includes("text/html")
          ) {
            const cache = await caches.open(SHELL_CACHE);
            await cache.put("/", response.clone());
          }
          return response;
        } catch {
          const cache = await caches.open(SHELL_CACHE);
          return (await cache.match("/")) || (await cache.match("/offline.html"));
        }
      })(),
    );
    return;
  }

  event.respondWith(
    (async () => {
      const shell = await caches.open(SHELL_CACHE);
      const runtime = await caches.open(RUNTIME_CACHE);
      const cached = (await runtime.match(request)) || (await shell.match(request));
      if (cached) return cached;
      const response = await fetch(request);
      if (response.ok) await runtime.put(request, response.clone());
      return response;
    })(),
  );
});
