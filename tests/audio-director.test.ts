import { readdir, readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const root = new URL("../", import.meta.url);

async function filesBelow(url: URL): Promise<string[]> {
  const entries = await readdir(url, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const child = new URL(entry.name + (entry.isDirectory() ? "/" : ""), url);
    return entry.isDirectory() ? filesBelow(child) : [child.pathname];
  }));
  return nested.flat();
}

describe("procedural adaptive audio", () => {
  it("uses state-aware Web Audio synthesis with lifecycle and voice controls", async () => {
    const source = await readFile(new URL("src/game/audio/AudioDirector.ts", root), "utf8");
    expect(source).toContain("createOscillator");
    expect(source).toContain("setGameplayState");
    expect(source).toContain("visibilitychange");
    expect(source).toContain("setVoiceLimit");
    expect(source).toContain("oscillator.disconnect");
    expect(source).not.toMatch(/fetch\(|new Audio\(/);
  });

  it("ships no external recorded music files", async () => {
    const files = await filesBelow(new URL("public/", root));
    expect(files.filter((file) => /\.(mp3|ogg|wav|m4a|aac|flac)$/i.test(file))).toEqual([]);
  });
});
