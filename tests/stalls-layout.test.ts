import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const root = new URL("../", import.meta.url);

describe("Stalls panel typography", () => {
  it("styles upgrade actions on the same scale as the queue manager", async () => {
    const [componentSource, cssSource] = await Promise.all([
      readFile(new URL("app/game/HawkerSimulator.tsx", root), "utf8"),
      readFile(new URL("app/globals.css", root), "utf8"),
    ]);

    expect(componentSource).toContain('className="stall-upgrade-button"');
    expect(componentSource).toContain("Upgrade to level {mastery.upgradeLevel + 1}");
    expect(componentSource).toContain("Requires mastery rank {mastery.requiredRank}");
    expect(cssSource).toContain("--stall-action-size: 0.56rem");
    expect(cssSource).toContain(".stall-upgrade-button {");
    expect(cssSource).toContain("font-size: var(--stall-action-size)");
  });
});
