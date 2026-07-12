export interface PwaStatusHandlers {
  onOfflineReady(): void;
  onUpdateReady(): void;
  onConnectivityChange(online: boolean): void;
  onOfflineError(message: string): void;
}

async function warmRuntimeCache(
  registration: ServiceWorkerRegistration,
  worker = registration.active,
): Promise<void> {
  if (!worker) throw new Error("The offline worker is not active yet.");
  const resourceUrls = performance
    .getEntriesByType("resource")
    .map((entry) => entry.name)
    .filter((url) => url.startsWith(location.origin));
  const urls = [...new Set([location.origin + "/", ...resourceUrls])];
  const channel = new MessageChannel();
  const result = await new Promise<{ ok: boolean; failed: number }>((resolve, reject) => {
    const timeout = window.setTimeout(
      () => reject(new Error("Offline caching timed out.")),
      20_000,
    );
    channel.port1.onmessage = (event) => {
      window.clearTimeout(timeout);
      resolve(event.data as { ok: boolean; failed: number });
    };
    worker.postMessage({ type: "WARM_CACHE", urls }, [channel.port2]);
  });
  if (!result.ok) throw new Error(`${result.failed} game files could not be cached.`);
}

export function registerPwa(handlers: PwaStatusHandlers): () => void {
  const updateConnectivity = () => handlers.onConnectivityChange(navigator.onLine);
  window.addEventListener("online", updateConnectivity);
  window.addEventListener("offline", updateConnectivity);
  updateConnectivity();

  if (!("serviceWorker" in navigator) || process.env.NODE_ENV !== "production") {
    return () => {
      window.removeEventListener("online", updateConnectivity);
      window.removeEventListener("offline", updateConnectivity);
    };
  }

  void navigator.serviceWorker
    .register("/sw.js")
    .then(async (registration) => {
      registration.addEventListener("updatefound", () => {
        const worker = registration.installing;
        worker?.addEventListener("statechange", () => {
          if (worker.state === "installed" && navigator.serviceWorker.controller) {
            void warmRuntimeCache(registration, worker)
              .then(() => handlers.onUpdateReady())
              .catch((error) =>
                handlers.onOfflineError(
                  error instanceof Error
                    ? `Update cache: ${error.message}`
                    : "The update cache could not be verified.",
                ),
              );
          }
        });
      });
      const ready = await navigator.serviceWorker.ready;
      await warmRuntimeCache(ready);
      handlers.onOfflineReady();
      if (registration.waiting) {
        await warmRuntimeCache(registration, registration.waiting);
        handlers.onUpdateReady();
      }
    })
    .catch((error) =>
      handlers.onOfflineError(
        error instanceof Error ? error.message : "Offline caching is unavailable.",
      ),
    );

  return () => {
    window.removeEventListener("online", updateConnectivity);
    window.removeEventListener("offline", updateConnectivity);
  };
}
