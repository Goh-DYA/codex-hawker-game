import { describe, expect, it } from "vitest";
import { deriveSatisfactionTips } from "../src/game/runtime/satisfactionInsight";

describe("guest happiness guidance", () => {
  it("prioritizes the changes with the largest weighted happiness impact", () => {
    const tips = deriveSatisfactionTips({
      foodQuality: 62,
      wait: 71,
      value: 74,
      walking: 90,
      comfort: 80,
      cleanliness: 92,
      ambience: 84,
    });

    expect(tips.map((tip) => tip.factor)).toEqual(["foodQuality", "wait"]);
    expect(tips[0]?.action).toContain("higher-quality dishes");
    expect(tips[1]?.action).toContain("service speed");
  });

  it("can recommend layout and cleanliness actions when they are the main weaknesses", () => {
    const tips = deriveSatisfactionTips({
      foodQuality: 95,
      wait: 95,
      value: 95,
      walking: 30,
      comfort: 95,
      cleanliness: 35,
      ambience: 95,
    });

    expect(tips.map((tip) => tip.factor)).toEqual(["walking", "cleanliness"]);
    expect(tips[0]?.action).toContain("Clear direct routes");
    expect(tips[1]?.action).toContain("tray returns");
  });

  it("returns no advice before the first rating", () => {
    expect(deriveSatisfactionTips(undefined)).toEqual([]);
  });
});
