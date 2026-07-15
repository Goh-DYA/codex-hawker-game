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

    assert.equal(report.counts.stalls, 12);
    assert.equal(report.counts.dishes, 46);
    assert.equal(report.counts.placeables, 80);
    assert.equal(report.counts.customerArchetypes, 12);
    assert.equal(report.counts.localizationKeys, 300);
  });

  it("ships four new customer personas with distinct demand roles", () => {
    const ids = new Set(CUSTOMER_ARCHETYPES.map((customer) => customer.id));

    assert.ok(ids.has("customer.afternoon-treat-stopper"));
    assert.ok(ids.has("customer.plant-forward-planner"));
    assert.ok(ids.has("customer.quiet-break-regular"));
    assert.ok(ids.has("customer.night-shift-recharger"));
    assert.equal(
      new Set(
        CUSTOMER_ARCHETYPES.map((customer) =>
          [
            customer.visualRules.outfitSilhouette,
            customer.visualRules.garmentPattern,
            customer.visualRules.carryProp,
          ].join(":"),
        ),
      ).size,
      CUSTOMER_ARCHETYPES.length,
    );
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

  it("ships four distinctive expanded hawker menus", () => {
    const expectedMenus = {
      "stall.mee-pok-junction": [
        "dish.bak-chor-mee",
        "dish.fishball-mee-pok",
        "dish.lor-mee",
        "dish.teochew-fish-dumpling-soup",
      ],
      "stall.sweet-monsoon": [
        "dish.chendol",
        "dish.tau-huay",
        "dish.teh-tarik",
        "dish.pulut-hitam",
      ],
      "stall.satay-meridian": [
        "dish.chicken-satay-set",
        "dish.bbq-chicken-wings",
        "dish.beef-satay-set",
        "dish.sambal-grilled-squid",
      ],
      "stall.bamboo-basket": [
        "dish.har-gow",
        "dish.siew-mai",
        "dish.char-siew-bao",
        "dish.lotus-leaf-rice",
      ],
    } as const;

    for (const [stallId, dishIds] of Object.entries(expectedMenus)) {
      const stall = STALLS.find((candidate) => candidate.id === stallId);
      assert.ok(stall, `${stallId} must be present`);
      assert.deepEqual(stall.dishIds, dishIds);

      const openingDish = DISHES.find((dish) => dish.id === dishIds[0]);
      assert.ok(openingDish, `${stallId} must have an opening dish`);
      assert.equal(
        openingDish.unlockRequirement.level,
        stall.unlockRequirement.level,
      );
      assert.equal(
        openingDish.unlockRequirement.reputation,
        stall.unlockRequirement.reputation,
      );
    }
  });

  it("labels every explicitly peanut-bearing dish", () => {
    const peanutDishIds = DISHES
      .filter((dish) => dish.dietaryTags.includes("contains-peanuts"))
      .map((dish) => dish.id);

    assert.deepEqual(peanutDishIds, [
      "dish.nasi-lemak",
      "dish.lemon-rice",
      "dish.chicken-satay-set",
      "dish.beef-satay-set",
    ]);
  });

  it("gives every stall and dish a unique primary visual reference", () => {
    const stallVisuals = STALLS.map(
      (stall) => `${stall.visual.sprite.atlas}:${stall.visual.sprite.frame}`,
    );
    const dishVisuals = DISHES.map(
      (dish) => `${dish.foodSprite.atlas}:${dish.foodSprite.frame}`,
    );

    assert.equal(new Set(stallVisuals).size, STALLS.length);
    assert.equal(new Set(dishVisuals).size, DISHES.length);
  });

  it("starts every stall queue at the service counter", () => {
    for (const stall of STALLS) {
      assert.deepEqual(stall.queueAnchor, stall.servicePoint, `${stall.id} leaves a gap before its queue`);
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

  it("rejects reused stall and food visual references", () => {
    const broken = structuredClone(LAUNCH_CONTENT) as unknown as {
      stalls: Array<{
        visual: { sprite: { atlas: string; frame: string } };
      }>;
      dishes: Array<{
        foodSprite: { atlas: string; frame: string };
      }>;
    };
    broken.stalls[1].visual.sprite = broken.stalls[0].visual.sprite;
    broken.dishes[1].foodSprite = broken.dishes[0].foodSprite;

    assert.throws(
      () => validateContent(broken),
      (error) =>
        error instanceof ContentValidationError &&
        error.issues.some((issue) => issue.includes("reuses stall visual")) &&
        error.issues.some((issue) => issue.includes("reuses food visual")),
    );
  });

  it("rejects a reused customer visual treatment", () => {
    const broken = structuredClone(LAUNCH_CONTENT) as unknown as {
      customerArchetypes: Array<{
        visualRules: {
          outfitSilhouette: string;
          garmentPattern: string;
          carryProp: string;
        };
      }>;
    };
    broken.customerArchetypes[1].visualRules = {
      ...broken.customerArchetypes[1].visualRules,
      ...broken.customerArchetypes[0].visualRules,
    };

    assert.throws(
      () => validateContent(broken),
      (error) =>
        error instanceof ContentValidationError &&
        error.issues.some((issue) =>
          issue.includes("reuses another customer visual treatment"),
        ),
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

  it("rejects peanut-bearing copy without the peanut dietary tag", () => {
    const broken = structuredClone(LAUNCH_CONTENT) as unknown as {
      dishes: Array<{ id: string; dietaryTags: string[] }>;
    };
    const nasiLemak = broken.dishes.find(
      (dish) => dish.id === "dish.nasi-lemak",
    );
    assert.ok(nasiLemak);
    nasiLemak.dietaryTags = nasiLemak.dietaryTags.filter(
      (tag) => tag !== "contains-peanuts",
    );

    assert.throws(
      () => validateContent(broken),
      (error) =>
        error instanceof ContentValidationError &&
        error.issues.some((issue) =>
          issue.includes("missing the contains-peanuts dietary tag"),
        ),
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
