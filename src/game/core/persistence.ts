import { calculateLevel, getUnlockedDefinitionIds } from "./economy";
import {
  getObjectQueueAnchor,
  normalizeBoundaryOpenings,
  samePoint,
  validatePlacement,
} from "./grid";
import { createNewGame } from "./state";
import { compareIds } from "./ordering";
import {
  cloneNutritionMetrics,
  createEmptyNutritionMetrics,
  HEALTH_CONDITIONS,
  NUTRITION_INTENTS,
  NUTRITION_METRICS,
} from "./nutrition";
import type {
  AnyPersistentGameState,
  GameState,
  GridMap,
  PersistentGameStateV1,
  PersistentGameStateV2,
  PersistentGameStateV3,
  PersistentGameStateV4,
  PlacedObject,
  QualityMode,
  SimulationCatalog,
  SimulationConfigOverrides,
  DailyObjective,
  StallMasteryState,
  VisitRating,
  NutritionIntent,
  NutritionDailyMetrics,
  NutritionIntentMetrics,
  NutritionMetric,
  NutritionMetrics,
  NutritionProfile,
  NutritionRequestResult,
  NutritionValue,
  HealthCondition,
} from "./types";

export const PERSISTENT_SCHEMA_VERSION = 4 as const;

export class PersistenceError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "PersistenceError";
  }
}

export interface DeserializeOptions {
  readonly config?: SimulationConfigOverrides;
  /** Explicit content migrations, keyed by an ID present in the save. */
  readonly definitionIdAliases?: Readonly<Record<string, string>>;
  /** Explicit compensation for intentionally removed content. */
  readonly removedDefinitionRefunds?: Readonly<Record<string, number>>;
}

export interface PersistenceRecoveryReport {
  readonly warnings: readonly string[];
  readonly remappedObjectIds: Readonly<Record<string, string>>;
  readonly removedObjectIds: readonly string[];
  readonly currencyRefunded: number;
}

export interface DeserializeResult {
  readonly state: GameState;
  readonly recovery: PersistenceRecoveryReport;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function finite(value: unknown, path: string, minimum = Number.NEGATIVE_INFINITY): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum) {
    throw new PersistenceError(`${path} must be a finite number${minimum > Number.NEGATIVE_INFINITY ? ` >= ${minimum}` : ""}`);
  }
  return value;
}

function boundedPercentage(value: unknown, path: string): number {
  return Math.min(100, finite(value, path, 0));
}

function healthRating(value: unknown, path: string): number {
  const parsed = finite(value, path, 1);
  if (parsed > 5) throw new PersistenceError(`${path} must be between one and five`);
  return parsed;
}

function safeInteger(
  value: unknown,
  path: string,
  minimum = 0,
  maximum = Number.MAX_SAFE_INTEGER,
): number {
  const parsed = finite(value, path, minimum);
  if (!Number.isSafeInteger(parsed) || parsed > maximum) {
    throw new PersistenceError(`${path} must be a safe integer between ${minimum} and ${maximum}`);
  }
  return parsed;
}

function stringValue(value: unknown, path: string): string {
  if (typeof value !== "string" || value.length === 0) throw new PersistenceError(`${path} must be a non-empty string`);
  return value;
}

function parsePoint(value: unknown, path: string): { x: number; y: number } {
  if (!isRecord(value)) throw new PersistenceError(`${path} must be an object`);
  const x = safeInteger(value.x, `${path}.x`, -Number.MAX_SAFE_INTEGER);
  const y = safeInteger(value.y, `${path}.y`, -Number.MAX_SAFE_INTEGER);
  return { x, y };
}

function parseWorldPoint(value: unknown, path: string): { x: number; y: number } {
  if (!isRecord(value)) throw new PersistenceError(`${path} must be an object`);
  return { x: finite(value.x, `${path}.x`), y: finite(value.y, `${path}.y`) };
}

function parseMap(value: unknown): GridMap {
  if (!isRecord(value)) throw new PersistenceError("map must be an object");
  const width = safeInteger(value.width, "map.width", 1);
  const height = safeInteger(value.height, "map.height", 1);
  const tileSize = finite(value.tileSize, "map.tileSize", Number.MIN_VALUE);
  const worldOrigin = parseWorldPoint(value.worldOrigin, "map.worldOrigin");
  if (!Array.isArray(value.tiles) || value.tiles.length !== width * height) {
    throw new PersistenceError("map.tiles length does not match its dimensions");
  }
  const tiles = value.tiles.map((tile, index) => {
    if (tile !== "floor" && tile !== "wall" && tile !== "void") {
      throw new PersistenceError(`map.tiles[${index}] is invalid`);
    }
    return tile;
  });
  return { width, height, tileSize, worldOrigin, tiles };
}

function parseObject(value: unknown, index: number): PlacedObject {
  const path = `objects[${index}]`;
  if (!isRecord(value)) throw new PersistenceError(`${path} must be an object`);
  const rotation = finite(value.rotation, `${path}.rotation`);
  if (rotation !== 0 && rotation !== 90 && rotation !== 180 && rotation !== 270) {
    throw new PersistenceError(`${path}.rotation is invalid`);
  }
  if (typeof value.open !== "boolean") throw new PersistenceError(`${path}.open must be boolean`);
  const queueDirection = value.queueDirection;
  if (
    queueDirection !== undefined &&
    queueDirection !== "north" &&
    queueDirection !== "east" &&
    queueDirection !== "south" &&
    queueDirection !== "west"
  ) {
    throw new PersistenceError(`${path}.queueDirection is invalid`);
  }
  let queuePath: readonly { x: number; y: number }[] | undefined;
  if (value.queuePath !== undefined) {
    if (!Array.isArray(value.queuePath)) throw new PersistenceError(`${path}.queuePath must be an array`);
    queuePath = value.queuePath.map((point, pointIndex) => parsePoint(point, `${path}.queuePath[${pointIndex}]`));
  }
  return {
    id: stringValue(value.id, `${path}.id`),
    definitionId: stringValue(value.definitionId, `${path}.definitionId`),
    origin: parsePoint(value.origin, `${path}.origin`),
    rotation,
    open: value.open,
    queueDirection,
    queuePath,
  };
}

function parseQuality(value: unknown): QualityMode {
  if (value !== "standard" && value !== "lower-end") throw new PersistenceError("qualityMode is invalid");
  return value;
}

function parseV2(value: Record<string, unknown>): PersistentGameStateV2 {
  if (!Array.isArray(value.objects)) throw new PersistenceError("objects must be an array");
  if (!isRecord(value.economy) || !isRecord(value.progression)) {
    throw new PersistenceError("economy and progression must be objects");
  }
  const unlocks = value.progression.unlockedDefinitionIds;
  if (!Array.isArray(unlocks) || unlocks.some((id) => typeof id !== "string")) {
    throw new PersistenceError("progression.unlockedDefinitionIds must be a string array");
  }
  safeInteger(value.progression.level, "progression.level", 1);
  const xp = safeInteger(value.progression.xp, "progression.xp", 0);
  const level = calculateLevel(xp);
  const savedAtTick = safeInteger(value.savedAtTick, "savedAtTick", 0);
  const nextCustomerSequence = safeInteger(value.nextCustomerSequence, "nextCustomerSequence", 1);
  return {
    schemaVersion: 2,
    savedAtTick,
    map: parseMap(value.map),
    entrance: parsePoint(value.entrance, "entrance"),
    exit: parsePoint(value.exit, "exit"),
    qualityMode: parseQuality(value.qualityMode),
    objects: value.objects.map(parseObject),
    economy: {
      currency: finite(value.economy.currency, "economy.currency", 0),
      lifetimeRevenue: finite(value.economy.lifetimeRevenue, "economy.lifetimeRevenue", 0),
      lifetimeSpend: finite(value.economy.lifetimeSpend, "economy.lifetimeSpend", 0),
      completedVisits: safeInteger(value.economy.completedVisits, "economy.completedVisits", 0),
      abandonedVisits: safeInteger(value.economy.abandonedVisits, "economy.abandonedVisits", 0),
    },
    progression: {
      xp,
      level,
      reputation: Math.max(0, Math.min(5, finite(value.progression.reputation, "progression.reputation", 0))),
      unlockedDefinitionIds: unlocks as string[],
      expansionCount: safeInteger(value.progression.expansionCount, "progression.expansionCount", 0),
      focusDay: 0,
      dailyObjectives: [],
      claimedMilestoneIds: [],
      stallMastery: {},
    },
    rngState: safeInteger(value.rngState, "rngState", 1, 0xffff_ffff),
    nextCustomerSequence,
    elapsedMs: safeInteger(value.elapsedMs, "elapsedMs", 0),
  };
}

function parseDailyObjectives(value: unknown): readonly DailyObjective[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry, index) => {
    if (!isRecord(entry)) throw new PersistenceError(`progression.dailyObjectives[${index}] must be an object`);
    const kind = entry.kind;
    if (!["serve", "revenue", "happiness", "flow", "variety", "facility", "nutrition"].includes(String(kind))) {
      throw new PersistenceError(`progression.dailyObjectives[${index}].kind is invalid`);
    }
    if (typeof entry.completed !== "boolean") throw new PersistenceError(`progression.dailyObjectives[${index}].completed must be boolean`);
    const nutritionCriterion = entry.nutritionCriterion;
    if (
      kind === "nutrition" &&
      nutritionCriterion !== "profiled-servings" &&
      nutritionCriterion !== "intent-matches" &&
      nutritionCriterion !== "variant-servings"
    ) {
      throw new PersistenceError(
        `progression.dailyObjectives[${index}].nutritionCriterion is invalid`,
      );
    }
    return {
      id: stringValue(entry.id, `progression.dailyObjectives[${index}].id`),
      day: safeInteger(entry.day, `progression.dailyObjectives[${index}].day`, 1),
      kind: kind as DailyObjective["kind"],
      title: stringValue(entry.title, `progression.dailyObjectives[${index}].title`),
      description: stringValue(entry.description, `progression.dailyObjectives[${index}].description`),
      target: finite(entry.target, `progression.dailyObjectives[${index}].target`, 0),
      progress: finite(entry.progress, `progression.dailyObjectives[${index}].progress`, 0),
      startValue: finite(entry.startValue, `progression.dailyObjectives[${index}].startValue`, 0),
      rewardCash: finite(entry.rewardCash, `progression.dailyObjectives[${index}].rewardCash`, 0),
      rewardXp: safeInteger(entry.rewardXp, `progression.dailyObjectives[${index}].rewardXp`, 0),
      completed: entry.completed,
      nutritionCriterion: kind === "nutrition"
        ? nutritionCriterion as DailyObjective["nutritionCriterion"]
        : undefined,
    };
  });
}

function parseNutritionValue(value: unknown, path: string): NutritionValue {
  if (!isRecord(value)) throw new PersistenceError(`${path} must be an object`);
  if (value.status === "known") {
    return { status: "known", value: finite(value.value, `${path}.value`, 0) };
  }
  if (value.status === "trace") return { status: "trace" };
  if (value.status === "unavailable") {
    const reason = value.reason;
    if (
      reason !== undefined &&
      reason !== "not-reported" &&
      reason !== "invalid-source" &&
      reason !== "unmapped"
    ) {
      throw new PersistenceError(`${path}.reason is invalid`);
    }
    return { status: "unavailable", reason };
  }
  throw new PersistenceError(`${path}.status is invalid`);
}

function parseNutritionProfile(value: unknown, path: string): NutritionProfile {
  if (!isRecord(value) || !isRecord(value.nutrients)) {
    throw new PersistenceError(`${path} must be a nutrition profile`);
  }
  const nutrientSource = value.nutrients;
  if (
    value.status !== "released" &&
    value.status !== "unavailable" &&
    value.status !== "quarantined"
  ) {
    throw new PersistenceError(`${path}.status is invalid`);
  }
  if (value.nutritionClass !== "meal" && value.nutritionClass !== "drink") {
    throw new PersistenceError(`${path}.nutritionClass is invalid`);
  }
  const servingSource = value.serving;
  if (
    servingSource !== undefined &&
    (!isRecord(servingSource) || (servingSource.unit !== "g" && servingSource.unit !== "ml"))
  ) throw new PersistenceError(`${path}.serving is invalid`);
  const intentFitsSource = isRecord(value.intentFits) ? value.intentFits : {};
  const intentFits: Partial<Record<NutritionIntent, number>> = {};
  for (const intent of NUTRITION_INTENTS) {
    const fit = intentFitsSource[intent];
    if (fit === undefined) continue;
    intentFits[intent] = Math.min(1, finite(fit, `${path}.intentFits.${intent}`, 0));
  }
  const conditionRatingsSource = isRecord(value.conditionRatings)
    ? value.conditionRatings
    : undefined;
  const conditionRatings: Partial<Record<HealthCondition, number>> = {};
  if (conditionRatingsSource) {
    for (const condition of HEALTH_CONDITIONS) {
      const rating = conditionRatingsSource[condition];
      if (rating === undefined) continue;
      conditionRatings[condition] = healthRating(
        rating,
        `${path}.conditionRatings.${condition}`,
      );
    }
  }
  return {
    id: stringValue(value.id, `${path}.id`),
    dishId: stringValue(value.dishId, `${path}.dishId`),
    status: value.status,
    serving: isRecord(servingSource)
      ? {
          amount: finite(servingSource.amount, `${path}.serving.amount`, Number.MIN_VALUE),
          unit: servingSource.unit as "g" | "ml",
          label: stringValue(servingSource.label, `${path}.serving.label`),
        }
      : undefined,
    nutrients: Object.fromEntries(
      NUTRITION_METRICS.map((metric) => [
        metric,
        parseNutritionValue(nutrientSource[metric], `${path}.nutrients.${metric}`),
      ]),
    ) as Record<NutritionMetric, NutritionValue>,
    intentFits,
    healthRating: value.healthRating === undefined
      ? undefined
      : healthRating(value.healthRating, `${path}.healthRating`),
    conditionRatings: conditionRatingsSource ? conditionRatings : undefined,
    nutritionClass: value.nutritionClass,
  };
}

function parseNutritionMetrics(value: unknown): NutritionMetrics {
  if (!isRecord(value)) return createEmptyNutritionMetrics();
  const empty = createEmptyNutritionMetrics();
  const byIntentSource = isRecord(value.byIntent) ? value.byIntent : {};
  const byIntent = Object.fromEntries(NUTRITION_INTENTS.map((intent) => {
    const source = isRecord(byIntentSource[intent]) ? byIntentSource[intent] : {};
    return [intent, {
      requests: safeInteger(source.requests ?? 0, `metrics.nutrition.byIntent.${intent}.requests`),
      matches: safeInteger(source.matches ?? 0, `metrics.nutrition.byIntent.${intent}.matches`),
      misses: safeInteger(source.misses ?? 0, `metrics.nutrition.byIntent.${intent}.misses`),
      unknowns: safeInteger(source.unknowns ?? 0, `metrics.nutrition.byIntent.${intent}.unknowns`),
    } satisfies NutritionIntentMetrics];
  })) as Record<NutritionIntent, NutritionIntentMetrics>;
  const totalsSource = isRecord(value.nutrientTotals) ? value.nutrientTotals : {};
  const countsSource = isRecord(value.nutrientKnownCounts) ? value.nutrientKnownCounts : {};
  const dishSource = isRecord(value.dishServings) ? value.dishServings : {};
  const recentSource = Array.isArray(value.recentOutcomes) ? value.recentOutcomes : [];
  const todaySource = isRecord(value.today) ? value.today : {};
  const todayByIntentSource = isRecord(todaySource.byIntent) ? todaySource.byIntent : {};
  const recentOutcomes = recentSource.slice(-50).map((entry, index) => {
    const path = `metrics.nutrition.recentOutcomes[${index}]`;
    if (!isRecord(entry)) throw new PersistenceError(`${path} must be an object`);
    const intentId = entry.intentId;
    if (intentId !== undefined && !NUTRITION_INTENTS.includes(intentId as NutritionIntent)) {
      throw new PersistenceError(`${path}.intentId is invalid`);
    }
    const result = entry.result;
    if (result !== "matched" && result !== "missed" && result !== "unknown") {
      throw new PersistenceError(`${path}.result is invalid`);
    }
    return {
      customerId: stringValue(entry.customerId, `${path}.customerId`),
      day: safeInteger(entry.day, `${path}.day`, 1),
      intentId: intentId as NutritionIntent | undefined,
      dishId: stringValue(entry.dishId, `${path}.dishId`),
      variantId: typeof entry.variantId === "string" ? entry.variantId : undefined,
      result: result as NutritionRequestResult,
      profile: entry.profile === undefined
        ? undefined
        : parseNutritionProfile(entry.profile, `${path}.profile`),
    };
  });
  return {
    ...empty,
    servedMeals: safeInteger(value.servedMeals ?? 0, "metrics.nutrition.servedMeals"),
    profiledServings: safeInteger(value.profiledServings ?? 0, "metrics.nutrition.profiledServings"),
    nonDefaultVariantServings: safeInteger(
      value.nonDefaultVariantServings ?? 0,
      "metrics.nutrition.nonDefaultVariantServings",
    ),
    intentRequests: safeInteger(value.intentRequests ?? 0, "metrics.nutrition.intentRequests"),
    intentMatches: safeInteger(value.intentMatches ?? 0, "metrics.nutrition.intentMatches"),
    intentMisses: safeInteger(value.intentMisses ?? 0, "metrics.nutrition.intentMisses"),
    intentUnknowns: safeInteger(value.intentUnknowns ?? 0, "metrics.nutrition.intentUnknowns"),
    byIntent,
    nutrientTotals: Object.fromEntries(NUTRITION_METRICS.map((metric) => [
      metric,
      finite(totalsSource[metric] ?? 0, `metrics.nutrition.nutrientTotals.${metric}`, 0),
    ])) as Record<NutritionMetric, number>,
    nutrientKnownCounts: Object.fromEntries(NUTRITION_METRICS.map((metric) => [
      metric,
      safeInteger(countsSource[metric] ?? 0, `metrics.nutrition.nutrientKnownCounts.${metric}`),
    ])) as Record<NutritionMetric, number>,
    dishServings: Object.fromEntries(Object.entries(dishSource).map(([dishId, count]) => [
      dishId,
      safeInteger(count, `metrics.nutrition.dishServings.${dishId}`),
    ])),
    recentOutcomes,
    today: {
      day: safeInteger(todaySource.day ?? 0, "metrics.nutrition.today.day"),
      servedMeals: safeInteger(
        todaySource.servedMeals ?? 0,
        "metrics.nutrition.today.servedMeals",
      ),
      profiledServings: safeInteger(
        todaySource.profiledServings ?? 0,
        "metrics.nutrition.today.profiledServings",
      ),
      intentRequests: safeInteger(
        todaySource.intentRequests ?? 0,
        "metrics.nutrition.today.intentRequests",
      ),
      intentMatches: safeInteger(
        todaySource.intentMatches ?? 0,
        "metrics.nutrition.today.intentMatches",
      ),
      intentMisses: safeInteger(
        todaySource.intentMisses ?? 0,
        "metrics.nutrition.today.intentMisses",
      ),
      intentUnknowns: safeInteger(
        todaySource.intentUnknowns ?? 0,
        "metrics.nutrition.today.intentUnknowns",
      ),
      byIntent: Object.fromEntries(NUTRITION_INTENTS.map((intent) => {
        const source = isRecord(todayByIntentSource[intent])
          ? todayByIntentSource[intent]
          : {};
        return [intent, {
          requests: safeInteger(
            source.requests ?? 0,
            `metrics.nutrition.today.byIntent.${intent}.requests`,
          ),
          matches: safeInteger(
            source.matches ?? 0,
            `metrics.nutrition.today.byIntent.${intent}.matches`,
          ),
          misses: safeInteger(
            source.misses ?? 0,
            `metrics.nutrition.today.byIntent.${intent}.misses`,
          ),
          unknowns: safeInteger(
            source.unknowns ?? 0,
            `metrics.nutrition.today.byIntent.${intent}.unknowns`,
          ),
        } satisfies NutritionIntentMetrics];
      })) as Record<NutritionIntent, NutritionIntentMetrics>,
      nutrientTotals: Object.fromEntries(NUTRITION_METRICS.map((metric) => [
        metric,
        finite(
          isRecord(todaySource.nutrientTotals) ? todaySource.nutrientTotals[metric] ?? 0 : 0,
          `metrics.nutrition.today.nutrientTotals.${metric}`,
          0,
        ),
      ])) as Record<NutritionMetric, number>,
      nutrientKnownCounts: Object.fromEntries(NUTRITION_METRICS.map((metric) => [
        metric,
        safeInteger(
          isRecord(todaySource.nutrientKnownCounts)
            ? todaySource.nutrientKnownCounts[metric] ?? 0
            : 0,
          `metrics.nutrition.today.nutrientKnownCounts.${metric}`,
        ),
      ])) as Record<NutritionMetric, number>,
      dishServings: isRecord(todaySource.dishServings)
        ? Object.fromEntries(Object.entries(todaySource.dishServings).map(([dishId, count]) => [
            dishId,
            safeInteger(count, `metrics.nutrition.today.dishServings.${dishId}`),
          ]))
        : {},
    } satisfies NutritionDailyMetrics,
  };
}

function parseMastery(value: unknown): Readonly<Record<string, StallMasteryState>> {
  if (!isRecord(value)) return {};
  return Object.fromEntries(Object.entries(value).map(([id, entry]) => {
    if (!isRecord(entry)) throw new PersistenceError(`progression.stallMastery.${id} must be an object`);
    const upgradeLevel = safeInteger(entry.upgradeLevel, `progression.stallMastery.${id}.upgradeLevel`, 1, 4);
    return [id, {
      points: safeInteger(entry.points, `progression.stallMastery.${id}.points`, 0),
      rank: safeInteger(entry.rank, `progression.stallMastery.${id}.rank`, 1),
      upgradeLevel: upgradeLevel as 1 | 2 | 3 | 4,
    }];
  }));
}

function parseVisitRatings(value: unknown): readonly VisitRating[] {
  if (!Array.isArray(value)) return [];
  return value.slice(-50).map((entry, index) => {
    if (!isRecord(entry) || !isRecord(entry.components)) throw new PersistenceError(`metrics.visitRatings[${index}] must be an object`);
    const componentsRecord = entry.components;
    const parsedComponents = Object.fromEntries(
      ["foodQuality", "wait", "value", "walking", "comfort", "cleanliness", "ambience"].map((key) => [
        key,
        boundedPercentage(componentsRecord[key], `metrics.visitRatings[${index}].components.${key}`),
      ]),
    ) as unknown as VisitRating["components"];
    const usesDistanceMetric = entry.walkingMetricVersion === 2;
    const legacyWalking = parsedComponents.walking;
    const components = usesDistanceMetric
      ? parsedComponents
      : { ...parsedComponents, walking: Math.max(70, legacyWalking) };
    if (typeof entry.served !== "boolean" || typeof entry.abandoned !== "boolean") {
      throw new PersistenceError(`metrics.visitRatings[${index}] outcome flags must be boolean`);
    }
    const legacyScore = boundedPercentage(entry.score, `metrics.visitRatings[${index}].score`);
    const score = usesDistanceMetric
      ? legacyScore
      : Math.round(Math.max(0, Math.min(100, legacyScore + (components.walking - legacyWalking) * 0.1)));
    return {
      customerId: stringValue(entry.customerId, `metrics.visitRatings[${index}].customerId`),
      walkingMetricVersion: 2,
      score,
      served: entry.served,
      abandoned: entry.abandoned,
      reason: stringValue(entry.reason, `metrics.visitRatings[${index}].reason`),
      stallDefinitionId: typeof entry.stallDefinitionId === "string" ? entry.stallDefinitionId : undefined,
      components,
      day: safeInteger(entry.day, `metrics.visitRatings[${index}].day`, 1),
    };
  });
}

function parseV3(value: Record<string, unknown>): PersistentGameStateV3 {
  if (!Array.isArray(value.accessPoints)) throw new PersistenceError("accessPoints must be an array");
  const accessPoints = value.accessPoints.map((entry, index) => {
    if (!isRecord(entry)) throw new PersistenceError(`accessPoints[${index}] must be an object`);
    if (entry.kind !== "entrance" && entry.kind !== "exit") throw new PersistenceError(`accessPoints[${index}].kind is invalid`);
    return { id: stringValue(entry.id, `accessPoints[${index}].id`), kind: entry.kind as "entrance" | "exit", position: parsePoint(entry.position, `accessPoints[${index}].position`) };
  });
  const entrance = accessPoints.find((point) => point.kind === "entrance")?.position;
  const exit = accessPoints.find((point) => point.kind === "exit")?.position;
  if (!entrance || !exit) throw new PersistenceError("At least one entrance and one exit are required");
  const common = parseV2({ ...value, schemaVersion: 2, entrance, exit });
  let routeGuidePoints: readonly { x: number; y: number }[] = [];
  if (value.routeGuidePoints !== undefined) {
    if (!Array.isArray(value.routeGuidePoints)) {
      throw new PersistenceError("routeGuidePoints must be an array");
    }
    routeGuidePoints = value.routeGuidePoints.map((point, index) =>
      parsePoint(point, `routeGuidePoints[${index}]`),
    );
  }
  const progressionRecord = isRecord(value.progression) ? value.progression : {};
  const claimed = progressionRecord.claimedMilestoneIds;
  if (claimed !== undefined && (!Array.isArray(claimed) || claimed.some((id) => typeof id !== "string"))) {
    throw new PersistenceError("progression.claimedMilestoneIds must be a string array");
  }
  const metrics = isRecord(value.metrics) ? value.metrics : {};
  return {
    schemaVersion: 3,
    savedAtTick: common.savedAtTick,
    map: common.map,
    accessPoints,
    routeGuidePoints,
    qualityMode: common.qualityMode,
    objects: common.objects,
    economy: common.economy,
    progression: {
      ...common.progression,
      focusDay: safeInteger(progressionRecord.focusDay ?? 0, "progression.focusDay", 0),
      dailyObjectives: parseDailyObjectives(progressionRecord.dailyObjectives),
      claimedMilestoneIds: (claimed as string[] | undefined) ?? [],
      stallMastery: parseMastery(progressionRecord.stallMastery),
    },
    metrics: {
      trayReturns: safeInteger(metrics.trayReturns ?? 0, "metrics.trayReturns", 0),
      visitRatings: parseVisitRatings(metrics.visitRatings),
    },
    rngState: common.rngState,
    nextCustomerSequence: common.nextCustomerSequence,
    elapsedMs: common.elapsedMs,
  };
}

function parseV4(value: Record<string, unknown>): PersistentGameStateV4 {
  const old = parseV3({ ...value, schemaVersion: 3 });
  const metrics = isRecord(value.metrics) ? value.metrics : {};
  return {
    ...old,
    schemaVersion: 4,
    metrics: {
      ...old.metrics,
      nutrition: parseNutritionMetrics(metrics.nutrition),
    },
  };
}

function parseV1(value: Record<string, unknown>): PersistentGameStateV1 {
  if (!Array.isArray(value.objects)) throw new PersistenceError("objects must be an array");
  return {
    schemaVersion: 1,
    map: parseMap(value.map),
    entrance: parsePoint(value.entrance, "entrance"),
    exit: parsePoint(value.exit, "exit"),
    objects: value.objects.map(parseObject),
    money: finite(value.money, "money", 0),
    xp: safeInteger(value.xp, "xp", 0),
    reputation: value.reputation === undefined ? undefined : finite(value.reputation, "reputation", 0),
    seed: safeInteger(value.seed, "seed", 1, 0xffff_ffff),
  };
}

export function migratePersistentState(value: unknown): PersistentGameStateV4 {
  if (!isRecord(value)) throw new PersistenceError("Save data must be an object");
  if (value.schemaVersion === 4) return parseV4(value);
  if (value.schemaVersion === 3) {
    const old = parseV3(value);
    return {
      ...old,
      schemaVersion: 4,
      metrics: { ...old.metrics, nutrition: createEmptyNutritionMetrics() },
    };
  }
  if (value.schemaVersion === 2) {
    const old = parseV2(value);
    return {
      schemaVersion: 4,
      savedAtTick: old.savedAtTick,
      map: old.map,
      accessPoints: [
        { id: "entrance-1", kind: "entrance", position: old.entrance },
        { id: "exit-1", kind: "exit", position: old.exit },
      ],
      routeGuidePoints: [],
      qualityMode: old.qualityMode,
      objects: old.objects,
      economy: old.economy,
      progression: old.progression,
      metrics: {
        trayReturns: 0,
        visitRatings: [],
        nutrition: createEmptyNutritionMetrics(),
      },
      rngState: old.rngState,
      nextCustomerSequence: old.nextCustomerSequence,
      elapsedMs: old.elapsedMs,
    };
  }
  if (value.schemaVersion !== 1) throw new PersistenceError(`Unsupported save version: ${String(value.schemaVersion)}`);
  const old = parseV1(value);
  const level = 1 + Math.floor(Math.sqrt(old.xp / 100));
  return migratePersistentState({
    schemaVersion: 2,
    savedAtTick: 0,
    map: old.map,
    entrance: old.entrance,
    exit: old.exit,
    qualityMode: "standard",
    objects: old.objects,
    economy: {
      currency: old.money,
      lifetimeRevenue: 0,
      lifetimeSpend: 0,
      completedVisits: 0,
      abandonedVisits: 0,
    },
    progression: {
      xp: old.xp,
      level,
      reputation: Math.max(0, Math.min(5, old.reputation ?? 2.5)),
      unlockedDefinitionIds: [],
      expansionCount: 0,
      focusDay: 0,
      dailyObjectives: [],
      claimedMilestoneIds: [],
      stallMastery: {},
    },
    rngState: old.seed,
    nextCustomerSequence: 1,
    elapsedMs: 0,
  });
}

export function persistentStateFromGame(state: GameState): PersistentGameStateV4 {
  return {
    schemaVersion: 4,
    savedAtTick: state.tick,
    map: {
      ...state.map,
      worldOrigin: { ...state.map.worldOrigin },
      tiles: [...state.map.tiles],
    },
    accessPoints: state.accessPoints.map((point) => ({ ...point, position: { ...point.position } })),
    routeGuidePoints: state.routeGuidePoints.map((point) => ({ ...point })),
    qualityMode: state.qualityMode,
    objects: Object.values(state.objects)
      .sort((a, b) => compareIds(a.id, b.id))
      .map((object) => ({
        ...object,
        origin: { ...object.origin },
        queuePath: object.queuePath?.map((point) => ({ ...point })),
      })),
    economy: { ...state.economy },
    progression: {
      ...state.progression,
      unlockedDefinitionIds: [...state.progression.unlockedDefinitionIds],
      dailyObjectives: state.progression.dailyObjectives.map((objective) => ({ ...objective })),
      claimedMilestoneIds: [...state.progression.claimedMilestoneIds],
      stallMastery: Object.fromEntries(Object.entries(state.progression.stallMastery).map(([id, mastery]) => [id, { ...mastery }])),
    },
    metrics: {
      trayReturns: state.metrics.trayReturns,
      visitRatings: state.metrics.visitRatings.map((rating) => ({
        ...rating,
        components: { ...rating.components },
      })),
      nutrition: cloneNutritionMetrics(state.metrics.nutrition),
    },
    rngState: state.rngState,
    nextCustomerSequence: state.nextCustomerSequence,
    elapsedMs: state.elapsedMs,
  };
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!isRecord(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
}

export function serializeGameState(state: GameState): string {
  return JSON.stringify(canonicalize(persistentStateFromGame(state)));
}

function normalizeObjects(
  save: PersistentGameStateV4,
  catalog: SimulationCatalog,
  options: DeserializeOptions,
): { readonly objects: readonly PlacedObject[]; readonly recovery: PersistenceRecoveryReport } {
  const accepted: Record<string, PlacedObject> = {};
  const warnings: string[] = [];
  const remappedObjectIds: Record<string, string> = {};
  const removedObjectIds: string[] = [];
  let currencyRefunded = 0;
  for (const source of save.objects) {
    if (accepted[source.id]) throw new PersistenceError(`Duplicate saved object id: ${source.id}`);
    let definitionId = source.definitionId;
    if (!catalog.placeables[definitionId]) {
      const alias = options.definitionIdAliases?.[definitionId];
      if (alias && catalog.placeables[alias]) {
        definitionId = alias;
        remappedObjectIds[source.id] = alias;
        warnings.push(`Remapped ${source.id} from ${source.definitionId} to ${alias}`);
      } else {
        const refund = options.removedDefinitionRefunds?.[definitionId];
        if (refund === undefined) {
          throw new PersistenceError(
            `Saved object ${source.id} references removed definition ${definitionId}; provide an alias or explicit refund migration`,
          );
        }
        if (!Number.isFinite(refund) || refund < 0) {
          throw new PersistenceError(`Refund migration for ${definitionId} must be non-negative`);
        }
        currencyRefunded += refund;
        removedObjectIds.push(source.id);
        warnings.push(`Removed ${source.id} (${definitionId}) and refunded ${refund}`);
        continue;
      }
    }
    const sourceObject: PlacedObject = { ...source, definitionId };
    const queueAnchor = getObjectQueueAnchor(sourceObject, catalog);
    const queueHead = sourceObject.queuePath?.[0];
    const queueHeadMovedOneTile =
      queueAnchor &&
      queueHead &&
      !samePoint(queueAnchor, queueHead) &&
      Math.abs(queueAnchor.x - queueHead.x) + Math.abs(queueAnchor.y - queueHead.y) === 1;
    const object: PlacedObject = queueHeadMovedOneTile
      ? {
          ...sourceObject,
          queuePath: [queueAnchor, ...(sourceObject.queuePath?.slice(0, -1) ?? [])],
        }
      : sourceObject;
    if (queueHeadMovedOneTile) {
      warnings.push(`Moved ${object.id}'s queue head to its updated service point`);
    }
    const validation = validatePlacement(save.map, accepted, catalog, object, {
      reservedPoints: [
        ...save.accessPoints.map((point) => point.position),
        ...save.routeGuidePoints,
      ],
    });
    if (!validation.valid) {
      throw new PersistenceError(`Saved object ${object.id} has invalid placement: ${validation.reasons.join("; ")}`);
    }
    accepted[object.id] = object;
  }
  return {
    objects: Object.values(accepted),
    recovery: { warnings, remappedObjectIds, removedObjectIds, currencyRefunded },
  };
}

function normalizeUnlocks(
  ids: readonly string[],
  catalog: SimulationCatalog,
  options: DeserializeOptions,
): { readonly ids: readonly string[]; readonly warnings: readonly string[] } {
  const accepted = new Set<string>();
  const warnings: string[] = [];
  for (const id of ids) {
    if (catalog.placeables[id]) {
      accepted.add(id);
      continue;
    }
    const alias = options.definitionIdAliases?.[id];
    if (alias && catalog.placeables[alias]) {
      accepted.add(alias);
      warnings.push(`Remapped unlocked definition ${id} to ${alias}`);
      continue;
    }
    if (options.removedDefinitionRefunds?.[id] !== undefined) {
      warnings.push(`Removed obsolete unlocked definition ${id}`);
      continue;
    }
    throw new PersistenceError(
      `Progression references removed definition ${id}; provide an alias or explicit removal migration`,
    );
  }
  return { ids: [...accepted].sort(compareIds), warnings };
}

export function deserializeGameStateWithReport(
  serialized: string | AnyPersistentGameState | unknown,
  catalog: SimulationCatalog,
  options: DeserializeOptions = {},
): DeserializeResult {
  let raw: unknown = serialized;
  if (typeof serialized === "string") {
    try {
      raw = JSON.parse(serialized) as unknown;
    } catch (error) {
      throw new PersistenceError("Save data is not valid JSON", { cause: error });
    }
  }
  const save = migratePersistentState(raw);
  const normalized = normalizeObjects(save, catalog, options);
  const normalizedMap = normalizeBoundaryOpenings(
    save.map,
    save.accessPoints.map((point) => point.position),
  );
  const normalizedUnlocks = normalizeUnlocks(save.progression.unlockedDefinitionIds, catalog, options);
  const recovery: PersistenceRecoveryReport = {
    ...normalized.recovery,
    warnings: [...normalized.recovery.warnings, ...normalizedUnlocks.warnings],
  };
  const recoveredEconomy = {
    ...save.economy,
    currency: save.economy.currency + normalized.recovery.currencyRefunded,
  };
  let base: GameState;
  try {
    base = createNewGame({
      map: normalizedMap,
      accessPoints: save.accessPoints,
      routeGuidePoints: save.routeGuidePoints,
      catalog,
      seed: save.rngState,
      startingCurrency: recoveredEconomy.currency,
      qualityMode: save.qualityMode,
      config: options.config,
      initialObjects: normalized.objects,
      initiallyUnlockedDefinitionIds: normalizedUnlocks.ids,
    });
  } catch (error) {
    throw new PersistenceError("Save data could not be normalized into a playable map", { cause: error });
  }
  const unlockedDefinitionIds = getUnlockedDefinitionIds(
    catalog,
    save.progression.level,
    normalizedUnlocks.ids,
  );
  const state: GameState = {
    ...base,
    economy: recoveredEconomy,
    progression: { ...save.progression, unlockedDefinitionIds },
    rngState: save.rngState,
    nextCustomerSequence: save.nextCustomerSequence,
    tick: save.savedAtTick,
    elapsedMs: save.elapsedMs,
    metrics: {
      ...base.metrics,
      trayReturns: save.metrics.trayReturns,
      visitRatings: save.metrics.visitRatings,
      nutrition: cloneNutritionMetrics(save.metrics.nutrition),
    },
    spawnCountdownMs: 0,
    accumulatorMs: 0,
    undoStack: [],
    events: [],
  };
  return { state, recovery };
}

export function deserializeGameState(
  serialized: string | AnyPersistentGameState | unknown,
  catalog: SimulationCatalog,
  options: DeserializeOptions = {},
): GameState {
  return deserializeGameStateWithReport(serialized, catalog, options).state;
}
