import type Phaser from "phaser";
import {
  CUSTOMER_ARCHETYPES,
  DISHES,
  ECONOMY,
  ENGLISH_LOCALIZATION,
  NUTRITION_CONTENT,
  PLACEABLES,
  STALLS,
  getNutritionProfile,
  getNutritionVariantFamily,
  type PlaceableCategory,
} from "@/src/content";
import {
  advanceSimulation,
  averageVisitRating,
  calculateExpansionCost,
  createGridMap,
  createNewGame,
  createSnapshot,
  deserializeGameState,
  dispatchCommand,
  effectiveStallDefinition,
  findPath,
  getBlockedTileKeys,
  getTile,
  getObjectOccupiedTiles,
  getObjectQueueAnchor,
  getSeatLocations,
  getUtilityInfluence,
  mealConsumptionFraction,
  OPERATING_DAY_MS,
  operatingMinuteOfDay,
  planStallQueueLayouts,
  persistentStateFromGame,
  tileToWorld,
  validatePlacement,
  worldToTile,
  xpRequiredForLevel,
  type Customer,
  type GameCommand,
  type GameSnapshot,
  type GameState,
  type GridPoint,
  type NutritionIntent,
  type NutritionMetric,
  type NutritionProfile as CoreNutritionProfile,
  type NutritionValue as CoreNutritionValue,
  type PlaceableDefinition as CorePlaceableDefinition,
  type PlacedObject,
  type QueueDirection,
  type Rotation,
  type SimulationCatalog,
  type SimulationEvent,
} from "@/src/game/core";
import type {
  BuildTool,
  GameSpeed,
  RuntimeController,
  RuntimeEvent,
  RuntimeOptions,
  RuntimeNutritionProfileSummary,
  RuntimeSnapshot,
} from "./types";
import { utilityEffectsForPlaceable } from "./contentUtility";
import { deriveQueueFlowInsight } from "./queueInsight";
import { deriveSatisfactionTips } from "./satisfactionInsight";
import {
  defaultStallMenusForProgression,
  isDishIdUnlockedForMenu,
  normalizeStallMenuSelection,
  resolveStallMenus,
} from "./stallMenus";
import {
  animationPoseForCustomer,
  customerAppearanceForId,
  stableVisualHash,
  vendorAnimationPoseForStall,
  visualRecipeForCustomer,
  visualRecipeForDish,
  visualRecipeForDishVariant,
  visualRecipeForPlaceable,
  visualRecipeForStallVendor,
  type PlaceableVisualRecipe,
  type StallVendorAnimationPose,
  type StallVendorEmblem,
  type StallVendorRecipe,
} from "./visualRecipes";
import { displayDishIdsForStall } from "./stallVisuals";

const TILE_SIZE = 48;
const MAP_WIDTH = 24;
const MAP_HEIGHT = 16;
const BUILDABLE_CONTENT = [...PLACEABLES, ...STALLS] as const;
const CONTENT_PLACEABLE_BY_ID = new Map(PLACEABLES.map((item) => [item.id, item]));
const DISH_BY_ID = new Map(DISHES.map((dish) => [dish.id, dish]));
const STALL_BY_ID = new Map(STALLS.map((stall) => [stall.id, stall]));
const STALL_VENDOR_VISUAL_BY_ID = new Map(
  STALLS.map((stall) => [stall.id, visualRecipeForStallVendor(stall)]),
);
const CUSTOMER_BY_ID = new Map(CUSTOMER_ARCHETYPES.map((archetype) => [archetype.id, archetype]));
const DISH_VISUAL_BY_ID = new Map(DISHES.map((dish) => [dish.id, visualRecipeForDish(dish)]));
const CUSTOMER_VISUAL_BY_ID = new Map(
  CUSTOMER_ARCHETYPES.map((archetype) => [archetype.id, visualRecipeForCustomer(archetype)]),
);
const BUILDABLE_REQUIREMENTS = new Map(
  BUILDABLE_CONTENT.map((definition) => [definition.id, definition.unlockRequirement]),
);

function usesComplexUnlock(id: string) {
  const requirement = BUILDABLE_REQUIREMENTS.get(id);
  return Boolean(
    requirement &&
      (requirement.reputation > 0 || requirement.prerequisiteIds.length > 0),
  );
}

function reconcileRuntimeUnlocks(source: GameState): GameState {
  const unlocked = new Set(source.progression.unlockedDefinitionIds);
  let changed = true;
  while (changed) {
    changed = false;
    for (const definition of BUILDABLE_CONTENT) {
      const requirement = definition.unlockRequirement;
      if (
        unlocked.has(definition.id) ||
        source.progression.level < requirement.level ||
        source.progression.reputation * 20 < requirement.reputation ||
        !requirement.prerequisiteIds.every((id) => unlocked.has(id))
      ) {
        continue;
      }
      unlocked.add(definition.id);
      changed = true;
    }
  }
  if (unlocked.size === source.progression.unlockedDefinitionIds.length) return source;
  return {
    ...source,
    progression: {
      ...source.progression,
      unlockedDefinitionIds: [...unlocked].sort(),
    },
  };
}

interface VisualDefinition {
  category: PlaceableCategory | "stall";
  name: string;
  palette: readonly string[];
  signShape?: "awning" | "lightbox" | "painted-board" | "tile-panel";
}

function localized(key: string) {
  return ENGLISH_LOCALIZATION[key] ?? key;
}

function colour(value: string, fallback: number) {
  const normalized = value.replace("#", "");
  const parsed = Number.parseInt(normalized, 16);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function mixColour(base: number, blend: number, amount: number) {
  const weight = Math.max(0, Math.min(1, amount));
  const channel = (shift: number) =>
    Math.round(
      ((base >>> shift) & 0xff) * (1 - weight) +
        ((blend >>> shift) & 0xff) * weight,
    );
  return (channel(16) << 16) | (channel(8) << 8) | channel(0);
}

function lighten(base: number, amount: number) {
  return mixColour(base, 0xffffff, amount);
}

function darken(base: number, amount: number) {
  return mixColour(base, 0x102923, amount);
}

function coreKind(category: PlaceableCategory): CorePlaceableDefinition["kind"] {
  if (category === "seat") return "seat";
  if (category === "table") return "table";
  if (category === "tray-waste") return "facility";
  if (category === "decor" || category === "plant" || category === "signage") {
    return "decoration";
  }
  return "facility";
}

type CustomerMovementState = Pick<
  Customer,
  "id" | "position" | "path" | "pathIndex" | "movementProgress"
>;

function renderedCustomerPosition(
  customer: CustomerMovementState,
  reducedMotion: boolean,
) {
  const next = customer.path[customer.pathIndex];
  if (!next || reducedMotion) return customer.position;
  const progress = Math.max(0, Math.min(1, customer.movementProgress));
  return {
    x: customer.position.x + (next.x - customer.position.x) * progress,
    y: customer.position.y + (next.y - customer.position.y) * progress,
  };
}

/** Resolves the customer occupying the grid tile where their avatar is rendered. */
export function customerAtRenderedGridPoint<T extends CustomerMovementState>(
  customers: readonly T[],
  point: GridPoint,
  reducedMotion = false,
): T | undefined {
  return customers
    .filter((customer) => {
      const position = renderedCustomerPosition(customer, reducedMotion);
      return (
        Math.floor(position.x + 0.5) === point.x &&
        Math.floor(position.y + 0.5) === point.y
      );
    })
    .sort((left, right) => left.id.localeCompare(right.id))[0];
}

/** Returns a visual key only for a reviewed member of a real variant family. */
export function nutritionVisualKeyForVariant(
  dishId: string | undefined,
  variantId: string | undefined,
): string | undefined {
  if (!dishId || !variantId) return undefined;
  return getNutritionVariantFamily(dishId)?.variants.find(
    (variant) => variant.id === variantId,
  )?.visualKey;
}

function coreNutritionProfile(
  source: ReturnType<typeof getNutritionProfile>,
): CoreNutritionProfile | undefined {
  if (!source) return undefined;
  return {
    id: source.id,
    dishId: source.dishId,
    status: source.status,
    serving: source.serving ? { ...source.serving } : undefined,
    nutrients: Object.fromEntries(
      Object.entries(source.nutrients).map(([metric, value]) => [metric, { ...value }]),
    ) as Readonly<Record<NutritionMetric, CoreNutritionValue>>,
    intentFits: { ...source.intentFits } as Partial<Record<NutritionIntent, number>>,
    nutritionClass: source.nutritionClass,
  };
}

function runtimeNutritionProfile(
  profile: CoreNutritionProfile | undefined,
): RuntimeNutritionProfileSummary | undefined {
  if (!profile) return undefined;
  return {
    status: profile.status,
    servingLabel: profile.serving?.label,
    energyKcal: profile.nutrients.energyKcal,
    proteinG: profile.nutrients.proteinG,
    dietaryFibreG: profile.nutrients.dietaryFibreG,
    sodiumMg: profile.nutrients.sodiumMg,
    totalSugarG: profile.nutrients.totalSugarG,
    intentFits: { ...profile.intentFits },
  };
}

export function customerDecisionReasons(
  customer: Pick<
    Customer,
    "archetypeId" | "nutritionIntentId" | "orderedDishId" | "orderedNutritionProfile"
  >,
  catalog: SimulationCatalog,
): readonly string[] {
  const dish = customer.orderedDishId
    ? catalog.dishes[customer.orderedDishId]
    : undefined;
  const archetype = catalog.archetypes[customer.archetypeId];
  if (!dish || !archetype) return [];

  const reasons: string[] = [];
  const preferred = new Set(archetype.preferenceTags ?? []);
  if ((dish.preferenceTags ?? []).some((tag) => preferred.has(tag))) {
    reasons.push("Familiar flavour preference");
  }

  if (customer.nutritionIntentId) {
    const fit = customer.orderedNutritionProfile?.intentFits[customer.nutritionIntentId];
    if (typeof fit === "number" && Number.isFinite(fit)) {
      reasons.push(fit >= 0.67 ? "Visit intent fit" : "Nutrition trade-off");
    }
  }

  if (dish.price <= archetype.budget) reasons.push("Price within visit budget");
  if (dish.quality * archetype.qualitySensitivity > 0) reasons.push("Menu quality");
  return [...new Set(reasons)].slice(0, 2);
}

function buildCatalog(): {
  catalog: SimulationCatalog;
  visuals: Readonly<Record<string, VisualDefinition>>;
} {
  const dishes: SimulationCatalog["dishes"] = Object.fromEntries(
    DISHES.map((dish) => {
      const family = getNutritionVariantFamily(dish.id);
      const baseProfile = coreNutritionProfile(getNutritionProfile(dish.id));
      const nutritionVariants = family
        ? family.variants.map((variant) => ({
            id: variant.id,
            label: variant.name,
            unlockRank: variant.unlockRank,
            profileId: variant.profileId,
            visualKey: variant.visualKey,
            profile: coreNutritionProfile(getNutritionProfile(dish.id, variant.id)),
          }))
        : baseProfile
          ? [{
              id: baseProfile.id,
              label: "Listed serving",
              unlockRank: 1,
              profileId: baseProfile.id,
              visualKey: "default",
              profile: baseProfile,
            }]
          : undefined;
      const defaultNutritionVariantId = family?.defaultVariantId ?? baseProfile?.id;
      return [
        dish.id,
        {
        id: dish.id,
        price: dish.price,
        preparationMs: dish.preparationTimeMs,
        eatingMs: dish.eatingTimeMs,
        quality: dish.quality,
        baseDemand: dish.baseDemand,
        preferenceTags: dish.preferenceTags,
        unlockLevel: dish.unlockRequirement.level,
        unlockReputation: dish.unlockRequirement.reputation / 20,
        nutritionVariants,
        defaultNutritionVariantId,
        activeNutritionVariantId: defaultNutritionVariantId,
      },
      ];
    }),
  );

  const placeables: Record<string, CorePlaceableDefinition> = {};
  const visuals: Record<string, VisualDefinition> = {};

  for (const item of PLACEABLES) {
    const returnPoint = item.interactionPoints.find((point) => point.role === "return-tray");
    placeables[item.id] = {
      id: item.id,
      kind: returnPoint ? "tray-return" : coreKind(item.category),
      footprint: item.footprint,
      allowedRotations: item.rotations,
      blocksMovement: item.walkability === "blocked",
      price: item.price,
      refundRate: item.price > 0 ? item.resaleValue / item.price : 0,
      unlockLevel: usesComplexUnlock(item.id)
        ? Number.MAX_SAFE_INTEGER
        : item.unlockRequirement.level,
      seatPoints: item.seatPoints.map((point) => ({ x: point.x, y: point.y })),
      trayReturnPoint: returnPoint ? { x: returnPoint.x, y: returnPoint.y } : undefined,
      utility: utilityEffectsForPlaceable(item),
    };
    visuals[item.id] = {
      category: item.category,
      name: localized(item.nameKey),
      palette: item.spriteReferences.map((_, index) =>
        ["#8cab95", "#d6a15f", "#6f8d94"][index % 3] as string,
      ),
    };
  }

  for (const stall of STALLS) {
    const averageDishPrice =
      stall.dishIds.reduce((total, id) => total + (dishes[id]?.price ?? 5), 0) /
      Math.max(1, stall.dishIds.length);
    placeables[stall.id] = {
      id: stall.id,
      kind: "stall",
      footprint: stall.footprint,
      allowedRotations: [0, 90, 180, 270],
      blocksMovement: true,
      price: stall.purchaseCost,
      refundRate: 0.5,
      unlockLevel: usesComplexUnlock(stall.id)
        ? Number.MAX_SAFE_INTEGER
        : stall.unlockRequirement.level,
      servicePoint: stall.servicePoint,
      queueAnchor: stall.queueAnchor,
      stall: {
        dishIds: stall.dishIds,
        allDishIds: stall.dishIds,
        orderMs: stall.serviceTimeMs,
        preparationCapacity: stall.preparationCapacity,
        queueCapacity: 7,
        popularity: stall.popularity,
        quality: stall.quality + Math.min(0.05, averageDishPrice / 300),
        menuSlots: stall.menuSlots,
        upgradeLevels: stall.upgradeLevels.map((upgrade) => ({ ...upgrade })),
      },
    };
    visuals[stall.id] = {
      category: "stall",
      name: localized(stall.nameKey),
      palette: stall.visual.palette,
      signShape: stall.visual.signShape,
    };
  }

  const archetypes: SimulationCatalog["archetypes"] = Object.fromEntries(
    CUSTOMER_ARCHETYPES.map((archetype) => [
      archetype.id,
      {
        id: archetype.id,
        budget: (archetype.budgetRange[0] + archetype.budgetRange[1]) / 2,
        patienceMs: archetype.patienceSeconds * 1_000,
        walkingSpeed: archetype.walkingSpeedTilesPerSecond,
        priceSensitivity: archetype.priceSensitivity,
        qualitySensitivity: archetype.qualitySensitivity,
        queueSensitivity: archetype.queueSensitivity,
        distanceSensitivity: archetype.distanceSensitivity,
        noveltyPreference: archetype.noveltyPreference,
        preferenceTags: archetype.dishPreferenceTags,
        unlockLevel: archetype.unlockRequirement.level,
        unlockReputation: archetype.unlockRequirement.reputation / 20,
        unlockPrerequisiteIds: [...archetype.unlockRequirement.prerequisiteIds],
        visitSchedule: { ...archetype.visitSchedule },
      },
    ]),
  );

  return { catalog: { placeables, dishes, archetypes }, visuals };
}

function starterObjects(
  catalog: SimulationCatalog,
  map: ReturnType<typeof createGridMap>,
): readonly PlacedObject[] {
  const candidates: PlacedObject[] = [];
  const tableIds = PLACEABLES.filter((item) => item.category === "table").map((item) => item.id);
  const seatId = PLACEABLES.find((item) => item.category === "seat")?.id;
  const trayId = PLACEABLES.find(
    (item) =>
      item.category === "tray-waste" &&
      item.interactionPoints.some((point) => point.role === "return-tray"),
  )?.id;
  const plantId = PLACEABLES.find((item) => item.category === "plant")?.id;
  const fanId = PLACEABLES.find((item) => item.category === "fan")?.id;

  const plans: Array<[string | undefined, number, number, boolean]> = [
    [STALLS[0]?.id, 2, 1, false],
    [STALLS[1]?.id, 10, 1, false],
    [tableIds[0], 5, 8, false],
    [tableIds[1] ?? tableIds[0], 12, 9, false],
    [seatId, 4, 8, false],
    [seatId, 8, 8, false],
    [seatId, 11, 9, false],
    [seatId, 15, 9, false],
    [seatId, 6, 11, false],
    [seatId, 13, 12, false],
    [trayId, 20, 7, false],
    [plantId, 20, 2, false],
    [plantId, 20, 12, false],
    [fanId, 9, 7, false],
  ];

  for (const [definitionId, x, y, open] of plans) {
    if (!definitionId || !catalog.placeables[definitionId]) continue;
    const object: PlacedObject = {
      id: `starter-${candidates.length + 1}`,
      definitionId,
      origin: { x, y },
      rotation: 0,
      open,
    };
    const existing = Object.fromEntries(candidates.map((candidate) => [candidate.id, candidate]));
    const validation = validatePlacement(map, existing, catalog, object, {
      reservedPoints: [
        { x: 0, y: 7 },
        { x: MAP_WIDTH - 1, y: 7 },
      ],
    });
    if (validation.valid) candidates.push(object);
  }
  return candidates;
}

function freshState(catalog: SimulationCatalog): GameState {
  const tiles = Array<"floor" | "wall">(MAP_WIDTH * MAP_HEIGHT).fill("floor");
  for (let x = 0; x < MAP_WIDTH; x += 1) {
    tiles[x] = "wall";
    tiles[(MAP_HEIGHT - 1) * MAP_WIDTH + x] = "wall";
  }
  for (let y = 0; y < MAP_HEIGHT; y += 1) {
    tiles[y * MAP_WIDTH] = "wall";
    tiles[y * MAP_WIDTH + MAP_WIDTH - 1] = "wall";
  }
  tiles[7 * MAP_WIDTH] = "floor";
  tiles[7 * MAP_WIDTH + MAP_WIDTH - 1] = "floor";

  const map = createGridMap(MAP_WIDTH, MAP_HEIGHT, {
    tileSize: TILE_SIZE,
    worldOrigin: { x: 0, y: 0 },
    tiles,
  });
  const created = createNewGame({
    map,
    entrance: { x: 0, y: 7 },
    exit: { x: MAP_WIDTH - 1, y: 7 },
    catalog,
    seed: "neighbourhood-hall-launch",
    startingCurrency: ECONOMY.startingCash,
    initialObjects: starterObjects(catalog, map),
    initiallyUnlockedDefinitionIds: Object.values(catalog.placeables)
      .filter((definition) => (definition.unlockLevel ?? 1) <= 1)
      .map((definition) => definition.id),
  });
  return reconcileRuntimeUnlocks({
    ...created,
    progression: {
      ...created.progression,
      reputation: ECONOMY.startingReputation / 20,
    },
  });
}

function assertRuntimeMap(state: GameState): GameState {
  if (
    state.map.tileSize !== TILE_SIZE ||
    state.map.width < MAP_WIDTH ||
    state.map.height < MAP_HEIGHT
  ) {
    throw new Error(
      `This save uses an unsupported map geometry (${state.map.width}×${state.map.height} at ${state.map.tileSize}px).`,
    );
  }
  return state;
}

function timeLabel(elapsedMs: number) {
  const minuteInDay = operatingMinuteOfDay(elapsedMs);
  const hour = Math.floor(minuteInDay / 60);
  const minute = minuteInDay % 60;
  const suffix = hour >= 12 ? "PM" : "AM";
  const clockHour = hour % 12 || 12;
  return `${clockHour}:${minute.toString().padStart(2, "0")} ${suffix}`;
}

function formatSimulationEvent(event: SimulationEvent): RuntimeEvent | undefined {
  if (event.type === "sale-completed") {
    return {
      kind: "success",
      message: `A neighbour enjoyed their meal · +$${event.amount ?? 0}`,
      importance: "routine",
      groupKey: "sales",
      amount: event.amount ?? 0,
    };
  }
  if (event.type === "level-up") {
    return { kind: "success", message: "Centre level increased — new catalogue entries unlocked.", importance: "important" };
  }
  if (event.type === "objective-completed") {
    return { kind: "success", message: `${event.message ?? "Today's focus"} complete · +$${event.amount ?? 0}`, importance: "important" };
  }
  if (event.type === "milestone-completed") {
    return { kind: "success", message: `Centre journey milestone complete · +$${event.amount ?? 0}`, importance: "important" };
  }
  if (event.type === "command-rejected") {
    return { kind: "error", message: event.message ?? "That build action is not valid.", importance: "important" };
  }
  if (event.type === "target-recovered") {
    return { kind: "warning", message: "A guest rerouted after the layout changed.", importance: "routine", groupKey: "reroutes" };
  }
  return undefined;
}

export interface RuntimePersistentState {
  readonly runtimeSchemaVersion: 2;
  readonly core: unknown;
  readonly stallMenus: Readonly<Record<string, readonly string[]>>;
  readonly nutritionDataVersion: string;
  readonly activeDishVariants: Readonly<Record<string, string>>;
}

export function defaultDishVariants(): Readonly<Record<string, string>> {
  return Object.fromEntries(
    NUTRITION_CONTENT.variantFamilies.map((family) => [
      family.dishId,
      family.defaultVariantId,
    ]),
  );
}

function withDishVariants(
  base: SimulationCatalog,
  activeDishVariants: Readonly<Record<string, string>>,
): SimulationCatalog {
  return {
    ...base,
    dishes: Object.fromEntries(Object.entries(base.dishes).map(([dishId, dish]) => {
      const family = getNutritionVariantFamily(dishId);
      const activeNutritionVariantId = family
        ? activeDishVariants[dishId] ?? family.defaultVariantId
        : dish.defaultNutritionVariantId;
      return [dishId, { ...dish, activeNutritionVariantId }];
    })),
  };
}

export function resolveDishVariants(
  value: unknown,
  state: Pick<GameState, "progression">,
): {
  readonly selections: Readonly<Record<string, string>>;
  readonly recovered: boolean;
} {
  const isVariantMap = value !== null && typeof value === "object" && !Array.isArray(value);
  const source = isVariantMap
    ? value as Readonly<Record<string, unknown>>
    : {};
  const familyIds = new Set(
    NUTRITION_CONTENT.variantFamilies.map((family) => family.dishId),
  );
  let recovered =
    (value !== undefined && !isVariantMap) ||
    Object.keys(source).some((dishId) => !familyIds.has(dishId)) ||
    (value !== undefined && [...familyIds].some((dishId) => !Object.hasOwn(source, dishId)));
  const selections = Object.fromEntries(NUTRITION_CONTENT.variantFamilies.map((family) => {
    const stallRanks = STALLS
      .filter((stall) => stall.dishIds.includes(family.dishId))
      .map((stall) => state.progression.stallMastery[stall.id]?.rank ?? 1);
    const rank = Math.max(1, ...stallRanks);
    const requested = source[family.dishId];
    const variant = typeof requested === "string"
      ? family.variants.find((candidate) => candidate.id === requested)
      : undefined;
    if (requested !== undefined && (!variant || variant.unlockRank > rank)) recovered = true;
    return [
      family.dishId,
      variant && variant.unlockRank <= rank ? variant.id : family.defaultVariantId,
    ];
  }));
  return { selections, recovered };
}

export function resolvePersistedDishVariants(
  value: unknown,
  nutritionDataVersion: string | undefined,
  state: Pick<GameState, "progression">,
): {
  readonly selections: Readonly<Record<string, string>>;
  readonly recovered: boolean;
} {
  const outdated =
    value !== undefined &&
    nutritionDataVersion !== NUTRITION_CONTENT.dataVersion;
  const resolved = resolveDishVariants(outdated ? undefined : value, state);
  return {
    selections: resolved.selections,
    recovered: outdated || resolved.recovered,
  };
}

function withStallMenus(
  base: SimulationCatalog,
  menus: Readonly<Record<string, readonly string[]>>,
): SimulationCatalog {
  return {
    ...base,
    placeables: Object.fromEntries(
      Object.entries(base.placeables).map(([id, definition]) => [
        id,
        definition.stall
          ? {
              ...definition,
              stall: {
                ...definition.stall,
                dishIds: menus[id] ?? definition.stall.dishIds,
              },
            }
          : definition,
      ]),
    ),
  };
}

export function decodeRuntimeSave(value: unknown): {
  core: unknown;
  runtimeSchemaVersion?: 1 | 2;
  menus?: Readonly<Record<string, readonly string[]>>;
  variants?: unknown;
  nutritionDataVersion?: string;
} {
  if (
    value &&
    typeof value === "object" &&
    ((value as { runtimeSchemaVersion?: unknown }).runtimeSchemaVersion === 1 ||
      (value as { runtimeSchemaVersion?: unknown }).runtimeSchemaVersion === 2)
  ) {
    const runtime = value as Partial<RuntimePersistentState> & {
      readonly runtimeSchemaVersion?: 1 | 2;
    };
    return {
      core: runtime.core,
      runtimeSchemaVersion: runtime.runtimeSchemaVersion,
      menus: normalizeStallMenuSelection(runtime.stallMenus),
      variants: runtime.activeDishVariants,
      nutritionDataVersion: typeof runtime.nutritionDataVersion === "string"
        ? runtime.nutritionDataVersion
        : undefined,
    };
  }
  return { core: value };
}

function stallMenuProgression(state: GameState) {
  return {
    level: state.progression.level,
    reputation: state.progression.reputation * 20,
  };
}

function stallMenuSlotBonuses(state: GameState) {
  return Object.fromEntries(
    STALLS.map((stall) => {
      const mastery = state.progression.stallMastery[stall.id];
      const upgrade = stall.upgradeLevels.find(
        (candidate) => candidate.level === mastery?.upgradeLevel,
      );
      return [stall.id, upgrade?.menuSlotsBonus ?? 0];
    }),
  );
}

function stallMenusMatch(
  left: Readonly<Record<string, readonly string[]>>,
  right: Readonly<Record<string, readonly string[]>>,
) {
  return STALLS.every((stall) => {
    const leftIds = left[stall.id] ?? [];
    const rightIds = right[stall.id] ?? [];
    return (
      leftIds.length === rightIds.length &&
      leftIds.every((dishId, index) => dishId === rightIds[index])
    );
  });
}

export async function createHawkerRuntime(
  options: RuntimeOptions,
): Promise<RuntimeController> {
  const PhaserRuntime = (await import("phaser")).default;
  const { catalog: authoredCatalog, visuals } = buildCatalog();
  let stallMenus = defaultStallMenusForProgression({
    level: 1,
    reputation: ECONOMY.startingReputation,
  });
  let activeDishVariants = defaultDishVariants();
  let catalog = withStallMenus(
    withDishVariants(authoredCatalog, activeDishVariants),
    stallMenus,
  );
  let state: GameState;
  let recoveredNutritionSelection = false;
  try {
    const candidates = options.initialStates ?? [];
    let loaded: GameState | undefined;
    let lastLoadError: unknown;
    for (let index = 0; index < candidates.length; index += 1) {
      try {
        const decoded = decodeRuntimeSave(candidates[index]);
        const loadedCore = reconcileRuntimeUnlocks(
          assertRuntimeMap(deserializeGameState(decoded.core, authoredCatalog)),
        );
        stallMenus = resolveStallMenus(decoded.menus ?? {}, {
          ...stallMenuProgression(loadedCore),
          slotBonuses: stallMenuSlotBonuses(loadedCore),
        });
        const resolvedVariants = resolvePersistedDishVariants(
          decoded.variants,
          decoded.nutritionDataVersion,
          loadedCore,
        );
        const incompleteRuntimeV2 =
          decoded.runtimeSchemaVersion === 2 &&
          (decoded.variants === undefined || decoded.nutritionDataVersion === undefined);
        activeDishVariants = resolvedVariants.selections;
        recoveredNutritionSelection =
          recoveredNutritionSelection ||
          resolvedVariants.recovered ||
          incompleteRuntimeV2;
        catalog = withStallMenus(
          withDishVariants(authoredCatalog, activeDishVariants),
          stallMenus,
        );
        loaded = { ...loadedCore, catalog };
        if (index > 0) {
          options.onEvent({
            kind: "warning",
            message: "The newest save was damaged; the automatic backup was restored.",
          });
        }
        break;
      } catch (error) {
        lastLoadError = error;
      }
    }
    if (!loaded && candidates.length > 0) throw lastLoadError;
    if (loaded) {
      state = loaded;
    } else {
      state = freshState(authoredCatalog);
      activeDishVariants = defaultDishVariants();
      catalog = withStallMenus(
        withDishVariants(authoredCatalog, activeDishVariants),
        stallMenus,
      );
      state = { ...state, catalog };
    }
  } catch (error) {
    options.onEvent({
      kind: "warning",
      message: `The previous save was recovered as a new centre: ${error instanceof Error ? error.message : "unknown save error"}`,
    });
    stallMenus = defaultStallMenusForProgression({
      level: 1,
      reputation: ECONOMY.startingReputation,
    });
    activeDishVariants = defaultDishVariants();
    catalog = withStallMenus(
      withDishVariants(authoredCatalog, activeDishVariants),
      stallMenus,
    );
    state = freshState(authoredCatalog);
    state = { ...state, catalog };
  }

  if (recoveredNutritionSelection) {
    options.onEvent({
      kind: "warning",
      message: "One or more saved recipe choices were reset to reviewed defaults.",
    });
  }

  if (
    process.env.NODE_ENV !== "production" &&
    typeof location !== "undefined" &&
    new URLSearchParams(location.search).has("visualQa")
  ) {
    state = {
      ...state,
      economy: { ...state.economy, currency: 100_000 },
      progression: {
        ...state.progression,
        xp: xpRequiredForLevel(12),
        level: 12,
        reputation: 5,
        unlockedDefinitionIds: Object.keys(catalog.placeables).sort(),
      },
    };
  }

  const persistentPayload = (): RuntimePersistentState => ({
    runtimeSchemaVersion: 2,
    core: persistentStateFromGame(state),
    stallMenus,
    nutritionDataVersion: NUTRITION_CONTENT.dataVersion,
    activeDishVariants,
  });

  const runtime = { game: undefined as Phaser.Game | undefined };
  let activeScene: HawkerScene | undefined;
  let selectedBuildId: string | undefined;
  let selectedObjectId: string | undefined;
  let selectedCustomerId: string | undefined;
  let pendingMoveId: string | undefined;
  let queueEditingStallId: string | undefined;
  let queueDraft: readonly GridPoint[] = [];
  let buildTool: BuildTool = "select";
  let selectedAccessPointId: string | undefined;
  let pendingAccessKind: "entrance" | "exit" | undefined;
  let accessSequence = state.accessPoints.length + 1;
  let selectedRotation: Rotation = 0;
  let speed: GameSpeed = 1;
  let speedBeforeLayoutEdit: GameSpeed = 1;
  let qualityMode = options.settings.quality;
  let reducedMotion = options.settings.reducedMotion;
  let highContrast = options.settings.highContrast;
  let debugOverlay = false;
  let objectSequence = Object.keys(state.objects).length + 1;
  let lastHudAt = 0;
  let lastPersistentRevenue = state.economy.lifetimeRevenue;
  let lastPeriodicSaveAt = performance.now();
  let lastRenderTick = -1;
  let lastSimulationMs = 0;
  let hoverTile: GridPoint = { x: 6, y: 6 };
  let lastFrameAt = performance.now();
  let dragged = false;
  let dragOrigin = { x: 0, y: 0 };
  let cameraOrigin = { x: 0, y: 0 };

  function synchronizeStallMenus() {
    const nextMenus = resolveStallMenus(stallMenus, {
      ...stallMenuProgression(state),
      slotBonuses: stallMenuSlotBonuses(state),
    });
    if (stallMenusMatch(stallMenus, nextMenus)) return false;
    stallMenus = nextMenus;
    catalog = withStallMenus(
      withDishVariants(authoredCatalog, activeDishVariants),
      stallMenus,
    );
    state = { ...state, catalog };
    return true;
  }

  synchronizeStallMenus();

  function isCentreOpen() {
    return Object.values(state.objects).some(
      (object) => catalog.placeables[object.definitionId]?.kind === "stall" && object.open,
    );
  }

  function runCommand(command: GameCommand, persist = true) {
    const result = dispatchCommand(state, command);
    state = result.state;
    const menusChanged = synchronizeStallMenus();
    for (const event of result.events) {
      const runtimeEvent = formatSimulationEvent(event);
      if (runtimeEvent) options.onEvent(runtimeEvent);
    }
    if ((result.accepted || menusChanged) && persist) {
      options.onPersistentChange(persistentPayload());
    }
    activeScene?.render(true);
    emitHud(true);
    return result.accepted;
  }

  function effectiveCatalog(): SimulationCatalog {
    return {
      ...catalog,
      placeables: Object.fromEntries(Object.entries(catalog.placeables).map(([id, definition]) => [
        id,
        definition.stall
          ? { ...definition, stall: effectiveStallDefinition(state, id, definition.stall) }
          : definition,
      ])),
    };
  }

  function currentSnapshot(): RuntimeSnapshot {
    const snapshot = createSnapshot(state);
    const seats = getSeatLocations(state.objects, catalog);
    const queueCount = Object.values(snapshot.queues).reduce((sum, queue) => sum + queue.length, 0);
    const placedContent = snapshot.objects
      .map((object) => CONTENT_PLACEABLE_BY_ID.get(object.definitionId))
      .filter((item) => item !== undefined);
    const cleanlinessSupport = placedContent.reduce(
      (sum, item) => sum + item.cleanlinessModifier,
      0,
    );
    const trayReturnStations = snapshot.objects.filter(
      (object) => catalog.placeables[object.definitionId]?.kind === "tray-return",
    ).length;
    const averageSatisfaction = averageVisitRating(state);
    const satisfactionBreakdown = snapshot.metrics.visitRatings.length
      ? Object.fromEntries(
          ["foodQuality", "wait", "value", "walking", "comfort", "cleanliness", "ambience"].map((key) => [
            key,
            snapshot.metrics.visitRatings.reduce((sum, rating) => sum + rating.components[key as keyof typeof rating.components], 0) /
              snapshot.metrics.visitRatings.length,
          ]),
        ) as unknown as RuntimeSnapshot["satisfactionBreakdown"]
      : undefined;
    const nextLevelExperience = xpRequiredForLevel(snapshot.progression.level + 1);
    const queueLayouts = planStallQueueLayouts(
      snapshot.map,
      state.objects,
      effectiveCatalog(),
      [
        ...snapshot.accessPoints.map((point) => point.position),
        ...snapshot.routeGuidePoints,
      ],
    );
    const blocked = getBlockedTileKeys(state.objects, catalog);
    const preferred = new Set(snapshot.routeGuidePoints.map((point) => `${point.x},${point.y}`));
    const routeCells = new Map<string, GridPoint>();
    for (const entrance of snapshot.accessPoints.filter((point) => point.kind === "entrance")) {
      for (const exit of snapshot.accessPoints.filter((point) => point.kind === "exit")) {
        for (const point of findPath(snapshot.map, entrance.position, exit.position, {
          blocked,
          preferred,
        }).path ?? []) {
          routeCells.set(`${point.x},${point.y}`, point);
        }
      }
    }
    const mainGuestRoute = [...routeCells.values()];
    const queueFlow = deriveQueueFlowInsight(
      snapshot.objects
        .filter((object) => catalog.placeables[object.definitionId]?.kind === "stall")
        .map((object) => {
          const definition = catalog.placeables[object.definitionId];
          const cells = queueLayouts[object.id] ?? [];
          const count = snapshot.queues[object.id]?.length ?? 0;
          return {
            open: object.open,
            queueCount: count,
            routeCapacity: cells.length,
            designedCapacity: definition?.stall
              ? effectiveStallDefinition(state, object.definitionId, definition.stall).queueCapacity
              : cells.length,
            occupiedCells: cells.slice(0, count),
          };
        }),
      mainGuestRoute,
    );
    const placedStalls = snapshot.objects
      .filter((object) => catalog.placeables[object.definitionId]?.kind === "stall")
      .map((object) => {
        const cells = queueLayouts[object.id] ?? [];
        const first = cells[0];
        const second = cells[1];
        const inferredDirection: QueueDirection =
          object.queueDirection ??
          (first && second
            ? second.x > first.x
              ? "east"
              : second.x < first.x
                ? "west"
                : second.y < first.y
                  ? "north"
                  : "south"
            : "south");
        return {
          objectId: object.id,
          definitionId: object.definitionId,
          name: visuals[object.definitionId]?.name ?? object.definitionId,
          queueCount: snapshot.queues[object.id]?.length ?? 0,
          queueDirection: inferredDirection,
          customQueue: Boolean(object.queuePath?.length),
          open: object.open,
        };
      });
    const milestoneTracks = [
      { id: "service", title: "Service", values: [50, 250, 1_000, 5_000], progress: snapshot.economy.completedVisits },
      { id: "hospitality", title: "Hospitality", values: [75, 85, 90, 95], progress: averageSatisfaction ?? 0 },
      { id: "variety", title: "Variety", values: [2, 4, 6, 8], progress: new Set(snapshot.objects.filter((object) => object.open && catalog.placeables[object.definitionId]?.kind === "stall").map((object) => object.definitionId)).size },
      { id: "growth", title: "Growth", values: [3, 7, 12, 20], progress: snapshot.progression.level },
    ].map((track) => {
      const tier = snapshot.progression.claimedMilestoneIds.filter((id) => id.startsWith(`${track.id}-`)).length;
      return { id: track.id, title: track.title, tier, progress: track.progress, target: track.values[Math.min(3, tier)]! };
    });
    const remainingObjectiveMinutes = Math.ceil((OPERATING_DAY_MS - (snapshot.elapsedMs % OPERATING_DAY_MS)) / 1_000);
    const day = 1 + Math.floor(snapshot.elapsedMs / OPERATING_DAY_MS);
    const nutritionFamilies = NUTRITION_CONTENT.variantFamilies.map((family) => {
      const rank = Math.max(
        1,
        ...STALLS
          .filter((stall) => stall.dishIds.includes(family.dishId))
          .map((stall) => snapshot.progression.stallMastery[stall.id]?.rank ?? 1),
      );
      const dish = catalog.dishes[family.dishId];
      const activeVariantId = activeDishVariants[family.dishId] ?? family.defaultVariantId;
      return {
        dishId: family.dishId,
        defaultVariantId: family.defaultVariantId,
        activeVariantId,
        variants: family.variants.map((variant) => {
          const coreVariant = dish?.nutritionVariants?.find(
            (candidate) => candidate.id === variant.id,
          );
          return {
            id: variant.id,
            label: variant.name,
            unlockRank: variant.unlockRank,
            profileId: variant.profileId,
            visualKey: variant.visualKey,
            unlocked: variant.unlockRank <= rank,
            selected: variant.id === activeVariantId,
            profile: runtimeNutritionProfile(coreVariant?.profile),
          };
        }),
      };
    });
    const emptyToday = {
      day,
      servedMeals: 0,
      profiledServings: 0,
      intentRequests: 0,
      intentMatches: 0,
      intentMisses: 0,
      intentUnknowns: 0,
      byIntent: Object.fromEntries(
        Object.keys(snapshot.metrics.nutrition.byIntent).map((intent) => [
          intent,
          { requests: 0, matches: 0, misses: 0, unknowns: 0 },
        ]),
      ) as typeof snapshot.metrics.nutrition.byIntent,
      nutrientTotals: {} as Readonly<Record<NutritionMetric, number>>,
      nutrientKnownCounts: {} as Readonly<Record<NutritionMetric, number>>,
      dishServings: {} as Readonly<Record<string, number>>,
    };
    const nutritionToday = snapshot.metrics.nutrition.today.day === day
      ? snapshot.metrics.nutrition.today
      : emptyToday;
    const compactMetrics = [
      "energyKcal",
      "proteinG",
      "dietaryFibreG",
      "sodiumMg",
    ] as const;
    const nutritionAverages = Object.fromEntries(compactMetrics.flatMap((metric) => {
      const count = nutritionToday.nutrientKnownCounts[metric] ?? 0;
      return count > 0 ? [[metric, nutritionToday.nutrientTotals[metric] / count]] : [];
    }));
    const mostServedDishId = Object.entries(nutritionToday.dishServings)
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0]?.[0];
    const leadingUnmetIntent = Object.entries(nutritionToday.byIntent)
      .map(([intent, metrics]) => [
        intent as NutritionIntent,
        metrics.misses + metrics.unknowns,
      ] as const)
      .filter((entry) => entry[1] > 0)
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0]?.[0];
    const selectedCustomer = selectedCustomerId
      ? snapshot.customers.find((customer) => customer.id === selectedCustomerId)
      : undefined;
    return {
      cash: snapshot.economy.currency,
      reputation: snapshot.progression.reputation * 20,
      level: snapshot.progression.level,
      experience: snapshot.progression.xp,
      nextLevelExperience,
      day,
      timeLabel: timeLabel(snapshot.elapsedMs),
      isOpen: isCentreOpen(),
      speed,
      quality: snapshot.qualityMode,
      activeCustomers: snapshot.customers.length,
      servedCustomers: snapshot.economy.completedVisits,
      averageSatisfaction: Math.max(0, Math.min(100, averageSatisfaction ?? 0)),
      hasSatisfactionRatings: averageSatisfaction !== undefined,
      satisfactionBreakdown,
      satisfactionTips: deriveSatisfactionTips(satisfactionBreakdown),
      queuePressure: queueFlow.pressure,
      queueFlowState: queueFlow.state,
      queueFlowMessage: queueFlow.message,
      freeSeats: Math.max(0, seats.length - Object.keys(snapshot.seatReservations).length),
      totalSeats: seats.length,
      cleanliness: Math.max(
        25,
        Math.min(
          100,
          86 +
            cleanlinessSupport * 4 +
            trayReturnStations * 4 -
            (trayReturnStations === 0 && snapshot.customers.length > 0 ? 28 : 0) -
            snapshot.customers.length * 0.5 -
            queueCount * 1.2,
        ),
      ),
      trayReturnStations,
      buildTool,
      selectedBuildId,
      selectedObjectId,
      selectedObjectDefinitionId: selectedObjectId
        ? state.objects[selectedObjectId]?.definitionId
        : undefined,
      unlockedContentIds: snapshot.progression.unlockedDefinitionIds,
      stallMenus,
      activeDishVariants,
      nutritionFamilies,
      nutritionPulse: {
        servedMeals: nutritionToday.servedMeals,
        profiledMeals: nutritionToday.profiledServings,
        intentRequests: nutritionToday.intentRequests,
        intentMatches: nutritionToday.intentMatches,
        intentMisses: nutritionToday.intentMisses,
        intentUnknowns: nutritionToday.intentUnknowns,
        averages: nutritionAverages,
        knownCounts: {
          energyKcal: nutritionToday.nutrientKnownCounts.energyKcal ?? 0,
          proteinG: nutritionToday.nutrientKnownCounts.proteinG ?? 0,
          dietaryFibreG: nutritionToday.nutrientKnownCounts.dietaryFibreG ?? 0,
          sodiumMg: nutritionToday.nutrientKnownCounts.sodiumMg ?? 0,
        },
        mostServedDishId,
        leadingUnmetIntent,
      },
      selectedCustomerId: selectedCustomer?.id,
      selectedCustomerNutrition: selectedCustomer
        ? {
            customerId: selectedCustomer.id,
            archetypeId: selectedCustomer.archetypeId,
            status: selectedCustomer.status,
            decisionReasons: customerDecisionReasons(selectedCustomer, catalog),
            intentId: selectedCustomer.nutritionIntentId,
            dishId: selectedCustomer.orderedDishId,
            variantId: selectedCustomer.orderedNutritionVariantId,
            requestResult: selectedCustomer.nutritionRequestResult,
            profile: runtimeNutritionProfile(selectedCustomer.orderedNutritionProfile),
          }
        : undefined,
      placedStalls,
      canUndo: snapshot.canUndo,
      objectiveProgress: Math.min(5, snapshot.economy.completedVisits),
      objectiveTarget: 5,
      objectives: snapshot.progression.dailyObjectives.map((objective) => ({
        id: objective.id,
        title: objective.title,
        description: objective.description,
        progress: objective.progress,
        target: objective.target,
        rewardCash: objective.rewardCash,
        rewardXp: objective.rewardXp,
        completed: objective.completed,
      })),
      objectiveRefreshLabel: `${Math.floor(remainingObjectiveMinutes / 60)}h ${remainingObjectiveMinutes % 60}m`,
      claimedMilestoneCount: snapshot.progression.claimedMilestoneIds.length,
      milestoneTracks,
      stallMastery: STALLS.map((definition) => {
        const mastery = snapshot.progression.stallMastery[definition.id] ?? { points: 0, rank: 1, upgradeLevel: 1 as const };
        const nextLevel = mastery.upgradeLevel + 1;
        const nextUpgrade = definition.upgradeLevels.find((upgrade) => upgrade.level === nextLevel);
        return {
          definitionId: definition.id,
          ...mastery,
          nextUpgradeCost: nextUpgrade?.cost,
          requiredRank: nextLevel === 2 ? 2 : nextLevel === 3 ? 4 : nextLevel === 4 ? 7 : undefined,
        };
      }),
      accessPoints: snapshot.accessPoints,
      routeGuidePoints: snapshot.routeGuidePoints,
      selectedAccessPointId,
      expansionCount: snapshot.progression.expansionCount,
      nextExpansionCost: calculateExpansionCost(
        snapshot.map,
        snapshot.progression,
        state.config,
        4,
        2,
      ),
      fps: runtime.game?.loop.actualFps || 60,
      simulationMs: lastSimulationMs,
      autosaveState: "saved",
    };
  }

  function emitHud(force = false) {
    const now = performance.now();
    if (!force && now - lastHudAt < 220) return;
    lastHudAt = now;
    options.onSnapshot(currentSnapshot());
  }

  function objectAt(point: GridPoint): PlacedObject | undefined {
    return Object.values(state.objects)
      .reverse()
      .find((object) =>
        getObjectOccupiedTiles(object, catalog).some(
          (occupied) => occupied.x === point.x && occupied.y === point.y,
        ),
      );
  }

  function customerAt(point: GridPoint): Customer | undefined {
    return customerAtRenderedGridPoint(
      Object.values(state.customers),
      point,
      reducedMotion,
    );
  }

  function placementCandidate(point: GridPoint): PlacedObject | undefined {
    if (!selectedBuildId) return undefined;
    return {
      id: "preview-placement",
      definitionId: selectedBuildId,
      origin: point,
      rotation: selectedRotation,
      open: false,
    };
  }

  function nextObjectId(): string {
    let candidate = `placed-${objectSequence++}`;
    while (state.objects[candidate]) candidate = `placed-${objectSequence++}`;
    return candidate;
  }

  function recomputeObjectSequence() {
    objectSequence =
      Math.max(
        0,
        ...Object.keys(state.objects).map((id) => {
          const match = /^placed-(\d+)$/.exec(id);
          return match ? Number(match[1]) : 0;
        }),
      ) + 1;
  }

  function handleTile(point: GridPoint) {
    hoverTile = point;
    if (buildTool === "access") {
      const existing = state.accessPoints.find(
        (accessPoint) => accessPoint.position.x === point.x && accessPoint.position.y === point.y,
      );
      if (existing) {
        selectedAccessPointId = existing.id;
        pendingAccessKind = undefined;
        options.onEvent({ kind: "info", message: `${existing.kind === "entrance" ? "Entrance" : "Exit"} selected. Choose a boundary tile to move it.` });
        emitHud(true);
        activeScene?.render(true);
        return;
      }
      if (pendingAccessKind) {
        const id = `${pendingAccessKind}-${accessSequence++}`;
        if (runCommand({ type: "add-access-point", accessPoint: { id, kind: pendingAccessKind, position: point } })) {
          selectedAccessPointId = id;
          pendingAccessKind = undefined;
        }
        return;
      }
      if (selectedAccessPointId) {
        runCommand({ type: "move-access-point", accessPointId: selectedAccessPointId, position: point });
        return;
      }
      options.onEvent({ kind: "info", message: "Choose Add entrance or Add exit, or select an existing access point." });
      return;
    }
    if (buildTool === "route") {
      const key = `${point.x},${point.y}`;
      const removing = state.routeGuidePoints.some(
        (candidate) => candidate.x === point.x && candidate.y === point.y,
      );
      const points = removing
        ? state.routeGuidePoints.filter((candidate) => `${candidate.x},${candidate.y}` !== key)
        : [...state.routeGuidePoints, point];
      if (runCommand({ type: "configure-guest-route", points })) {
        options.onEvent({
          kind: "info",
          message: removing
            ? `Removed preferred route tile ${key}.`
            : `Added preferred route tile ${key}. Guests will favour this aisle.`,
        });
      }
      return;
    }
    if (buildTool === "queue") {
      const stall = queueEditingStallId ? state.objects[queueEditingStallId] : undefined;
      const definition = stall ? catalog.placeables[stall.definitionId] : undefined;
      if (!stall || definition?.kind !== "stall" || !definition.stall) return;
      const anchor = getObjectQueueAnchor(stall, catalog);
      if (!anchor) return;
      const draft = queueDraft.length > 0 ? queueDraft : [anchor];
      const existingIndex = draft.findIndex(
        (candidate) => candidate.x === point.x && candidate.y === point.y,
      );
      if (existingIndex >= 0) {
        const trimmed = draft.slice(0, existingIndex + 1);
        if (trimmed.length === draft.length) return;
        if (runCommand({ type: "configure-queue", objectId: stall.id, points: trimmed })) {
          queueDraft = trimmed;
          options.onEvent({ kind: "info", message: `Queue shortened to ${trimmed.length} spaces.` });
        }
        return;
      }
      const tail = draft.at(-1) as GridPoint;
      if (Math.abs(tail.x - point.x) + Math.abs(tail.y - point.y) !== 1) {
        options.onEvent({ kind: "warning", message: "Add queue spaces one adjacent tile at a time." });
        return;
      }
      if (draft.length >= definition.stall.queueCapacity) {
        options.onEvent({ kind: "warning", message: `This stall supports ${definition.stall.queueCapacity} queue spaces.` });
        return;
      }
      const extended = [...draft, point];
      if (runCommand({ type: "configure-queue", objectId: stall.id, points: extended })) {
        queueDraft = extended;
        options.onEvent({ kind: "info", message: `Queue now bends through ${extended.length} spaces.` });
      }
      return;
    }
    if (buildTool === "place") {
      if (!selectedBuildId) return;
      const accepted = runCommand({
        type: "place-object",
        objectId: nextObjectId(),
        definitionId: selectedBuildId,
        origin: point,
        rotation: selectedRotation,
      });
      if (accepted) options.onEvent({ kind: "info", message: "Placed. You can undo or keep building." });
      return;
    }

    if (buildTool === "remove") {
      const object = objectAt(point);
      if (!object) return;
      runCommand({ type: "remove-object", objectId: object.id });
      selectedObjectId = undefined;
      return;
    }

    if (buildTool === "move") {
      if (!pendingMoveId) {
        pendingMoveId = objectAt(point)?.id;
        selectedObjectId = pendingMoveId;
        if (pendingMoveId) options.onEvent({ kind: "info", message: "Choose a clear destination tile." });
      } else if (
        runCommand({ type: "move-object", objectId: pendingMoveId, origin: point })
      ) {
        pendingMoveId = undefined;
        selectedObjectId = undefined;
      }
      return;
    }

    const customer = customerAt(point);
    selectedCustomerId = customer?.id;
    selectedObjectId = customer ? undefined : objectAt(point)?.id;
    emitHud(true);
    activeScene?.render(true);
  }

  function bindActiveScene(scene: HawkerScene) {
    activeScene = scene;
  }

  class HawkerScene extends PhaserRuntime.Scene {
    private worldGraphics?: Phaser.GameObjects.Graphics;
    private overlayGraphics?: Phaser.GameObjects.Graphics;
    private labels: Phaser.GameObjects.Text[] = [];

    constructor() {
      super({ key: "hawker-centre" });
    }

    create() {
      bindActiveScene(this);
      this.worldGraphics = this.add.graphics();
      this.overlayGraphics = this.add.graphics();
      this.syncWorldBounds(true);
      this.cameras.main.setZoom(0.78);
      this.input.on("pointermove", (pointer: Phaser.Input.Pointer) => {
        const camera = this.cameras.main;
        const worldPoint = camera.getWorldPoint(pointer.x, pointer.y);
        hoverTile = worldToTile(state.map, worldPoint);
        if (pointer.isDown) {
          const distance = Math.hypot(pointer.x - dragOrigin.x, pointer.y - dragOrigin.y);
          if (distance > 6) dragged = true;
          if (dragged) {
            camera.scrollX = cameraOrigin.x - (pointer.x - dragOrigin.x) / camera.zoom;
            camera.scrollY = cameraOrigin.y - (pointer.y - dragOrigin.y) / camera.zoom;
          }
        }
        this.render(true);
      });
      this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
        options.parent.focus();
        dragged = false;
        dragOrigin = { x: pointer.x, y: pointer.y };
        cameraOrigin = { x: this.cameras.main.scrollX, y: this.cameras.main.scrollY };
      });
      this.input.on("pointerup", (pointer: Phaser.Input.Pointer) => {
        if (dragged) return;
        const point = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
        handleTile(worldToTile(state.map, point));
      });
      this.input.on(
        "wheel",
        (
          _pointer: Phaser.Input.Pointer,
          _objects: unknown[],
          _deltaX: number,
          deltaY: number,
        ) => {
          const next = PhaserRuntime.Math.Clamp(
            this.cameras.main.zoom - Math.sign(deltaY) * 0.08,
            0.48,
            1.55,
          );
          this.cameras.main.setZoom(next);
        },
      );
      this.input.keyboard?.on("keydown", (event: KeyboardEvent) => {
        const target = event.target;
        if (
          target instanceof HTMLInputElement ||
          target instanceof HTMLTextAreaElement ||
          target instanceof HTMLSelectElement ||
          !options.parent.contains(document.activeElement)
        ) {
          return;
        }
        const key = event.key.toLocaleLowerCase();
        if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(key)) {
          event.preventDefault();
        }
        const movedCursor = key.startsWith("arrow");
        if (key === "arrowup") hoverTile = { ...hoverTile, y: Math.max(0, hoverTile.y - 1) };
        else if (key === "arrowdown") hoverTile = { ...hoverTile, y: Math.min(state.map.height - 1, hoverTile.y + 1) };
        else if (key === "arrowleft") hoverTile = { ...hoverTile, x: Math.max(0, hoverTile.x - 1) };
        else if (key === "arrowright") hoverTile = { ...hoverTile, x: Math.min(state.map.width - 1, hoverTile.x + 1) };
        else if (key === "enter") handleTile(hoverTile);
        else if (key === "r") rotateSelection();
        else if (key === "escape") {
          if (selectedCustomerId) {
            selectedCustomerId = undefined;
            emitHud(true);
          } else {
            setBuildTool("select");
          }
        }
        else if (key === "u") runCommand({ type: "undo" });
        else if (key === " ") setSpeed(speed === 0 ? 1 : 0);
        else if (key === "+" || key === "=") zoomBy(0.1);
        else if (key === "-" || key === "_") zoomBy(-0.1);
        if (movedCursor) this.followBuildCursor();
        this.render(true);
      });
      this.render(true);
      emitHud(true);
    }

    syncWorldBounds(centre = false) {
      const worldWidth = state.map.width * TILE_SIZE;
      const worldHeight = state.map.height * TILE_SIZE;
      this.cameras.main.setBounds(-80, -80, worldWidth + 160, worldHeight + 160);
      if (centre) this.cameras.main.centerOn(worldWidth / 2, worldHeight / 2);
    }

    followBuildCursor() {
      const point = tileToWorld(state.map, hoverTile);
      const view = this.cameras.main.worldView;
      const margin = TILE_SIZE * 1.5;
      if (
        point.x < view.left + margin ||
        point.x > view.right - margin ||
        point.y < view.top + margin ||
        point.y > view.bottom - margin
      ) {
        this.cameras.main.centerOn(point.x, point.y);
      }
    }

    update(_time: number, delta: number) {
      const now = performance.now();
      const frameDelta = Math.min(250, delta || now - lastFrameAt);
      lastFrameAt = now;
      if (speed > 0 && isCentreOpen()) {
        const startedAt = performance.now();
        state = {
          ...state,
          arrivalPerformancePressure: Math.max(0, Math.min(1, (lastSimulationMs - 8) / 16)),
        };
        const result = advanceSimulation(state, frameDelta * speed);
        const beforeUnlockCount = state.progression.unlockedDefinitionIds.length;
        state = reconcileRuntimeUnlocks(result.state);
        if (selectedCustomerId && !state.customers[selectedCustomerId]) {
          selectedCustomerId = undefined;
          options.onEvent({
            kind: "info",
            message: "The selected guest finished their visit.",
          });
        }
        const menusChanged = synchronizeStallMenus();
        lastSimulationMs = performance.now() - startedAt;
        for (const event of result.events) {
          const runtimeEvent = formatSimulationEvent(event);
          if (runtimeEvent) options.onEvent(runtimeEvent);
        }
        const catalogueChanged =
          state.progression.unlockedDefinitionIds.length > beforeUnlockCount;
        if (catalogueChanged) {
          options.onEvent({
            kind: "success",
            message: "New catalogue choices are now available.",
            importance: "important",
          });
        }
        const revenueChanged =
          state.economy.lifetimeRevenue !== lastPersistentRevenue;
        if (revenueChanged) {
          lastPersistentRevenue = state.economy.lifetimeRevenue;
        }
        if (catalogueChanged || menusChanged || revenueChanged) {
          options.onPersistentChange(persistentPayload());
          lastPeriodicSaveAt = now;
        } else if (now - lastPeriodicSaveAt >= 15_000 && state.tick > 0) {
          options.onPersistentChange(persistentPayload());
          lastPeriodicSaveAt = now;
        }
      }
      if (state.tick !== lastRenderTick) this.render();
      emitHud();
    }

    render(force = false) {
      const snapshot = createSnapshot(state);
      if (!force && snapshot.tick === lastRenderTick) return;
      lastRenderTick = snapshot.tick;
      this.labels.forEach((label) => label.destroy());
      this.labels = [];
      this.worldGraphics?.clear();
      this.overlayGraphics?.clear();
      if (!this.worldGraphics || !this.overlayGraphics) return;
      drawMap(this, this.worldGraphics, snapshot);
      drawObjects(this, this.worldGraphics, snapshot);
      drawCustomers(this.worldGraphics, snapshot);
      drawOverlay(this, this.overlayGraphics, snapshot);
    }

    addLabel(x: number, y: number, text: string, colourValue = "#17352e") {
      const label = this.add
        .text(x, y, text, {
          color: colourValue,
          fontFamily: '"Trebuchet MS", system-ui, sans-serif',
          fontSize: "11px",
          fontStyle: "bold",
          align: "center",
          backgroundColor: "#fff7e5e8",
          padding: { x: 4, y: 2 },
        })
        .setOrigin(0.5, 0.5)
        .setDepth(20);
      this.labels.push(label);
    }
  }

  function drawMap(
    scene: HawkerScene,
    graphics: Phaser.GameObjects.Graphics,
    snapshot: GameSnapshot,
  ) {
    const width = snapshot.map.width * TILE_SIZE;
    const height = snapshot.map.height * TILE_SIZE;
    graphics.fillStyle(0x365f53, 1);
    graphics.fillRect(-96, -96, width + 192, height + 192);
    graphics.fillStyle(0x477567, 1);
    graphics.fillRoundedRect(-56, -56, width + 112, height + 112, 24);
    graphics.fillStyle(0xe9d7b5, 1);
    graphics.fillRect(0, 0, width, height);
    for (let y = 0; y < snapshot.map.height; y += 1) {
      for (let x = 0; x < snapshot.map.width; x += 1) {
        const tile = snapshot.map.tiles[y * snapshot.map.width + x];
        const accessPoint = snapshot.accessPoints.find((point) => point.position.x === x && point.position.y === y);
        const isEntrance = accessPoint?.kind === "entrance";
        const isExit = accessPoint?.kind === "exit";
        const alternate = (x + y) % 2 === 0;
        const isExpansion = x >= MAP_WIDTH || y >= MAP_HEIGHT;
        graphics.fillStyle(
          tile === "wall" && !isEntrance && !isExit
            ? 0x3f695a
            : isExpansion
              ? alternate
                ? 0xf0dfbd
                : 0xe9d4af
              : alternate
                ? 0xecdcbc
                : 0xe5d1ad,
          1,
        );
        graphics.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
        graphics.lineStyle(
          1,
          tile === "wall" && !isEntrance && !isExit ? 0x274c40 : 0xcfb88f,
          0.46,
        );
        graphics.strokeRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
        if (tile === "wall" && !isEntrance && !isExit) {
          graphics.fillStyle(0x729584, 0.5);
          graphics.fillRect(x * TILE_SIZE + 3, y * TILE_SIZE + 3, TILE_SIZE - 6, 6);
        } else if (isExpansion && (x + y) % 4 === 0) {
          graphics.fillStyle(0xd6bc8f, 0.34);
          graphics.fillCircle(x * TILE_SIZE + TILE_SIZE / 2, y * TILE_SIZE + TILE_SIZE / 2, 2);
        }
      }
    }

    // Preferred tiles are authored guidance, while the dashed line remains a
    // prediction of the route guests can actually take through the live map.
    for (const point of snapshot.routeGuidePoints) {
      const x = point.x * TILE_SIZE;
      const y = point.y * TILE_SIZE;
      graphics.fillStyle(0x1f9f91, 0.2);
      graphics.fillRoundedRect(x + 5, y + 5, TILE_SIZE - 10, TILE_SIZE - 10, 7);
      graphics.lineStyle(2, 0x14796f, 0.88);
      graphics.strokeRoundedRect(x + 5, y + 5, TILE_SIZE - 10, TILE_SIZE - 10, 7);
      for (const offset of [15, 28]) {
        graphics.lineBetween(x + offset - 4, y + 18, x + offset + 3, y + 24);
        graphics.lineBetween(x + offset + 3, y + 24, x + offset - 4, y + 30);
      }
    }

    const preferred = new Set(snapshot.routeGuidePoints.map((point) => `${point.x},${point.y}`));
    graphics.lineStyle(3, 0xfff7e5, 0.82);
    for (const entrance of snapshot.accessPoints.filter((point) => point.kind === "entrance")) {
      for (const exit of snapshot.accessPoints.filter((point) => point.kind === "exit")) {
        const guestRoute = findPath(snapshot.map, entrance.position, exit.position, {
          blocked: getBlockedTileKeys(state.objects, catalog),
          preferred,
        }).path ?? [];
        for (let index = 1; index < guestRoute.length; index += 1) {
          const previous = guestRoute[index - 1] as GridPoint;
          const current = guestRoute[index] as GridPoint;
          const startX = (previous.x + 0.5) * TILE_SIZE;
          const startY = (previous.y + 0.5) * TILE_SIZE;
          const deltaX = (current.x - previous.x) * TILE_SIZE;
          const deltaY = (current.y - previous.y) * TILE_SIZE;
          graphics.lineBetween(startX + deltaX * 0.12, startY + deltaY * 0.12, startX + deltaX * 0.68, startY + deltaY * 0.68);
        }
      }
    }

    const drawPortal = (point: GridPoint, label: string, pointsInward: boolean) => {
      const x = point.x * TILE_SIZE;
      const y = point.y * TILE_SIZE;
      graphics.fillStyle(0xf4c65a, 1);
      graphics.fillRoundedRect(x + 3, y + 6, TILE_SIZE - 6, TILE_SIZE - 12, 5);
      graphics.fillStyle(0xfff3c9, 1);
      graphics.fillRoundedRect(x + 8, y + 11, TILE_SIZE - 16, TILE_SIZE - 22, 3);
      graphics.lineStyle(3, 0x8b5b27, 0.8);
      graphics.strokeRoundedRect(x + 3, y + 6, TILE_SIZE - 6, TILE_SIZE - 12, 5);
      const direction = point.x === 0 ? 1 : point.x === snapshot.map.width - 1 ? -1 : pointsInward ? 1 : -1;
      const centreX = x + TILE_SIZE / 2;
      const centreY = y + TILE_SIZE / 2;
      graphics.fillStyle(0x355e52, 1);
      graphics.fillTriangle(
        centreX + direction * 9,
        centreY,
        centreX - direction * 4,
        centreY - 8,
        centreX - direction * 4,
        centreY + 8,
      );
      const labelX = centreX + (point.x === 0 ? 34 : point.x === snapshot.map.width - 1 ? -34 : 0);
      scene.addLabel(labelX, centreY - 21, label);
    };

    for (const point of snapshot.accessPoints) {
      drawPortal(point.position, point.kind === "entrance" ? "ENTRY" : "EXIT", point.kind === "entrance");
    }
  }

  interface ObjectVisualBounds {
    readonly minX: number;
    readonly minY: number;
    readonly maxX: number;
    readonly maxY: number;
    readonly width: number;
    readonly height: number;
    readonly centreX: number;
    readonly centreY: number;
  }

  function boundsForObject(object: PlacedObject): ObjectVisualBounds | undefined {
    const cells = getObjectOccupiedTiles(object, catalog);
    if (cells.length === 0) return undefined;
    const minX = Math.min(...cells.map((cell) => cell.x)) * TILE_SIZE;
    const minY = Math.min(...cells.map((cell) => cell.y)) * TILE_SIZE;
    const maxX = (Math.max(...cells.map((cell) => cell.x)) + 1) * TILE_SIZE;
    const maxY = (Math.max(...cells.map((cell) => cell.y)) + 1) * TILE_SIZE;
    return {
      minX,
      minY,
      maxX,
      maxY,
      width: maxX - minX,
      height: maxY - minY,
      centreX: (minX + maxX) / 2,
      centreY: (minY + maxY) / 2,
    };
  }

  function drawMakerMark(
    graphics: Phaser.GameObjects.Graphics,
    bounds: ObjectVisualBounds,
    recipe: PlaceableVisualRecipe,
  ) {
    // A restrained maker's badge keeps deterministic identity without making
    // unrelated furniture look as though it came from the same toy set.
    const badgeX = bounds.maxX - 10;
    const badgeY = bounds.maxY - 9;
    graphics.fillStyle(0xe7c66d, 0.9);
    graphics.fillRoundedRect(badgeX - 5, badgeY - 3, 10, 6, 2);
    graphics.fillStyle(darken(recipe.accent, 0.28), 1);
    if ((recipe.makerMark & 1) === 0) {
      graphics.fillCircle(badgeX, badgeY, 1.7);
    } else {
      graphics.fillRect(badgeX - 2, badgeY - 1, 4, 2);
    }
  }

  function drawObjectShadow(
    graphics: Phaser.GameObjects.Graphics,
    bounds: ObjectVisualBounds,
    round = false,
  ) {
    graphics.fillStyle(0x17352e, 0.08);
    if (round) {
      graphics.fillEllipse(bounds.centreX + 5, bounds.centreY + 9, bounds.width - 5, bounds.height - 7);
    } else {
      graphics.fillRoundedRect(bounds.minX + 9, bounds.minY + 12, bounds.width - 6, bounds.height - 3, 8);
    }
    graphics.fillStyle(0x17352e, 0.17);
    if (round) {
      graphics.fillEllipse(bounds.centreX + 3, bounds.centreY + 7, bounds.width - 9, bounds.height - 12);
    } else {
      graphics.fillRoundedRect(bounds.minX + 7, bounds.minY + 10, bounds.width - 8, bounds.height - 5, 7);
    }
  }

  function stallServiceVisualState(
    snapshot: GameSnapshot,
    objectId: string,
  ): {
    readonly activity: "idle" | "order" | "prepare";
    readonly preparingDishId?: string;
    readonly preparingVariantId?: string;
  } {
    const preparing = snapshot.customers.find(
      (customer) =>
        customer.targetStallId === objectId &&
        customer.status === "waiting-for-food" &&
        customer.orderedDishId,
    );
    if (preparing) {
      return {
        activity: "prepare",
        preparingDishId: preparing.orderedDishId,
        preparingVariantId: preparing.orderedNutritionVariantId,
      };
    }
    const ordering = snapshot.customers.some(
      (customer) => customer.targetStallId === objectId && customer.status === "ordering",
    );
    return { activity: ordering ? "order" : "idle" };
  }

  function drawStallEmblem(
    graphics: Phaser.GameObjects.Graphics,
    emblem: StallVendorEmblem,
    x: number,
    y: number,
    scale: number,
    primary: number,
    accent: number,
  ) {
    graphics.fillStyle(0xfff5dc, 0.94);
    graphics.fillCircle(x, y, 11 * scale);
    graphics.lineStyle(Math.max(1, 1.8 * scale), darken(primary, 0.3), 0.9);
    graphics.strokeCircle(x, y, 11 * scale);
    graphics.fillStyle(accent, 1);
    graphics.lineStyle(Math.max(1, 1.8 * scale), accent, 1);

    if (emblem === "sunburst") {
      graphics.fillCircle(x, y, 4 * scale);
      for (let ray = 0; ray < 8; ray += 1) {
        const angle = (ray / 8) * Math.PI * 2;
        graphics.lineBetween(
          x + Math.cos(angle) * 5 * scale,
          y + Math.sin(angle) * 5 * scale,
          x + Math.cos(angle) * 8 * scale,
          y + Math.sin(angle) * 8 * scale,
        );
      }
    } else if (emblem === "lime-leaf" || emblem === "tamarind-leaf") {
      const leafCount = emblem === "tamarind-leaf" ? 3 : 2;
      for (let leaf = 0; leaf < leafCount; leaf += 1) {
        graphics.fillEllipse(
          x + (leaf - (leafCount - 1) / 2) * 4 * scale,
          y + (leaf % 2 === 0 ? -1 : 2) * scale,
          7 * scale,
          11 * scale,
        );
      }
      graphics.lineStyle(Math.max(1, scale), darken(accent, 0.3), 0.9);
      graphics.lineBetween(x - 5 * scale, y + 6 * scale, x + 6 * scale, y - 6 * scale);
    } else if (emblem === "coffee-cup") {
      graphics.fillRoundedRect(x - 6 * scale, y - 2 * scale, 10 * scale, 7 * scale, 2 * scale);
      graphics.strokeCircle(x + 5 * scale, y + scale, 3 * scale);
      graphics.lineBetween(x - 3 * scale, y - 4 * scale, x - 2 * scale, y - 8 * scale);
      graphics.lineBetween(x + scale, y - 4 * scale, x + 2 * scale, y - 8 * scale);
    } else if (emblem === "flame") {
      graphics.fillTriangle(x - 6 * scale, y + 7 * scale, x + 6 * scale, y + 7 * scale, x + 2 * scale, y - 8 * scale);
      graphics.fillStyle(lighten(accent, 0.45), 1);
      graphics.fillTriangle(x - 2 * scale, y + 5 * scale, x + 3 * scale, y + 5 * scale, x, y - 3 * scale);
    } else if (emblem === "noodle-ribbon") {
      for (let ribbon = -1; ribbon <= 1; ribbon += 1) {
        graphics.lineBetween(x - 7 * scale, y + ribbon * 4 * scale, x - scale, y - ribbon * 2 * scale);
        graphics.lineBetween(x - scale, y - ribbon * 2 * scale, x + 7 * scale, y + ribbon * 3 * scale);
      }
    } else if (emblem === "lantern") {
      graphics.fillRoundedRect(x - 5 * scale, y - 6 * scale, 10 * scale, 13 * scale, 4 * scale);
      graphics.lineBetween(x - 3 * scale, y - 8 * scale, x + 3 * scale, y - 8 * scale);
      graphics.lineBetween(x, y + 7 * scale, x, y + 9 * scale);
    } else if (emblem === "raindrop") {
      graphics.fillCircle(x, y + 3 * scale, 5 * scale);
      graphics.fillTriangle(x - 5 * scale, y + scale, x + 5 * scale, y + scale, x, y - 8 * scale);
    } else if (emblem === "compass") {
      graphics.strokeCircle(x, y, 7 * scale);
      graphics.fillTriangle(x, y - 8 * scale, x - 3 * scale, y + 2 * scale, x + 2 * scale, y);
      graphics.fillTriangle(x, y + 8 * scale, x + 3 * scale, y - 2 * scale, x - 2 * scale, y);
    } else if (emblem === "bamboo-knot") {
      graphics.lineStyle(Math.max(2, 3 * scale), accent, 1);
      graphics.lineBetween(x - 6 * scale, y + 7 * scale, x + 5 * scale, y - 7 * scale);
      graphics.lineBetween(x - 7 * scale, y - 3 * scale, x + 6 * scale, y + 5 * scale);
      graphics.fillCircle(x, y, 2.5 * scale);
    } else if (emblem === "hearth-tile") {
      graphics.fillTriangle(x, y - 8 * scale, x + 8 * scale, y, x, y + 8 * scale);
      graphics.fillTriangle(x, y - 8 * scale, x - 8 * scale, y, x, y + 8 * scale);
      graphics.fillStyle(0xfff5dc, 0.92);
      graphics.fillCircle(x, y, 3 * scale);
    } else {
      for (let wave = -1; wave <= 1; wave += 1) {
        const waveY = y + wave * 4 * scale;
        graphics.lineBetween(x - 7 * scale, waveY, x - 2 * scale, waveY - 2 * scale);
        graphics.lineBetween(x - 2 * scale, waveY - 2 * scale, x + 3 * scale, waveY + 2 * scale);
        graphics.lineBetween(x + 3 * scale, waveY + 2 * scale, x + 7 * scale, waveY);
      }
    }
  }

  function drawStallVendorHeadwear(
    graphics: Phaser.GameObjects.Graphics,
    recipe: StallVendorRecipe,
    headX: number,
    headY: number,
    scale: number,
  ) {
    const brimY = headY - 6.2 * scale;
    graphics.fillStyle(recipe.apron, 1);
    if (recipe.headwear === "service-cap") {
      graphics.fillEllipse(headX - scale, brimY - 2 * scale, 15 * scale, 8 * scale);
      graphics.fillRoundedRect(headX - 7 * scale, brimY - 3 * scale, 13 * scale, 5 * scale, 2 * scale);
      graphics.fillStyle(recipe.apronTrim, 1);
      graphics.fillRoundedRect(headX + 2 * scale, brimY, 8 * scale, 2.5 * scale, scale);
    } else if (recipe.headwear === "visor") {
      graphics.fillRoundedRect(headX - 8 * scale, brimY - 2 * scale, 16 * scale, 3.5 * scale, scale);
      graphics.fillStyle(recipe.apronTrim, 1);
      graphics.fillRoundedRect(headX + 2 * scale, brimY, 9 * scale, 2.4 * scale, scale);
    } else if (recipe.headwear === "headband") {
      graphics.fillStyle(recipe.apronTrim, 1);
      graphics.fillRoundedRect(headX - 7.5 * scale, brimY - 1.5 * scale, 15 * scale, 3 * scale, scale);
      graphics.fillTriangle(
        headX + 6 * scale,
        brimY,
        headX + 11 * scale,
        brimY + 5 * scale,
        headX + 7 * scale,
        brimY + 3 * scale,
      );
    } else if (recipe.headwear === "hair-wrap") {
      graphics.fillEllipse(headX, brimY - 2.5 * scale, 17 * scale, 10 * scale);
      graphics.fillStyle(recipe.apronTrim, 1);
      graphics.fillRoundedRect(headX - 8 * scale, brimY - 1.5 * scale, 16 * scale, 3 * scale, scale);
      graphics.fillCircle(headX + 7 * scale, brimY - 5 * scale, 3 * scale);
    } else if (recipe.headwear === "chef-cap") {
      graphics.fillStyle(0xf4efe4, 1);
      for (let lobe = -1; lobe <= 1; lobe += 1) {
        graphics.fillCircle(headX + lobe * 4 * scale, brimY - 5 * scale, 4.7 * scale);
      }
      graphics.fillRoundedRect(headX - 8 * scale, brimY - 5 * scale, 16 * scale, 7 * scale, 2 * scale);
      graphics.fillStyle(recipe.apronTrim, 0.9);
      graphics.fillRect(headX - 7 * scale, brimY, 14 * scale, 1.6 * scale);
    } else {
      graphics.fillStyle(lighten(recipe.apron, 0.45), 0.82);
      graphics.fillEllipse(headX, brimY - 2 * scale, 16 * scale, 9 * scale);
      graphics.lineStyle(Math.max(0.8, scale), recipe.apronTrim, 0.68);
      for (let band = -2; band <= 2; band += 1) {
        graphics.lineBetween(
          headX + band * 3 * scale,
          brimY - 6 * scale,
          headX + band * 2.2 * scale,
          brimY + scale,
        );
      }
    }
  }

  function drawStallVendorHair(
    graphics: Phaser.GameObjects.Graphics,
    recipe: StallVendorRecipe,
    headX: number,
    headY: number,
    scale: number,
  ) {
    graphics.fillStyle(recipe.hair, 1);
    if (recipe.hairStyle === "tied-back") {
      graphics.fillCircle(headX - 7 * scale, headY - 2 * scale, 4.5 * scale);
      graphics.fillEllipse(headX, headY - 6 * scale, 16 * scale, 10 * scale);
    } else if (recipe.hairStyle === "coiled") {
      for (let curl = -2; curl <= 2; curl += 1) {
        graphics.fillCircle(headX + curl * 3.2 * scale, headY - (6 + Math.abs(curl)) * scale, 3.2 * scale);
      }
    } else if (recipe.hairStyle === "wavy") {
      graphics.fillEllipse(headX, headY - 5.5 * scale, 17 * scale, 11 * scale);
      graphics.fillCircle(headX - 7 * scale, headY - 1.5 * scale, 3.5 * scale);
      graphics.fillCircle(headX + 7 * scale, headY - 1.5 * scale, 3.5 * scale);
    } else if (recipe.hairStyle === "side-part") {
      graphics.fillEllipse(headX, headY - 6 * scale, 16 * scale, 9 * scale);
      graphics.lineStyle(Math.max(0.8, scale), lighten(recipe.hair, 0.28), 0.72);
      graphics.lineBetween(headX - scale, headY - 9 * scale, headX + 5 * scale, headY - 5 * scale);
    } else {
      graphics.fillEllipse(
        headX,
        headY - 5.5 * scale,
        recipe.hairStyle === "close-cut" ? 15 * scale : 16 * scale,
        recipe.hairStyle === "close-cut" ? 7 * scale : 9 * scale,
      );
    }
  }

  function drawStallVendorTool(
    graphics: Phaser.GameObjects.Graphics,
    recipe: StallVendorRecipe,
    pose: StallVendorAnimationPose,
    handX: number,
    handY: number,
    scale: number,
  ) {
    const handedness = (recipe.seed & 1) === 0 ? 1 : -1;
    const angle = handedness === 1
      ? -0.55 + pose.toolAngle
      : Math.PI + 0.55 - pose.toolAngle;
    const endX = handX + Math.cos(angle) * 13 * scale;
    const endY = handY + Math.sin(angle) * 13 * scale;
    graphics.lineStyle(Math.max(1.2, 2 * scale), 0x66503b, 1);

    if (recipe.tool === "long-spout-kettle") {
      graphics.fillStyle(0xaebfba, 1);
      graphics.fillEllipse(endX, endY, 13 * scale, 10 * scale);
      graphics.lineStyle(Math.max(1, 1.6 * scale), 0x586c67, 1);
      graphics.strokeCircle(endX - 5 * scale, endY - 4 * scale, 4 * scale);
      graphics.fillTriangle(
        endX + handedness * 5 * scale,
        endY - 3 * scale,
        endX + handedness * 16 * scale,
        endY - 8 * scale,
        endX + handedness * 6 * scale,
        endY + scale,
      );
      return;
    }

    graphics.lineBetween(handX, handY, endX, endY);
    if (recipe.tool === "cleaver") {
      graphics.fillStyle(0xbcc9c6, 1);
      graphics.fillRoundedRect(endX - scale, endY - 6 * scale, 9 * scale, 8 * scale, scale);
      graphics.fillStyle(0x71827e, 1);
      graphics.fillCircle(endX + 5 * scale, endY - 3 * scale, scale);
    } else if (recipe.tool === "ladle" || recipe.tool === "braising-ladle") {
      graphics.fillStyle(0xaebfba, 1);
      graphics.fillCircle(endX, endY, (recipe.tool === "braising-ladle" ? 4.2 : 3.5) * scale);
      graphics.fillStyle(0x596d68, 1);
      graphics.fillCircle(endX - scale, endY - scale, scale);
    } else if (recipe.tool === "wok-spatula") {
      graphics.fillStyle(0xaebfba, 1);
      graphics.fillEllipse(endX + 2 * scale, endY, 8 * scale, 5 * scale);
      graphics.lineStyle(Math.max(0.8, scale), 0x596d68, 0.9);
      graphics.lineBetween(endX - scale, endY, endX + 5 * scale, endY);
    } else if (recipe.tool === "noodle-basket") {
      graphics.fillStyle(0xd3ddd9, 0.74);
      graphics.fillEllipse(endX + 2 * scale, endY, 11 * scale, 7 * scale);
      graphics.lineStyle(Math.max(0.7, scale), 0x657772, 0.9);
      graphics.strokeEllipse(endX + 2 * scale, endY, 11 * scale, 7 * scale);
      for (let wire = -1; wire <= 1; wire += 1) {
        graphics.lineBetween(endX - 2 * scale, endY + wire * 2 * scale, endX + 6 * scale, endY + wire * 2 * scale);
      }
    } else if (recipe.tool === "griddle-spatula" || recipe.tool === "fish-turner") {
      graphics.fillStyle(0xb7c5c1, 1);
      graphics.fillRoundedRect(endX - scale, endY - 3 * scale, 10 * scale, 7 * scale, scale);
      graphics.lineStyle(Math.max(0.7, scale), 0x687a75, 0.9);
      const slots = recipe.tool === "fish-turner" ? 3 : 2;
      for (let slot = 0; slot < slots; slot += 1) {
        graphics.lineBetween(endX + (2 + slot * 2.5) * scale, endY - 2 * scale, endX + (2 + slot * 2.5) * scale, endY + 2 * scale);
      }
    } else if (recipe.tool === "measuring-cup" || recipe.tool === "batter-cup") {
      graphics.fillStyle(recipe.tool === "batter-cup" ? 0xd9ad5d : 0xcfe3dd, 0.96);
      graphics.fillRoundedRect(endX - 3 * scale, endY - 4 * scale, 8 * scale, 8 * scale, 2 * scale);
      graphics.lineStyle(Math.max(0.8, scale), 0x667a75, 0.88);
      graphics.strokeCircle(endX + 5 * scale, endY, 3 * scale);
    } else if (recipe.tool === "grill-tongs") {
      graphics.lineStyle(Math.max(1, 1.4 * scale), 0xaebfba, 1);
      graphics.lineBetween(handX, handY, endX + 5 * scale, endY - 2 * scale);
      graphics.lineBetween(handX, handY, endX + 5 * scale, endY + 3 * scale);
      graphics.fillCircle(endX + 6 * scale, endY - 2 * scale, 1.3 * scale);
      graphics.fillCircle(endX + 6 * scale, endY + 3 * scale, 1.3 * scale);
    } else {
      graphics.fillStyle(lighten(recipe.apron, 0.54), 0.94);
      graphics.fillTriangle(
        endX - 3 * scale,
        endY - 4 * scale,
        endX + 7 * scale,
        endY - 2 * scale,
        endX + 2 * scale,
        endY + 6 * scale,
      );
      graphics.lineStyle(Math.max(0.8, scale), recipe.apronTrim, 0.74);
      graphics.lineBetween(endX - scale, endY - 2 * scale, endX + 4 * scale, endY + 3 * scale);
    }
  }

  function drawStallVendor(
    graphics: Phaser.GameObjects.Graphics,
    bounds: ObjectVisualBounds,
    windowHeight: number,
    counterY: number,
    recipe: StallVendorRecipe,
    pose: StallVendorAnimationPose,
  ) {
    const scale = Math.max(0.72, Math.min(1, windowHeight / 72));
    const handedness = (recipe.seed & 1) === 0 ? 1 : -1;
    const centreOffset = ((recipe.seed >>> 4) % 5 - 2) * 1.15;
    const torsoX = bounds.centreX + centreOffset + pose.lean * scale;
    const headX = torsoX + pose.headTurn * scale;
    const headY = counterY - 37 * scale + pose.bob * scale;
    const shoulderY = headY + 10 * scale;
    const torsoBottom = counterY + 3;
    const workingShoulderX = torsoX + handedness * 7 * scale;
    const supportShoulderX = torsoX - handedness * 7 * scale;
    const workingHandX = workingShoulderX + handedness * (8 + pose.reach) * scale;
    const workingHandY = shoulderY + (7 + pose.workingArm * 6 - pose.toolLift) * scale;
    const supportHandX = supportShoulderX - handedness * (6 + Math.abs(pose.reach) * 0.35) * scale;
    const supportHandY = shoulderY + (8 + pose.supportArm * 5) * scale;

    if (highContrast) {
      graphics.lineStyle(Math.max(6, 9 * scale), 0xfff9e8, 0.96);
      graphics.lineBetween(workingShoulderX, shoulderY, workingHandX, workingHandY);
      graphics.lineBetween(supportShoulderX, shoulderY, supportHandX, supportHandY);
      graphics.fillStyle(0xfff9e8, 0.96);
      graphics.fillRoundedRect(
        torsoX - 12 * scale,
        shoulderY - 4 * scale,
        24 * scale,
        torsoBottom - shoulderY + 8 * scale,
        7 * scale,
      );
      graphics.fillCircle(headX, headY, 9.5 * scale);
    }

    graphics.fillStyle(0x17352e, 0.14);
    graphics.fillEllipse(torsoX + 2 * scale, counterY - scale, 30 * scale, 9 * scale);

    graphics.lineStyle(Math.max(3.5, 6 * scale), recipe.skin, 1);
    graphics.lineBetween(workingShoulderX, shoulderY, workingHandX, workingHandY);
    graphics.lineBetween(supportShoulderX, shoulderY, supportHandX, supportHandY);
    graphics.fillStyle(recipe.shirt, 1);
    graphics.fillCircle(workingShoulderX, shoulderY, 4.2 * scale);
    graphics.fillCircle(supportShoulderX, shoulderY, 4.2 * scale);

    graphics.fillStyle(recipe.shirt, 1);
    graphics.fillRoundedRect(
      torsoX - 10 * scale,
      shoulderY - 2 * scale,
      20 * scale,
      torsoBottom - shoulderY + 4 * scale,
      5 * scale,
    );
    graphics.fillStyle(recipe.apron, 1);
    if (recipe.apronStyle === "waist") {
      graphics.fillRoundedRect(torsoX - 10 * scale, shoulderY + 9 * scale, 20 * scale, torsoBottom - shoulderY - 5 * scale, 3 * scale);
      graphics.fillStyle(recipe.apronTrim, 1);
      graphics.fillRect(torsoX - 10 * scale, shoulderY + 9 * scale, 20 * scale, 2 * scale);
    } else {
      graphics.fillRoundedRect(torsoX - 7 * scale, shoulderY + 2 * scale, 14 * scale, torsoBottom - shoulderY + scale, 3 * scale);
      graphics.lineStyle(Math.max(1, 1.7 * scale), recipe.apronTrim, 0.95);
      if (recipe.apronStyle === "cross-back") {
        graphics.lineBetween(torsoX - 7 * scale, shoulderY + 3 * scale, torsoX + 6 * scale, shoulderY + 15 * scale);
        graphics.lineBetween(torsoX + 7 * scale, shoulderY + 3 * scale, torsoX - 6 * scale, shoulderY + 15 * scale);
      } else {
        graphics.lineBetween(torsoX - 7 * scale, shoulderY + 3 * scale, torsoX - 4 * scale, shoulderY - scale);
        graphics.lineBetween(torsoX + 7 * scale, shoulderY + 3 * scale, torsoX + 4 * scale, shoulderY - scale);
      }
      if (recipe.apronStyle === "utility") {
        graphics.fillStyle(lighten(recipe.apron, 0.22), 1);
        graphics.fillRoundedRect(torsoX - 5 * scale, shoulderY + 12 * scale, 10 * scale, 6 * scale, scale);
        graphics.lineStyle(Math.max(0.8, scale), recipe.apronTrim, 0.86);
        graphics.lineBetween(torsoX, shoulderY + 13 * scale, torsoX, shoulderY + 17 * scale);
      }
    }

    drawStallVendorHair(graphics, recipe, headX, headY, scale);
    graphics.fillStyle(recipe.skin, 1);
    graphics.fillCircle(headX, headY, 7.5 * scale);
    graphics.fillCircle(headX - 7.2 * scale, headY + scale, 1.7 * scale);
    graphics.fillCircle(headX + 7.2 * scale, headY + scale, 1.7 * scale);
    graphics.fillStyle(0x24332f, 1);
    graphics.fillCircle(headX - 2.5 * scale, headY - scale, 0.9 * scale);
    graphics.fillCircle(headX + 2.5 * scale, headY - scale, 0.9 * scale);
    graphics.lineStyle(Math.max(0.8, scale), darken(recipe.skin, 0.36), 0.82);
    graphics.lineBetween(headX - 2 * scale, headY + 4 * scale, headX + 2 * scale, headY + 4 * scale);
    drawStallVendorHeadwear(graphics, recipe, headX, headY, scale);

    graphics.fillStyle(recipe.skin, 1);
    graphics.fillCircle(workingHandX, workingHandY, 2.7 * scale);
    graphics.fillCircle(supportHandX, supportHandY, 2.7 * scale);
    drawStallVendorTool(graphics, recipe, pose, workingHandX, workingHandY, scale);
  }

  function drawStallGraphic(
    scene: HawkerScene,
    graphics: Phaser.GameObjects.Graphics,
    object: PlacedObject,
    bounds: ObjectVisualBounds,
    visual: VisualDefinition,
    snapshot: GameSnapshot,
  ) {
    const primary = colour(visual.palette[0] ?? "#6b877c", 0x6b877c);
    const secondary = colour(visual.palette[1] ?? "#f3e0b4", 0xf3e0b4);
    const accent = colour(visual.palette[2] ?? "#d56d50", 0xd56d50);
    const id = object.definitionId;
    const stallVariant = Math.max(0, STALLS.findIndex((stall) => stall.id === id));
    const serviceVisual = stallServiceVisualState(snapshot, object.id);
    const frame = darken(primary, 0.52);
    const metal = 0x7b8f8a;
    const windowX = bounds.minX + 13;
    const windowY = bounds.minY + 28;
    const windowWidth = bounds.width - 26;
    const windowHeight = Math.max(28, bounds.height - 47);

    drawObjectShadow(graphics, bounds);
    graphics.fillStyle(frame, 1);
    graphics.fillRoundedRect(bounds.minX + 3, bounds.minY + 7, bounds.width - 6, bounds.height - 10, 8);
    graphics.fillStyle(primary, 1);
    graphics.fillRoundedRect(bounds.minX + 7, bounds.minY + 10, bounds.width - 14, bounds.height - 15, 6);
    graphics.fillStyle(lighten(primary, 0.26), 0.72);
    graphics.fillRoundedRect(bounds.minX + 10, bounds.minY + 12, bounds.width - 20, 5, 3);
    graphics.fillStyle(darken(primary, 0.34), 1);
    graphics.fillRect(bounds.minX + 8, bounds.maxY - 14, bounds.width - 16, 7);
    graphics.fillStyle(0x263b37, 0.42);
    graphics.fillRoundedRect(bounds.minX + 13, bounds.maxY - 9, bounds.width - 26, 4, 2);

    // Each cuisine gets a different roofline before colour is considered.
    if (id.includes("coconut") || id.includes("tamarind")) {
      graphics.fillStyle(id.includes("coconut") ? 0xb9864c : 0x4f7650, 1);
      graphics.fillTriangle(
        bounds.minX + 2,
        bounds.minY + 25,
        bounds.centreX,
        bounds.minY - 2,
        bounds.maxX - 2,
        bounds.minY + 25,
      );
      graphics.lineStyle(2, lighten(primary, 0.38), 0.78);
      for (let rib = -2; rib <= 2; rib += 1) {
        graphics.lineBetween(
          bounds.centreX,
          bounds.minY + 1,
          bounds.centreX + rib * (bounds.width * 0.19),
          bounds.minY + 23,
        );
      }
    } else if (id.includes("kopi")) {
      graphics.fillStyle(secondary, 1);
      graphics.fillRect(bounds.minX + 2, bounds.minY + 3, bounds.width - 4, 18);
      const scallopWidth = Math.max(12, (bounds.width - 8) / 7);
      for (let index = 0; index < 7; index += 1) {
        graphics.fillStyle(index % 2 === 0 ? accent : primary, 1);
        graphics.fillCircle(
          bounds.minX + 4 + scallopWidth * (index + 0.5),
          bounds.minY + 20,
          scallopWidth * 0.52,
        );
        graphics.fillRect(
          bounds.minX + 4 + scallopWidth * index,
          bounds.minY + 3,
          scallopWidth,
          17,
        );
      }
    } else if (id.includes("mee-pok")) {
      graphics.fillStyle(0xe8dfca, 1);
      graphics.fillRoundedRect(bounds.minX + 2, bounds.minY + 2, bounds.width - 4, 23, 4);
      graphics.fillStyle(accent, 1);
      graphics.fillRect(bounds.minX + 7, bounds.minY + 6, bounds.width - 14, 7);
      graphics.fillStyle(frame, 1);
      for (const basketX of [bounds.centreX - 22, bounds.centreX, bounds.centreX + 22]) {
        graphics.lineStyle(1.5, frame, 1);
        graphics.lineBetween(basketX, bounds.minY + 13, basketX, bounds.minY + 21);
        graphics.strokeCircle(basketX, bounds.minY + 23, 5);
      }
    } else if (id.includes("sweet-monsoon")) {
      graphics.fillStyle(lighten(primary, 0.24), 1);
      graphics.fillRoundedRect(bounds.minX + 2, bounds.minY + 2, bounds.width - 4, 20, 9);
      const scallopWidth = (bounds.width - 8) / 6;
      for (let scallop = 0; scallop < 6; scallop += 1) {
        graphics.fillStyle(scallop % 2 === 0 ? accent : secondary, 1);
        graphics.fillCircle(bounds.minX + 4 + scallopWidth * (scallop + 0.5), bounds.minY + 21, scallopWidth * 0.55);
      }
      graphics.fillStyle(0xeef1e8, 1);
      graphics.fillTriangle(bounds.centreX - 9, bounds.minY + 14, bounds.centreX + 9, bounds.minY + 14, bounds.centreX, bounds.minY - 2);
      graphics.lineStyle(2, accent, 1);
      graphics.lineBetween(bounds.centreX - 6, bounds.minY + 10, bounds.centreX + 5, bounds.minY + 3);
    } else if (id.includes("satay")) {
      graphics.fillStyle(0x363c39, 1);
      graphics.fillTriangle(bounds.minX + 5, bounds.minY + 25, bounds.maxX - 5, bounds.minY + 25, bounds.maxX - 20, bounds.minY + 5);
      graphics.fillTriangle(bounds.minX + 5, bounds.minY + 25, bounds.minX + 20, bounds.minY + 5, bounds.maxX - 20, bounds.minY + 5);
      graphics.fillStyle(0x606d68, 1);
      graphics.fillRect(bounds.centreX - 8, bounds.minY - 3, 16, 10);
      graphics.fillStyle(accent, 1);
      graphics.fillRect(bounds.minX + 9, bounds.minY + 21, bounds.width - 18, 5);
    } else if (id.includes("bamboo-basket")) {
      graphics.fillStyle(0xb98d55, 1);
      graphics.fillRect(bounds.minX + 3, bounds.minY + 4, bounds.width - 6, 18);
      graphics.fillStyle(0x8a643b, 1);
      for (let slat = 0; slat < 9; slat += 1) {
        graphics.fillRect(bounds.minX + 5 + slat * ((bounds.width - 10) / 9), bounds.minY + 4, 3, 19);
      }
      graphics.fillStyle(0xd4ad6f, 1);
      graphics.fillTriangle(bounds.minX, bounds.minY + 5, bounds.centreX, bounds.minY - 4, bounds.maxX, bounds.minY + 5);
      graphics.fillTriangle(bounds.minX + 6, bounds.minY + 19, bounds.centreX, bounds.minY + 10, bounds.maxX - 6, bounds.minY + 19);
    } else if (id.includes("cinder") || id.includes("harbour")) {
      graphics.fillStyle(id.includes("cinder") ? 0x303c3b : 0x284f62, 1);
      graphics.fillRoundedRect(bounds.minX + 1, bounds.minY + 1, bounds.width - 2, 24, 3);
      graphics.fillStyle(metal, 1);
      for (let slot = 0; slot < 5; slot += 1) {
        graphics.fillRect(bounds.centreX - 32 + slot * 16, bounds.minY + 7, 9, 3);
      }
      graphics.fillStyle(accent, 1);
      graphics.fillRect(bounds.minX + 8, bounds.minY + 20, bounds.width - 16, 5);
    } else if (id.includes("tiffin")) {
      graphics.fillStyle(0x7f3028, 1);
      graphics.fillRoundedRect(bounds.minX + 3, bounds.minY + 2, bounds.width - 6, 22, 11);
      graphics.fillStyle(0xe0a348, 1);
      graphics.fillRect(bounds.minX + 12, bounds.minY + 7, bounds.width - 24, 4);
      for (const lanternX of [bounds.minX + 14, bounds.maxX - 14]) {
        graphics.lineStyle(2, 0x5f3a26, 1);
        graphics.lineBetween(lanternX, bounds.minY + 8, lanternX, bounds.minY + 19);
        graphics.fillStyle(0xf0a33a, 1);
        graphics.fillEllipse(lanternX, bounds.minY + 21, 10, 13);
      }
    } else if (id.includes("straits")) {
      graphics.fillStyle(0xe9d7b5, 1);
      graphics.fillRect(bounds.minX + 3, bounds.minY + 2, bounds.width - 6, 24);
      const tileSize = 12;
      for (let tileX = bounds.minX + 6, index = 0; tileX < bounds.maxX - 8; tileX += tileSize, index += 1) {
        graphics.fillStyle(index % 2 === 0 ? primary : accent, 1);
        graphics.fillRect(tileX, bounds.minY + 5, 8, 8);
        graphics.fillStyle(index % 2 === 0 ? accent : primary, 1);
        graphics.fillCircle(tileX + 4, bounds.minY + 9, 2);
      }
      graphics.fillStyle(darken(primary, 0.3), 1);
      graphics.fillRect(bounds.minX + 8, bounds.minY + 17, bounds.width - 16, 7);
    } else {
      const awningCount = 6 + (stallVariant % 3);
      const panelWidth = (bounds.width - 8) / awningCount;
      for (let index = 0; index < awningCount; index += 1) {
        graphics.fillStyle(index % 2 === 0 ? accent : secondary, 1);
        graphics.fillRect(bounds.minX + 4 + index * panelWidth, bounds.minY + 2, panelWidth + 1, 20);
        graphics.fillTriangle(
          bounds.minX + 4 + index * panelWidth,
          bounds.minY + 20,
          bounds.minX + 4 + (index + 1) * panelWidth,
          bounds.minY + 20,
          bounds.minX + 4 + (index + 0.5) * panelWidth,
          bounds.minY + 26,
        );
      }
    }

    const signWidth = Math.min(bounds.width - 34, Math.max(74, visual.name.length * 6.2));
    const signX = bounds.centreX - signWidth / 2;
    const signY = bounds.minY + 6;
    if (visual.signShape === "lightbox") {
      graphics.fillStyle(0xfff2c7, 0.24);
      graphics.fillRoundedRect(signX - 4, signY - 4, signWidth + 8, 25, 7);
      graphics.fillStyle(0xfff7dc, 0.98);
      graphics.fillRoundedRect(signX, signY, signWidth, 17, 4);
      graphics.lineStyle(2.5, accent, 0.94);
      graphics.strokeRoundedRect(signX, signY, signWidth, 17, 4);
    } else if (visual.signShape === "painted-board") {
      graphics.fillStyle(0x6f4a2e, 1);
      graphics.fillRoundedRect(signX, signY - 1, signWidth, 19, 2);
      graphics.fillStyle(lighten(primary, 0.18), 1);
      graphics.fillRoundedRect(signX + 3, signY + 2, signWidth - 6, 13, 1);
      graphics.lineStyle(1.5, 0xe7c66d, 0.82);
      graphics.strokeRoundedRect(signX + 3, signY + 2, signWidth - 6, 13, 1);
    } else if (visual.signShape === "tile-panel") {
      graphics.fillStyle(0xf2e6ce, 1);
      graphics.fillRoundedRect(signX, signY - 1, signWidth, 19, 3);
      const signTiles = Math.max(4, Math.floor(signWidth / 18));
      for (let tile = 0; tile < signTiles; tile += 1) {
        graphics.fillStyle(tile % 2 === 0 ? primary : accent, 0.92);
        graphics.fillRect(signX + 3 + (tile * (signWidth - 6)) / signTiles, signY + 2, (signWidth - 7) / signTiles, 13);
      }
    } else {
      graphics.fillStyle(darken(primary, 0.22), 0.94);
      graphics.fillRoundedRect(signX, signY, signWidth, 17, 8);
      graphics.lineStyle(2, lighten(accent, 0.24), 0.9);
      graphics.strokeRoundedRect(signX, signY, signWidth, 17, 8);
    }

    graphics.fillStyle(0x203832, 0.94);
    graphics.fillRoundedRect(windowX, windowY, windowWidth, windowHeight, 4);
    graphics.fillStyle(lighten(secondary, 0.18), 0.92);
    graphics.fillRect(windowX + 4, windowY + 4, windowWidth - 8, Math.max(12, windowHeight - 16));
    const interiorTop = windowY + 7;
    const interiorBottom = windowY + Math.max(16, windowHeight - 14);
    const tileRows = bounds.height >= TILE_SIZE * 3 ? 3 : 2;
    const tileColumns = Math.max(4, Math.floor(windowWidth / 25));
    graphics.lineStyle(1, darken(secondary, 0.08), 0.24);
    for (let column = 1; column < tileColumns; column += 1) {
      const tileX = windowX + 4 + (column * (windowWidth - 8)) / tileColumns;
      graphics.lineBetween(tileX, interiorTop, tileX, interiorBottom);
    }
    for (let row = 1; row < tileRows; row += 1) {
      const tileY = interiorTop + (row * (interiorBottom - interiorTop)) / tileRows;
      graphics.lineBetween(windowX + 4, tileY, windowX + windowWidth - 4, tileY);
    }
    graphics.fillStyle(0x2a403b, 0.86);
    graphics.fillRoundedRect(windowX + 7, windowY + 11, Math.min(38, windowWidth * 0.24), 15, 3);
    graphics.fillStyle(lighten(accent, 0.26), 0.96);
    for (let menuLine = 0; menuLine < 3; menuLine += 1) {
      graphics.fillRoundedRect(windowX + 12, windowY + 15 + menuLine * 4, Math.min(27, windowWidth * 0.17) - menuLine * 2, 1.5, 1);
    }
    const shelfY = windowY + Math.max(27, windowHeight * 0.42);
    graphics.fillStyle(frame, 0.92);
    graphics.fillRoundedRect(windowX + 7, shelfY, windowWidth - 14, 4, 2);
    graphics.fillStyle(lighten(metal, 0.18), 0.74);
    graphics.fillRect(windowX + 11, shelfY - 2, windowWidth - 22, 2);
    for (const lampX of [windowX + windowWidth * 0.38, windowX + windowWidth * 0.7]) {
      graphics.fillStyle(0xffe0a1, 0.12);
      graphics.fillTriangle(lampX - 12, windowY + 8, lampX + 12, windowY + 8, lampX, shelfY + 20);
      graphics.fillStyle(0xf8d487, 0.96);
      graphics.fillRoundedRect(lampX - 5, windowY + 6, 10, 4, 2);
    }
    graphics.lineStyle(3, frame, 1);
    graphics.lineBetween(bounds.minX + 10, bounds.minY + 24, bounds.minX + 10, bounds.maxY - 8);
    graphics.lineBetween(bounds.maxX - 10, bounds.minY + 24, bounds.maxX - 10, bounds.maxY - 8);

    const counterY = bounds.maxY - 21;
    graphics.fillStyle(0xa76d3c, 1);
    graphics.fillRoundedRect(bounds.minX + 8, counterY - 3, bounds.width - 16, 10, 3);
    graphics.fillStyle(lighten(0xa76d3c, 0.28), 1);
    graphics.fillRect(bounds.minX + 12, counterY - 2, bounds.width - 24, 3);
    graphics.fillStyle(frame, 1);
    graphics.fillRect(bounds.minX + 10, counterY + 7, bounds.width - 20, 11);
    graphics.fillStyle(lighten(frame, 0.16), 1);
    const cabinetWidth = (bounds.width - 28) / 3;
    for (let cabinet = 0; cabinet < 3; cabinet += 1) {
      const cabinetX = bounds.minX + 14 + cabinet * cabinetWidth;
      graphics.fillRoundedRect(cabinetX, counterY + 9, cabinetWidth - 3, 7, 1.5);
      graphics.fillStyle(lighten(metal, 0.3), 0.92);
      graphics.fillCircle(cabinetX + cabinetWidth - 8, counterY + 12, 1.3);
      graphics.fillStyle(lighten(frame, 0.16), 1);
    }

    const workY = counterY - 7;
    if (id.includes("sunrise")) {
      for (const chickenX of [bounds.centreX - 13, bounds.centreX + 4]) {
        graphics.lineStyle(1.5, 0x76512d, 1);
        graphics.lineBetween(chickenX, windowY + 3, chickenX, workY - 12);
        graphics.fillStyle(chickenX < bounds.centreX ? 0xe6c694 : 0xb9693f, 1);
        graphics.fillEllipse(chickenX, workY - 7, 12, 17);
        graphics.fillCircle(chickenX + 5, workY - 2, 3);
      }
      graphics.fillStyle(0x8b5736, 1);
      graphics.fillRoundedRect(bounds.centreX + 20, workY - 6, 22, 10, 2);
      graphics.fillStyle(0xd7e1db, 1);
      graphics.fillRect(bounds.centreX + 29, workY - 15, 3, 12);
    } else if (id.includes("coconut")) {
      for (const potX of [bounds.centreX - 18, bounds.centreX + 14]) {
        graphics.fillStyle(0x6c7773, 1);
        graphics.fillRoundedRect(potX - 10, workY - 9, 20, 12, 4);
        graphics.fillStyle(0xd6d7cf, 1);
        graphics.fillEllipse(potX, workY - 9, 20, 6);
        graphics.fillCircle(potX, workY - 13, 3);
      }
      graphics.fillStyle(0x4f874f, 1);
      graphics.fillEllipse(bounds.centreX + 38, workY - 8, 18, 8);
      graphics.fillEllipse(bounds.centreX + 34, workY - 13, 7, 16);
    } else if (id.includes("kopi")) {
      graphics.fillStyle(0xa86f44, 1);
      graphics.fillEllipse(bounds.centreX - 17, workY - 5, 20, 15);
      graphics.fillStyle(0xead8b5, 1);
      graphics.fillEllipse(bounds.centreX - 17, workY - 8, 15, 5);
      graphics.lineStyle(2, 0x6b4c32, 1);
      graphics.strokeCircle(bounds.centreX - 5, workY - 3, 6);
      graphics.fillStyle(0xc5d4cf, 1);
      graphics.fillTriangle(bounds.centreX + 7, workY + 2, bounds.centreX + 20, workY - 14, bounds.centreX + 28, workY + 2);
      graphics.lineStyle(2, 0x5c6b67, 1);
      graphics.strokeCircle(bounds.centreX + 29, workY - 4, 6);
    } else if (id.includes("cinder")) {
      graphics.fillStyle(0x272f2e, 1);
      graphics.fillEllipse(bounds.centreX, workY - 4, 43, 17);
      graphics.lineStyle(3, 0x84908d, 1);
      graphics.strokeEllipse(bounds.centreX, workY - 4, 43, 17);
      graphics.fillStyle(0xf0a13b, 1);
      graphics.fillTriangle(bounds.centreX - 12, workY + 2, bounds.centreX - 4, workY - 12, bounds.centreX + 1, workY + 3);
      graphics.fillStyle(0xd95438, 1);
      graphics.fillTriangle(bounds.centreX - 2, workY + 2, bounds.centreX + 7, workY - 10, bounds.centreX + 12, workY + 3);
      graphics.lineStyle(3, 0x615248, 1);
      graphics.lineBetween(bounds.centreX + 17, workY - 9, bounds.centreX + 38, workY - 18);
    } else if (id.includes("mee-pok")) {
      for (const basketX of [bounds.centreX - 21, bounds.centreX - 2]) {
        graphics.fillStyle(0xbfc9c4, 1);
        graphics.fillEllipse(basketX, workY - 6, 15, 8);
        graphics.lineStyle(1.5, 0x596965, 1);
        graphics.strokeEllipse(basketX, workY - 6, 15, 8);
        graphics.lineBetween(basketX - 5, workY - 10, basketX - 5, workY - 3);
        graphics.lineBetween(basketX, workY - 10, basketX, workY - 3);
        graphics.lineBetween(basketX + 5, workY - 10, basketX + 5, workY - 3);
      }
      const bottleColours = [0x9f4d36, 0x6b3e2c, 0xe5b342] as const;
      for (let bottle = 0; bottle < 3; bottle += 1) {
        graphics.fillStyle(bottleColours[bottle] as number, 1);
        graphics.fillRoundedRect(bounds.centreX + 17 + bottle * 8, workY - 12 + (bottle % 2) * 3, 6, 13, 2);
      }
      graphics.fillStyle(0xd8aa52, 1);
      graphics.fillEllipse(bounds.centreX + 5, workY - 3, 19, 7);
    } else if (id.includes("sweet-monsoon")) {
      graphics.fillStyle(0xcfd8d5, 1);
      graphics.fillRoundedRect(bounds.centreX - 31, workY - 17, 23, 19, 4);
      graphics.fillStyle(0xf0f2ed, 1);
      graphics.fillTriangle(bounds.centreX - 28, workY - 1, bounds.centreX - 11, workY - 1, bounds.centreX - 19, workY - 14);
      const jarColours = [0x8b5a38, 0x4d9252, 0xc55656] as const;
      for (let jar = 0; jar < 3; jar += 1) {
        const jarX = bounds.centreX + 2 + jar * 13;
        graphics.fillStyle(0xe8f0eb, 0.88);
        graphics.fillRoundedRect(jarX - 5, workY - 14, 10, 15, 3);
        graphics.fillStyle(jarColours[jar] as number, 1);
        graphics.fillRoundedRect(jarX - 4, workY - 7, 8, 7, 2);
      }
      graphics.lineStyle(2, 0xd9e4df, 1);
      graphics.lineBetween(bounds.maxX - 14, workY - 19, bounds.maxX - 28, workY - 2);
      graphics.fillStyle(0xc88745, 1);
      graphics.fillEllipse(bounds.maxX - 14, workY - 18, 8, 5);
      graphics.fillEllipse(bounds.maxX - 28, workY - 1, 8, 5);
    } else if (id.includes("satay")) {
      graphics.fillStyle(0x2e3431, 1);
      graphics.fillRoundedRect(bounds.centreX - 34, workY - 9, 68, 13, 3);
      graphics.fillStyle(0xd65034, 1);
      for (let ember = 0; ember < 6; ember += 1) {
        graphics.fillCircle(bounds.centreX - 26 + ember * 10, workY, 2.5);
      }
      for (let skewer = 0; skewer < 5; skewer += 1) {
        const skewerX = bounds.centreX - 25 + skewer * 12;
        graphics.lineStyle(1.5, 0xd6b477, 1);
        graphics.lineBetween(skewerX, workY - 14, skewerX + 5, workY + 2);
        graphics.fillStyle(skewer % 2 === 0 ? 0x9c4b33 : 0x6f392d, 1);
        graphics.fillCircle(skewerX + 2, workY - 8, 3);
        graphics.fillCircle(skewerX + 3, workY - 3, 3);
      }
    } else if (id.includes("bamboo-basket")) {
      for (let stack = 0; stack < 3; stack += 1) {
        const stackX = bounds.centreX - 25 + stack * 25;
        const tierCount = 2 + (stack % 2);
        for (let tier = 0; tier < tierCount; tier += 1) {
          const tierY = workY - tier * 8;
          graphics.fillStyle(tier % 2 === 0 ? 0xc89b58 : 0xdaaF68, 1);
          graphics.fillRoundedRect(stackX - 10, tierY - 5, 20, 7, 3);
          graphics.lineStyle(1, 0x815f36, 1);
          graphics.lineBetween(stackX - 8, tierY - 2, stackX + 8, tierY - 2);
        }
      }
      graphics.fillStyle(0xf1e0c5, 1);
      graphics.fillCircle(bounds.centreX + 39, workY - 5, 4);
      graphics.fillCircle(bounds.centreX + 34, workY, 4);
    } else if (id.includes("tiffin")) {
      for (let stack = 0; stack < 2; stack += 1) {
        const stackX = bounds.centreX - 18 + stack * 31;
        for (let tier = 0; tier < 3 + stack; tier += 1) {
          graphics.fillStyle(tier % 2 === 0 ? 0xd8d7ca : accent, 1);
          graphics.fillRoundedRect(stackX - 8, workY - tier * 7 - 3, 16, 7, 2);
        }
        graphics.lineStyle(1.5, 0x5f625d, 1);
        graphics.strokeRoundedRect(stackX - 10, workY - (3 + stack) * 7 + 2, 20, (3 + stack) * 7, 5);
      }
    } else if (id.includes("tamarind")) {
      graphics.fillStyle(0x4f874f, 1);
      graphics.fillEllipse(bounds.centreX, workY - 3, 58, 18);
      graphics.fillStyle(0xdfa841, 1);
      graphics.fillTriangle(bounds.centreX - 23, workY - 3, bounds.centreX + 19, workY - 9, bounds.centreX + 23, workY + 2);
      graphics.fillStyle(0xb96139, 1);
      graphics.fillCircle(bounds.centreX + 31, workY - 2, 5);
    } else if (id.includes("straits")) {
      graphics.fillStyle(0xc15e43, 1);
      graphics.fillEllipse(bounds.centreX - 13, workY - 3, 26, 12);
      graphics.fillStyle(0xe7d2a8, 1);
      graphics.fillEllipse(bounds.centreX - 13, workY - 6, 20, 7);
      graphics.fillStyle(0x445d58, 1);
      for (let jar = 0; jar < 3; jar += 1) {
        graphics.fillRoundedRect(bounds.centreX + 11 + jar * 10, workY - 10 + (jar % 2) * 3, 7, 12, 3);
      }
    } else if (id.includes("harbour")) {
      graphics.fillStyle(0x47765d, 1);
      graphics.fillEllipse(bounds.centreX - 8, workY - 4, 39, 14);
      graphics.fillStyle(0xd85c3e, 1);
      graphics.fillEllipse(bounds.centreX - 7, workY - 5, 27, 8);
      graphics.fillTriangle(bounds.centreX - 28, workY - 4, bounds.centreX - 17, workY - 13, bounds.centreX - 17, workY + 4);
      graphics.lineStyle(2, 0x283d3b, 1);
      for (let grate = 0; grate < 4; grate += 1) {
        graphics.lineBetween(bounds.centreX + 17 + grate * 5, workY - 12, bounds.centreX + 17 + grate * 5, workY + 2);
      }
    } else {
      const propCount = 2 + (stallVariant % 3);
      for (let prop = 0; prop < propCount; prop += 1) {
        const propX = bounds.centreX + (prop - (propCount - 1) / 2) * 20;
        graphics.fillStyle(prop % 2 === 0 ? accent : primary, 1);
        graphics.fillEllipse(propX, workY - (prop % 2) * 4, 16, 9);
        graphics.fillStyle(secondary, 1);
        graphics.fillEllipse(propX, workY - 2 - (prop % 2) * 4, 11, 5);
      }
    }

    const stallDefinition = STALL_BY_ID.get(id);
    const vendorRecipe = STALL_VENDOR_VISUAL_BY_ID.get(id);
    if (stallDefinition && vendorRecipe) {
      const pose = vendorAnimationPoseForStall(
        vendorRecipe,
        snapshot.tick,
        reducedMotion,
        serviceVisual.activity,
      );
      drawStallVendor(graphics, bounds, windowHeight, counterY, vendorRecipe, pose);
      drawStallEmblem(
        graphics,
        vendorRecipe.emblem,
        windowX + windowWidth - 17,
        windowY + 18,
        bounds.height < TILE_SIZE * 3 ? 0.64 : 0.78,
        primary,
        accent,
      );

      // Redraw the foreground lip after the worker so the character remains
      // convincingly inside the stall rather than floating over the counter.
      graphics.fillStyle(darken(0xa76d3c, 0.18), 1);
      graphics.fillRoundedRect(bounds.minX + 8, counterY + 1, bounds.width - 16, 7, 2);
      graphics.fillStyle(lighten(0xa76d3c, 0.34), 0.94);
      graphics.fillRect(bounds.minX + 13, counterY + 1, bounds.width - 26, 2);

      const displayLimit = qualityMode === "standard"
        ? bounds.width >= TILE_SIZE * 4 ? 3 : 2
        : 2;
      const displayDishIds = displayDishIdsForStall(
        stallDefinition,
        [
          serviceVisual.preparingDishId,
          ...(stallMenus[id] ?? []),
        ].filter((dishId): dishId is string => typeof dishId === "string"),
        displayLimit,
      );
      const displaySpan = Math.min(bounds.width - 52, 116);
      const servingScale = bounds.height < TILE_SIZE * 3 ? 0.4 : 0.46;
      for (const [index, dishId] of displayDishIds.entries()) {
        const fraction = displayDishIds.length === 1
          ? 0.5
          : index / (displayDishIds.length - 1);
        const dishX = bounds.centreX - displaySpan / 2 + displaySpan * fraction;
        const dishY = counterY - 2 - (index % 2) * 1.5;
        graphics.fillStyle(0x18332d, 0.13);
        graphics.fillEllipse(dishX + 1, counterY + 4, 28 * servingScale, 8 * servingScale);
        const variantId = dishId === serviceVisual.preparingDishId
          ? serviceVisual.preparingVariantId
          : activeDishVariants[dishId];
        drawDishServing(
          graphics,
          dishId,
          dishX,
          dishY,
          servingScale,
          0,
          nutritionVisualKeyForVariant(dishId, variantId),
        );
      }
    }

    graphics.lineStyle(3, 0x17352e, 0.82);
    graphics.strokeRoundedRect(bounds.minX + 3, bounds.minY + 7, bounds.width - 6, bounds.height - 10, 8);
    scene.addLabel(bounds.centreX, bounds.minY + 15, visual.name);
    if (!object.open) {
      graphics.fillStyle(0x44544f, 0.94);
      graphics.fillRect(windowX, windowY, windowWidth, windowHeight + 7);
      graphics.lineStyle(2, 0x9aa8a2, 0.72);
      for (let slatY = windowY + 5; slatY < counterY + 8; slatY += 7) {
        graphics.lineBetween(windowX + 3, slatY, windowX + windowWidth - 3, slatY);
      }
      scene.addLabel(bounds.centreX, bounds.centreY + 16, "CLOSED", "#9a3e31");
    }
  }

  function drawTableGraphic(
    graphics: Phaser.GameObjects.Graphics,
    id: string,
    bounds: ObjectVisualBounds,
    recipe: PlaceableVisualRecipe,
  ) {
    const round = id.includes("round") || id.includes("terrazzo");
    const timber = id.includes("communal") || id.includes("trestle");
    const top = timber ? 0xa86f44 : id.includes("folding") ? 0xdde8e5 : recipe.accent;
    const edge = timber ? 0x6b462d : darken(recipe.accent, 0.48);
    drawObjectShadow(graphics, bounds, round);

    // Draw supports before the tabletop so each construction reads at a glance.
    if (round) {
      graphics.fillStyle(0x50625d, 1);
      graphics.fillEllipse(bounds.centreX + 2, bounds.centreY + 9, bounds.width * 0.32, bounds.height * 0.26);
      graphics.fillRect(bounds.centreX - 4, bounds.centreY - 1, 8, bounds.height * 0.38);
    } else if (id.includes("folding")) {
      graphics.lineStyle(4, 0x71827e, 1);
      graphics.lineBetween(bounds.minX + 13, bounds.minY + 15, bounds.maxX - 14, bounds.maxY - 8);
      graphics.lineBetween(bounds.maxX - 13, bounds.minY + 15, bounds.minX + 14, bounds.maxY - 8);
      graphics.fillStyle(0x384a46, 1);
      graphics.fillCircle(bounds.minX + 14, bounds.maxY - 8, 3);
      graphics.fillCircle(bounds.maxX - 14, bounds.maxY - 8, 3);
    } else if (id.includes("trestle")) {
      graphics.lineStyle(5, 0x6b462d, 1);
      graphics.lineBetween(bounds.minX + 13, bounds.minY + 17, bounds.minX + 24, bounds.maxY - 8);
      graphics.lineBetween(bounds.minX + 31, bounds.minY + 17, bounds.minX + 20, bounds.maxY - 8);
      graphics.lineBetween(bounds.maxX - 31, bounds.minY + 17, bounds.maxX - 20, bounds.maxY - 8);
      graphics.lineBetween(bounds.maxX - 13, bounds.minY + 17, bounds.maxX - 24, bounds.maxY - 8);
    } else {
      graphics.fillStyle(timber ? 0x6b462d : 0x5d6b67, 1);
      for (const legX of [bounds.minX + 13, bounds.maxX - 13]) {
        graphics.fillRoundedRect(legX - 4, bounds.centreY, 8, bounds.height * 0.38, 2);
      }
    }

    graphics.fillStyle(top, 1);
    if (id.includes("terrazzo")) {
      graphics.fillEllipse(bounds.centreX, bounds.centreY - 3, bounds.width - 8, bounds.height - 12);
      graphics.lineStyle(4, 0x8d8274, 0.95);
      graphics.strokeEllipse(bounds.centreX, bounds.centreY - 3, bounds.width - 8, bounds.height - 12);
    } else if (id.includes("round")) {
      graphics.fillCircle(bounds.centreX, bounds.centreY - 3, Math.min(bounds.width, bounds.height) * 0.39);
      graphics.lineStyle(4, edge, 1);
      graphics.strokeCircle(bounds.centreX, bounds.centreY - 3, Math.min(bounds.width, bounds.height) * 0.39);
      graphics.fillStyle(lighten(top, 0.3), 0.8);
      graphics.fillEllipse(bounds.centreX - 5, bounds.centreY - 9, bounds.width * 0.3, bounds.height * 0.12);
      graphics.fillStyle(0xd7d8cc, 1);
      graphics.fillCircle(bounds.centreX, bounds.centreY - 3, 3.5);
    } else if (id.includes("snack-ledge")) {
      graphics.fillRoundedRect(bounds.minX + 3, bounds.centreY - 10, bounds.width - 6, 19, 4);
      graphics.fillStyle(lighten(top, 0.3), 0.8);
      graphics.fillRect(bounds.minX + 8, bounds.centreY - 7, bounds.width - 16, 4);
      graphics.lineStyle(4, edge, 1);
      graphics.lineBetween(bounds.minX + 4, bounds.centreY + 9, bounds.maxX - 4, bounds.centreY + 9);
      graphics.fillStyle(0xcdd9d6, 1);
      for (let hook = 0; hook < 3; hook += 1) {
        graphics.fillCircle(bounds.centreX - 12 + hook * 12, bounds.centreY + 14, 2.5);
      }
    } else {
      const inset = timber || id.includes("family") ? 4 : id.includes("accessible") ? 6 : 9;
      const radius = id.includes("folding") ? 2 : id.includes("compact") ? 5 : 7;
      graphics.fillRoundedRect(
        bounds.minX + inset,
        bounds.minY + 6,
        bounds.width - inset * 2,
        bounds.height - 18,
        radius,
      );
      graphics.lineStyle(4, edge, 0.95);
      graphics.strokeRoundedRect(
        bounds.minX + inset,
        bounds.minY + 6,
        bounds.width - inset * 2,
        bounds.height - 18,
        radius,
      );
      graphics.fillStyle(lighten(top, 0.28), 0.72);
      graphics.fillRoundedRect(
        bounds.minX + inset + 5,
        bounds.minY + 10,
        bounds.width - inset * 2 - 10,
        4,
        2,
      );
    }

    if (timber) {
      graphics.lineStyle(1.5, lighten(0x6b462d, 0.2), 0.72);
      const plankCount = id.includes("long") ? 5 : 3;
      for (let plank = 1; plank < plankCount; plank += 1) {
        const plankY = bounds.minY + 7 + (plank * (bounds.height - 20)) / plankCount;
        graphics.lineBetween(bounds.minX + 7, plankY, bounds.maxX - 7, plankY);
      }
      graphics.fillStyle(0xd9c28d, 1);
      graphics.fillRoundedRect(bounds.centreX - 8, bounds.centreY - 6, 16, 10, 3);
      graphics.fillStyle(0xb64035, 1);
      graphics.fillCircle(bounds.centreX - 3, bounds.centreY - 3, 2);
      graphics.fillStyle(0xd9a73c, 1);
      graphics.fillCircle(bounds.centreX + 3, bounds.centreY - 3, 2);
    }
    if (id.includes("terrazzo")) {
      const speckleColours = [0xf6cf68, 0xc8624c, 0x477c86, 0xfff4d8];
      const speckleCount = qualityMode === "standard" ? 15 : 8;
      for (let index = 0; index < speckleCount; index += 1) {
        const angle = (index / speckleCount) * Math.PI * 2;
        const radius = index % 2 === 0 ? 0.27 : 0.15;
        graphics.fillStyle(speckleColours[index % speckleColours.length] as number, 0.95);
        graphics.fillCircle(
          bounds.centreX + Math.cos(angle) * bounds.width * radius,
          bounds.centreY - 3 + Math.sin(angle) * bounds.height * radius,
          index % 3 === 0 ? 2.5 : 1.7,
        );
      }
    }
    if (id.includes("accessible")) {
      graphics.fillStyle(0xe8f4ff, 0.94);
      graphics.fillRoundedRect(bounds.maxX - 32, bounds.minY + 11, 19, 16, 4);
      graphics.lineStyle(2.5, 0x356b82, 1);
      graphics.strokeCircle(bounds.maxX - 23, bounds.minY + 17, 4.5);
      graphics.lineBetween(bounds.maxX - 23, bounds.minY + 21, bounds.maxX - 17, bounds.minY + 27);
      graphics.lineStyle(3, 0x356b82, 0.8);
      graphics.lineBetween(bounds.maxX - 7, bounds.minY + 8, bounds.maxX - 7, bounds.maxY - 15);
    }
    if (id.includes("folding")) {
      graphics.fillStyle(0x72827e, 1);
      graphics.fillCircle(bounds.centreX, bounds.minY + 8, 3);
      graphics.lineStyle(1.5, 0x9cadab, 0.85);
      graphics.lineBetween(bounds.centreX, bounds.minY + 11, bounds.centreX, bounds.maxY - 14);
    }
    if (id.includes("compact")) {
      graphics.fillStyle(lighten(recipe.accent, 0.5), 1);
      for (const corner of [
        [bounds.minX + 14, bounds.minY + 11],
        [bounds.maxX - 14, bounds.minY + 11],
        [bounds.minX + 14, bounds.maxY - 17],
        [bounds.maxX - 14, bounds.maxY - 17],
      ] as const) {
        graphics.fillCircle(corner[0], corner[1], 2.4);
      }
    }
    drawMakerMark(graphics, bounds, recipe);
  }

  function drawSeatGraphic(
    graphics: Phaser.GameObjects.Graphics,
    id: string,
    bounds: ObjectVisualBounds,
    recipe: PlaceableVisualRecipe,
  ) {
    const isStool = id.includes("stool") || id.includes("perch");
    const isBench = id.includes("bench") || id.includes("booth");
    const frame = id.includes("communal") ? 0x6b462d : 0x435a55;
    drawObjectShadow(graphics, bounds, isStool);

    if (isStool) {
      const radius = Math.min(bounds.width, bounds.height) * (id.includes("high-counter") ? 0.29 : 0.34);
      graphics.fillStyle(frame, 1);
      if (id.includes("swivel")) {
        graphics.fillRect(bounds.centreX - 3, bounds.centreY + 2, 6, bounds.height * 0.34);
        graphics.fillEllipse(bounds.centreX, bounds.maxY - 8, 25, 7);
        graphics.fillStyle(recipe.accent, 1);
        graphics.fillEllipse(bounds.centreX, bounds.centreY - 4, radius * 2.3, radius * 1.35);
        graphics.fillStyle(lighten(recipe.accent, 0.26), 1);
        graphics.fillEllipse(bounds.centreX - 3, bounds.centreY - 7, radius, radius * 0.35);
      } else {
        for (let leg = 0; leg < 3; leg += 1) {
          const angle = (leg / 3) * Math.PI * 2 + Math.PI / 2;
          graphics.lineStyle(3.5, frame, 1);
          graphics.lineBetween(
            bounds.centreX + Math.cos(angle) * radius * 0.55,
            bounds.centreY + Math.sin(angle) * radius * 0.45,
            bounds.centreX + Math.cos(angle) * radius * 0.9,
            bounds.maxY - 7 + Math.sin(angle) * 2,
          );
        }
        graphics.fillStyle(recipe.accent, 1);
        if (id.includes("high-counter")) {
          graphics.fillRoundedRect(bounds.centreX - radius, bounds.centreY - radius * 0.62, radius * 2, radius * 1.25, 4);
          graphics.lineStyle(2.5, lighten(frame, 0.22), 1);
          graphics.strokeRoundedRect(bounds.centreX - radius, bounds.centreY - radius * 0.62, radius * 2, radius * 1.25, 4);
          graphics.lineBetween(bounds.centreX - 9, bounds.maxY - 13, bounds.centreX + 9, bounds.maxY - 13);
        } else {
          graphics.fillCircle(bounds.centreX, bounds.centreY - 2, radius);
          graphics.lineStyle(3, frame, 0.9);
          graphics.strokeCircle(bounds.centreX, bounds.centreY - 2, radius);
          graphics.fillStyle(lighten(recipe.accent, 0.3), 0.82);
          graphics.fillEllipse(bounds.centreX - 3, bounds.centreY - 6, radius, radius * 0.38);
        }
      }
    } else if (isBench) {
      if (id.includes("acoustic")) {
        graphics.fillStyle(darken(recipe.accent, 0.35), 1);
        graphics.fillRoundedRect(bounds.minX + 4, bounds.minY + 4, bounds.width - 8, bounds.height - 12, 13);
        graphics.fillStyle(lighten(recipe.accent, 0.16), 1);
        graphics.fillRoundedRect(bounds.minX + 10, bounds.minY + 13, bounds.width - 20, bounds.height - 25, 8);
        graphics.fillStyle(0xede3d2, 1);
        graphics.fillRoundedRect(bounds.minX + 15, bounds.centreY - 3, bounds.width - 30, 12, 5);
        graphics.fillStyle(frame, 1);
        for (let slat = 0; slat < 3; slat += 1) {
          graphics.fillRect(bounds.minX + 12, bounds.minY + 11 + slat * 8, bounds.width - 24, 2);
        }
      } else {
        graphics.fillStyle(frame, 1);
        for (const legX of [bounds.minX + 13, bounds.maxX - 13]) {
          graphics.fillRect(legX - 3, bounds.centreY, 6, bounds.height * 0.34);
        }
        graphics.fillStyle(recipe.accent, 1);
        graphics.fillRoundedRect(bounds.minX + 6, bounds.minY + 14, bounds.width - 12, bounds.height - 24, 4);
        graphics.fillStyle(id.includes("communal") ? 0x8a5b38 : darken(recipe.accent, 0.42), 1);
        graphics.fillRoundedRect(bounds.minX + 7, bounds.minY + 6, bounds.width - 14, 11, 4);
        if (id.includes("communal")) {
          graphics.lineStyle(1.5, 0xd3a86f, 0.75);
          graphics.lineBetween(bounds.minX + 11, bounds.minY + 11, bounds.maxX - 11, bounds.minY + 11);
          graphics.lineBetween(bounds.minX + 11, bounds.centreY, bounds.maxX - 11, bounds.centreY);
        }
        const places = id.includes("three-person") ? 3 : 2;
        for (let index = 1; index < places; index += 1) {
          const x = bounds.minX + (bounds.width * index) / places;
          graphics.lineStyle(2, 0xfff4d8, 0.64);
          graphics.lineBetween(x, bounds.minY + 17, x, bounds.maxY - 12);
        }
      }
    } else {
      const inset = id.includes("easy-rise") ? 7 : 10;
      graphics.fillStyle(frame, 1);
      graphics.fillRect(bounds.minX + inset + 1, bounds.centreY + 4, 5, bounds.height * 0.28);
      graphics.fillRect(bounds.maxX - inset - 6, bounds.centreY + 4, 5, bounds.height * 0.28);
      graphics.fillStyle(recipe.accent, 1);
      graphics.fillRoundedRect(bounds.minX + inset, bounds.minY + 15, bounds.width - inset * 2, bounds.height - 24, 7);
      graphics.fillStyle(darken(recipe.accent, id.includes("easy-rise") ? 0.18 : 0.42), 1);
      if (id.includes("moulded")) {
        graphics.fillRoundedRect(bounds.minX + inset - 2, bounds.minY + 5, bounds.width - inset * 2 + 4, 15, 8);
        graphics.fillStyle(0xe7ddd0, 0.88);
        graphics.fillRoundedRect(bounds.centreX - 7, bounds.minY + 9, 14, 5, 3);
      } else {
        graphics.fillRoundedRect(bounds.minX + inset, bounds.minY + 6, bounds.width - inset * 2, id.includes("easy-rise") ? 17 : 11, 5);
      }
      if (id.includes("arm-chair")) {
        graphics.fillStyle(frame, 1);
        graphics.fillRoundedRect(bounds.minX + 4, bounds.minY + 15, 8, bounds.height - 21, 3);
        graphics.fillRoundedRect(bounds.maxX - 12, bounds.minY + 15, 8, bounds.height - 21, 3);
        graphics.fillStyle(lighten(recipe.accent, 0.2), 1);
        graphics.fillRoundedRect(bounds.minX + 4, bounds.minY + 14, 11, 6, 3);
        graphics.fillRoundedRect(bounds.maxX - 15, bounds.minY + 14, 11, 6, 3);
      }
      if (id.includes("booster")) {
        graphics.fillStyle(0xf6cf68, 1);
        graphics.fillRoundedRect(bounds.centreX - 9, bounds.centreY - 5, 18, 13, 4);
        graphics.lineStyle(2, 0xc66c3c, 1);
        graphics.lineBetween(bounds.centreX - 8, bounds.centreY - 2, bounds.centreX + 7, bounds.centreY + 7);
        graphics.lineBetween(bounds.centreX + 8, bounds.centreY - 2, bounds.centreX - 7, bounds.centreY + 7);
      }
      if (id.includes("cushioned")) {
        graphics.fillStyle(lighten(recipe.accent, 0.38), 0.95);
        graphics.fillRoundedRect(bounds.minX + inset + 3, bounds.minY + 18, bounds.width - inset * 2 - 6, bounds.height - 31, 5);
        graphics.lineStyle(1.5, darken(recipe.accent, 0.18), 0.75);
        graphics.lineBetween(bounds.centreX - 7, bounds.centreY - 5, bounds.centreX + 7, bounds.centreY + 5);
        graphics.lineBetween(bounds.centreX + 7, bounds.centreY - 5, bounds.centreX - 7, bounds.centreY + 5);
        graphics.fillStyle(0xffe8cf, 0.9);
        graphics.fillCircle(bounds.centreX, bounds.centreY, 2.3);
      }
    }
    drawMakerMark(graphics, bounds, recipe);
  }

  function drawFixtureGraphic(
    graphics: Phaser.GameObjects.Graphics,
    id: string,
    bounds: ObjectVisualBounds,
    recipe: PlaceableVisualRecipe,
  ) {
    drawObjectShadow(graphics, bounds);
    const x = bounds.minX + 7;
    const y = bounds.minY + 7;
    const width = bounds.width - 14;
    const height = bounds.height - 17;
    const frame = darken(recipe.accent, 0.52);

    if (id.includes("ticket")) {
      graphics.fillStyle(0x4f625d, 1);
      graphics.fillRoundedRect(bounds.centreX - 12, y, 24, height - 2, 8);
      graphics.fillStyle(0x142e30, 1);
      graphics.fillRoundedRect(bounds.centreX - 8, y + 6, 16, 13, 3);
      graphics.fillStyle(0x8fd3c3, 1);
      graphics.fillCircle(bounds.centreX, y + 12, 3);
      graphics.fillStyle(recipe.accent, 1);
      graphics.fillRoundedRect(bounds.centreX - 7, y + 24, 14, 6, 2);
      graphics.fillStyle(0xfff4d8, 1);
      graphics.fillRect(bounds.centreX - 5, y + 29, 10, 10);
      graphics.fillStyle(frame, 1);
      graphics.fillRect(bounds.centreX - 2, bounds.maxY - 10, 4, 7);
    } else if (id.includes("condiment")) {
      graphics.fillStyle(0x986642, 1);
      graphics.fillRoundedRect(x, bounds.centreY - 5, width, height * 0.55, 5);
      graphics.fillStyle(0xd4a465, 1);
      graphics.fillRoundedRect(x - 2, bounds.centreY - 8, width + 4, 8, 3);
      graphics.fillStyle(0x4b5b56, 1);
      graphics.fillRoundedRect(bounds.centreX - 19, bounds.centreY - 18, 38, 11, 3);
      const bottleColours = [0xc8624c, 0xd69a35, 0x4d8753];
      for (let index = 0; index < 3; index += 1) {
        graphics.fillStyle(bottleColours[index] as number, 1);
        graphics.fillRoundedRect(bounds.centreX - 14 + index * 11, bounds.centreY - 24, 8, 17, 3);
        graphics.fillStyle(0xe9e0c9, 1);
        graphics.fillRect(bounds.centreX - 12 + index * 11, bounds.centreY - 27, 4, 4);
      }
    } else if (id.includes("cutlery")) {
      graphics.fillStyle(0x71837f, 1);
      graphics.fillRoundedRect(x, y + 10, width, height - 10, 5);
      graphics.fillStyle(0xdce8e4, 1);
      for (let slot = 0; slot < 3; slot += 1) {
        graphics.fillRoundedRect(bounds.centreX - 17 + slot * 12, y + 4, 9, height * 0.65, 4);
      }
      graphics.lineStyle(2, 0x61716d, 1);
      for (let index = -1; index <= 1; index += 1) {
        const utensilX = bounds.centreX + index * 12;
        graphics.lineBetween(utensilX, y + 8, utensilX, bounds.centreY + 5);
        graphics.fillCircle(utensilX, y + 7, 2.5);
      }
    } else if (id.includes("water")) {
      graphics.fillStyle(0x5f716c, 1);
      graphics.fillRoundedRect(x, bounds.centreY - 4, width, height * 0.58, 5);
      for (const carafeX of [bounds.centreX - 11, bounds.centreX + 11]) {
        graphics.fillStyle(0xbde4e8, 0.74);
        graphics.fillRoundedRect(carafeX - 6, y + 3, 12, 23, 5);
        graphics.fillStyle(0x70bfd0, 0.9);
        graphics.fillRoundedRect(carafeX - 5, y + 12, 10, 13, 4);
        graphics.lineStyle(2, 0x5c7a7f, 1);
        graphics.strokeCircle(carafeX + 7, y + 11, 4);
      }
      graphics.fillStyle(0xf0eee1, 1);
      for (let cup = 0; cup < 3; cup += 1) {
        graphics.fillRoundedRect(bounds.centreX - 12 + cup * 9, bounds.centreY + 7, 7, 8, 2);
      }
    } else if (id.includes("pickup")) {
      graphics.fillStyle(frame, 1);
      graphics.fillRoundedRect(x, y, width, height, 4);
      graphics.fillStyle(0xe6e0cd, 1);
      graphics.fillRoundedRect(x + 4, y + 4, width - 8, height - 10, 2);
      graphics.fillStyle(frame, 1);
      for (let row = 1; row < 3; row += 1) {
        graphics.fillRect(x + 3, y + row * (height / 3), width - 6, 4);
      }
      for (let row = 0; row < 2; row += 1) {
        graphics.fillStyle(row === 0 ? recipe.accent : 0xd49a44, 1);
        graphics.fillEllipse(bounds.centreX + (row ? 7 : -8), y + 10 + row * 13, 13, 6);
      }
    } else if (id.includes("display-case")) {
      const chilled = id.includes("chilled");
      graphics.fillStyle(0x50615d, 1);
      graphics.fillRoundedRect(x, y + 2, width, height, 5);
      graphics.fillStyle(chilled ? 0xa9d9e2 : 0xf4b567, 0.5);
      graphics.fillRoundedRect(x + 4, y + 5, width - 8, height - 13, 3);
      graphics.lineStyle(2, chilled ? 0xe9fbff : 0xffead0, 0.92);
      graphics.strokeRoundedRect(x + 4, y + 5, width - 8, height - 13, 3);
      graphics.lineBetween(x + 6, bounds.centreY, x + width - 6, bounds.centreY);
      for (let row = 0; row < 2; row += 1) {
        graphics.fillStyle(chilled ? (row === 0 ? 0x79aeb5 : 0xe8d6b5) : row === 0 ? 0xd27b4c : 0xe6b94e, 1);
        const servingY = bounds.centreY - 7 + row * 16;
        for (let serving = 0; serving < 3; serving += 1) {
          graphics.fillEllipse(bounds.centreX - 14 + serving * 14, servingY, 10, 5);
        }
      }
      graphics.fillStyle(chilled ? 0x579ab0 : 0xd85e39, 1);
      graphics.fillRect(x + 4, bounds.maxY - 13, width - 8, 5);
    } else {
      graphics.fillStyle(0x71837f, 1);
      graphics.fillRoundedRect(x, y + 5, width, height - 4, 5);
      graphics.fillStyle(0xd8ddd7, 1);
      graphics.fillRoundedRect(x - 2, y, width + 4, 9, 3);
      graphics.fillStyle(recipe.accent, 1);
      graphics.fillRect(x + 5, y + 12, width - 10, height - 21);
      graphics.fillStyle(0x294d42, 1);
      graphics.fillCircle(x + 7, bounds.maxY - 7, 5);
      graphics.fillCircle(x + width - 7, bounds.maxY - 7, 5);
      graphics.lineStyle(2, 0xaebbb7, 1);
      graphics.lineBetween(x + 4, y + height - 7, x + width - 4, y + height - 7);
    }
    graphics.lineStyle(2.5, frame, 0.82);
    if (!id.includes("ticket")) {
      graphics.strokeRoundedRect(x, y, width, height, 6);
    }
    drawMakerMark(graphics, bounds, recipe);
  }

  function drawTrayWasteGraphic(
    scene: HawkerScene,
    graphics: Phaser.GameObjects.Graphics,
    id: string,
    bounds: ObjectVisualBounds,
    recipe: PlaceableVisualRecipe,
  ) {
    drawObjectShadow(graphics, bounds);
    const x = bounds.minX + 6;
    const y = bounds.minY + 5;
    const width = bounds.width - 12;
    const height = bounds.height - 11;
    const steel = 0x83938f;
    const darkSteel = 0x41534f;

    if (id.includes("tray-return") || id.includes("dish-drop") || id.includes("tray-stack")) {
      graphics.fillStyle(darkSteel, 1);
      graphics.fillRoundedRect(x, y, width, height, 5);
      graphics.fillStyle(0xcdd5d1, 1);
      graphics.fillRoundedRect(x + 4, y + 4, width - 8, height - 8, 3);
      const bays = id.includes("dual") ? 2 : 1;
      for (let bay = 0; bay < bays; bay += 1) {
        const bayX = x + 7 + bay * ((width - 9) / bays);
        const bayWidth = (width - 13) / bays;
        graphics.fillStyle(0x253d39, 1);
        graphics.fillRoundedRect(bayX, y + 12, bayWidth - 3, height - 21, 2);
        const shelfCount = id.includes("dish-drop") ? 2 : 3;
        for (let row = 0; row < shelfCount; row += 1) {
          const shelfY = y + 18 + row * ((height - 24) / shelfCount);
          graphics.fillStyle(steel, 1);
          graphics.fillRect(bayX + 2, shelfY, bayWidth - 7, 4);
          graphics.fillStyle(id.includes("tray-stack") ? 0xd8af68 : 0xd6dcd7, 1);
          graphics.fillRoundedRect(bayX + 4, shelfY - 3, bayWidth - 11, 4, 1);
        }
      }
      if (id.includes("dish-drop")) {
        graphics.fillStyle(0x1d312e, 1);
        graphics.fillEllipse(bounds.centreX, y + 10, Math.min(36, width - 17), 8);
        graphics.lineStyle(2, 0xe8eee9, 1);
        graphics.strokeEllipse(bounds.centreX, y + 10, Math.min(36, width - 17), 8);
      } else {
        graphics.fillStyle(recipe.accent, 1);
        graphics.fillRect(x + 5, y + 5, width - 10, 6);
      }
      scene.addLabel(bounds.centreX, bounds.minY - 2, id.includes("tray-stack") ? "CLEAN TRAYS" : id.includes("dish-drop") ? "DISH DROP" : "RETURN");
    } else if (id.includes("recycling")) {
      graphics.fillStyle(0x5c6f6a, 1);
      graphics.fillRoundedRect(x, y + 7, width, height - 7, 5);
      const colours = [0x4d8753, 0xf2c14e, 0x4d7390] as const;
      for (let index = 0; index < 3; index += 1) {
        const openingX = bounds.minX + 15 + index * ((bounds.width - 30) / 2);
        graphics.fillStyle(colours[index] as number, 1);
        graphics.fillRoundedRect(openingX - 9, y, 18, 15, 4);
        graphics.fillStyle(0x20332f, 1);
        if (index === 0) {
          graphics.fillCircle(openingX, y + 7, 4);
        } else if (index === 1) {
          graphics.fillRoundedRect(openingX - 5, y + 4, 10, 6, 2);
        } else {
          graphics.fillEllipse(openingX, y + 7, 12, 5);
        }
        graphics.fillStyle(lighten(colours[index] as number, 0.45), 0.9);
        graphics.fillCircle(openingX, bounds.centreY + 10, 3);
      }
    } else if (id.includes("food-waste")) {
      graphics.fillStyle(0x6f633f, 1);
      graphics.fillRoundedRect(x + 3, y + 9, width - 6, height - 11, 7);
      graphics.fillStyle(0x4c432b, 1);
      graphics.fillRoundedRect(x, y + 3, width, 13, 6);
      graphics.fillStyle(0x202f2b, 1);
      graphics.fillEllipse(bounds.centreX, y + 9, width - 16, 7);
      graphics.fillStyle(0x6c914f, 1);
      graphics.fillEllipse(bounds.centreX - 5, y + 8, 9, 4);
      graphics.fillStyle(0xc58a3f, 1);
      graphics.fillCircle(bounds.centreX + 5, y + 7, 2.5);
      graphics.fillStyle(0xc3c8bd, 1);
      graphics.fillRoundedRect(bounds.centreX - 9, bounds.maxY - 8, 18, 4, 2);
    } else if (id.includes("trolley")) {
      graphics.fillStyle(steel, 1);
      graphics.fillRoundedRect(x + 4, bounds.centreY - 2, width - 8, height * 0.48, 4);
      graphics.fillStyle(recipe.accent, 1);
      graphics.fillRoundedRect(x + 8, bounds.centreY + 2, width - 16, height * 0.32, 3);
      graphics.lineStyle(4, darkSteel, 1);
      graphics.lineBetween(x + 5, y + 7, x + 5, bounds.maxY - 8);
      graphics.lineBetween(bounds.maxX - 11, y + 11, bounds.maxX - 11, bounds.maxY - 8);
      graphics.lineStyle(3, 0x8a6241, 1);
      graphics.lineBetween(bounds.centreX + 13, y - 3, bounds.centreX + 4, bounds.centreY + 7);
      graphics.fillStyle(0x4d8753, 1);
      graphics.fillTriangle(bounds.centreX - 16, bounds.centreY + 7, bounds.centreX - 6, y + 10, bounds.centreX + 1, bounds.centreY + 7);
      graphics.fillStyle(0x263d38, 1);
      graphics.fillCircle(x + 9, bounds.maxY - 7, 5);
      graphics.fillCircle(x + width - 9, bounds.maxY - 7, 5);
    } else {
      graphics.fillStyle(darken(recipe.accent, 0.18), 1);
      graphics.fillRoundedRect(x + 4, y + 9, width - 8, height - 10, 7);
      graphics.fillStyle(recipe.accent, 1);
      graphics.fillRoundedRect(x, y + 2, width, 14, 6);
      graphics.fillStyle(0x263d38, 1);
      graphics.fillEllipse(bounds.centreX, y + 9, width - 15, 8);
      graphics.fillStyle(0xc4cac4, 1);
      graphics.fillRoundedRect(bounds.centreX - 9, bounds.maxY - 8, 18, 4, 2);
      graphics.fillStyle(lighten(recipe.accent, 0.5), 1);
      graphics.fillRect(bounds.centreX - 2, bounds.centreY - 3, 4, 10);
    }
    graphics.lineStyle(2.5, darkSteel, 0.84);
    graphics.strokeRoundedRect(x, y, width, height, 5);
    drawMakerMark(graphics, bounds, recipe);
  }

  function drawLightingGraphic(
    graphics: Phaser.GameObjects.Graphics,
    id: string,
    bounds: ObjectVisualBounds,
    recipe: PlaceableVisualRecipe,
  ) {
    const pulse = reducedMotion ? 0.16 : 0.12 + Math.sin(state.tick * 0.09 + recipe.seed) * 0.04;
    const glowRadius = Math.min(bounds.width, bounds.height) * 0.48;
    graphics.fillStyle(0xffd86b, pulse * 0.45);
    graphics.fillCircle(bounds.centreX, bounds.centreY + 3, glowRadius);
    graphics.fillStyle(0xffd86b, pulse);
    graphics.fillCircle(bounds.centreX, bounds.centreY + 2, glowRadius * 0.7);
    if (id.includes("tube")) {
      graphics.fillStyle(0x63716e, 1);
      graphics.fillRoundedRect(bounds.minX + 4, bounds.centreY - 8, bounds.width - 8, 16, 5);
      graphics.fillStyle(0xfff4c3, 1);
      graphics.fillRoundedRect(bounds.minX + 9, bounds.centreY - 4, bounds.width - 18, 8, 4);
      graphics.fillStyle(0x394b47, 1);
      graphics.fillRect(bounds.minX + 6, bounds.centreY - 4, 5, 8);
      graphics.fillRect(bounds.maxX - 11, bounds.centreY - 4, 5, 8);
    } else if (id.includes("pendant")) {
      graphics.lineStyle(3, 0x294d42, 1);
      graphics.lineBetween(bounds.centreX, bounds.minY + 4, bounds.centreX, bounds.centreY - 9);
      graphics.fillStyle(darken(recipe.accent, 0.28), 1);
      graphics.fillTriangle(bounds.centreX - 13, bounds.centreY + 5, bounds.centreX + 13, bounds.centreY + 5, bounds.centreX, bounds.centreY - 12);
      graphics.fillStyle(0xffefb0, 1);
      graphics.fillEllipse(bounds.centreX, bounds.centreY + 5, 19, 7);
      graphics.fillCircle(bounds.centreX, bounds.centreY + 2, 4);
    } else if (id.includes("lantern-cluster")) {
      for (let index = 0; index < 3; index += 1) {
        const lanternX = bounds.centreX - 13 + index * 13;
        const lanternY = bounds.centreY - 6 + Math.abs(index - 1) * 8;
        graphics.lineStyle(1.5, 0x6b4c32, 1);
        graphics.lineBetween(lanternX, bounds.minY + 2, lanternX, lanternY - 7);
        graphics.fillStyle(index === 1 ? recipe.accent : 0xffd86b, 1);
        graphics.fillEllipse(lanternX, lanternY, 13, 17);
        graphics.lineStyle(1, 0x8a5a35, 0.85);
        graphics.lineBetween(lanternX - 5, lanternY, lanternX + 5, lanternY);
        graphics.fillStyle(0xffefb0, 1);
        graphics.fillCircle(lanternX, lanternY, 2.5);
      }
    } else if (id.includes("path-light")) {
      graphics.fillStyle(0x425550, 1);
      graphics.fillRoundedRect(bounds.centreX - 7, bounds.centreY - 12, 14, 26, 4);
      graphics.fillStyle(0xffefb0, 1);
      graphics.fillRoundedRect(bounds.centreX - 5, bounds.centreY - 9, 10, 9, 3);
      graphics.fillStyle(recipe.accent, 1);
      graphics.fillRect(bounds.centreX - 7, bounds.centreY + 6, 14, 5);
      graphics.fillStyle(0xffd86b, pulse * 1.4);
      graphics.fillTriangle(bounds.centreX - 4, bounds.centreY - 3, bounds.centreX + 4, bounds.centreY - 3, bounds.centreX + 20, bounds.centreY + 10);
    } else if (id.includes("skylight")) {
      graphics.fillStyle(0xb9e2e8, 1);
      graphics.fillRoundedRect(bounds.minX + 6, bounds.minY + 6, bounds.width - 12, bounds.height - 12, 5);
      graphics.lineStyle(3, 0x557c80, 0.9);
      graphics.strokeRoundedRect(bounds.minX + 6, bounds.minY + 6, bounds.width - 12, bounds.height - 12, 5);
      graphics.lineBetween(bounds.centreX, bounds.minY + 7, bounds.centreX, bounds.maxY - 7);
      graphics.lineBetween(bounds.minX + 7, bounds.centreY, bounds.maxX - 7, bounds.centreY);
      graphics.lineStyle(2, 0xffffff, 0.9);
      graphics.lineBetween(bounds.minX + 10, bounds.minY + 10, bounds.centreX - 3, bounds.centreY - 3);
    } else if (id.includes("string")) {
      graphics.lineStyle(2, 0x6b4c32, 1);
      graphics.lineBetween(bounds.minX + 4, bounds.centreY - 5, bounds.maxX - 4, bounds.centreY + 1);
      for (let index = 0; index < 5; index += 1) {
        const bulbX = bounds.minX + 8 + index * ((bounds.width - 16) / 4);
        const bulbY = bounds.centreY - 4 + index * 1.5 + (index % 2) * 4;
        graphics.lineStyle(1.5, 0x5e4b36, 1);
        graphics.lineBetween(bulbX, bulbY - 4, bulbX, bulbY);
        graphics.fillStyle(index % 2 === 0 ? 0xf4c65a : recipe.accent, 1);
        graphics.fillCircle(bulbX, bulbY + 2, 4);
        graphics.fillStyle(0xfff5ce, 1);
        graphics.fillCircle(bulbX - 1, bulbY + 1, 1.3);
      }
    } else if (id.includes("task-light")) {
      graphics.fillStyle(0x3f514d, 1);
      graphics.fillRoundedRect(bounds.minX + 6, bounds.maxY - 11, 18, 7, 3);
      graphics.lineStyle(4, 0x556a65, 1);
      graphics.lineBetween(bounds.minX + 16, bounds.maxY - 11, bounds.centreX + 3, bounds.centreY - 8);
      graphics.lineBetween(bounds.centreX + 3, bounds.centreY - 8, bounds.maxX - 10, bounds.minY + 10);
      graphics.fillStyle(recipe.accent, 1);
      graphics.fillTriangle(bounds.maxX - 18, bounds.minY + 13, bounds.maxX - 3, bounds.minY + 4, bounds.maxX - 5, bounds.minY + 20);
      graphics.fillStyle(0xffefb0, 1);
      graphics.fillCircle(bounds.maxX - 8, bounds.minY + 12, 3);
    } else {
      graphics.fillStyle(0xffefb0, 1);
      graphics.fillCircle(bounds.centreX, bounds.centreY, 12);
      graphics.fillStyle(recipe.accent, 1);
      graphics.fillRect(bounds.centreX - 10, bounds.centreY + 8, 20, 5);
    }
  }

  function drawFanGraphic(
    graphics: Phaser.GameObjects.Graphics,
    id: string,
    bounds: ObjectVisualBounds,
    recipe: PlaceableVisualRecipe,
  ) {
    drawObjectShadow(graphics, bounds, true);
    const radius = Math.min(bounds.width, bounds.height) * (id.includes("high-volume") ? 0.42 : 0.35);
    if (id.includes("column")) {
      graphics.fillStyle(0xc9d9d5, 1);
      graphics.fillRoundedRect(bounds.centreX - 8, bounds.minY + 7, 16, bounds.height - 18, 8);
      graphics.fillStyle(recipe.accent, 1);
      for (let row = 0; row < 4; row += 1) graphics.fillRect(bounds.centreX - 5, bounds.minY + 13 + row * 7, 10, 3);
    } else if (id.includes("exhaust")) {
      graphics.fillStyle(0x57776e, 1);
      graphics.fillRoundedRect(bounds.minX + 6, bounds.minY + 6, bounds.width - 12, bounds.height - 12, 4);
      graphics.fillStyle(0x263d38, 1);
      for (let row = 0; row < 4; row += 1) graphics.fillRect(bounds.minX + 12, bounds.minY + 12 + row * 7, bounds.width - 24, 3);
    } else {
      if (id.includes("wall")) {
        graphics.fillStyle(0x52645f, 1);
        graphics.fillRoundedRect(bounds.centreX - 16, bounds.maxY - 11, 32, 7, 3);
        graphics.fillRect(bounds.centreX - 4, bounds.centreY + radius * 0.6, 8, bounds.maxY - bounds.centreY - radius * 0.6 - 7);
      } else if (id.includes("ceiling")) {
        graphics.lineStyle(4, 0x52645f, 1);
        graphics.lineBetween(bounds.centreX, bounds.minY + 2, bounds.centreX, bounds.centreY - radius * 0.6);
      }
      graphics.fillStyle(id.includes("quiet") ? 0xe4ece8 : 0xc9d9d5, 1);
      graphics.fillCircle(bounds.centreX, bounds.centreY - 2, radius + 5);
      graphics.lineStyle(id.includes("high-volume") ? 4 : 2, 0x476f68, 0.86);
      graphics.strokeCircle(bounds.centreX, bounds.centreY - 2, radius + 5);
      const bladeCount = id.includes("high-volume") ? 5 : id.includes("ceiling") ? 4 : 3;
      for (let blade = 0; blade < bladeCount; blade += 1) {
        const radians = PhaserRuntime.Math.DegToRad(
          (blade * 360) / bladeCount + state.tick * (reducedMotion ? 0 : id.includes("quiet") ? 1.4 : 3.2),
        );
        const bladeX = bounds.centreX + Math.cos(radians) * radius * 0.54;
        const bladeY = bounds.centreY - 2 + Math.sin(radians) * radius * 0.54;
        graphics.fillStyle(recipe.accent, 0.95);
        graphics.fillEllipse(
          bladeX,
          bladeY,
          radius * (id.includes("ceiling") ? 1.25 : 0.9),
          radius * (id.includes("quiet") ? 0.26 : 0.34),
        );
      }
      graphics.fillStyle(0x294d42, 1);
      graphics.fillCircle(bounds.centreX, bounds.centreY - 2, 5);
      if (!id.includes("ceiling")) {
        graphics.lineStyle(1.2, 0x6f817c, 0.6);
        graphics.strokeCircle(bounds.centreX, bounds.centreY - 2, radius * 0.68);
        const spokeCount = qualityMode === "standard" ? 8 : 4;
        for (let spoke = 0; spoke < spokeCount; spoke += 1) {
          const radians = (spoke / spokeCount) * Math.PI * 2;
          graphics.lineBetween(
            bounds.centreX + Math.cos(radians) * 6,
            bounds.centreY - 2 + Math.sin(radians) * 6,
            bounds.centreX + Math.cos(radians) * (radius + 3),
            bounds.centreY - 2 + Math.sin(radians) * (radius + 3),
          );
        }
      }
    }
    drawMakerMark(graphics, bounds, recipe);
  }

  function drawPlantGraphic(
    graphics: Phaser.GameObjects.Graphics,
    id: string,
    bounds: ObjectVisualBounds,
    recipe: PlaceableVisualRecipe,
  ) {
    drawObjectShadow(graphics, bounds, id.includes("pot") || id.includes("table-herb"));
    const leafDark = id.includes("rain-garden") ? 0x33706a : 0x376f46;
    const leafLight = mixColour(recipe.accent, 0x58a55f, 0.7);
    const baseY = bounds.maxY - (id.includes("border-bed") || id.includes("trough") ? 19 : 23);

    if (id.includes("trellis")) {
      graphics.lineStyle(3, 0x8b5b4c, 1);
      for (let column = 0; column < 3; column += 1) {
        const x = bounds.minX + 10 + column * ((bounds.width - 20) / 2);
        graphics.lineBetween(x, bounds.minY + 7, x, bounds.maxY - 8);
      }
      graphics.lineBetween(bounds.minX + 8, bounds.centreY, bounds.maxX - 8, bounds.centreY);
      graphics.lineStyle(2.5, leafDark, 1);
      for (let vine = 0; vine < 3; vine += 1) {
        const vineX = bounds.minX + 12 + vine * ((bounds.width - 24) / 2);
        graphics.lineBetween(vineX, bounds.maxY - 10, vineX + (vine % 2 ? 8 : -7), bounds.minY + 10);
        for (let node = 0; node < 4; node += 1) {
          const nodeY = bounds.maxY - 17 - node * ((bounds.height - 26) / 4);
          graphics.fillStyle(node % 2 === 0 ? leafLight : leafDark, 1);
          graphics.fillEllipse(vineX + (node % 2 ? 5 : -5), nodeY, 10, 6);
        }
      }
    }
    const potHeight = id.includes("border-bed") || id.includes("trough") ? 13 : 17;
    graphics.fillStyle(id.includes("rain-garden") ? 0x477c86 : id.includes("hanging") ? 0xc68a52 : 0x9a6844, 1);
    if (id.includes("hanging")) {
      graphics.fillEllipse(bounds.centreX, bounds.centreY - 1, bounds.width * 0.48, 14);
      graphics.fillRoundedRect(bounds.centreX - bounds.width * 0.18, bounds.centreY - 2, bounds.width * 0.36, 13, 5);
    } else {
      graphics.fillRoundedRect(bounds.minX + bounds.width * 0.18, bounds.maxY - potHeight - 5, bounds.width * 0.64, potHeight, 5);
      graphics.fillStyle(lighten(id.includes("rain-garden") ? 0x477c86 : 0x9a6844, 0.24), 0.9);
      graphics.fillRect(bounds.minX + bounds.width * 0.23, bounds.maxY - potHeight - 2, bounds.width * 0.54, 3);
    }

    if (id.includes("banana")) {
      graphics.lineStyle(4, 0x507242, 1);
      for (let leaf = 0; leaf < 6; leaf += 1) {
        const angle = -Math.PI * 0.84 + (leaf / 5) * Math.PI * 0.68;
        const length = 25 + (leaf % 2) * 5;
        const tipX = bounds.centreX + Math.cos(angle) * length;
        const tipY = baseY + Math.sin(angle) * length;
        graphics.lineBetween(bounds.centreX, baseY, tipX, tipY);
        graphics.fillStyle(leaf % 2 === 0 ? leafLight : leafDark, 1);
        graphics.fillEllipse(
          bounds.centreX + Math.cos(angle) * length * 0.62,
          baseY + Math.sin(angle) * length * 0.62,
          20,
          8,
        );
        graphics.lineStyle(2, 0xd5b154, 1);
        graphics.lineBetween(bounds.centreX, baseY, bounds.centreX, baseY - 18);
      }
    } else if (id.includes("areca")) {
      for (let frond = 0; frond < 7; frond += 1) {
        const angle = -Math.PI * 0.9 + (frond / 6) * Math.PI * 0.8;
        const length = 24 + (frond % 3) * 4;
        const tipX = bounds.centreX + Math.cos(angle) * length;
        const tipY = baseY + Math.sin(angle) * length;
        graphics.lineStyle(2.5, 0x3b6f45, 1);
        graphics.lineBetween(bounds.centreX, baseY, tipX, tipY);
        for (let leaflet = 1; leaflet <= 3; leaflet += 1) {
          const fraction = leaflet / 4;
          const stemX = bounds.centreX + (tipX - bounds.centreX) * fraction;
          const stemY = baseY + (tipY - baseY) * fraction;
          graphics.fillStyle((frond + leaflet) % 2 ? leafLight : leafDark, 1);
          graphics.fillEllipse(stemX + (leaflet % 2 ? 4 : -4), stemY, 10, 4);
        }
      }
    } else if (id.includes("pandan")) {
      for (let leaf = 0; leaf < 10; leaf += 1) {
        const leafX = bounds.minX + 8 + leaf * ((bounds.width - 16) / 9);
        graphics.fillStyle(leaf % 2 === 0 ? leafDark : leafLight, 1);
        graphics.fillTriangle(leafX - 3, baseY + 3, leafX + 3, baseY + 3, leafX + (leaf % 2 ? 7 : -7), bounds.minY + 7 + (leaf % 3) * 4);
      }
    } else if (id.includes("fern") || id.includes("trough")) {
      for (let frond = 0; frond < 8; frond += 1) {
        const frondX = bounds.minX + 9 + frond * ((bounds.width - 18) / 7);
        const sway = (frond % 3 - 1) * 8;
        graphics.lineStyle(2, leafDark, 1);
        graphics.lineBetween(frondX, baseY, frondX + sway, bounds.minY + 10 + (frond % 2) * 5);
        for (let leaflet = 0; leaflet < 3; leaflet += 1) {
          graphics.fillStyle((frond + leaflet) % 2 ? leafLight : leafDark, 1);
          graphics.fillEllipse(frondX + sway * (leaflet + 1) / 4 + (leaflet % 2 ? 4 : -4), baseY - 5 - leaflet * 5, 8, 4);
        }
      }
    } else if (id.includes("rain-garden")) {
      graphics.fillStyle(0x76b5bd, 0.8);
      graphics.fillEllipse(bounds.centreX, baseY + 3, bounds.width * 0.45, 10);
      for (let reed = 0; reed < 5; reed += 1) {
        const reedX = bounds.centreX - 14 + reed * 7;
        graphics.lineStyle(2.5, reed % 2 ? leafLight : leafDark, 1);
        graphics.lineBetween(reedX, baseY + 1, reedX + (reed % 2 ? 3 : -3), bounds.minY + 9 + (reed % 3) * 4);
        graphics.fillStyle(0xb7894d, 1);
        graphics.fillEllipse(reedX + (reed % 2 ? 3 : -3), bounds.minY + 9 + (reed % 3) * 4, 4, 7);
      }
    } else if (id.includes("hanging")) {
      for (let vine = 0; vine < 5; vine += 1) {
        const vineX = bounds.centreX - 14 + vine * 7;
        const vineLength = 14 + (vine % 3) * 7;
        graphics.lineStyle(2, leafDark, 1);
        graphics.lineBetween(vineX, bounds.centreY + 4, vineX + (vine % 2 ? 5 : -4), bounds.centreY + vineLength);
        for (let leaf = 0; leaf < 2; leaf += 1) {
          graphics.fillStyle((vine + leaf) % 2 ? leafLight : leafDark, 1);
          graphics.fillEllipse(vineX + (leaf ? 4 : -3), bounds.centreY + 10 + leaf * 7, 9, 6);
        }
      }
    } else if (!id.includes("trellis")) {
      const leafCount = id.includes("herb") ? 7 : 5;
      for (let leaf = 0; leaf < leafCount; leaf += 1) {
        const angle = -Math.PI * 0.9 + (leaf / Math.max(1, leafCount - 1)) * Math.PI * 0.8;
        const length = id.includes("herb") ? 12 : 19;
        const tipX = bounds.centreX + Math.cos(angle) * length;
        const tipY = baseY + Math.sin(angle) * length;
        graphics.lineStyle(2.5, leafDark, 1);
        graphics.lineBetween(bounds.centreX, baseY, tipX, tipY);
        graphics.fillStyle(leaf % 2 === 0 ? leafLight : leafDark, 1);
        graphics.fillEllipse(tipX, tipY, id.includes("herb") ? 8 : 12, id.includes("herb") ? 6 : 7);
      }
    }
    if (id.includes("hanging")) {
      graphics.lineStyle(2, 0x6b4c32, 1);
      graphics.lineBetween(bounds.centreX - 9, bounds.minY + 3, bounds.centreX - 5, bounds.centreY);
      graphics.lineBetween(bounds.centreX + 9, bounds.minY + 3, bounds.centreX + 5, bounds.centreY);
    }
    drawMakerMark(graphics, bounds, recipe);
  }

  function drawSignageGraphic(
    scene: HawkerScene,
    graphics: Phaser.GameObjects.Graphics,
    id: string,
    bounds: ObjectVisualBounds,
    recipe: PlaceableVisualRecipe,
  ) {
    drawObjectShadow(graphics, bounds);
    graphics.fillStyle(0x6b4c32, 1);
    graphics.fillRect(bounds.centreX - 3, bounds.centreY, 6, bounds.height * 0.35);
    graphics.fillStyle(recipe.accent, 1);
    const isBoard = id.includes("directory") || id.includes("menu-preview") || id.includes("identity");
    if (isBoard) {
      graphics.fillRoundedRect(bounds.minX + 5, bounds.minY + 5, bounds.width - 10, bounds.height * 0.58, 5);
      graphics.fillStyle(0xfff4d8, 1);
      for (let row = 0; row < 3; row += 1) graphics.fillRect(bounds.minX + 12, bounds.minY + 13 + row * 8, bounds.width - 24, 3);
    } else {
      graphics.fillRoundedRect(bounds.minX + 7, bounds.minY + 8, bounds.width - 14, bounds.height * 0.45, 5);
      graphics.fillStyle(0xfff4d8, 1);
      if (id.includes("arrow")) {
        graphics.fillTriangle(bounds.maxX - 13, bounds.minY + 18, bounds.maxX - 24, bounds.minY + 10, bounds.maxX - 24, bounds.minY + 26);
        graphics.fillRect(bounds.minX + 13, bounds.minY + 15, bounds.width - 34, 6);
      } else if (id.includes("accessible")) {
        graphics.strokeCircle(bounds.centreX, bounds.minY + 18, 7);
        graphics.lineBetween(bounds.centreX, bounds.minY + 25, bounds.centreX + 8, bounds.minY + 30);
      } else if (id.includes("queue")) {
        for (let dot = 0; dot < 3; dot += 1) graphics.fillCircle(bounds.centreX - 10 + dot * 10, bounds.minY + 19, 3);
      } else {
        graphics.fillRect(bounds.centreX - 12, bounds.minY + 14, 24, 7);
      }
    }
    const shortLabel = id.includes("directory")
      ? "DIRECTORY"
      : id.includes("menu")
        ? "MENU"
        : id.includes("return")
          ? "RETURN →"
          : id.includes("accessible")
            ? "ACCESS"
            : id.includes("queue")
              ? "QUEUE"
              : id.includes("row")
                ? "ROW"
                : "WELCOME";
    scene.addLabel(bounds.centreX, bounds.minY + 5, shortLabel);
    drawMakerMark(graphics, bounds, recipe);
  }

  function drawDividerGraphic(
    graphics: Phaser.GameObjects.Graphics,
    id: string,
    bounds: ObjectVisualBounds,
    recipe: PlaceableVisualRecipe,
  ) {
    drawObjectShadow(graphics, bounds);
    if (id.includes("queue-rail")) {
      graphics.fillStyle(0x294d42, 1);
      graphics.fillCircle(bounds.minX + 9, bounds.centreY, 6);
      graphics.fillCircle(bounds.maxX - 9, bounds.centreY, 6);
      graphics.lineStyle(5, recipe.accent, 1);
      graphics.lineBetween(bounds.minX + 10, bounds.centreY - 3, bounds.maxX - 10, bounds.centreY - 3);
    } else if (id.includes("clear-wind")) {
      graphics.fillStyle(0xb9e2e8, 0.48);
      graphics.fillRoundedRect(bounds.minX + 5, bounds.minY + 7, bounds.width - 10, bounds.height - 14, 3);
      graphics.lineStyle(3, 0x477c86, 0.9);
      graphics.strokeRoundedRect(bounds.minX + 5, bounds.minY + 7, bounds.width - 10, bounds.height - 14, 3);
    } else if (id.includes("planter")) {
      graphics.fillStyle(0x8b5b4c, 1);
      graphics.fillRoundedRect(bounds.minX + 5, bounds.centreY, bounds.width - 10, bounds.height * 0.35, 4);
      for (let leaf = 0; leaf < 6; leaf += 1) {
        graphics.lineStyle(5, leaf % 2 ? 0x4d8753 : recipe.accent, 1);
        const x = bounds.minX + 9 + leaf * ((bounds.width - 18) / 5);
        graphics.lineBetween(x, bounds.centreY, x + (leaf % 2 ? 6 : -6), bounds.minY + 8);
      }
    } else {
      graphics.fillStyle(id.includes("tiled") ? 0x6fa5a6 : id.includes("acoustic") ? 0x7b669b : recipe.accent, 1);
      graphics.fillRoundedRect(bounds.minX + 4, bounds.minY + (id.includes("half-wall") ? bounds.height * 0.35 : 7), bounds.width - 8, id.includes("half-wall") ? bounds.height * 0.5 : bounds.height - 14, 4);
      graphics.lineStyle(2, 0xfff4d8, 0.55);
      const divisions = 2 + recipe.detailVariant % 4;
      for (let index = 1; index < divisions; index += 1) {
        const x = bounds.minX + (bounds.width * index) / divisions;
        graphics.lineBetween(x, bounds.minY + 10, x, bounds.maxY - 10);
      }
    }
    drawMakerMark(graphics, bounds, recipe);
  }

  function drawFacilityGraphic(
    graphics: Phaser.GameObjects.Graphics,
    id: string,
    bounds: ObjectVisualBounds,
    recipe: PlaceableVisualRecipe,
  ) {
    drawObjectShadow(graphics, bounds);
    const x = bounds.minX + 6;
    const y = bounds.minY + 6;
    const width = bounds.width - 12;
    const height = bounds.height - 14;
    const frame = 0x40544f;

    if (id.includes("handwash")) {
      graphics.fillStyle(0x647c76, 1);
      graphics.fillRoundedRect(x, y + 9, width, height - 9, 6);
      graphics.fillStyle(0xe0e7e2, 1);
      graphics.fillRoundedRect(x - 2, y + 6, width + 4, 15, 5);
      const basinCount = bounds.width > TILE_SIZE ? 2 : 1;
      for (let basin = 0; basin < basinCount; basin += 1) {
        const basinX = x + ((basin + 0.5) * width) / basinCount;
        graphics.fillStyle(0xaec5c1, 1);
        graphics.fillEllipse(basinX, y + 14, Math.min(25, width / basinCount - 7), 8);
        graphics.lineStyle(3, frame, 1);
        graphics.lineBetween(basinX, y + 4, basinX, y + 9);
        graphics.lineBetween(basinX, y + 9, basinX + 5, y + 9);
      }
      graphics.fillStyle(0x65a48e, 1);
      graphics.fillRoundedRect(bounds.maxX - 15, y + 2, 7, 12, 2);
      graphics.fillStyle(0xe9eee9, 1);
      graphics.fillRect(bounds.maxX - 13, y, 3, 4);
    } else if (id.includes("mop-sink")) {
      graphics.fillStyle(0x8e9c98, 1);
      graphics.fillRoundedRect(x + 4, bounds.centreY - 2, width - 8, height * 0.5, 4);
      graphics.fillStyle(0xd8dfdc, 1);
      graphics.fillRoundedRect(x + 7, bounds.centreY, width - 14, height * 0.35, 3);
      graphics.fillStyle(0x7fb2bd, 0.85);
      graphics.fillEllipse(bounds.centreX, bounds.centreY + 4, width - 20, 8);
      graphics.lineStyle(3, 0x8a6241, 1);
      graphics.lineBetween(bounds.centreX + 12, y - 3, bounds.centreX + 2, bounds.maxY - 9);
      graphics.fillStyle(0x4e8a54, 1);
      for (let strand = 0; strand < 4; strand += 1) {
        graphics.lineStyle(2, 0x4e8a54, 1);
        graphics.lineBetween(bounds.centreX - 3 + strand * 2, bounds.maxY - 16, bounds.centreX - 7 + strand * 4, bounds.maxY - 7);
      }
      graphics.fillStyle(frame, 1);
      graphics.fillRoundedRect(bounds.maxX - 19, y + 3, 10, 15, 3);
      graphics.lineStyle(2, frame, 1);
      graphics.lineBetween(bounds.maxX - 14, y + 3, bounds.maxX - 14, y - 2);
    } else if (id.includes("accessible") && id.includes("basin")) {
      graphics.fillStyle(0xe1e8e5, 1);
      graphics.fillRoundedRect(x + 1, y + 6, width - 2, 18, 7);
      graphics.fillStyle(0xaec5c1, 1);
      graphics.fillEllipse(bounds.centreX, y + 14, width - 16, 9);
      graphics.lineStyle(4, 0x4d7390, 1);
      graphics.lineBetween(x + 2, y + 1, x + 2, y + 27);
      graphics.lineBetween(x + 2, y + 1, x + 18, y + 1);
      graphics.lineStyle(3, frame, 1);
      graphics.lineBetween(bounds.centreX, y, bounds.centreX, y + 8);
      graphics.lineBetween(bounds.centreX, y + 8, bounds.centreX + 7, y + 8);
      graphics.lineStyle(2.5, 0x4d7390, 1);
      graphics.strokeCircle(bounds.centreX, bounds.maxY - 13, 6);
      graphics.lineBetween(bounds.centreX, bounds.maxY - 7, bounds.centreX + 7, bounds.maxY - 3);
    } else if (id.includes("fountain")) {
      graphics.fillStyle(0x718681, 1);
      graphics.fillRoundedRect(x + 5, y + 7, width - 10, height - 8, 7);
      graphics.fillStyle(0xdce8e4, 1);
      graphics.fillEllipse(bounds.centreX, y + 12, width - 17, 12);
      graphics.fillStyle(0x9db5b0, 1);
      graphics.fillEllipse(bounds.centreX, y + 12, width - 24, 7);
      graphics.lineStyle(3, frame, 1);
      graphics.lineBetween(bounds.centreX + 6, y + 3, bounds.centreX + 6, y + 10);
      graphics.lineBetween(bounds.centreX + 6, y + 3, bounds.centreX + 12, y + 3);
      graphics.fillStyle(0x70bfd0, 1);
      graphics.fillCircle(bounds.centreX + 12, y + 6, 2.5);
    } else if (id.includes("first-aid")) {
      graphics.fillStyle(0xf2f0e6, 1);
      graphics.fillRoundedRect(x + 3, y, width - 6, height, 5);
      graphics.lineStyle(2.5, 0x8f9e98, 1);
      graphics.strokeRoundedRect(x + 3, y, width - 6, height, 5);
      graphics.fillStyle(0xc75542, 1);
      graphics.fillRect(bounds.centreX - 4, bounds.centreY - 14, 8, 28);
      graphics.fillRect(bounds.centreX - 14, bounds.centreY - 4, 28, 8);
    } else if (id.includes("cupboard")) {
      graphics.fillStyle(0x6e817c, 1);
      graphics.fillRoundedRect(x, y, width, height, 5);
      graphics.fillStyle(0x859792, 1);
      graphics.fillRoundedRect(x + 4, y + 4, width - 8, height - 8, 3);
      graphics.lineStyle(3, 0x294d42, 1);
      graphics.lineBetween(bounds.centreX, bounds.minY + 8, bounds.centreX, bounds.maxY - 10);
      graphics.fillStyle(0xf4c65a, 1);
      graphics.fillCircle(bounds.centreX - 5, bounds.centreY, 2.5);
      graphics.fillCircle(bounds.centreX + 5, bounds.centreY, 2.5);
      graphics.fillStyle(0xf0eee2, 1);
      graphics.fillRoundedRect(x + 7, y + 7, width - 14, 7, 2);
      graphics.fillStyle(recipe.accent, 1);
      for (let stripe = 0; stripe < 3; stripe += 1) {
        graphics.fillRect(x + 10 + stripe * ((width - 20) / 3), y + 9, 5, 2);
      }
    } else {
      graphics.fillStyle(0x667a74, 1);
      graphics.fillRoundedRect(x, y, width, height, 6);
      graphics.lineStyle(3, frame, 0.82);
      graphics.strokeRoundedRect(x, y, width, height, 6);
      graphics.fillStyle(recipe.accent, 1);
      graphics.fillRoundedRect(bounds.centreX - 11, bounds.centreY - 13, 22, 26, 4);
      graphics.fillStyle(0xf1ce55, 1);
      graphics.fillTriangle(bounds.centreX, bounds.centreY - 9, bounds.centreX - 8, bounds.centreY + 7, bounds.centreX + 8, bounds.centreY + 7);
      graphics.fillStyle(frame, 1);
      graphics.fillRect(bounds.centreX - 1.5, bounds.centreY - 3, 3, 6);
      graphics.fillCircle(bounds.centreX, bounds.centreY + 5, 1.6);
    }
    drawMakerMark(graphics, bounds, recipe);
  }

  function drawDecorGraphic(
    graphics: Phaser.GameObjects.Graphics,
    id: string,
    bounds: ObjectVisualBounds,
    recipe: PlaceableVisualRecipe,
  ) {
    if (id.includes("bunting")) {
      graphics.lineStyle(2, 0x6b4c32, 1);
      graphics.lineBetween(bounds.minX + 4, bounds.minY + 8, bounds.maxX - 4, bounds.minY + 13);
      for (let index = 0; index < 5; index += 1) {
        graphics.fillStyle(index % 2 ? recipe.accent : 0xf4c65a, 1);
        const x = bounds.minX + 7 + index * ((bounds.width - 14) / 4);
        const lineY = bounds.minY + 8 + index * 1.25;
        graphics.fillTriangle(x - 5, lineY, x + 5, lineY, x, lineY + 14 + (index % 2) * 3);
        graphics.lineStyle(1, lighten(index % 2 ? recipe.accent : 0xf4c65a, 0.38), 0.85);
        graphics.lineBetween(x - 3, lineY + 2, x, lineY + 10);
      }
    } else if (id.includes("flower-vase")) {
      graphics.fillStyle(0x477c86, 1);
      graphics.fillEllipse(bounds.centreX, bounds.centreY + 8, 15, 18);
      graphics.fillStyle(0x73a9b0, 0.9);
      graphics.fillEllipse(bounds.centreX - 2, bounds.centreY + 4, 5, 10);
      graphics.lineStyle(1.5, 0x4d8753, 1);
      for (let index = 0; index < 5; index += 1) {
        const angle = (index / 5) * Math.PI * 2;
        graphics.lineBetween(bounds.centreX, bounds.centreY + 1, bounds.centreX + Math.cos(angle) * 9, bounds.centreY - 7 + Math.sin(angle) * 7);
        graphics.fillStyle(index % 2 ? 0xf4c65a : recipe.accent, 1);
        const flowerX = bounds.centreX + Math.cos(angle) * 9;
        const flowerY = bounds.centreY - 7 + Math.sin(angle) * 7;
        for (let petal = 0; petal < 4; petal += 1) {
          const petalAngle = (petal / 4) * Math.PI * 2;
          graphics.fillEllipse(flowerX + Math.cos(petalAngle) * 2.6, flowerY + Math.sin(petalAngle) * 2.6, 4.5, 3);
        }
        graphics.fillStyle(0x83512f, 1);
        graphics.fillCircle(flowerX, flowerY, 1.6);
      }
    } else if (id.includes("clock")) {
      drawObjectShadow(graphics, bounds, true);
      graphics.fillStyle(0x8c633f, 1);
      graphics.fillCircle(bounds.centreX, bounds.centreY, Math.min(bounds.width, bounds.height) * 0.38);
      graphics.fillStyle(0xfff4d8, 1);
      graphics.fillCircle(bounds.centreX, bounds.centreY, Math.min(bounds.width, bounds.height) * 0.32);
      graphics.lineStyle(3, recipe.accent, 1);
      graphics.strokeCircle(bounds.centreX, bounds.centreY, Math.min(bounds.width, bounds.height) * 0.32);
      for (let marker = 0; marker < 12; marker += 1) {
        const radians = (marker / 12) * Math.PI * 2;
        graphics.fillStyle(0x5c4737, 1);
        graphics.fillCircle(bounds.centreX + Math.cos(radians) * 11, bounds.centreY + Math.sin(radians) * 11, marker % 3 === 0 ? 1.6 : 1);
      }
      graphics.lineBetween(bounds.centreX, bounds.centreY, bounds.centreX, bounds.centreY - 10);
      graphics.lineBetween(bounds.centreX, bounds.centreY, bounds.centreX + 8, bounds.centreY + 4);
    } else {
      drawObjectShadow(graphics, bounds);
      graphics.fillStyle(id.includes("noticeboard") ? 0x8b5b4c : recipe.accent, 1);
      graphics.fillRoundedRect(bounds.minX + 5, bounds.minY + 6, bounds.width - 10, bounds.height - 15, 5);
      if (id.includes("mural")) {
        const tileColours = [0xfff4d8, 0xf4c65a, 0x4d7390, 0xc8624c] as const;
        for (let row = 0; row < 3; row += 1) {
          for (let column = 0; column < 5; column += 1) {
            const tileX = bounds.minX + 10 + column * ((bounds.width - 20) / 5);
            const tileY = bounds.minY + 10 + row * ((bounds.height - 22) / 3);
            graphics.fillStyle(tileColours[(row + column) % tileColours.length] as number, 0.95);
            graphics.fillTriangle(tileX, tileY, tileX + 7, tileY, tileX + (column % 2 ? 0 : 7), tileY + 7);
          }
        }
      } else {
        const paperColours = [0xfff4d8, 0xf4c65a, 0xc9e0dc, 0xf2cfca] as const;
        for (let index = 0; index < 5; index += 1) {
          const paperX = bounds.minX + 10 + (index % 3) * ((bounds.width - 22) / 3);
          const paperY = bounds.minY + 11 + Math.floor(index / 3) * 14;
          graphics.fillStyle(paperColours[index % paperColours.length] as number, 1);
          graphics.fillRoundedRect(paperX, paperY, 10 + (index % 2) * 3, 9, 1);
          graphics.fillStyle(0xc75b43, 1);
          graphics.fillCircle(paperX + 4, paperY + 2, 1.2);
        }
      }
      graphics.lineStyle(2.5, 0x5f452f, 0.88);
      graphics.strokeRoundedRect(bounds.minX + 5, bounds.minY + 6, bounds.width - 10, bounds.height - 15, 5);
    }
    if (!id.includes("bunting") && !id.includes("flower-vase") && !id.includes("clock")) {
      drawMakerMark(graphics, bounds, recipe);
    }
  }

  function drawObjects(
    scene: HawkerScene,
    graphics: Phaser.GameObjects.Graphics,
    snapshot: GameSnapshot,
  ) {
    const ordered = [...snapshot.objects].sort(
      (a, b) => a.origin.y - b.origin.y || a.origin.x - b.origin.x,
    );
    for (const object of ordered) {
      const definition = catalog.placeables[object.definitionId];
      const visual = visuals[object.definitionId] ?? {
        category: "facility" as const,
        name: object.definitionId,
        palette: ["#7f958c"],
      };
      const bounds = boundsForObject(object);
      if (!definition || !bounds) continue;

      if (visual.category === "stall") {
        drawStallGraphic(scene, graphics, object, bounds, visual, snapshot);
      } else {
        const recipe = visualRecipeForPlaceable(
          object.definitionId,
          visual.category,
          CONTENT_PLACEABLE_BY_ID.get(object.definitionId)?.tags,
        );
        if (visual.category === "table") drawTableGraphic(graphics, recipe.motif, bounds, recipe);
        else if (visual.category === "seat") drawSeatGraphic(graphics, recipe.motif, bounds, recipe);
        else if (visual.category === "stall-fixture") drawFixtureGraphic(graphics, recipe.motif, bounds, recipe);
        else if (visual.category === "tray-waste") drawTrayWasteGraphic(scene, graphics, recipe.motif, bounds, recipe);
        else if (visual.category === "lighting") drawLightingGraphic(graphics, recipe.motif, bounds, recipe);
        else if (visual.category === "fan") drawFanGraphic(graphics, recipe.motif, bounds, recipe);
        else if (visual.category === "plant") drawPlantGraphic(graphics, recipe.motif, bounds, recipe);
        else if (visual.category === "signage") drawSignageGraphic(scene, graphics, recipe.motif, bounds, recipe);
        else if (visual.category === "divider") drawDividerGraphic(graphics, recipe.motif, bounds, recipe);
        else if (visual.category === "facility") drawFacilityGraphic(graphics, recipe.motif, bounds, recipe);
        else drawDecorGraphic(graphics, recipe.motif, bounds, recipe);
      }

      if (selectedObjectId === object.id) {
        graphics.lineStyle(4, 0x287ec0, 1);
        graphics.strokeRoundedRect(bounds.minX + 1, bounds.minY + 1, bounds.width - 2, bounds.height - 2, 6);
        graphics.fillStyle(0xffffff, 1);
        graphics.fillCircle(bounds.maxX - 4, bounds.minY + 4, 7);
        graphics.lineStyle(2, 0x287ec0, 1);
        graphics.strokeCircle(bounds.maxX - 4, bounds.minY + 4, 7);
      }
    }
  }

  function drawRiceMound(
    graphics: Phaser.GameObjects.Graphics,
    x: number,
    y: number,
    scale: number,
    colourValue: number,
    remaining: number,
  ) {
    graphics.fillStyle(colourValue, 1);
    graphics.fillEllipse(x, y, 12 * scale * remaining, 9 * scale * remaining);
    graphics.fillStyle(lighten(colourValue, 0.35), 0.9);
    const grainCount = qualityMode === "standard" ? 4 : 2;
    for (let grain = 0; grain < grainCount; grain += 1) {
      const grainX = x + (grain - (grainCount - 1) / 2) * 2.2 * scale * remaining;
      graphics.fillEllipse(grainX, y - (grain % 2) * 2 * scale, 2.4 * scale, 1.1 * scale);
    }
  }

  function drawNoodleStrands(
    graphics: Phaser.GameObjects.Graphics,
    x: number,
    y: number,
    scale: number,
    colourValue: number,
    remaining: number,
    dark = false,
  ) {
    graphics.fillStyle(dark ? darken(colourValue, 0.28) : colourValue, 0.88);
    graphics.fillEllipse(x, y, 18 * scale * remaining, 10 * scale * remaining);
    graphics.lineStyle(Math.max(1, 1.35 * scale), lighten(colourValue, dark ? 0.28 : 0.42), 1);
    const strandCount = qualityMode === "standard" ? 5 : 3;
    for (let strand = 0; strand < strandCount; strand += 1) {
      const offset = (strand - (strandCount - 1) / 2) * 2.7 * scale * remaining;
      graphics.lineBetween(
        x - 7 * scale * remaining,
        y + offset * 0.35,
        x + 7 * scale * remaining,
        y - offset * 0.28,
      );
    }
  }

  function drawDishMotif(
    graphics: Phaser.GameObjects.Graphics,
    dishId: string,
    recipe: ReturnType<typeof visualRecipeForDish>,
    x: number,
    y: number,
    scale: number,
    remaining: number,
  ) {
    const portion = recipe.portionColour;
    const garnish = recipe.garnishColour;
    const small = Math.max(1.1, 1.7 * scale);
    const has = (...parts: readonly string[]) => parts.some((part) => dishId.includes(part));

    if (has("poached-chicken-rice", "roast-chicken-rice", "soya-tofu-rice")) {
      drawRiceMound(graphics, x - 4 * scale, y, scale, 0xf0e2be, remaining);
      if (has("soya-tofu")) {
        graphics.fillStyle(0xd7a468, 1);
        for (let cube = 0; cube < 3; cube += 1) {
          graphics.fillRoundedRect(x + (2 + cube * 3) * scale, y + (cube % 2 ? -4 : 0) * scale, 4 * scale * remaining, 4 * scale * remaining, scale);
        }
      } else {
        const chicken = has("roast") ? 0xa95736 : 0xe5c8a0;
        graphics.fillStyle(chicken, 1);
        for (let slice = 0; slice < 3; slice += 1) {
          graphics.fillEllipse(x + (2 + slice * 3) * scale, y + (slice - 1) * 2 * scale, 6 * scale * remaining, 3 * scale * remaining);
        }
      }
      graphics.fillStyle(0x61a05a, 1);
      graphics.fillCircle(x + 7 * scale, y - 5 * scale, 2.4 * scale);
      graphics.fillCircle(x + 10 * scale, y - 2 * scale, 2.4 * scale);
    } else if (has("nasi-lemak")) {
      drawRiceMound(graphics, x - 4 * scale, y - scale, scale, 0xf2e8ce, remaining);
      graphics.fillStyle(0xb73d2f, 1);
      graphics.fillEllipse(x + 5 * scale, y + 3 * scale, 7 * scale, 4 * scale);
      graphics.fillStyle(0xf8f1d4, 1);
      graphics.fillEllipse(x + 4 * scale, y - 4 * scale, 8 * scale, 6 * scale);
      graphics.fillStyle(0xe5a92e, 1);
      graphics.fillCircle(x + 4 * scale, y - 4 * scale, 2.2 * scale);
      graphics.lineStyle(Math.max(1, scale), 0x4d7e4f, 1);
      graphics.lineBetween(x - 10 * scale, y + 4 * scale, x - 5 * scale, y - 6 * scale);
    } else if (has("nasi-briyani", "lemon-rice")) {
      drawRiceMound(graphics, x - 2 * scale, y, scale, has("lemon") ? 0xe4bf4d : portion, remaining);
      if (has("briyani")) {
        graphics.fillStyle(0x985039, 1);
        graphics.fillEllipse(x + 6 * scale, y - 2 * scale, 8 * scale, 5 * scale);
        graphics.fillCircle(x + 10 * scale, y + scale, 2.5 * scale);
      } else {
        graphics.fillStyle(0x3f804b, 1);
        graphics.fillEllipse(x + 5 * scale, y - 3 * scale, 5 * scale, 2.5 * scale);
        graphics.fillCircle(x + 8 * scale, y + 3 * scale, 1.7 * scale);
      }
    } else if (has("lotus-leaf-rice")) {
      graphics.fillStyle(0x466d46, 1);
      graphics.fillEllipse(x, y, 21 * scale, 14 * scale);
      graphics.lineStyle(Math.max(1, 1.2 * scale), 0x93ab68, 1);
      graphics.lineBetween(x - 9 * scale, y, x + 9 * scale, y);
      graphics.lineBetween(x, y - 6 * scale, x, y + 6 * scale);
      graphics.fillStyle(0xc99658, 1);
      graphics.fillEllipse(x, y, 8 * scale * remaining, 6 * scale * remaining);
    } else if (has("chicken-congee", "tau-huay", "pulut-hitam")) {
      const base = has("pulut") ? 0x493044 : has("tau-huay") ? 0xf3e2b7 : 0xeee2c6;
      graphics.fillStyle(base, 1);
      graphics.fillEllipse(x, y, 17 * scale * remaining, 9 * scale * remaining);
      if (has("tau-huay")) {
        graphics.lineStyle(Math.max(1, scale), 0xc69a52, 0.9);
        graphics.lineBetween(x - 6 * scale, y - scale, x + 6 * scale, y + scale);
      } else {
        graphics.fillStyle(has("pulut") ? 0xe5d1c0 : 0x4c8d50, 1);
        for (let dot = 0; dot < 4; dot += 1) {
          graphics.fillCircle(x - 5 * scale + dot * 3.2 * scale, y + (dot % 2 ? 2 : -2) * scale, small * 0.65);
        }
      }
    } else if (has("mee-rebus", "char-kway-teow", "hokkien-prawn-mee", "mee-goreng", "nyonya-laksa", "bak-chor-mee", "fishball-mee-pok", "lor-mee")) {
      const darkNoodles = has("char-kway", "bak-chor");
      const noodleColour = has("mee-goreng")
        ? 0xc75b35
        : has("laksa")
          ? 0xd8753a
          : has("lor-mee")
            ? 0xc79a58
            : portion;
      if (has("lor-mee")) {
        graphics.fillStyle(0x65402f, 1);
        graphics.fillEllipse(x, y, 20 * scale * remaining, 12 * scale * remaining);
      }
      drawNoodleStrands(graphics, x, y, scale, noodleColour, remaining, darkNoodles);
      if (has("hokkien", "laksa")) {
        graphics.fillStyle(0xe47c62, 1);
        graphics.fillEllipse(x - 5 * scale, y - 3 * scale, 6 * scale, 3 * scale);
        graphics.lineStyle(Math.max(1, scale), 0xe47c62, 1);
        graphics.lineBetween(x - 8 * scale, y - 5 * scale, x - 4 * scale, y - 3 * scale);
      }
      if (has("fishball")) {
        graphics.fillStyle(0xf2e3c7, 1);
        graphics.fillCircle(x - 5 * scale, y - 3 * scale, 2.7 * scale);
        graphics.fillCircle(x + 4 * scale, y + 2 * scale, 2.7 * scale);
      }
      if (has("bak-chor")) {
        graphics.fillStyle(0x8e5239, 1);
        for (let mince = 0; mince < 4; mince += 1) {
          graphics.fillCircle(x - 5 * scale + mince * 3.2 * scale, y - 3 * scale + (mince % 2) * 5 * scale, 1.6 * scale);
        }
      }
      if (has("lor-mee")) {
        graphics.fillStyle(0xf3ead4, 1);
        graphics.fillEllipse(x - 5 * scale, y - 3 * scale, 7 * scale, 6 * scale);
        graphics.fillStyle(0xd79d32, 1);
        graphics.fillCircle(x - 5 * scale, y - 3 * scale, 1.8 * scale);
        graphics.fillStyle(0xe7c0a4, 1);
        graphics.fillRoundedRect(x + 2 * scale, y - 5 * scale, 6 * scale, 3 * scale, scale);
        graphics.fillRoundedRect(x + 4 * scale, y + scale, 6 * scale, 3 * scale, scale);
      }
      graphics.fillStyle(0x4e9252, 1);
      graphics.fillEllipse(x + 6 * scale, y - 4 * scale, 5 * scale, 2.5 * scale);
    } else if (has("soto-ayam", "lontong-sayur", "sliced-fish-soup", "teochew-fish-dumpling")) {
      graphics.fillStyle(has("soto", "fish-dumpling") ? 0xd6b16b : portion, 1);
      graphics.fillEllipse(x, y, 17 * scale * remaining, 9 * scale * remaining);
      if (has("lontong")) {
        for (let cube = 0; cube < 3; cube += 1) {
          graphics.fillStyle(cube % 2 === 0 ? 0xeee3c4 : 0x83a55d, 1);
          graphics.fillRoundedRect(x - 7 * scale + cube * 5 * scale, y - (cube % 2) * 3 * scale, 4 * scale, 4 * scale, scale);
        }
      } else if (has("sliced-fish")) {
        graphics.fillStyle(0xf1e5d0, 1);
        for (let slice = 0; slice < 3; slice += 1) {
          graphics.fillEllipse(x - 6 * scale + slice * 6 * scale, y + (slice % 2 ? -2 : 2) * scale, 7 * scale, 3 * scale);
        }
      } else if (has("dumpling")) {
        graphics.fillStyle(0xf0ddd0, 1);
        for (let dumpling = 0; dumpling < 3; dumpling += 1) {
          graphics.fillCircle(x - 6 * scale + dumpling * 6 * scale, y + (dumpling % 2) * 2 * scale, 3 * scale);
        }
      } else {
        graphics.fillStyle(0xe8d0a4, 1);
        for (let shred = 0; shred < 4; shred += 1) {
          graphics.fillEllipse(x - 6 * scale + shred * 4 * scale, y + (shred % 2 ? -2 : 2) * scale, 5 * scale, 2 * scale);
        }
      }
      graphics.fillStyle(0x4d8e52, 1);
      graphics.fillCircle(x + 3 * scale, y - 3 * scale, small);
    } else if (has("ice-kacang")) {
      graphics.fillStyle(0xf4eee3, 1);
      graphics.fillTriangle(x - 9 * scale, y + 6 * scale, x + 9 * scale, y + 6 * scale, x, y - 9 * scale * remaining);
      const syrupColours = [0xd94848, 0x55a05d, 0xe5a738] as const;
      for (let stripe = 0; stripe < 3; stripe += 1) {
        graphics.lineStyle(Math.max(1, 2.5 * scale), syrupColours[stripe] as number, 0.95);
        graphics.lineBetween(x - (5 - stripe * 2) * scale, y + 3 * scale, x + (stripe - 1) * 2 * scale, y - (6 - stripe * 2) * scale);
      }
    } else if (has("chendol")) {
      graphics.fillStyle(0xd8c59b, 1);
      graphics.fillEllipse(x, y, 17 * scale, 10 * scale);
      graphics.lineStyle(Math.max(1, 1.6 * scale), 0x3b8a4d, 1);
      for (let strand = 0; strand < 5; strand += 1) {
        graphics.lineBetween(x - 7 * scale + strand * 3.5 * scale, y - 4 * scale, x - 4 * scale + strand * 2.8 * scale, y + 4 * scale);
      }
      graphics.fillStyle(0x7d4b2f, 1);
      graphics.fillCircle(x + 6 * scale, y - 2 * scale, 2.5 * scale);
    } else if (has("kopi", "sugarcane", "teh-tarik")) {
      const drinkColour = has("sugarcane") ? 0xa8c75e : has("teh-tarik") ? 0xc48443 : 0x6b3e2a;
      graphics.fillStyle(drinkColour, 1);
      graphics.fillEllipse(x - 0.5 * scale, y - 5 * scale, 10 * scale, 4 * scale);
      if (has("sugarcane")) {
        graphics.fillStyle(0xe8f4d0, 0.8);
        graphics.fillCircle(x - 3 * scale, y - 5 * scale, 1.8 * scale);
        graphics.lineStyle(Math.max(1, 1.4 * scale), 0x4c8753, 1);
        graphics.lineBetween(x + 2 * scale, y - 6 * scale, x + 6 * scale, y - 14 * scale);
      } else if (has("teh-tarik")) {
        graphics.fillStyle(0xf0ddba, 1);
        graphics.fillEllipse(x - 0.5 * scale, y - 6 * scale, 9 * scale, 2.7 * scale);
      } else {
        graphics.fillStyle(0xe8d1a7, 0.9);
        graphics.fillCircle(x - 2 * scale, y - 6 * scale, 1.4 * scale);
      }
    } else if (has("roti-prata", "chicken-murtabak", "masala-thosai")) {
      if (has("thosai")) {
        graphics.fillStyle(0xd69a3d, 1);
        graphics.fillTriangle(x - 10 * scale, y + 5 * scale, x + 10 * scale, y + 4 * scale, x + 6 * scale, y - 5 * scale);
        graphics.fillStyle(0xf1c35a, 1);
        graphics.fillEllipse(x, y, 18 * scale, 5 * scale);
      } else {
        const filled = has("murtabak");
        graphics.fillStyle(filled ? 0xb9783b : 0xdca94d, 1);
        for (let piece = 0; piece < (filled ? 4 : 2); piece += 1) {
          const pieceX = x - (filled ? 6 : 5) * scale + (piece % 2) * 8 * scale;
          const pieceY = y - (piece > 1 ? -2 : 2) * scale;
          graphics.fillRoundedRect(pieceX, pieceY, 8 * scale, 6 * scale, scale);
          graphics.lineStyle(Math.max(1, scale), 0xf1d584, 0.9);
          graphics.lineBetween(pieceX + scale, pieceY + 2 * scale, pieceX + 7 * scale, pieceY + 2 * scale);
        }
      }
      graphics.fillStyle(0xb84b35, 1);
      graphics.fillCircle(x + 9 * scale, y - 5 * scale, 3.2 * scale);
    } else if (has("idli-sambar", "vadai-set")) {
      for (let piece = 0; piece < 3; piece += 1) {
        const pieceX = x - 6 * scale + piece * 6 * scale;
        const pieceY = y + (piece % 2 ? -3 : 2) * scale;
        graphics.fillStyle(has("idli") ? 0xf1ead7 : 0xa76a37, 1);
        graphics.fillCircle(pieceX, pieceY, 3.6 * scale);
        if (has("vadai")) {
          graphics.fillStyle(0x69452d, 1);
          graphics.fillCircle(pieceX, pieceY, 1.4 * scale);
        }
      }
      graphics.fillStyle(has("idli") ? 0xb95936 : 0x77a34e, 1);
      graphics.fillCircle(x + 8 * scale, y - 5 * scale, 3 * scale);
    } else if (has("fried-carrot-cake")) {
      for (let cube = 0; cube < 6; cube += 1) {
        graphics.fillStyle(cube % 3 === 0 ? 0x6a4030 : 0xe8d7ae, 1);
        graphics.fillRoundedRect(x - 8 * scale + (cube % 3) * 6 * scale, y - 5 * scale + Math.floor(cube / 3) * 6 * scale, 5 * scale * remaining, 5 * scale * remaining, scale);
      }
      graphics.fillStyle(0x4e8b4d, 1);
      graphics.fillCircle(x + 6 * scale, y - 4 * scale, small);
    } else if (has("oyster-omelette")) {
      graphics.fillStyle(0xe0a43f, 1);
      for (let fold = 0; fold < 4; fold += 1) {
        graphics.fillEllipse(x - 5 * scale + fold * 3.5 * scale, y + (fold % 2 ? -3 : 2) * scale, 9 * scale, 6 * scale);
      }
      graphics.fillStyle(0xb9b2a3, 1);
      graphics.fillEllipse(x - 4 * scale, y - 3 * scale, 5 * scale, 3 * scale);
      graphics.fillEllipse(x + 6 * scale, y + 2 * scale, 5 * scale, 3 * scale);
    } else if (has("chicken-satay", "beef-satay")) {
      const beef = has("beef");
      const meat = beef ? 0x63362b : 0xb85e34;
      for (let skewer = 0; skewer < 3; skewer += 1) {
        const skewerY = y - 4 * scale + skewer * 4 * scale;
        graphics.lineStyle(Math.max(1, scale), 0xcda66a, 1);
        graphics.lineBetween(x - 10 * scale, skewerY, x + 8 * scale, skewerY + 2 * scale);
        graphics.fillStyle(meat, 1);
        for (let piece = 0; piece < 3; piece += 1) {
          const pieceX = x - 5 * scale + piece * 5 * scale;
          const pieceY = skewerY + piece * 0.5 * scale;
          if (beef) {
            graphics.fillRoundedRect(pieceX - 2.4 * scale, pieceY - 2 * scale, 4.8 * scale, 4 * scale, 0.7 * scale);
            graphics.lineStyle(Math.max(0.8, scale), 0x38251f, 0.78);
            graphics.lineBetween(pieceX - 1.6 * scale, pieceY - 1.4 * scale, pieceX + 1.6 * scale, pieceY + 1.4 * scale);
          } else {
            graphics.fillEllipse(pieceX, pieceY, 5.2 * scale, 4 * scale);
            graphics.fillStyle(0xd78c4d, 0.82);
            graphics.fillCircle(pieceX - scale, pieceY - scale, scale);
            graphics.fillStyle(meat, 1);
          }
        }
      }
      graphics.fillStyle(0x9b642f, 1);
      graphics.fillCircle(x + 9 * scale, y - 5 * scale, 3 * scale);
    } else if (has("bbq-chicken-wings")) {
      graphics.fillStyle(0xa74f32, 1);
      for (let wing = 0; wing < 3; wing += 1) {
        const wingX = x - 6 * scale + wing * 6 * scale;
        graphics.fillEllipse(wingX, y + (wing % 2 ? -3 : 2) * scale, 8 * scale, 5 * scale);
        graphics.fillCircle(wingX + 3 * scale, y + (wing % 2 ? -1 : 4) * scale, 2.4 * scale);
      }
    } else if (has("sambal-grilled-squid")) {
      graphics.fillStyle(0xc75b43, 1);
      graphics.fillEllipse(x - 2 * scale, y - scale, 14 * scale, 8 * scale);
      graphics.lineStyle(Math.max(1, 1.4 * scale), 0xe2a060, 1);
      for (let tentacle = 0; tentacle < 4; tentacle += 1) {
        graphics.lineBetween(x + 3 * scale, y + (tentacle - 1.5) * 1.5 * scale, x + (8 + tentacle) * scale, y + (tentacle - 1.5) * 3 * scale);
      }
      graphics.fillStyle(0x4d874f, 1);
      graphics.fillEllipse(x - 8 * scale, y - 5 * scale, 6 * scale, 3 * scale);
    } else if (has("har-gow")) {
      const positions = [
        [-5, -3],
        [3, -3],
        [-4, 3],
        [4, 3],
      ] as const;
      for (const [offsetX, offsetY] of positions) {
        const dumplingX = x + offsetX * scale;
        const dumplingY = y + offsetY * scale;
        graphics.fillStyle(0xf2e5dc, 0.82);
        graphics.fillEllipse(dumplingX, dumplingY, 7 * scale, 6 * scale);
        graphics.lineStyle(Math.max(0.7, 0.8 * scale), 0xb99f92, 0.65);
        for (let pleat = -1; pleat <= 1; pleat += 1) {
          graphics.lineBetween(
            dumplingX + pleat * 1.4 * scale,
            dumplingY - 2.5 * scale,
            dumplingX + pleat * 0.7 * scale,
            dumplingY + scale,
          );
        }
      }
    } else if (has("siew-mai")) {
      for (let dumpling = 0; dumpling < 3; dumpling += 1) {
        const dumplingX = x - 6 * scale + dumpling * 6 * scale;
        const dumplingY = y + (dumpling % 2 ? -3 : 2) * scale;
        graphics.fillStyle(0xe4b94f, 1);
        graphics.fillRoundedRect(dumplingX - 3 * scale, dumplingY - 3 * scale, 6 * scale, 7 * scale, 1.4 * scale);
        graphics.fillStyle(0x9a5a3e, 1);
        graphics.fillEllipse(dumplingX, dumplingY - 2.5 * scale, 4.5 * scale, 2.5 * scale);
        graphics.fillStyle(0xd76b3d, 1);
        graphics.fillCircle(dumplingX, dumplingY - 3 * scale, 1.2 * scale);
      }
    } else if (has("char-siew-bao")) {
      for (let bun = 0; bun < 3; bun += 1) {
        const bunX = x - 6 * scale + bun * 6 * scale;
        const bunY = y + (bun % 2 ? -3 : 2) * scale;
        graphics.fillStyle(0xf3e7d5, 1);
        graphics.fillCircle(bunX, bunY, 4.4 * scale);
        graphics.fillStyle(0xa84f38, 1);
        graphics.fillTriangle(
          bunX - 2.2 * scale,
          bunY - 2.6 * scale,
          bunX + 2.2 * scale,
          bunY - 2.6 * scale,
          bunX,
          bunY + 0.5 * scale,
        );
      }
    } else if (has("sambal-stingray")) {
      graphics.fillStyle(0x3e7749, 1);
      graphics.fillEllipse(x, y, 22 * scale, 13 * scale);
      graphics.fillStyle(0x9c5d46, 1);
      graphics.fillTriangle(x - 8 * scale, y - 4 * scale, x + 8 * scale, y - 5 * scale, x + 4 * scale, y + 5 * scale);
      graphics.fillStyle(0xd44332, 1);
      graphics.fillEllipse(x, y - scale, 12 * scale, 5 * scale);
    } else if (has("black-pepper-crab")) {
      graphics.fillStyle(0x8f3e2f, 1);
      graphics.fillCircle(x, y, 6 * scale * remaining);
      graphics.fillCircle(x - 8 * scale, y - 3 * scale, 4 * scale);
      graphics.fillCircle(x + 8 * scale, y - 3 * scale, 4 * scale);
      graphics.lineStyle(Math.max(1, 1.6 * scale), 0x713328, 1);
      for (const side of [-1, 1]) {
        for (let leg = 0; leg < 3; leg += 1) {
          graphics.lineBetween(x + side * 5 * scale, y + (leg - 1) * 3 * scale, x + side * (10 + leg) * scale, y + (leg - 1.5) * 5 * scale);
        }
      }
      graphics.fillStyle(0x312b28, 1);
      graphics.fillCircle(x - 2 * scale, y - 2 * scale, small * 0.55);
      graphics.fillCircle(x + 2 * scale, y - 2 * scale, small * 0.55);
    } else if (has("ayam-buah-keluak", "chap-chye", "babi-pongteh")) {
      graphics.fillStyle(has("ayam") ? 0x493a33 : portion, 1);
      graphics.fillEllipse(x, y, 17 * scale * remaining, 10 * scale * remaining);
      const stewColours = has("chap-chye")
        ? [0x76a056, 0xd49a49, 0xc9d0b4]
        : [0x7b4932, 0xc18a50, 0xe0c08b];
      for (let piece = 0; piece < 4; piece += 1) {
        graphics.fillStyle(stewColours[piece % stewColours.length] as number, 1);
        graphics.fillRoundedRect(x - 7 * scale + piece * 4.5 * scale, y - (piece % 2) * 4 * scale, 4 * scale, 4 * scale, scale);
      }
    } else if (recipe.foodForm === "rice") {
      drawRiceMound(graphics, x, y, scale, portion, remaining);
    } else if (recipe.foodForm === "noodles") {
      drawNoodleStrands(graphics, x, y, scale, portion, remaining);
    } else if (recipe.foodForm === "bread") {
      graphics.fillStyle(portion, 1);
      graphics.fillRoundedRect(x - 9 * scale, y - 5 * scale, 18 * scale * remaining, 10 * scale * remaining, 3 * scale);
      graphics.lineStyle(Math.max(1, scale), lighten(portion, 0.35), 1);
      graphics.lineBetween(x - 6 * scale, y, x + 6 * scale, y);
    } else if (recipe.foodForm === "seafood") {
      graphics.fillStyle(portion, 1);
      graphics.fillEllipse(x, y, 18 * scale * remaining, 8 * scale * remaining);
      graphics.fillTriangle(x - 11 * scale, y, x - 6 * scale, y - 5 * scale, x - 6 * scale, y + 5 * scale);
      graphics.fillStyle(0x1c302d, 1);
      graphics.fillCircle(x + 5 * scale, y - scale, small * 0.5);
    } else {
      graphics.fillStyle(portion, 1);
      graphics.fillEllipse(x, y, 16 * scale * remaining, 9 * scale * remaining);
    }

    if (!has("kopi", "sugarcane", "teh-tarik", "ice-kacang", "black-pepper-crab")) {
      graphics.fillStyle(garnish, 1);
      const garnishCount = Math.min(qualityMode === "standard" ? 3 : 1, recipe.garnishCount);
      for (let index = 0; index < garnishCount; index += 1) {
        const angle = (index / Math.max(1, garnishCount)) * Math.PI * 2 + recipe.garnishCount;
        graphics.fillCircle(
          x + Math.cos(angle) * 5 * scale * remaining,
          y + Math.sin(angle) * 3 * scale * remaining,
          small * 0.62,
        );
      }
    }
  }

  function drawNutritionVariantCue(
    graphics: Phaser.GameObjects.Graphics,
    visualKey: string,
    family: NonNullable<ReturnType<typeof visualRecipeForDishVariant>["variantVisualFamily"]>,
    x: number,
    y: number,
    scale: number,
  ) {
    const outline = 0x17352e;
    const lineWidth = Math.max(0.9, 1.15 * scale);
    const has = (...parts: readonly string[]) => parts.some((part) => visualKey.includes(part));
    graphics.lineStyle(lineWidth, outline, 0.9);

    if (family === "drink") {
      const sugarCount = has("no-sugar", "kosong") ? 0 : has("one-sugar") ? 1 : 2;
      if (has("black-")) {
        graphics.fillStyle(0x4b2d22, 0.86);
        graphics.fillEllipse(x, y - 5 * scale, 9 * scale, 3 * scale);
      }
      if (has("evaporated")) {
        graphics.lineStyle(lineWidth, 0xf3e2c5, 0.96);
        graphics.beginPath();
        graphics.arc(x - 1.3 * scale, y - 5 * scale, 3.4 * scale, 0.2, Math.PI * 1.55);
        graphics.strokePath();
        graphics.beginPath();
        graphics.arc(x + 2.4 * scale, y - 5 * scale, 2.2 * scale, Math.PI * 0.25, Math.PI * 1.8);
        graphics.strokePath();
      } else if (has("milk")) {
        graphics.lineStyle(lineWidth, 0xf3e2c5, 0.96);
        graphics.beginPath();
        graphics.arc(x, y - 5 * scale, 3.4 * scale, 0.2, Math.PI * 1.55);
        graphics.strokePath();
      }
      if (has("pulled-foam")) {
        graphics.fillStyle(0xfff0d0, 1);
        graphics.fillEllipse(x, y - 7 * scale, 10 * scale, 3.5 * scale);
        graphics.fillCircle(x - 3 * scale, y - 8 * scale, 1.2 * scale);
        graphics.fillCircle(x + 2 * scale, y - 8.5 * scale, 1.4 * scale);
      }
      graphics.fillStyle(0xfffbef, 1);
      for (let cube = 0; cube < sugarCount; cube += 1) {
        const cubeX = x + (cube - (sugarCount - 1) / 2) * 4.3 * scale;
        graphics.fillRect(cubeX - 1.5 * scale, y + 2 * scale, 3 * scale, 3 * scale);
        graphics.strokeRect(cubeX - 1.5 * scale, y + 2 * scale, 3 * scale, 3 * scale);
      }
      return;
    }

    if (family === "nasi-lemak") {
      if (has("rice-only")) {
        graphics.lineStyle(lineWidth, outline, 0.9);
        graphics.strokeCircle(x - 4 * scale, y, 7 * scale);
      } else if (has("egg-ikan")) {
        graphics.fillStyle(0xf7edcf, 1);
        graphics.fillCircle(x + 4 * scale, y - 4 * scale, 4 * scale);
        graphics.fillStyle(0xe2a92e, 1);
        graphics.fillCircle(x + 4 * scale, y - 4 * scale, 1.8 * scale);
        graphics.fillStyle(0x76513b, 1);
        for (let dot = 0; dot < 4; dot += 1) {
          graphics.fillCircle(x + (dot - 1.5) * 2.2 * scale, y + 4 * scale, scale);
        }
      } else if (has("fish")) {
        graphics.fillStyle(0xc98a54, 1);
        graphics.fillEllipse(x + 5 * scale, y, 11 * scale, 5 * scale);
        graphics.fillTriangle(x + 9 * scale, y, x + 13 * scale, y - 3 * scale, x + 13 * scale, y + 3 * scale);
      } else {
        if (has("wing")) {
          graphics.fillStyle(0xb96c3d, 1);
          graphics.fillEllipse(x + 5 * scale, y + 2 * scale, 8 * scale, 5 * scale);
          graphics.fillCircle(x + 9 * scale, y + 3 * scale, 2 * scale);
        }
        if (has("cutlet")) {
          graphics.fillStyle(0x955231, 1);
          graphics.fillRoundedRect(x - 1 * scale, y - 6 * scale, 12 * scale, 5 * scale, scale);
          graphics.lineStyle(lineWidth, 0xe1ae66, 1);
          graphics.lineBetween(x, y - 4 * scale, x + 9 * scale, y - 4 * scale);
        }
      }
      return;
    }

    if (family === "carrot-cake") {
      if (has("black-sauce")) {
        graphics.fillStyle(0x5c3a2c, 0.92);
        for (let cube = 0; cube < 4; cube += 1) {
          graphics.fillRoundedRect(
            x - 7 * scale + (cube % 2) * 7 * scale,
            y - 5 * scale + Math.floor(cube / 2) * 6 * scale,
            6 * scale,
            5 * scale,
            scale,
          );
        }
      } else {
        graphics.fillStyle(0xf5edcf, 1);
        graphics.fillEllipse(x + 2 * scale, y - 2 * scale, 13 * scale, 9 * scale);
        graphics.fillStyle(0xe0a936, 1);
        graphics.fillCircle(x + 2 * scale, y - 2 * scale, 2.2 * scale);
      }
      return;
    }

    if (family === "prata") {
      const pieceCount = has("two-curry") ? 2 : 1;
      graphics.fillStyle(0xdca94d, 1);
      for (let piece = 0; piece < pieceCount; piece += 1) {
        graphics.fillRoundedRect(
          x - 8 * scale + piece * 7 * scale,
          y - 4 * scale + piece * 3 * scale,
          11 * scale,
          8 * scale,
          1.5 * scale,
        );
      }
      if (has("egg")) {
        graphics.fillStyle(0xf6e9c4, 1);
        graphics.fillCircle(x, y - scale, 3.6 * scale);
        graphics.fillStyle(0xdda331, 1);
        graphics.fillCircle(x, y - scale, 1.6 * scale);
      }
      if (has("onion")) {
        graphics.fillStyle(0xaa7899, 1);
        graphics.fillCircle(x - 5 * scale, y + 3 * scale, scale);
        graphics.fillCircle(x + 5 * scale, y - 3 * scale, scale);
      }
      if (has("cheese")) {
        graphics.fillStyle(0xf1c84f, 1);
        graphics.fillRoundedRect(x - 7 * scale, y + 3 * scale, 14 * scale, 2.2 * scale, scale);
      }
      return;
    }

    if (family === "fish-soup") {
      if (has("milky")) {
        graphics.fillStyle(0xeadfc5, 0.92);
        graphics.fillEllipse(x, y, 18 * scale, 9 * scale);
      }
      if (has("beehoon")) {
        graphics.lineStyle(lineWidth, 0xe2c679, 1);
        for (let strand = -2; strand <= 2; strand += 1) {
          graphics.lineBetween(x - 7 * scale, y + strand * scale, x + 7 * scale, y - strand * 0.7 * scale);
        }
      } else {
        graphics.fillStyle(0xf0e2ce, 1);
        for (let slice = -1; slice <= 1; slice += 1) {
          graphics.fillEllipse(x + slice * 5 * scale, y + (slice % 2) * 2 * scale, 7 * scale, 3 * scale);
        }
      }
      return;
    }

    if (family === "bak-chor") {
      if (has("broth")) {
        graphics.fillStyle(0xb99762, 0.88);
        graphics.fillEllipse(x, y, 19 * scale, 10 * scale);
        graphics.lineStyle(lineWidth, 0xf0d58c, 0.9);
        graphics.lineBetween(x - 6 * scale, y - 2 * scale, x + 6 * scale, y + 2 * scale);
      } else {
        graphics.lineStyle(lineWidth, 0x70402f, 1);
        for (let strand = -2; strand <= 2; strand += 1) {
          graphics.lineBetween(x - 7 * scale, y + strand * scale, x + 7 * scale, y - strand * scale);
        }
      }
      return;
    }

    if (family === "murtabak") {
      graphics.fillStyle(0xba7a3e, 1);
      for (let piece = 0; piece < 4; piece += 1) {
        graphics.fillRoundedRect(
          x - 8 * scale + (piece % 2) * 8 * scale,
          y - 6 * scale + Math.floor(piece / 2) * 7 * scale,
          7 * scale,
          6 * scale,
          scale,
        );
      }
      const filling = has("vegetable") ? 0x4f8b51 : has("mutton") ? 0x694034 : 0xb7653e;
      graphics.fillStyle(filling, 1);
      if (has("vegetable")) {
        graphics.fillRoundedRect(x - 6 * scale, y - 3 * scale, 3 * scale, 5 * scale, scale);
        graphics.fillTriangle(
          x,
          y + 3 * scale,
          x + 3 * scale,
          y - 3 * scale,
          x + 6 * scale,
          y + 3 * scale,
        );
      } else if (has("mutton")) {
        for (let piece = -1; piece <= 1; piece += 1) {
          const pieceX = x + piece * 5 * scale;
          graphics.fillTriangle(
            pieceX,
            y - 3 * scale,
            pieceX + 3 * scale,
            y,
            pieceX,
            y + 3 * scale,
          );
          graphics.fillTriangle(
            pieceX,
            y - 3 * scale,
            pieceX - 3 * scale,
            y,
            pieceX,
            y + 3 * scale,
          );
        }
      } else {
        graphics.fillCircle(x - 3 * scale, y - 2 * scale, 1.5 * scale);
        graphics.fillCircle(x + 4 * scale, y + 2 * scale, 1.5 * scale);
      }
      if (has("mushroom-cheese")) {
        graphics.fillStyle(0x76543d, 1);
        graphics.fillEllipse(x - 5 * scale, y - 3 * scale, 4 * scale, 2.5 * scale);
        graphics.fillRect(x - 5.5 * scale, y - 2 * scale, scale, 3 * scale);
        graphics.fillStyle(0xf0c84d, 1);
        graphics.fillRoundedRect(x - 7 * scale, y + 5 * scale, 14 * scale, 2 * scale, scale);
      }
      return;
    }

    if (family === "briyani") {
      const protein = has("vegetable") ? 0x57915a : has("mutton") ? 0x6e4032 : has("fish-prawn") ? 0xd9785c : 0x9b5238;
      graphics.fillStyle(protein, 1);
      if (has("vegetable")) {
        graphics.fillCircle(x + 5 * scale, y - 3 * scale, 2.4 * scale);
        graphics.fillRoundedRect(x + 1 * scale, y + 1 * scale, 5 * scale, 4 * scale, scale);
      } else if (has("fish-prawn")) {
        graphics.fillEllipse(x + 5 * scale, y - scale, 9 * scale, 4 * scale);
        graphics.lineStyle(lineWidth, protein, 1);
        graphics.lineBetween(x + 8 * scale, y - 2 * scale, x + 12 * scale, y - 6 * scale);
      } else if (has("mutton")) {
        for (let piece = 0; piece < 3; piece += 1) {
          graphics.fillRoundedRect(
            x + (piece - 1) * 4.5 * scale,
            y - (piece % 2) * 3 * scale,
            4 * scale,
            4 * scale,
            0.8 * scale,
          );
        }
      } else {
        graphics.fillEllipse(x + 5 * scale, y - 2 * scale, 9 * scale, 6 * scale);
        graphics.fillCircle(x + 9 * scale, y + scale, 2.2 * scale);
      }
      return;
    }

    if (family === "thosai") {
      graphics.fillStyle(0xd69a3d, 1);
      if (has("plain-roll")) {
        graphics.fillRoundedRect(x - 10 * scale, y - 3 * scale, 20 * scale, 6 * scale, 3 * scale);
      } else {
        graphics.fillTriangle(x - 10 * scale, y + 5 * scale, x + 10 * scale, y + 4 * scale, x + 6 * scale, y - 5 * scale);
      }
      if (has("egg-centre")) {
        graphics.fillStyle(0xf6e9c4, 1);
        graphics.fillCircle(x, y, 4 * scale);
        graphics.fillStyle(0xdda331, 1);
        graphics.fillCircle(x, y, 1.7 * scale);
      }
      if (has("ghee-gloss")) {
        graphics.lineStyle(Math.max(1, 2 * scale), 0xffe69a, 0.95);
        graphics.lineBetween(x - 7 * scale, y - 2 * scale, x + 7 * scale, y + scale);
      }
      return;
    }

    const cueCount = 1 + (stableVisualHash(visualKey) % 3);
    for (let index = 0; index < cueCount; index += 1) {
      const cueX = x + (index - (cueCount - 1) / 2) * 5 * scale;
      graphics.strokeTriangle(
        cueX - 2.5 * scale,
        y - 3 * scale,
        cueX + 2.5 * scale,
        y - 3 * scale,
        cueX,
        y + 2 * scale,
      );
    }
  }

  function drawDishServing(
    graphics: Phaser.GameObjects.Graphics,
    dishId: string | undefined,
    x: number,
    y: number,
    scale: number,
    eatenFraction = 0,
    variantVisualKey?: string,
  ) {
    const dish = dishId ? DISH_BY_ID.get(dishId) : undefined;
    if (!dish) return;
    const recipe = variantVisualKey
      ? visualRecipeForDishVariant(dish, variantVisualKey)
      : DISH_VISUAL_BY_ID.get(dish.id) ?? visualRecipeForDish(dish);
    const remaining = Math.max(0.22, 1 - eatenFraction);
    const vessel = recipe.presentation.vessel;

    graphics.fillStyle(0x17352e, 0.16);
    graphics.fillEllipse(x + 1, y + 4 * scale, 27 * scale, 10 * scale);
    if (vessel === "tall-drinking-glass") {
      graphics.fillStyle(0xcfe5df, 0.72);
      graphics.fillRoundedRect(x - 7 * scale, y - 10 * scale, 13 * scale, 20 * scale, 3 * scale);
      graphics.lineStyle(Math.max(1, 1.7 * scale), 0x789c98, 0.9);
      graphics.strokeRoundedRect(x - 7 * scale, y - 10 * scale, 13 * scale, 20 * scale, 3 * scale);
      graphics.lineStyle(Math.max(0.8, scale), 0xffffff, 0.5);
      graphics.lineBetween(x - 4 * scale, y - 8 * scale, x - 4 * scale, y + 7 * scale);
    } else if (vessel === "kopitiam-cup-and-saucer") {
      graphics.fillStyle(0xe5ddcf, 1);
      graphics.fillEllipse(x, y + 7 * scale, 23 * scale, 7 * scale);
      graphics.fillStyle(0xf5efe1, 1);
      graphics.fillRoundedRect(x - 7 * scale, y - 7 * scale, 13 * scale, 16 * scale, 3 * scale);
      graphics.lineStyle(Math.max(1, 1.7 * scale), 0x7a6650, 0.88);
      graphics.strokeCircle(x + 7 * scale, y, 5 * scale);
      graphics.strokeRoundedRect(x - 7 * scale, y - 7 * scale, 13 * scale, 16 * scale, 3 * scale);
    } else if (vessel === "deep-ceramic-bowl") {
      graphics.fillStyle(0xd8d0c2, 1);
      graphics.fillRoundedRect(x - 10 * scale, y - scale, 20 * scale, 8 * scale, 5 * scale);
      graphics.fillStyle(0xf5efe1, 1);
      graphics.fillEllipse(x, y - scale, 24 * scale, 16 * scale);
      graphics.lineStyle(Math.max(1, 1.8 * scale), 0x7a6650, 0.84);
      graphics.strokeEllipse(x, y - scale, 24 * scale, 16 * scale);
      graphics.fillStyle(lighten(recipe.portionColour, 0.12), 1);
      graphics.fillEllipse(x, y - scale, 18 * scale * remaining, 10 * scale * remaining);
    } else if (vessel === "bamboo-steamer") {
      graphics.fillStyle(0xd1a45f, 1);
      graphics.fillEllipse(x, y, 29 * scale, 21 * scale);
      graphics.fillStyle(0xe5c989, 1);
      graphics.fillEllipse(x, y - scale, 23 * scale, 15 * scale);
      graphics.lineStyle(Math.max(1, 1.5 * scale), 0x7a5a35, 0.86);
      graphics.strokeEllipse(x, y, 29 * scale, 21 * scale);
      graphics.strokeEllipse(x, y - scale, 23 * scale, 15 * scale);
      if (qualityMode === "standard") {
        graphics.lineStyle(Math.max(0.7, scale), 0xb88446, 0.72);
        for (let slat = -2; slat <= 2; slat += 1) {
          graphics.lineBetween(x + slat * 4 * scale, y - 6 * scale, x + slat * 4 * scale, y + 5 * scale);
        }
      }
    } else if (vessel === "banana-leaf-lined-plate") {
      graphics.fillStyle(0xf5efe1, 1);
      graphics.fillEllipse(x, y, 30 * scale, 20 * scale);
      graphics.fillStyle(0x4e7447, 1);
      graphics.fillEllipse(x, y - scale, 26 * scale, 16 * scale);
      graphics.lineStyle(Math.max(0.8, scale), 0x9caf6d, 0.92);
      graphics.lineBetween(x - 11 * scale, y + 3 * scale, x + 11 * scale, y - 5 * scale);
    } else if (vessel === "shared-oval-platter") {
      graphics.fillStyle(0xf5efe1, 1);
      graphics.fillEllipse(x, y, 31 * scale, 20 * scale);
      graphics.lineStyle(Math.max(1, 1.5 * scale), 0xc9bba4, 0.9);
      graphics.strokeEllipse(x, y, 31 * scale, 20 * scale);
      graphics.strokeEllipse(x, y, 26 * scale, 15 * scale);
    } else {
      graphics.fillStyle(0xf5efe1, 1);
      graphics.fillCircle(x, y, 13 * scale);
      graphics.lineStyle(Math.max(1, 1.8 * scale), 0x7a6650, 0.72);
      graphics.strokeCircle(x, y, 13 * scale);
      graphics.lineStyle(Math.max(0.8, scale), 0xd6c8ae, 0.82);
      graphics.strokeCircle(x, y, 10 * scale);
    }

    const isDrinkVessel =
      vessel === "kopitiam-cup-and-saucer" || vessel === "tall-drinking-glass";
    drawDishMotif(graphics, dish.id, recipe, x, y - (isDrinkVessel ? 0 : scale), scale, remaining);

    if (recipe.variantVisualKey && recipe.variantVisualFamily) {
      drawNutritionVariantCue(
        graphics,
        recipe.variantVisualKey,
        recipe.variantVisualFamily,
        x,
        y - (isDrinkVessel ? 0 : scale),
        scale,
      );
    }

    if (recipe.steam !== "none" && !reducedMotion && eatenFraction < 0.82) {
      const wisps = recipe.steam === "full" ? 3 : 1;
      graphics.lineStyle(Math.max(1, 1.35 * scale), 0xffffff, 0.64);
      for (let index = 0; index < wisps; index += 1) {
        const phase = Math.sin(state.tick * 0.14 + index) * 2 * scale;
        const steamX = x + (index - (wisps - 1) / 2) * 5 * scale;
        graphics.lineBetween(steamX, y - 8 * scale, steamX + phase, y - 15 * scale);
      }
    }
  }

  function nearestTableMealAnchor(
    snapshot: GameSnapshot,
    customerX: number,
    customerY: number,
  ) {
    let best: { x: number; y: number; distance: number } | undefined;
    for (const object of snapshot.objects) {
      if (visuals[object.definitionId]?.category !== "table") continue;
      const bounds = boundsForObject(object);
      if (!bounds) continue;
      const distance = Math.hypot(bounds.centreX - customerX, bounds.centreY - customerY);
      if (distance > TILE_SIZE * 2.2 || (best && distance >= best.distance)) continue;
      best = { x: bounds.centreX, y: bounds.centreY, distance };
    }
    if (!best || best.distance < 1) return { x: customerX, y: customerY - 17 };
    const reach = Math.min(20, best.distance * 0.48);
    return {
      x: customerX + ((best.x - customerX) / best.distance) * reach,
      y: customerY + ((best.y - customerY) / best.distance) * reach,
    };
  }

  function drawCustomerIndicator(
    graphics: Phaser.GameObjects.Graphics,
    indicator: ReturnType<typeof animationPoseForCustomer>["indicator"],
    x: number,
    y: number,
    accent: number,
  ) {
    graphics.fillStyle(0xfff8e8, 0.96);
    graphics.fillCircle(x, y, 8);
    graphics.lineStyle(2, accent, 1);
    if (indicator === "question") {
      graphics.strokeCircle(x, y - 2, 3.5);
      graphics.fillStyle(accent, 1);
      graphics.fillCircle(x, y + 5, 1.5);
    } else if (indicator === "footsteps") {
      graphics.fillStyle(accent, 1);
      graphics.fillEllipse(x - 3, y + 2, 3, 6);
      graphics.fillEllipse(x + 3, y - 2, 3, 6);
    } else if (indicator === "queue") {
      graphics.fillStyle(accent, 1);
      for (let index = -1; index <= 1; index += 1) graphics.fillCircle(x + index * 4, y, 1.6);
    } else if (indicator === "order") {
      graphics.strokeRoundedRect(x - 5, y - 4, 10, 7, 2);
      graphics.lineBetween(x - 2, y + 3, x - 4, y + 6);
    } else if (indicator === "clock") {
      graphics.strokeCircle(x, y, 5);
      graphics.lineBetween(x, y, x, y - 3);
      graphics.lineBetween(x, y, x + 3, y + 2);
    } else if (indicator === "seat") {
      graphics.lineBetween(x - 4, y - 4, x - 4, y + 4);
      graphics.lineBetween(x - 4, y + 1, x + 4, y + 1);
      graphics.lineBetween(x + 4, y + 1, x + 4, y + 5);
    } else if (indicator === "meal") {
      graphics.strokeCircle(x, y, 5);
      graphics.lineBetween(x - 6, y - 5, x - 6, y + 5);
    } else if (indicator === "return") {
      graphics.lineBetween(x - 5, y, x + 4, y);
      graphics.lineBetween(x - 5, y, x - 1, y - 4);
      graphics.lineBetween(x - 5, y, x - 1, y + 4);
    } else {
      graphics.lineBetween(x - 4, y, x + 5, y);
      graphics.lineBetween(x + 5, y, x + 1, y - 4);
      graphics.lineBetween(x + 5, y, x + 1, y + 4);
    }
  }

  function drawCustomerAccessory(
    graphics: Phaser.GameObjects.Graphics,
    accessory: ReturnType<typeof visualRecipeForCustomer>["accessory"],
    x: number,
    y: number,
    accent: number,
  ) {
    graphics.fillStyle(accent, 1);
    if (accessory === "tote") {
      graphics.fillRoundedRect(x + 8, y - 1, 8, 11, 2);
      graphics.lineStyle(1.5, accent, 1);
      graphics.strokeCircle(x + 12, y - 2, 4);
    } else if (accessory === "briefcase") {
      graphics.fillRoundedRect(x + 8, y + 1, 11, 8, 2);
      graphics.lineStyle(1.5, accent, 1);
      graphics.strokeRoundedRect(x + 11, y - 2, 5, 4, 1);
    } else if (accessory === "backpack") {
      graphics.fillRoundedRect(x - 14, y - 6, 8, 15, 3);
    } else if (accessory === "walking-aid") {
      graphics.lineStyle(2.5, accent, 1);
      graphics.lineBetween(x + 10, y - 2, x + 13, y + 13);
      graphics.lineBetween(x + 13, y + 13, x + 17, y + 13);
    }
  }

  function customerOutfitDimensions(
    silhouette: ReturnType<typeof visualRecipeForCustomer>["outfitSilhouette"],
    isEating: boolean,
  ) {
    const dimensions = {
      compact: { width: 18, height: 20, radius: 5 },
      relaxed: { width: 23, height: 21, radius: 8 },
      structured: { width: 20, height: 23, radius: 4 },
      layered: { width: 24, height: 23, radius: 7 },
      sporty: { width: 19, height: 20, radius: 9 },
      classic: { width: 21, height: 22, radius: 6 },
    }[silhouette];
    return {
      ...dimensions,
      height: isEating ? dimensions.height - 3 : dimensions.height,
    };
  }

  function drawCustomerGarmentPattern(
    graphics: Phaser.GameObjects.Graphics,
    pattern: ReturnType<typeof visualRecipeForCustomer>["garmentPattern"],
    x: number,
    y: number,
    width: number,
    height: number,
    radius: number,
    accent: number,
  ) {
    graphics.fillStyle(accent, 1);
    if (pattern === "banded") {
      graphics.fillRect(x - width / 2, y + 3, width, 4);
    } else if (pattern === "panelled") {
      graphics.fillRoundedRect(x - 3, y - 4, 6, height - 2, 2);
    } else if (pattern === "sashed") {
      graphics.lineStyle(3, accent, 1);
      graphics.lineBetween(x - width / 2 + 3, y - 3, x + width / 2 - 3, y + 10);
    } else if (pattern === "piped") {
      graphics.lineStyle(1.5, accent, 1);
      graphics.strokeRoundedRect(x - width / 2 + 1, y - 4, width - 2, height - 2, radius);
    } else if (pattern === "pocketed") {
      graphics.fillRoundedRect(x + 1, y + 1, 7, 6, 1.5);
      graphics.lineStyle(1, 0xffffff, 0.45);
      graphics.lineBetween(x + 2, y + 3, x + 7, y + 3);
    }
  }

  function drawCustomers(graphics: Phaser.GameObjects.Graphics, snapshot: GameSnapshot) {
    for (const customer of snapshot.customers) {
      const archetype = CUSTOMER_BY_ID.get(customer.archetypeId) ?? CUSTOMER_ARCHETYPES[0];
      if (!archetype) continue;
      const visual = CUSTOMER_VISUAL_BY_ID.get(archetype.id) ?? visualRecipeForCustomer(archetype);
      const customerSeed = stableVisualHash(customer.id);
      const appearance = customerAppearanceForId(customer.id);
      const pose = animationPoseForCustomer(customer.status, snapshot.tick, customerSeed, reducedMotion);
      const position = renderedCustomerPosition(customer, reducedMotion);
      const next = customer.path[customer.pathIndex];
      const directionX = next ? Math.sign(next.x - customer.position.x) : 0;
      const directionY = next ? Math.sign(next.y - customer.position.y) : 1;
      const x = (position.x + 0.5) * TILE_SIZE;
      const y = (position.y + 0.5) * TILE_SIZE + pose.bob;
      const outfit = customerOutfitDimensions(visual.outfitSilhouette, pose.pose === "eat");
      const bodyWidth = outfit.width;
      const bodyHeight = outfit.height;

      if (customer.id === selectedCustomerId) {
        graphics.lineStyle(4, highContrast ? 0xffffff : 0x2d6ea8, 1);
        graphics.strokeCircle(x, y + 1, 24);
        graphics.lineStyle(2, highContrast ? 0x17352e : 0xfff7e5, 1);
        graphics.strokeCircle(x, y + 1, 19);
      }
      graphics.fillStyle(0x17352e, 0.16);
      graphics.fillEllipse(x, y + 13, bodyWidth + 9, 9);
      if (pose.stride !== 0) {
        graphics.lineStyle(4, appearance.clothing, 1);
        graphics.lineBetween(x - 4, y + 7, x - 5 + pose.stride, y + 14);
        graphics.lineBetween(x + 4, y + 7, x + 5 - pose.stride, y + 14);
      }
      graphics.fillStyle(appearance.clothing, 1);
      graphics.fillRoundedRect(
        x - bodyWidth / 2,
        y - 5,
        bodyWidth,
        bodyHeight,
        outfit.radius,
      );
      drawCustomerGarmentPattern(
        graphics,
        visual.garmentPattern,
        x,
        y,
        bodyWidth,
        bodyHeight,
        outfit.radius,
        appearance.accent,
      );
      graphics.fillStyle(appearance.skin, 1);
      graphics.fillCircle(x + directionX * 2, y - 10 + directionY * 0.5, 7.5);
      graphics.lineStyle(2, 0x17352e, 0.7);
      graphics.strokeCircle(x + directionX * 2, y - 10 + directionY * 0.5, 7.5);
      graphics.lineStyle(3.5, appearance.skin, 1);
      graphics.lineBetween(x - bodyWidth / 2 + 2, y, x - bodyWidth / 2 - 3 + pose.armSwing, y + 8);
      graphics.lineBetween(x + bodyWidth / 2 - 2, y, x + bodyWidth / 2 + 3 - pose.armSwing, y + 8);

      if (((customerSeed >>> 7) % 1_000) / 1_000 < visual.accessoryChance) {
        drawCustomerAccessory(graphics, visual.accessory, x, y, appearance.accent);
      }

      if (pose.carriesFood || (customer.hasTray && customer.status !== "eating")) {
        graphics.fillStyle(0xb7864d, 1);
        graphics.fillRoundedRect(x - 16, y + 7, 32, 10, 3);
        graphics.fillStyle(0xd8b772, 1);
        graphics.fillRoundedRect(x - 13, y + 9, 26, 6, 2);
        graphics.lineStyle(1.5, 0x7a5a35, 0.9);
        graphics.strokeRoundedRect(x - 16, y + 7, 32, 10, 3);
        graphics.fillStyle(appearance.skin, 1);
        graphics.fillCircle(x - 14, y + 9, 2.6);
        graphics.fillCircle(x + 14, y + 9, 2.6);
        if (pose.carriesFood) {
          drawDishServing(
            graphics,
            customer.orderedDishId,
            x,
            y + 6,
            0.66,
            0,
            nutritionVisualKeyForVariant(
              customer.orderedDishId,
              customer.orderedNutritionVariantId,
            ),
          );
        }
      }

      if (pose.showsMeal) {
        const anchor = nearestTableMealAnchor(snapshot, x, y);
        const dish = customer.orderedDishId ? catalog.dishes[customer.orderedDishId] : undefined;
        const diningUtility = getUtilityInfluence(state.objects, catalog, customer.position);
        const eatenFraction = dish
          ? mealConsumptionFraction(
              customer.stateElapsedMs,
              dish.eatingMs,
              diningUtility.eatingSpeed,
            )
          : 0;
        graphics.fillStyle(0xb7864d, 1);
        graphics.fillRoundedRect(anchor.x - 17, anchor.y - 11, 34, 22, 4);
        graphics.fillStyle(0xd8b772, 1);
        graphics.fillRoundedRect(anchor.x - 14, anchor.y - 8, 28, 16, 3);
        drawDishServing(
          graphics,
          customer.orderedDishId,
          anchor.x,
          anchor.y,
          0.82,
          eatenFraction,
          nutritionVisualKeyForVariant(
            customer.orderedDishId,
            customer.orderedNutritionVariantId,
          ),
        );
        graphics.lineStyle(2.5, appearance.skin, 1);
        graphics.lineBetween(x + 5, y + 2, anchor.x + pose.armSwing * 0.35, anchor.y - 2);
        graphics.lineStyle(1.5, 0x5f5142, 1);
        graphics.lineBetween(anchor.x + 9, anchor.y - 7, anchor.x + 13, anchor.y + 7);
      }

      drawCustomerIndicator(graphics, pose.indicator, x + 15, y - 19, appearance.accent);

      if (customer.status === "queued" || customer.status === "waiting-for-food") {
        const patience = catalog.archetypes[customer.archetypeId]?.patienceMs ?? 1;
        const fraction = Math.max(0, Math.min(1, customer.patienceRemainingMs / patience));
        graphics.lineStyle(2.5, fraction > 0.35 ? 0xe8b94f : 0xc75542, 1);
        graphics.beginPath();
        graphics.arc(x, y + 2, 17, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * fraction);
        graphics.strokePath();
      }
      if (debugOverlay) {
        graphics.lineStyle(2, 0x287ec0, 0.55);
        let previous = { x, y };
        for (const step of customer.path.slice(customer.pathIndex)) {
          const pathPoint = tileToWorld(snapshot.map, step);
          graphics.lineBetween(previous.x, previous.y, pathPoint.x, pathPoint.y);
          previous = pathPoint;
        }
      }
    }
  }

  function drawOverlay(
    scene: HawkerScene,
    graphics: Phaser.GameObjects.Graphics,
    snapshot: GameSnapshot,
  ) {
    const queueLayouts = planStallQueueLayouts(
      snapshot.map,
      state.objects,
      effectiveCatalog(),
      [
        ...snapshot.accessPoints.map((point) => point.position),
        ...snapshot.routeGuidePoints,
      ],
    );
    for (const stall of snapshot.objects) {
      const definition = catalog.placeables[stall.definitionId];
      if (definition?.kind !== "stall") continue;
      const queue = snapshot.queues[stall.id] ?? [];
      const queueCells = queueLayouts[stall.id] ?? [];
      const bounds = boundsForObject(stall);
      if (bounds) {
        scene.addLabel(
          bounds.maxX - 25,
          bounds.minY + 25,
          `${queue.length} ${queue.length === 1 ? "guest" : "guests"}`,
          queue.length >= (definition.stall?.queueCapacity ?? 7) ? "#9a3e31" : "#17352e",
        );
      }
      if (queueCells.length === 0) continue;
      graphics.lineStyle(4, 0xe8b94f, 0.45);
      for (let index = 1; index < queueCells.length; index += 1) {
        const previous = tileToWorld(snapshot.map, queueCells[index - 1] as GridPoint);
        const point = tileToWorld(snapshot.map, queueCells[index] as GridPoint);
        graphics.lineBetween(previous.x, previous.y, point.x, point.y);
      }
      for (let index = 0; index < queueCells.length; index += 1) {
        const point = tileToWorld(snapshot.map, queueCells[index] as GridPoint);
        const occupied = index < queue.length;
        graphics.fillStyle(occupied ? 0xe8b94f : 0xfff7e5, occupied ? 0.24 : 0.36);
        graphics.fillCircle(point.x, point.y, occupied ? 17 : 12);
        graphics.lineStyle(2.5, occupied ? 0xd69a35 : 0xb39769, occupied ? 1 : 0.72);
        graphics.strokeCircle(point.x, point.y, occupied ? 17 : 12);
        graphics.fillStyle(0x17352e, occupied ? 0.92 : 0.56);
        graphics.fillCircle(point.x + 10, point.y - 10, 7);
        graphics.fillStyle(0xfff7e5, 1);
        const pipCount = Math.min(3, index + 1);
        for (let pip = 0; pip < pipCount; pip += 1) {
          graphics.fillCircle(point.x + 7 + pip * 3, point.y - 10, 1);
        }
      }
    }

    for (const key of Object.keys(snapshot.seatReservations)) {
      const [objectId, indexSource] = key.split(":");
      const seat = getSeatLocations(state.objects, catalog).find(
        (location) => location.objectId === objectId && location.index === Number(indexSource),
      );
      if (!seat) continue;
      graphics.lineStyle(3, 0x4da8bc, 1);
      graphics.strokeCircle((seat.point.x + 0.5) * TILE_SIZE, (seat.point.y + 0.5) * TILE_SIZE, 17);
    }

    if (buildTool === "place" && selectedBuildId) {
      const candidate = placementCandidate(hoverTile);
      if (candidate) {
        const result = validatePlacement(state.map, state.objects, catalog, candidate, {
          reservedPoints: [
            ...state.accessPoints.map((point) => point.position),
            ...state.routeGuidePoints,
          ],
        });
        const cells = result.occupiedTiles;
        for (const cell of cells) {
          graphics.fillStyle(result.valid ? 0x2b83b8 : 0xc75542, 0.34);
          graphics.fillRect(cell.x * TILE_SIZE + 2, cell.y * TILE_SIZE + 2, TILE_SIZE - 4, TILE_SIZE - 4);
          graphics.lineStyle(3, result.valid ? 0x1d648f : 0x8f2e22, 1);
          graphics.strokeRect(cell.x * TILE_SIZE + 2, cell.y * TILE_SIZE + 2, TILE_SIZE - 4, TILE_SIZE - 4);
          if (!result.valid) {
            graphics.lineBetween(cell.x * TILE_SIZE + 9, cell.y * TILE_SIZE + 9, (cell.x + 1) * TILE_SIZE - 9, (cell.y + 1) * TILE_SIZE - 9);
            graphics.lineBetween((cell.x + 1) * TILE_SIZE - 9, cell.y * TILE_SIZE + 9, cell.x * TILE_SIZE + 9, (cell.y + 1) * TILE_SIZE - 9);
          }
        }
      }
    } else if (buildTool === "route") {
      const hoverKey = `${hoverTile.x},${hoverTile.y}`;
      const isExisting = snapshot.routeGuidePoints.some(
        (point) => point.x === hoverTile.x && point.y === hoverTile.y,
      );
      const occupiedQueueCells = new Set(
        Object.values(queueLayouts).flat().map((point) => `${point.x},${point.y}`),
      );
      const valid = isExisting || (
        hoverTile.x > 0 &&
        hoverTile.y > 0 &&
        hoverTile.x < snapshot.map.width - 1 &&
        hoverTile.y < snapshot.map.height - 1 &&
        getTile(snapshot.map, hoverTile) === "floor" &&
        !getBlockedTileKeys(state.objects, catalog).has(hoverKey) &&
        !occupiedQueueCells.has(hoverKey)
      );
      graphics.fillStyle(isExisting ? 0xe8b94f : valid ? 0x28b7a7 : 0xc75542, 0.28);
      graphics.fillRoundedRect(
        hoverTile.x * TILE_SIZE + 3,
        hoverTile.y * TILE_SIZE + 3,
        TILE_SIZE - 6,
        TILE_SIZE - 6,
        7,
      );
      graphics.lineStyle(3, isExisting ? 0x9a6a20 : valid ? 0x14796f : 0x8f2e22, 1);
      graphics.strokeRoundedRect(
        hoverTile.x * TILE_SIZE + 3,
        hoverTile.y * TILE_SIZE + 3,
        TILE_SIZE - 6,
        TILE_SIZE - 6,
        7,
      );
      if (isExisting) {
        graphics.lineBetween(
          hoverTile.x * TILE_SIZE + 14,
          hoverTile.y * TILE_SIZE + 14,
          (hoverTile.x + 1) * TILE_SIZE - 14,
          (hoverTile.y + 1) * TILE_SIZE - 14,
        );
        graphics.lineBetween(
          (hoverTile.x + 1) * TILE_SIZE - 14,
          hoverTile.y * TILE_SIZE + 14,
          hoverTile.x * TILE_SIZE + 14,
          (hoverTile.y + 1) * TILE_SIZE - 14,
        );
      }
    } else {
      graphics.lineStyle(2, 0xffffff, 0.85);
      graphics.strokeRect(hoverTile.x * TILE_SIZE + 3, hoverTile.y * TILE_SIZE + 3, TILE_SIZE - 6, TILE_SIZE - 6);
    }

    if (debugOverlay) {
      graphics.lineStyle(2, 0x7a2e88, 0.8);
      for (const object of snapshot.objects) {
        for (const tile of getObjectOccupiedTiles(object, catalog)) {
          graphics.strokeRect(tile.x * TILE_SIZE + 5, tile.y * TILE_SIZE + 5, TILE_SIZE - 10, TILE_SIZE - 10);
        }
      }
    }
  }

  function setBuildTool(tool: BuildTool) {
    const editingLayout = buildTool === "access" || buildTool === "route";
    const willEditLayout = tool === "access" || tool === "route";
    if (willEditLayout && !editingLayout) {
      speedBeforeLayoutEdit = speed === 0 ? 1 : speed;
      speed = 0;
    }
    buildTool = tool;
    if (tool !== "move") pendingMoveId = undefined;
    if (tool !== "place") selectedBuildId = undefined;
    if (tool !== "queue") {
      queueEditingStallId = undefined;
      queueDraft = [];
    }
    if (tool !== "queue") selectedObjectId = undefined;
    if (tool !== "access") {
      selectedAccessPointId = undefined;
      pendingAccessKind = undefined;
    }
    if (editingLayout && !willEditLayout) speed = speedBeforeLayoutEdit;
    emitHud(true);
    activeScene?.render(true);
  }

  function rotateSelection() {
    if (selectedObjectId) {
      runCommand({ type: "rotate-object", objectId: selectedObjectId });
      return;
    }
    selectedRotation = ((selectedRotation + 90) % 360) as Rotation;
    activeScene?.render(true);
  }

  function setSpeed(next: GameSpeed) {
    speed = next;
    emitHud(true);
  }

  function zoomBy(delta: number) {
    if (!activeScene) return;
    activeScene.cameras.main.setZoom(
      PhaserRuntime.Math.Clamp(activeScene.cameras.main.zoom + delta, 0.48, 1.55),
    );
  }

  const game = new PhaserRuntime.Game({
    type: PhaserRuntime.AUTO,
    parent: options.parent,
    backgroundColor: "#c7b08a",
    transparent: false,
    render: {
      antialias: options.settings.quality === "standard",
      pixelArt: false,
      roundPixels: false,
      powerPreference: options.settings.quality === "standard" ? "high-performance" : "low-power",
    },
    scale: {
      mode: PhaserRuntime.Scale.RESIZE,
      width: options.parent.clientWidth,
      height: options.parent.clientHeight,
      autoCenter: PhaserRuntime.Scale.CENTER_BOTH,
    },
    fps: {
      target: 60,
      limit: options.settings.quality === "standard" ? 60 : 30,
      forceSetTimeOut: false,
    },
    scene: HawkerScene,
    input: {
      keyboard: { target: options.parent },
      mouse: { preventDefaultWheel: true },
    },
    audio: { noAudio: true },
  });
  runtime.game = game;

  const controller: RuntimeController = {
    destroy() {
      game.destroy(true);
      activeScene = undefined;
    },
    selectBuildItem(itemId) {
      selectedBuildId = itemId;
      selectedRotation = 0;
      if (itemId) setBuildTool("place");
      emitHud(true);
      activeScene?.render(true);
    },
    setBuildTool,
    rotateSelection,
    undo() {
      runCommand({ type: "undo" });
    },
    toggleOpen() {
      const stalls = Object.values(state.objects).filter(
        (object) => catalog.placeables[object.definitionId]?.kind === "stall",
      );
      if (stalls.length === 0) {
        options.onEvent({
          kind: "warning",
          message: "Place at least one food or drink stall before opening.",
        });
        return false;
      }
      const nextOpen = !isCentreOpen();
      for (const object of stalls) {
        runCommand({ type: "set-stall-open", objectId: object.id, open: nextOpen }, false);
      }
      options.onPersistentChange(persistentPayload());
      options.onEvent({
        kind: "info",
        message: nextOpen ? "Shutters up — the lunch crowd is arriving." : "Centre closed for layout changes.",
      });
      emitHud(true);
      activeScene?.render(true);
      return true;
    },
    setSpeed,
    setQuality(quality) {
      qualityMode = quality;
      runCommand({ type: "set-quality-mode", mode: quality });
      game.loop.setFPSLimit(quality === "standard" ? 60 : 30);
      activeScene?.render(true);
    },
    setReducedMotion(enabled) {
      reducedMotion = enabled;
      activeScene?.render(true);
    },
    setHighContrast(enabled) {
      highContrast = enabled;
      activeScene?.render(true);
    },
    setDebugOverlay(enabled) {
      debugOverlay = enabled;
      activeScene?.render(true);
    },
    zoomBy,
    centreCamera() {
      activeScene?.cameras.main.centerOn(
        (state.map.width * TILE_SIZE) / 2,
        (state.map.height * TILE_SIZE) / 2,
      );
    },
    exportState() {
      return persistentPayload();
    },
    importState(value) {
      const decoded = decodeRuntimeSave(value);
      const imported = reconcileRuntimeUnlocks(
        assertRuntimeMap(deserializeGameState(decoded.core, authoredCatalog)),
      );
      stallMenus = resolveStallMenus(decoded.menus ?? {}, {
        ...stallMenuProgression(imported),
        slotBonuses: stallMenuSlotBonuses(imported),
      });
      const resolvedVariants = resolvePersistedDishVariants(
        decoded.variants,
        decoded.nutritionDataVersion,
        imported,
      );
      const incompleteRuntimeV2 =
        decoded.runtimeSchemaVersion === 2 &&
        (decoded.variants === undefined || decoded.nutritionDataVersion === undefined);
      activeDishVariants = resolvedVariants.selections;
      catalog = withStallMenus(
        withDishVariants(authoredCatalog, activeDishVariants),
        stallMenus,
      );
      state = { ...imported, catalog };
      selectedCustomerId = undefined;
      if (resolvedVariants.recovered || incompleteRuntimeV2) {
        options.onEvent({
          kind: "warning",
          message: "One or more imported recipe choices were reset to reviewed defaults.",
        });
      }
      recomputeObjectSequence();
      lastPersistentRevenue = state.economy.lifetimeRevenue;
      activeScene?.syncWorldBounds(true);
      activeScene?.render(true);
      emitHud(true);
    },
    reset() {
      stallMenus = defaultStallMenusForProgression({
        level: 1,
        reputation: ECONOMY.startingReputation,
      });
      activeDishVariants = defaultDishVariants();
      catalog = withStallMenus(
        withDishVariants(authoredCatalog, activeDishVariants),
        stallMenus,
      );
      state = freshState(authoredCatalog);
      state = { ...state, catalog };
      recomputeObjectSequence();
      selectedBuildId = undefined;
      selectedObjectId = undefined;
      selectedCustomerId = undefined;
      selectedAccessPointId = undefined;
      pendingAccessKind = undefined;
      buildTool = "select";
      speed = 1;
      speedBeforeLayoutEdit = 1;
      lastPersistentRevenue = 0;
      activeScene?.syncWorldBounds(true);
      activeScene?.render(true);
      emitHud(true);
      options.onPersistentChange(persistentPayload());
    },
    spawnCustomer() {
      state = { ...state, spawnCountdownMs: 0 };
      const result = advanceSimulation(state, state.config.fixedStepMs);
      state = result.state;
      synchronizeStallMenus();
      activeScene?.render(true);
      emitHud(true);
    },
    addCash(amount) {
      state = {
        ...state,
        economy: { ...state.economy, currency: Math.max(0, state.economy.currency + amount) },
      };
      options.onPersistentChange(persistentPayload());
      emitHud(true);
    },
    expandMap() {
      if (state.progression.level < 3) {
        options.onEvent({
          kind: "warning",
          message: "Reach level 3 to expand the dining hall.",
        });
        return false;
      }
      const accepted = runCommand({ type: "expand-map", addColumns: 4, addRows: 2 });
      if (accepted) {
        activeScene?.syncWorldBounds(false);
        options.onEvent({
          kind: "success",
          message: "The dining hall expanded by four columns and two rows.",
          importance: "important",
        });
      }
      return accepted;
    },
    beginQueueEdit(objectId) {
      const stall = state.objects[objectId];
      const definition = stall ? catalog.placeables[stall.definitionId] : undefined;
      const anchor = stall ? getObjectQueueAnchor(stall, catalog) : undefined;
      if (!stall || definition?.kind !== "stall" || !definition.stall || !anchor) {
        options.onEvent({ kind: "warning", message: "Select a placed stall to edit its queue." });
        return false;
      }
      setBuildTool("queue");
      queueEditingStallId = objectId;
      queueDraft = stall.queuePath?.length ? stall.queuePath.map((point) => ({ ...point })) : [anchor];
      selectedObjectId = objectId;
      selectedBuildId = undefined;
      pendingMoveId = undefined;
      options.onEvent({
        kind: "info",
        message: stall.queuePath?.length
          ? "Choose an existing queue space to shorten it, or an adjacent tile to extend it."
          : "Choose adjacent clear tiles to shape this stall's queue.",
      });
      emitHud(true);
      activeScene?.render(true);
      return true;
    },
    setQueueDirection(objectId, direction) {
      const accepted = runCommand({
        type: "set-stall-queue-direction",
        objectId,
        direction,
      });
      if (accepted) {
        queueEditingStallId = undefined;
        queueDraft = [];
        buildTool = "select";
        selectedObjectId = objectId;
        options.onEvent({ kind: "info", message: `Automatic queue now starts ${direction}.` });
        emitHud(true);
      }
      return accepted;
    },
    finishQueueEdit() {
      if (buildTool !== "queue") return;
      queueEditingStallId = undefined;
      queueDraft = [];
      buildTool = "select";
      options.onEvent({ kind: "info", message: "Queue route saved." });
      emitHud(true);
      activeScene?.render(true);
    },
    setDishEnabled(stallId, dishId, enabled) {
      const definition = STALLS.find((stall) => stall.id === stallId);
      if (!definition || !definition.dishIds.includes(dishId)) return false;
      if (enabled && !isDishIdUnlockedForMenu(dishId, stallMenuProgression(state))) {
        options.onEvent({
          kind: "warning",
          message: "That dish has not been unlocked yet.",
        });
        return false;
      }
      const current = [...(stallMenus[stallId] ?? [])];
      const hasDish = current.includes(dishId);
      if (enabled === hasDish) return true;
      const mastery = state.progression.stallMastery[stallId];
      const upgrade = definition.upgradeLevels.find((candidate) => candidate.level === mastery?.upgradeLevel);
      const menuSlots = definition.menuSlots + (upgrade?.menuSlotsBonus ?? 0);
      if (enabled && current.length >= menuSlots) {
        options.onEvent({
          kind: "warning",
          message: `${localized(definition.nameKey)} has ${menuSlots} menu slots. Turn off another dish first.`,
        });
        return false;
      }
      if (!enabled && current.length <= 1) {
        options.onEvent({
          kind: "warning",
          message: "Every open stall needs at least one operating dish.",
        });
        return false;
      }
      const next = enabled
        ? [...current, dishId]
        : current.filter((candidate) => candidate !== dishId);
      stallMenus = { ...stallMenus, [stallId]: next };
      catalog = withStallMenus(
        withDishVariants(authoredCatalog, activeDishVariants),
        stallMenus,
      );
      state = { ...state, catalog };
      options.onPersistentChange(persistentPayload());
      emitHud(true);
      options.onEvent({
        kind: "info",
        message: `${localized(definition.nameKey)} menu updated.`,
      });
      return true;
    },
    setDishVariant(dishId, variantId) {
      const family = getNutritionVariantFamily(dishId);
      const variant = family?.variants.find((candidate) => candidate.id === variantId);
      if (!family || !variant) return false;
      const rank = Math.max(
        1,
        ...STALLS
          .filter((stall) => stall.dishIds.includes(dishId))
          .map((stall) => state.progression.stallMastery[stall.id]?.rank ?? 1),
      );
      if (variant.unlockRank > rank) {
        options.onEvent({
          kind: "warning",
          message: `Reach stall mastery rank ${variant.unlockRank} to serve that version.`,
        });
        return false;
      }
      if (activeDishVariants[dishId] === variantId) return true;
      activeDishVariants = { ...activeDishVariants, [dishId]: variantId };
      catalog = withStallMenus(
        withDishVariants(authoredCatalog, activeDishVariants),
        stallMenus,
      );
      state = { ...state, catalog };
      options.onPersistentChange(persistentPayload());
      emitHud(true);
      activeScene?.render(true);
      options.onEvent({
        kind: "info",
        message: `${variant.name} will be used for future orders.`,
      });
      return true;
    },
    selectCustomer(customerId) {
      selectedCustomerId = customerId && state.customers[customerId]
        ? customerId
        : undefined;
      emitHud(true);
      activeScene?.render(true);
    },
    addAccessPoint(kind) {
      setBuildTool("access");
      pendingAccessKind = kind;
      selectedAccessPointId = undefined;
      selectedBuildId = undefined;
      selectedObjectId = undefined;
      options.onEvent({ kind: "info", message: `Choose a clear boundary tile for the new ${kind}.` });
      emitHud(true);
      activeScene?.render(true);
    },
    selectAccessPoint(accessPointId) {
      if (accessPointId && !state.accessPoints.some((point) => point.id === accessPointId)) return;
      setBuildTool("access");
      selectedAccessPointId = accessPointId;
      pendingAccessKind = undefined;
      emitHud(true);
      activeScene?.render(true);
    },
    removeSelectedAccessPoint() {
      if (!selectedAccessPointId) return false;
      const accepted = runCommand({ type: "remove-access-point", accessPointId: selectedAccessPointId });
      if (accepted) selectedAccessPointId = undefined;
      return accepted;
    },
    clearGuestRoute() {
      if (state.routeGuidePoints.length === 0) return true;
      const accepted = runCommand({ type: "configure-guest-route", points: [] });
      if (accepted) {
        options.onEvent({ kind: "info", message: "Preferred guest route cleared." });
      }
      return accepted;
    },
    upgradeStall(definitionId) {
      const accepted = runCommand({ type: "upgrade-stall", definitionId });
      if (accepted) options.onEvent({ kind: "success", message: "Stall mastery upgrade purchased.", importance: "important" });
      return accepted;
    },
  };

  return controller;
}
