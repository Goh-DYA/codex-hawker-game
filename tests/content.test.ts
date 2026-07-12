import assert from "node:assert/strict";
import { describe, it } from "vitest";

import {
  CUSTOMER_ARCHETYPES,
  DISHES,
  ENGLISH_LOCALIZATION,
  LAUNCH_CONTENT,
  PLACEABLES,
  PLACEABLE_CATEGORY_MINIMUMS,
  STALLS,
  ContentValidationError,
  validateContent,
} from "../src/content/index";

describe("launch content", () => {
  it("ships the exact required stall, dish, and customer counts", () => {
    const report = validateContent();

    assert.equal(report.counts.stalls, 8);
    assert.equal(report.counts.dishes, 30);
    assert.equal(report.counts.placeables, 80);
    assert.equal(report.counts.customerArchetypes, 8);
    assert.equal(report.counts.localizationKeys, 252);
  });

  it("meets every meaningful placeable category minimum", () => {
    const report = validateContent();

    for (const [category, minimum] of Object.entries(
      PLACEABLE_CATEGORY_MINIMUMS,
    )) {
      assert.ok(
        report.categoryCounts[category as keyof typeof report.categoryCounts] >=
          minimum,
        `${category} must contain at least ${minimum} items`,
      );
    }
  });

  it("keeps every stall and dish link reciprocal", () => {
    const stalls = new Map(STALLS.map((stall) => [stall.id, stall]));
    const dishes = new Map(DISHES.map((dish) => [dish.id, dish]));

    for (const stall of STALLS) {
      for (const dishId of stall.dishIds) {
        assert.ok(dishes.has(dishId), `${stall.id} references ${dishId}`);
        assert.ok(dishes.get(dishId)?.stallIds.includes(stall.id));
      }
    }
    for (const dish of DISHES) {
      assert.equal(dish.stallIds.length, 1);
      assert.ok(stalls.get(dish.stallIds[0])?.dishIds.includes(dish.id));
    }
  });

  it("provides complete non-placeholder English copy", () => {
    const records = [...STALLS, ...DISHES, ...PLACEABLES, ...CUSTOMER_ARCHETYPES];
    assert.equal(Object.keys(ENGLISH_LOCALIZATION).length, records.length * 2);

    for (const record of records) {
      assert.match(ENGLISH_LOCALIZATION[record.nameKey], /\S{3}/);
      assert.doesNotMatch(
        ENGLISH_LOCALIZATION[record.nameKey],
        /todo|tbd|placeholder|unnamed/i,
      );
      assert.ok(ENGLISH_LOCALIZATION[record.descriptionKey].length >= 36);
    }
  });

  it("reports duplicate IDs as actionable validation errors", () => {
    const broken = structuredClone(LAUNCH_CONTENT) as unknown as {
      stalls: Array<{ id: string }>;
    };
    broken.stalls[1].id = broken.stalls[0].id;

    assert.throws(
      () => validateContent(broken),
      (error) =>
        error instanceof ContentValidationError &&
        error.issues.some((issue) => issue.includes("Duplicate stall ID")),
    );
  });

  it("reports a broken stall-to-dish reference", () => {
    const broken = structuredClone(LAUNCH_CONTENT) as unknown as {
      stalls: Array<{ dishIds: string[] }>;
    };
    broken.stalls[0].dishIds[0] = "dish.missing-dish";

    assert.throws(
      () => validateContent(broken),
      (error) =>
        error instanceof ContentValidationError &&
        error.issues.some((issue) => issue.includes("links to missing dish")),
    );
  });

  it("reports missing localization", () => {
    const broken = structuredClone(LAUNCH_CONTENT) as unknown as {
      localization: Record<string, string>;
    };
    delete broken.localization[STALLS[0].nameKey];

    assert.throws(
      () => validateContent(broken),
      (error) =>
        error instanceof ContentValidationError &&
        error.issues.some((issue) => issue.includes("missing localization key")),
    );
  });

  it("rejects unlocks beyond the reachable progression cap", () => {
    const broken = structuredClone(LAUNCH_CONTENT) as unknown as {
      placeables: Array<{ unlockRequirement: { level: number } }>;
    };
    broken.placeables[0].unlockRequirement.level = 21;

    assert.throws(
      () => validateContent(broken),
      (error) =>
        error instanceof ContentValidationError &&
        error.issues.some((issue) => issue.includes("exceeds max level")),
    );
  });

  it("rejects circular unlock prerequisites", () => {
    const broken = structuredClone(LAUNCH_CONTENT) as unknown as {
      placeables: Array<{
        id: string;
        unlockRequirement: {
          level: number;
          reputation: number;
          prerequisiteIds: string[];
        };
      }>;
    };
    const first = broken.placeables[0];
    const second = broken.placeables[1];
    first.unlockRequirement.level = 2;
    first.unlockRequirement.reputation = 10;
    first.unlockRequirement.prerequisiteIds = [second.id];
    second.unlockRequirement.prerequisiteIds = [first.id];

    assert.throws(
      () => validateContent(broken),
      (error) =>
        error instanceof ContentValidationError &&
        error.issues.some((issue) => issue.includes("prerequisite cycle")),
    );
  });
});
