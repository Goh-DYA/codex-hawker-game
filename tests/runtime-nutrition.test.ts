import { describe, expect, it } from "vitest";
import { NUTRITION_CONTENT, STALLS } from "../src/content";
import {
  customerAtRenderedGridPoint,
  customerDecisionReasons,
  customerHealthDecisionReasons,
  decodeRuntimeSave,
  defaultDishVariants,
  resolveDishVariants,
  resolvePersistedDishVariants,
} from "../src/game/runtime/createHawkerRuntime";
import type { GameState, SimulationCatalog } from "../src/game/core";

function progressionWithRanks(
  ranks: Readonly<Record<string, number>>,
): Pick<GameState, "progression"> {
  return {
    progression: {
      xp: 0,
      level: 12,
      reputation: 5,
      unlockedDefinitionIds: [],
      expansionCount: 0,
      focusDay: 1,
      dailyObjectives: [],
      claimedMilestoneIds: [],
      stallMastery: Object.fromEntries(Object.entries(ranks).map(([id, rank]) => [
        id,
        { points: 0, rank, upgradeLevel: 1 as const },
      ])),
    },
  };
}

describe("runtime nutrition persistence", () => {
  it("hit-tests moving customers on the tile where their avatar is rendered", () => {
    const customer = {
      id: "moving-customer",
      position: { x: 2, y: 3 },
      path: [{ x: 3, y: 3 }],
      pathIndex: 0,
      movementProgress: 0.75,
    };

    expect(customerAtRenderedGridPoint([customer], { x: 2, y: 3 })).toBeUndefined();
    expect(customerAtRenderedGridPoint([customer], { x: 3, y: 3 })).toBe(customer);
    expect(customerAtRenderedGridPoint([customer], { x: 2, y: 3 }, true)).toBe(customer);
  });

  it("surfaces at most two neutral decision factors for an ordered dish", () => {
    const reviewedProfile = NUTRITION_CONTENT.profiles.find(
      (profile) =>
        profile.status === "released" &&
        typeof profile.intentFits["fibre-forward"] === "number",
    );
    expect(reviewedProfile).toBeDefined();
    const catalog: SimulationCatalog = {
      placeables: {},
      dishes: {
        selected: {
          id: "selected",
          price: 6,
          preparationMs: 1_000,
          eatingMs: 1_000,
          quality: 3,
          preferenceTags: ["familiar"],
        },
      },
      archetypes: {
        guest: {
          id: "guest",
          budget: 12,
          patienceMs: 10_000,
          walkingSpeed: 1,
          priceSensitivity: 1,
          qualitySensitivity: 1,
          queueSensitivity: 1,
          distanceSensitivity: 1,
          preferenceTags: ["familiar"],
        },
      },
    };

    const reasons = customerDecisionReasons({
      archetypeId: "guest",
      orderedDishId: "selected",
      nutritionIntentId: "fibre-forward",
      orderedNutritionProfile: reviewedProfile,
    }, catalog);

    expect(reasons).toHaveLength(2);
    expect(reasons[0]).toBe("Familiar flavour preference");
    expect(["Visit intent fit", "Nutrition trade-off"]).toContain(reasons[1]);
  });

  it("explains each condition-aware rating using the nutrient family considered", () => {
    const reviewedProfile = NUTRITION_CONTENT.profiles.find(
      (profile) =>
        profile.status === "released" &&
        typeof profile.conditionRatings?.hypertension === "number",
    );
    expect(reviewedProfile).toBeDefined();

    const reasons = customerHealthDecisionReasons({
      healthConditions: ["hypertension", "diabetes"],
      orderedNutritionProfile: reviewedProfile,
    });

    expect(reasons.some((reason) => reason.includes("Managing hypertension"))).toBe(true);
    expect(reasons.some((reason) => reason.includes("sodium"))).toBe(true);
    expect(reasons.some((reason) => reason.includes("carbohydrate, total sugar"))).toBe(true);
  });

  it("migrates raw core and runtime V1 envelopes without inventing variant selections", () => {
    const raw = { schemaVersion: 3 };
    expect(decodeRuntimeSave(raw)).toEqual({ core: raw });
    expect(decodeRuntimeSave({
      runtimeSchemaVersion: 1,
      core: raw,
      stallMenus: {},
    })).toMatchObject({
      core: raw,
      runtimeSchemaVersion: 1,
      variants: undefined,
      nutritionDataVersion: undefined,
    });
  });

  it("decodes runtime V2 selections and the nutrition data version", () => {
    const defaults = defaultDishVariants();
    const decoded = decodeRuntimeSave({
      runtimeSchemaVersion: 2,
      core: { schemaVersion: 4 },
      stallMenus: {},
      nutritionDataVersion: NUTRITION_CONTENT.dataVersion,
      activeDishVariants: defaults,
    });
    expect(decoded.variants).toEqual(defaults);
    expect(decoded.nutritionDataVersion).toBe(NUTRITION_CONTENT.dataVersion);
  });

  it("falls back from missing or locked variants and accepts an unlocked reviewed variant", () => {
    const family = NUTRITION_CONTENT.variantFamilies.find(
      (candidate) => candidate.variants.some((variant) => variant.unlockRank > 1),
    );
    expect(family).toBeDefined();
    const locked = family!.variants.find((variant) => variant.unlockRank > 1)!;
    const completeSelections = defaultDishVariants();
    const lowRank = resolveDishVariants(
      { ...completeSelections, [family!.dishId]: locked.id },
      progressionWithRanks({}),
    );
    expect(lowRank.recovered).toBe(true);
    expect(lowRank.selections[family!.dishId]).toBe(family!.defaultVariantId);

    const stall = STALLS.find((candidate) => candidate.dishIds.includes(family!.dishId));
    expect(stall).toBeDefined();
    const unlocked = resolveDishVariants(
      { ...completeSelections, [family!.dishId]: locked.id },
      progressionWithRanks({ [stall!.id]: locked.unlockRank }),
    );
    expect(unlocked.recovered).toBe(false);
    expect(unlocked.selections[family!.dishId]).toBe(locked.id);

    const missing = resolveDishVariants(
      { ...completeSelections, [family!.dishId]: "retired-variant" },
      progressionWithRanks({ [stall!.id]: 7 }),
    );
    expect(missing.recovered).toBe(true);
    expect(missing.selections[family!.dishId]).toBe(family!.defaultVariantId);

    const tampered = resolveDishVariants(
      {
        ...completeSelections,
        [family!.dishId]: 42,
        "dish.retired-family": "retired-variant",
      },
      progressionWithRanks({ [stall!.id]: 7 }),
    );
    expect(tampered.recovered).toBe(true);
    expect(tampered.selections[family!.dishId]).toBe(family!.defaultVariantId);

    const partial = resolveDishVariants({}, progressionWithRanks({}));
    expect(partial.recovered).toBe(true);
  });

  it("resets otherwise-valid selections when the nutrition data version is outdated", () => {
    const family = NUTRITION_CONTENT.variantFamilies.find(
      (candidate) => candidate.variants.some((variant) => variant.unlockRank > 1),
    );
    expect(family).toBeDefined();
    const alternative = family!.variants.find((variant) => variant.unlockRank > 1)!;
    const stall = STALLS.find((candidate) => candidate.dishIds.includes(family!.dishId));
    expect(stall).toBeDefined();

    const resolved = resolvePersistedDishVariants(
      { [family!.dishId]: alternative.id },
      "outdated-nutrition-snapshot",
      progressionWithRanks({ [stall!.id]: 7 }),
    );

    expect(resolved.recovered).toBe(true);
    expect(resolved.selections[family!.dishId]).toBe(family!.defaultVariantId);

    const missingVersion = resolvePersistedDishVariants(
      { [family!.dishId]: alternative.id },
      undefined,
      progressionWithRanks({ [stall!.id]: 7 }),
    );
    expect(missingVersion.recovered).toBe(true);
    expect(missingVersion.selections[family!.dishId]).toBe(family!.defaultVariantId);
  });
});
