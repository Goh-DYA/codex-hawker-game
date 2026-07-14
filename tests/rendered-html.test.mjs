import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the release game shell", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  assert.match(response.headers.get("content-security-policy") ?? "", /default-src 'self'/);
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");

  const html = await response.text();
  assert.match(html, /<title>Hawker Simulator/);
  assert.match(html, /Build a place everyone can share/);
  assert.match(html, /data-testid="game-world"/);
  assert.match(html, /data-testid="build-catalogue"/);
  assert.match(html, /Open centre/);
  assert.match(html, /Open settings/);
  assert.match(html, /10×/);
  assert.match(html, /Three ways to grow/);
  assert.match(html, />Access</);
  assert.match(html, /manifest\.webmanifest/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape|react-loading-skeleton/);
});

test("ships a versioned, update-gated offline shell", async () => {
  const [serviceWorker, manifest] = await Promise.all([
    readFile(new URL("../public/sw.js", import.meta.url), "utf8"),
    readFile(new URL("../public/manifest.webmanifest", import.meta.url), "utf8"),
  ]);
  const parsedManifest = JSON.parse(manifest);
  assert.equal(parsedManifest.name, "Hawker Simulator");
  assert.equal(parsedManifest.start_url, "/");
  assert.equal(parsedManifest.display, "standalone");
  assert.match(serviceWorker, /hawker-simulator-1\.0\.0-[a-f0-9]{12}/);
  assert.match(serviceWorker, /WARM_CACHE/);
  assert.match(serviceWorker, /ACTIVATE_UPDATE/);
  assert.match(serviceWorker, /if \(await cache\.match\(url\)\) return/);
  assert.doesNotMatch(
    serviceWorker.match(/self\.addEventListener\("install"[\s\S]*?\n\}\);/)?.[0] ?? "",
    /skipWaiting/,
  );
});
