import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const root = new URL("../", import.meta.url);

describe("insights panel layout", () => {
  it("renders Centre journey milestones as aligned label/value rows", async () => {
    const [componentSource, cssSource] = await Promise.all([
      readFile(new URL("app/game/HawkerSimulator.tsx", root), "utf8"),
      readFile(new URL("app/globals.css", root), "utf8"),
    ]);

    expect(componentSource).toContain('<dl className="milestone-progress-list">');
    expect(componentSource).toContain("track.progress).toLocaleString()");
    expect(cssSource).toContain(".milestone-progress-list > div");
    expect(cssSource).toContain("grid-template-columns: minmax(0, 1fr) auto");
    expect(cssSource).toContain("font-variant-numeric: tabular-nums");
  });

  it("keeps insight typography on one shared scale", async () => {
    const cssSource = await readFile(new URL("app/globals.css", root), "utf8");

    expect(cssSource).toContain("--insight-title-size: 0.69rem");
    expect(cssSource).toContain("--insight-body-size: 0.61rem");
    expect(cssSource).toContain("--insight-status-size: 0.63rem");
    expect(cssSource).toContain("--insight-detail-size: 0.58rem");
    expect(cssSource).toContain("font-size: var(--insight-detail-size)");
    expect(cssSource).toContain("font-size: var(--insight-status-size)");
  });
});
