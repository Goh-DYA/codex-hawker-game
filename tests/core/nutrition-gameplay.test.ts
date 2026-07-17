import { describe, expect, it } from "vitest";
import {
  averageRankPercentiles,
  bestEnabledNutritionIntentFit,
  createDailyObjectives,
  createEmptyNutritionMetrics,
  migratePersistentState,
  nutritionDishChoiceBonus,
  nutritionIntentFromRoll,
  nutritionRequestResult,
  nutritionStallChoiceBonus,
  persistentStateFromGame,
  stepSimulation,
  type DishDefinition,
  type GameState,
  type NutritionIntent,
  type NutritionMetric,
  type NutritionProfile,
  type NutritionValue,
  type SimulationCatalog,
} from "../../src/game/core";
import { makeGame, TEST_CATALOG } from "./fixtures";

const METRICS: readonly NutritionMetric[] = [
  "energyKcal",
  "proteinG",
  "totalFatG",
  "saturatedFatG",
  "transFatG",
  "carbohydrateG",
  "totalSugarG",
  "dietaryFibreG",
  "sodiumMg",
  "calciumMg",
  "ironMg",
  "waterG",
];

function profile(
  id: string,
  dishId: string,
  intentFits: Partial<Record<NutritionIntent, number>>,
): NutritionProfile {
  const unavailable: NutritionValue = { status: "unavailable", reason: "not-reported" };
  return {
    id,
    dishId,
    status: "released",
    nutritionClass: "meal",
    serving: { amount: 300, unit: "g", label: "1 plate (300 g)" },
    nutrients: Object.fromEntries(METRICS.map((metric) => [metric, unavailable])) as Record<
      NutritionMetric,
      NutritionValue
    >,
    intentFits,
  };
}

function nutritionDish(
  source: DishDefinition,
  fit: number,
  activeVariantId = `${source.id}-default`,
): DishDefinition {
  const defaultProfile = profile(`${source.id}-profile-default`, source.id, {
    "fibre-forward": fit,
  });
  const alternativeProfile = profile(`${source.id}-profile-alt`, source.id, {
    "fibre-forward": Math.max(0, 1 - fit),
  });
  return {
    ...source,
    quality: 3,
    price: 6,
    baseDemand: 0.5,
    preferenceTags: [],
    defaultNutritionVariantId: `${source.id}-default`,
    activeNutritionVariantId: activeVariantId,
    nutritionVariants: [
      {
        id: `${source.id}-default`,
        label: "Default",
        unlockRank: 1,
        profileId: defaultProfile.id,
        visualKey: "default",
        profile: defaultProfile,
      },
      {
        id: `${source.id}-alt`,
        label: "Alternative",
        unlockRank: 2,
        profileId: alternativeProfile.id,
        visualKey: "alternative",
        profile: alternativeProfile,
      },
    ],
  };
}

function nutritionCatalog(): SimulationCatalog {
  const rice = nutritionDish(TEST_CATALOG.dishes.rice, 0.1);
  const noodles = nutritionDish(TEST_CATALOG.dishes.noodles, 0.95);
  return {
    ...TEST_CATALOG,
    dishes: { rice, noodles },
    archetypes: {
      regular: {
        ...TEST_CATALOG.archetypes.regular,
        preferenceTags: [],
        priceSensitivity: 0,
        qualitySensitivity: 1,
      },
    },
    placeables: {
      ...TEST_CATALOG.placeables,
      stall: {
        ...TEST_CATALOG.placeables.stall,
        stall: {
          ...TEST_CATALOG.placeables.stall.stall,
          dishIds: ["rice", "noodles"],
          allDishIds: ["rice", "noodles"],
          orderMs: 1,
        } as NonNullable<typeof TEST_CATALOG.placeables.stall.stall>,
      },
    },
  };
}

describe("nutrition education rules", () => {
  it("uses the exact nutrition choice weights and the inclusive match boundary", () => {
    expect(nutritionStallChoiceBonus(1)).toBe(2);
    expect(nutritionStallChoiceBonus(0.5)).toBe(1);
    expect(nutritionDishChoiceBonus(1)).toBe(1.75);
    expect(nutritionDishChoiceBonus(0.5)).toBe(0.875);
    expect(nutritionDishChoiceBonus(undefined)).toBe(0);

    const lowLegacyHighFit = {
      ...nutritionDish(TEST_CATALOG.dishes.rice, 0.95),
      quality: 1,
      price: 9,
    };
    const highLegacyLowFit = {
      ...nutritionDish(TEST_CATALOG.dishes.noodles, 0.1),
      quality: 5,
      price: 2,
    };
    expect(bestEnabledNutritionIntentFit(
      [lowLegacyHighFit, highLegacyLowFit],
      "fibre-forward",
    )).toBe(0.95);
    expect(bestEnabledNutritionIntentFit(
      [lowLegacyHighFit, highLegacyLowFit],
      undefined,
    )).toBeUndefined();

    expect(nutritionRequestResult(
      "fibre-forward",
      profile("boundary", "dish", { "fibre-forward": 0.67 }),
    )).toBe("matched");
    expect(nutritionRequestResult(
      "fibre-forward",
      profile("below", "dish", { "fibre-forward": 0.6699 }),
    )).toBe("missed");
    expect(nutritionRequestResult(
      "fibre-forward",
      profile("unknown", "dish", {}),
    )).toBe("unknown");
    expect(nutritionRequestResult("fibre-forward", undefined)).toBe("unknown");
  });

  it("uses one deterministic roll for the 40% assignment gate and canonical intent selection", () => {
    const eligible: readonly NutritionIntent[] = [
      "lighter-energy",
      "protein-forward",
      "fibre-forward",
      "sodium-aware",
      "lower-total-sugar-drink",
    ];
    expect(nutritionIntentFromRoll(1, eligible, 0)).toBeUndefined();
    expect(nutritionIntentFromRoll(2, eligible, 0)).toBe("lighter-energy");
    expect(nutritionIntentFromRoll(2, eligible, 0.399)).toBe("lower-total-sugar-drink");
    expect(nutritionIntentFromRoll(2, eligible, 0.4)).toBeUndefined();

    const levelOneWithoutNutrition = stepSimulation(makeGame({ seed: "rng-compat" }));
    const levelOneWithNutrition = stepSimulation(makeGame({
      seed: "rng-compat",
      catalog: nutritionCatalog(),
    }));
    expect(levelOneWithNutrition.rngState).toBe(levelOneWithoutNutrition.rngState);
  });

  it("computes relative fits with average-rank ties and a single-option score of one", () => {
    expect(averageRankPercentiles({ a: 10 }, "higher")).toEqual({ a: 1 });
    expect(averageRankPercentiles({ a: 10, b: 10, c: 20 }, "higher")).toEqual({
      a: 0.25,
      b: 0.25,
      c: 1,
    });
    expect(averageRankPercentiles({ a: 10, b: undefined, c: 20 }, "lower")).toEqual({
      c: 0,
      a: 1,
    });
  });

  it("lets an intent influence an otherwise equal dish choice and freezes the order-time variant", () => {
    const catalog = nutritionCatalog();
    let state = makeGame({
      catalog,
      config: { spawnIntervalMs: 100_000 },
    });
    const customer = {
      id: "customer-manual",
      archetypeId: "regular",
      status: "ordering" as const,
      position: { x: 2, y: 2 },
      path: [],
      pathIndex: 0,
      movementProgress: 0,
      stateElapsedMs: 1_000,
      visitElapsedMs: 1_000,
      walkingDistanceTiles: 0,
      patienceRemainingMs: 10_000,
      satisfaction: 3,
      targetStallId: "stall-1",
      nutritionIntentId: "fibre-forward" as const,
      hasTray: false,
      served: false,
      spent: 0,
      stuckMs: 0,
    };
    state = {
      ...state,
      spawnCountdownMs: 100_000,
      customers: { [customer.id]: customer },
      queues: { ...state.queues, "stall-1": [customer.id] },
    };
    state = stepSimulation(state);
    const ordered = state.customers[customer.id]!;
    expect(ordered.orderedDishId).toBe("noodles");
    expect(ordered.orderedNutritionVariantId).toBe("noodles-default");
    expect(ordered.orderedNutritionProfile?.id).toBe("noodles-profile-default");

    const changedDish = nutritionDish(
      catalog.dishes.noodles,
      0.95,
      "noodles-alt",
    );
    state = {
      ...state,
      catalog: {
        ...state.catalog,
        dishes: { ...state.catalog.dishes, noodles: changedDish },
      },
    };
    expect(state.customers[customer.id]?.orderedNutritionVariantId).toBe("noodles-default");
    expect(state.customers[customer.id]?.orderedNutritionProfile?.id).toBe(
      "noodles-profile-default",
    );

    state = {
      ...state,
      customers: {
        ...state.customers,
        [customer.id]: {
          ...state.customers[customer.id]!,
          stateElapsedMs: 10_000,
        },
      },
    };
    state = stepSimulation(state);
    expect(state.metrics.nutrition).toMatchObject({
      servedMeals: 1,
      profiledServings: 1,
      intentMatches: 1,
      nonDefaultVariantServings: 0,
      today: {
        day: 1,
        servedMeals: 1,
        profiledServings: 1,
        intentMatches: 1,
      },
    });
    expect(state.metrics.nutrition.recentOutcomes[0]).toMatchObject({
      customerId: customer.id,
      dishId: "noodles",
      variantId: "noodles-default",
      result: "matched",
      profile: { id: "noodles-profile-default" },
    });
    expect(state.metrics.nutrition.dishServings).toEqual({ noodles: 1 });
    expect(state.metrics.nutrition.today.dishServings).toEqual({ noodles: 1 });
    const byIntent = Object.values(state.metrics.nutrition.byIntent);
    expect(byIntent.reduce((sum, metric) => sum + metric.requests, 0)).toBe(
      state.metrics.nutrition.intentRequests,
    );
    expect(byIntent.reduce((sum, metric) => sum + metric.matches, 0)).toBe(
      state.metrics.nutrition.intentMatches,
    );
    expect(state.metrics.nutrition.intentRequests).toBe(
      state.metrics.nutrition.intentMatches +
        state.metrics.nutrition.intentMisses +
        state.metrics.nutrition.intentUnknowns,
    );
    expect(state.metrics.nutrition.today.intentRequests).toBe(
      state.metrics.nutrition.today.intentMatches +
        state.metrics.nutrition.today.intentMisses +
        state.metrics.nutrition.today.intentUnknowns,
    );
    expect(
      state.metrics.nutrition.profiledServings,
    ).toBeLessThanOrEqual(state.metrics.nutrition.servedMeals);
    expect(state.metrics.nutrition.recentOutcomes.length).toBeLessThanOrEqual(50);
  });

  it("does not change economy, progression, or satisfaction for the same served dish", () => {
    const sourceCatalog = nutritionCatalog();
    const catalog: SimulationCatalog = {
      ...sourceCatalog,
      placeables: {
        ...sourceCatalog.placeables,
        stall: {
          ...sourceCatalog.placeables.stall,
          stall: {
            ...sourceCatalog.placeables.stall.stall!,
            dishIds: ["noodles"],
            allDishIds: ["noodles"],
          },
        },
      },
    };
    const serve = (nutritionIntentId?: NutritionIntent) => {
      let state = makeGame({ catalog, config: { spawnIntervalMs: 100_000 } });
      const customer = {
        id: "customer-comparison",
        archetypeId: "regular",
        status: "ordering" as const,
        position: { x: 2, y: 2 },
        path: [],
        pathIndex: 0,
        movementProgress: 0,
        stateElapsedMs: 1_000,
        visitElapsedMs: 1_000,
        walkingDistanceTiles: 0,
        patienceRemainingMs: 10_000,
        satisfaction: 3,
        targetStallId: "stall-1",
        nutritionIntentId,
        hasTray: false,
        served: false,
        spent: 0,
        stuckMs: 0,
      };
      state = {
        ...state,
        spawnCountdownMs: 100_000,
        customers: { [customer.id]: customer },
        queues: { ...state.queues, "stall-1": [customer.id] },
      };
      state = stepSimulation(state);
      state = {
        ...state,
        customers: {
          ...state.customers,
          [customer.id]: {
            ...state.customers[customer.id]!,
            stateElapsedMs: 10_000,
          },
        },
      };
      return stepSimulation(state);
    };

    const withoutIntent = serve();
    const withIntent = serve("fibre-forward");
    expect(withIntent.economy).toEqual(withoutIntent.economy);
    expect(withIntent.progression).toEqual(withoutIntent.progression);
    expect(withIntent.customers["customer-comparison"]?.satisfaction).toBe(
      withoutIntent.customers["customer-comparison"]?.satisfaction,
    );
  });

  it("rotates the nutrition objective without adding a fourth objective", () => {
    const catalog = nutritionCatalog();
    const base = makeGame({ catalog });
    const state: GameState = {
      ...base,
      progression: { ...base.progression, level: 4 },
    };
    expect(createDailyObjectives(state, 1)).toHaveLength(3);
    expect(createDailyObjectives(state, 1)[2]).toMatchObject({
      kind: "nutrition",
      nutritionCriterion: "profiled-servings",
    });
    expect(createDailyObjectives(state, 2)[2]).toMatchObject({
      nutritionCriterion: "intent-matches",
    });
    expect(createDailyObjectives(state, 3)[2]).toMatchObject({
      nutritionCriterion: "profiled-servings",
    });
    const withVariantRank: GameState = {
      ...state,
      progression: {
        ...state.progression,
        stallMastery: {
          stall: { points: 100, rank: 2, upgradeLevel: 1 },
        },
      },
    };
    expect(createDailyObjectives(withVariantRank, 3)[2]).toMatchObject({
      nutritionCriterion: "variant-servings",
    });
    expect(createDailyObjectives({ ...withVariantRank, objects: {} }, 2)[2]).toMatchObject({
      nutritionCriterion: "profiled-servings",
    });
  });

  it("migrates V3 saves with empty nutrition counters and round-trips V4 counters", () => {
    const current = makeGame();
    const v4 = persistentStateFromGame(current);
    const v3 = {
      ...v4,
      schemaVersion: 3,
      metrics: {
        trayReturns: v4.metrics.trayReturns,
        visitRatings: v4.metrics.visitRatings,
      },
    };
    expect(migratePersistentState(v3).metrics.nutrition).toEqual(createEmptyNutritionMetrics());

    const populated = {
      ...v4,
      metrics: {
        ...v4.metrics,
        nutrition: {
          ...v4.metrics.nutrition,
          servedMeals: 3,
          profiledServings: 2,
          today: {
            ...v4.metrics.nutrition.today,
            day: 1,
            intentRequests: 3,
            intentMisses: 2,
            byIntent: {
              ...v4.metrics.nutrition.today.byIntent,
              "sodium-aware": {
                requests: 3,
                matches: 1,
                misses: 2,
                unknowns: 0,
              },
            },
          },
        },
      },
    };
    expect(migratePersistentState(populated).metrics.nutrition).toMatchObject({
      servedMeals: 3,
      profiledServings: 2,
      today: {
        byIntent: {
          "sodium-aware": {
            requests: 3,
            matches: 1,
            misses: 2,
            unknowns: 0,
          },
        },
      },
    });

    const history = Array.from({ length: 60 }, (_, index) => ({
      customerId: `customer-${index + 1}`,
      day: 1,
      dishId: "rice",
      result: "unknown" as const,
    }));
    const withLongHistory = {
      ...populated,
      metrics: {
        ...populated.metrics,
        nutrition: {
          ...populated.metrics.nutrition,
          recentOutcomes: history,
        },
      },
    };
    expect(migratePersistentState(withLongHistory).metrics.nutrition.recentOutcomes).toHaveLength(50);
  });
});
