import { createHash } from "node:crypto";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const serviceWorkerPath = fileURLToPath(new URL("../public/sw.js", import.meta.url));
const sourceRoots = ["app", "src", "public"];
const includedExtensions = new Set([
  ".css",
  ".html",
  ".js",
  ".json",
  ".svg",
  ".ts",
  ".tsx",
  ".webmanifest",
]);

async function collect(directory, files = []) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await collect(path, files);
    else if (includedExtensions.has(extname(entry.name)) && path !== serviceWorkerPath) {
      files.push(path);
    }
  }
  return files;
}

const hash = createHash("sha256");
for (const sourceRoot of sourceRoots) {
  const directory = join(root, sourceRoot);
  const files = await collect(directory).catch(() => []);
  for (const file of files.sort()) {
    hash.update(relative(root, file));
    hash.update(await readFile(file));
  }
}
hash.update(await readFile(new URL("../package-lock.json", import.meta.url)));
const buildHash = hash.digest("hex").slice(0, 12);
const source = await readFile(serviceWorkerPath, "utf8");
const stamped = source.replace(
  /const BUILD_ID = "hawker-simulator-[^"]+";/,
  `const BUILD_ID = "hawker-simulator-1.0.0-${buildHash}";`,
);
if (stamped === source && !source.includes(`1.0.0-${buildHash}`)) {
  throw new Error("Could not locate the service-worker BUILD_ID declaration.");
}
if (stamped !== source) await writeFile(serviceWorkerPath, stamped, "utf8");
process.stdout.write(`Service worker build id: ${buildHash}\n`);
