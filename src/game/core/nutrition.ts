import type {
  DishDefinition,
  NutritionIntent,
  NutritionIntentMetrics,
  NutritionDailyMetrics,
  NutritionMetric,
  NutritionMetrics,
  NutritionProfile,
  NutritionRequestResult,
  NutritionValue,
  NutritionVariant,
} from "./types";

export const NUTRITION_INTENTS: readonly NutritionIntent[] = [
  "lighter-energy",
  "protein-forward",
  "fibre-forward",
  "sodium-aware",
  "lower-total-sugar-drink",
];

export const NUTRITION_METRICS: readonly NutritionMetric[] = [
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

export const NUTRITION_STALL_CHOICE_WEIGHT = 2;
export const NUTRITION_DISH_CHOICE_WEIGHT = 1.75;

function weightedIntentFit(fit: number | undefined, weight: number): number {
  if (typeof fit !== "number" || !Number.isFinite(fit)) return 0;
  return Math.max(0, Math.min(1, fit)) * weight;
}

export function nutritionStallChoiceBonus(fit: number | undefined): number {
  return weightedIntentFit(fit, NUTRITION_STALL_CHOICE_WEIGHT);
}

export function nutritionDishChoiceBonus(fit: number | undefined): number {
  return weightedIntentFit(fit, NUTRITION_DISH_CHOICE_WEIGHT);
}

function emptyIntentMetric(): NutritionIntentMetrics {
  return { requests: 0, matches: 0, misses: 0, unknowns: 0 };
}

export function createEmptyNutritionMetrics(): NutritionMetrics {
  const emptyDay = createEmptyNutritionDayMetrics(0);
  return {
    servedMeals: 0,
    profiledServings: 0,
    nonDefaultVariantServings: 0,
    intentRequests: 0,
    intentMatches: 0,
    intentMisses: 0,
    intentUnknowns: 0,
    byIntent: Object.fromEntries(
      NUTRITION_INTENTS.map((intent) => [intent, emptyIntentMetric()]),
    ) as Record<NutritionIntent, NutritionIntentMetrics>,
    nutrientTotals: Object.fromEntries(
      NUTRITION_METRICS.map((metric) => [metric, 0]),
    ) as Record<NutritionMetric, number>,
    nutrientKnownCounts: Object.fromEntries(
      NUTRITION_METRICS.map((metric) => [metric, 0]),
    ) as Record<NutritionMetric, number>,
    dishServings: {},
    recentOutcomes: [],
    today: emptyDay,
  };
}

export function createEmptyNutritionDayMetrics(day: number): NutritionDailyMetrics {
  return {
    day,
    servedMeals: 0,
    profiledServings: 0,
    intentRequests: 0,
    intentMatches: 0,
    intentMisses: 0,
    intentUnknowns: 0,
    byIntent: Object.fromEntries(
      NUTRITION_INTENTS.map((intent) => [intent, emptyIntentMetric()]),
    ) as Record<NutritionIntent, NutritionIntentMetrics>,
    nutrientTotals: Object.fromEntries(
      NUTRITION_METRICS.map((metric) => [metric, 0]),
    ) as Record<NutritionMetric, number>,
    nutrientKnownCounts: Object.fromEntries(
      NUTRITION_METRICS.map((metric) => [metric, 0]),
    ) as Record<NutritionMetric, number>,
    dishServings: {},
  };
}

export function cloneNutritionProfile(
  profile: NutritionProfile | undefined,
): NutritionProfile | undefined {
  if (!profile) return undefined;
  return {
    ...profile,
    serving: profile.serving ? { ...profile.serving } : undefined,
    nutrients: Object.fromEntries(
      Object.entries(profile.nutrients).map(([metric, value]) => [metric, { ...value }]),
    ) as Readonly<Record<NutritionMetric, NutritionValue>>,
    intentFits: { ...profile.intentFits },
  };
}

export function cloneNutritionMetrics(metrics: NutritionMetrics): NutritionMetrics {
  return {
    ...metrics,
    byIntent: Object.fromEntries(
      Object.entries(metrics.byIntent).map(([intent, value]) => [intent, { ...value }]),
    ) as Readonly<Record<NutritionIntent, NutritionIntentMetrics>>,
    nutrientTotals: { ...metrics.nutrientTotals },
    nutrientKnownCounts: { ...metrics.nutrientKnownCounts },
    dishServings: { ...metrics.dishServings },
    recentOutcomes: metrics.recentOutcomes.map((outcome) => ({
      ...outcome,
      profile: cloneNutritionProfile(outcome.profile),
    })),
    today: {
      ...metrics.today,
      byIntent: Object.fromEntries(
        Object.entries(metrics.today.byIntent).map(([intent, value]) => [intent, { ...value }]),
      ) as Readonly<Record<NutritionIntent, NutritionIntentMetrics>>,
      nutrientTotals: { ...metrics.today.nutrientTotals },
      nutrientKnownCounts: { ...metrics.today.nutrientKnownCounts },
      dishServings: { ...metrics.today.dishServings },
    },
  };
}

export function activeNutritionVariant(
  dish: DishDefinition | undefined,
): NutritionVariant | undefined {
  if (!dish?.nutritionVariants?.length) return undefined;
  return dish.nutritionVariants.find(
    (variant) => variant.id === dish.activeNutritionVariantId,
  ) ?? dish.nutritionVariants.find(
    (variant) => variant.id === dish.defaultNutritionVariantId,
  ) ?? dish.nutritionVariants[0];
}

export function nutritionIntentFit(
  dish: DishDefinition | undefined,
  intent: NutritionIntent | undefined,
): number | undefined {
  if (!intent) return undefined;
  const profile = activeNutritionVariant(dish)?.profile;
  if (!profile || profile.status !== "released") return undefined;
  const fit = profile.intentFits[intent];
  return typeof fit === "number" && Number.isFinite(fit)
    ? Math.max(0, Math.min(1, fit))
    : undefined;
}

export function bestEnabledNutritionIntentFit(
  dishes: readonly DishDefinition[],
  intent: NutritionIntent | undefined,
): number | undefined {
  let best: number | undefined;
  for (const dish of dishes) {
    const fit = nutritionIntentFit(dish, intent);
    if (fit === undefined) continue;
    best = best === undefined ? fit : Math.max(best, fit);
  }
  return best;
}

/** One seeded roll decides both whether an intent exists and which intent is used. */
export function nutritionIntentFromRoll(
  level: number,
  eligible: readonly NutritionIntent[],
  roll: number,
): NutritionIntent | undefined {
  if (level < 2 || eligible.length === 0 || !Number.isFinite(roll) || roll < 0 || roll >= 0.4) {
    return undefined;
  }
  const canonical = NUTRITION_INTENTS.filter((intent) => eligible.includes(intent));
  if (canonical.length === 0) return undefined;
  return canonical[Math.min(canonical.length - 1, Math.floor((roll / 0.4) * canonical.length))];
}

export function nutritionRequestResult(
  intent: NutritionIntent | undefined,
  profile: NutritionProfile | undefined,
): NutritionRequestResult {
  if (!intent || !profile || profile.status !== "released") return "unknown";
  const fit = profile.intentFits[intent];
  if (typeof fit !== "number" || !Number.isFinite(fit)) return "unknown";
  return fit >= 0.67 ? "matched" : "missed";
}

/**
 * Converts raw values into average-rank percentiles. Ties share their average
 * rank, and a single comparable value scores 1.
 */
export function averageRankPercentiles(
  values: Readonly<Record<string, number | undefined>>,
  direction: "higher" | "lower",
): Readonly<Record<string, number>> {
  const entries = Object.entries(values)
    .filter((entry): entry is [string, number] => Number.isFinite(entry[1]))
    .sort((left, right) => {
      const delta = direction === "higher" ? left[1] - right[1] : right[1] - left[1];
      return delta || left[0].localeCompare(right[0]);
    });
  if (entries.length === 0) return {};
  if (entries.length === 1) return { [entries[0]![0]]: 1 };
  const result: Record<string, number> = {};
  let index = 0;
  while (index < entries.length) {
    let end = index + 1;
    while (end < entries.length && entries[end]![1] === entries[index]![1]) end += 1;
    const averageRank = (index + (end - 1)) / 2;
    const percentile = averageRank / (entries.length - 1);
    for (let cursor = index; cursor < end; cursor += 1) {
      result[entries[cursor]![0]] = percentile;
    }
    index = end;
  }
  return result;
}
