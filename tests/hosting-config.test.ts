import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import nextConfig from "../next.config";
import { SECURITY_HEADERS } from "../src/config/securityHeaders";

const root = new URL("../", import.meta.url);

describe("dual-target hosting configuration", () => {
  it("uses a native Next.js build for Vercel", async () => {
    const [packageSource, vercelSource] = await Promise.all([
      readFile(new URL("package.json", root), "utf8"),
      readFile(new URL("vercel.json", root), "utf8"),
    ]);
    const packageJson = JSON.parse(packageSource);
    const vercelConfig = JSON.parse(vercelSource);

    expect(packageJson.scripts.build).toBe("vinext build");
    expect(packageJson.scripts["build:vercel"]).toContain("stamp-service-worker.mjs");
    expect(packageJson.scripts["build:vercel"]).toContain("next build");
    expect(vercelConfig.framework).toBe("nextjs");
    expect(vercelConfig.buildCommand).toBe("npm run build:vercel");
  });

  it("applies the shared security policy to Next.js responses", async () => {
    expect(nextConfig.headers).toBeTypeOf("function");
    const routes = await nextConfig.headers!();

    expect(routes).toEqual([
      {
        source: "/:path*",
        headers: Object.entries(SECURITY_HEADERS).map(([key, value]) => ({
          key,
          value,
        })),
      },
    ]);
    expect(SECURITY_HEADERS["Content-Security-Policy"]).toContain("default-src 'self'");
    expect(SECURITY_HEADERS["X-Content-Type-Options"]).toBe("nosniff");
  });

  it("keeps the Cloudflare worker on the shared header source", async () => {
    const workerSource = await readFile(new URL("worker/index.ts", root), "utf8");
    expect(workerSource).toContain('from "../src/config/securityHeaders"');
    expect(workerSource).not.toContain("const SECURITY_HEADERS = {");
  });
});
