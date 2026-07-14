import type Phaser from "phaser";
import {
  CUSTOMER_ARCHETYPES,
  DISHES,
  ECONOMY,
  ENGLISH_LOCALIZATION,
  PLACEABLES,
  STALLS,
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
  getObjectOccupiedTiles,
  getObjectQueueAnchor,
  getSeatLocations,
  getUtilityInfluence,
  mealConsumptionFraction,
  OPERATING_DAY_MS,
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
  RuntimeSnapshot,
} from "./types";
import { utilityEffectsForPlaceable } from "./contentUtility";
import { deriveQueueFlowInsight } from "./queueInsight";
import { deriveSatisfactionTips } from "./satisfactionInsight";
import {
  animationPoseForCustomer,
  stableVisualHash,
  visualRecipeForCustomer,
  visualRecipeForDish,
  visualRecipeForPlaceable,
  type PlaceableVisualRecipe,
} from "./visualRecipes";

const TILE_SIZE = 48;
const MAP_WIDTH = 24;
const MAP_HEIGHT = 16;
const BUILDABLE_CONTENT = [...PLACEABLES, ...STALLS] as const;
const CONTENT_PLACEABLE_BY_ID = new Map(PLACEABLES.map((item) => [item.id, item]));
const DISH_BY_ID = new Map(DISHES.map((dish) => [dish.id, dish]));
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
}

function localized(key: string) {
  return ENGLISH_LOCALIZATION[key] ?? key;
}

function colour(value: string, fallback: number) {
  const normalized = value.replace("#", "");
  const parsed = Number.parseInt(normalized, 16);
  return Number.isFinite(parsed) ? parsed : fallback;
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

function buildCatalog(): {
  catalog: SimulationCatalog;
  visuals: Readonly<Record<string, VisualDefinition>>;
} {
  const dishes: SimulationCatalog["dishes"] = Object.fromEntries(
    DISHES.map((dish) => [
      dish.id,
      {
        id: dish.id,
        price: dish.price,
        preparationMs: dish.preparationTimeMs,
        eatingMs: dish.eatingTimeMs,
        quality: dish.quality,
        preferenceTags: dish.preferenceTags,
      },
    ]),
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
  const minutes = 10 * 60 + 30 + Math.floor(elapsedMs / 1_000);
  const minuteInDay = minutes % (24 * 60);
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

interface RuntimePersistentState {
  readonly runtimeSchemaVersion: 1;
  readonly core: unknown;
  readonly stallMenus: Readonly<Record<string, readonly string[]>>;
}

function defaultStallMenus(): Readonly<Record<string, readonly string[]>> {
  return Object.fromEntries(
    STALLS.map((stall) => [stall.id, stall.dishIds.slice(0, stall.menuSlots)]),
  );
}

function normalizeStallMenus(value: unknown): Readonly<Record<string, readonly string[]>> {
  const source = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  return Object.fromEntries(
    STALLS.map((stall) => {
      const rawCandidate = source[stall.id];
      const candidate: unknown[] = Array.isArray(rawCandidate) ? rawCandidate : [];
      const permitted = new Set<string>(stall.dishIds);
      const selected = [...new Set<string>(candidate.filter((id): id is string => typeof id === "string" && permitted.has(id)))]
        .slice(0, stall.menuSlots);
      return [stall.id, selected.length > 0 ? selected : stall.dishIds.slice(0, stall.menuSlots)];
    }),
  );
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

function decodeRuntimeSave(value: unknown): {
  core: unknown;
  menus: Readonly<Record<string, readonly string[]>>;
} {
  if (
    value &&
    typeof value === "object" &&
    (value as { runtimeSchemaVersion?: unknown }).runtimeSchemaVersion === 1
  ) {
    const runtime = value as Partial<RuntimePersistentState>;
    return { core: runtime.core, menus: normalizeStallMenus(runtime.stallMenus) };
  }
  return { core: value, menus: defaultStallMenus() };
}

export async function createHawkerRuntime(
  options: RuntimeOptions,
): Promise<RuntimeController> {
  const PhaserRuntime = (await import("phaser")).default;
  const { catalog: baseCatalog, visuals } = buildCatalog();
  let stallMenus = defaultStallMenus();
  let catalog = withStallMenus(baseCatalog, stallMenus);
  let state: GameState;
  try {
    const candidates = options.initialStates ?? [];
    let loaded: GameState | undefined;
    let lastLoadError: unknown;
    for (let index = 0; index < candidates.length; index += 1) {
      try {
        const decoded = decodeRuntimeSave(candidates[index]);
        stallMenus = decoded.menus;
        catalog = withStallMenus(baseCatalog, stallMenus);
        loaded = reconcileRuntimeUnlocks(
          assertRuntimeMap(deserializeGameState(decoded.core, catalog)),
        );
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
    state = loaded ?? freshState(catalog);
  } catch (error) {
    options.onEvent({
      kind: "warning",
      message: `The previous save was recovered as a new centre: ${error instanceof Error ? error.message : "unknown save error"}`,
    });
    stallMenus = defaultStallMenus();
    catalog = withStallMenus(baseCatalog, stallMenus);
    state = freshState(catalog);
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
    runtimeSchemaVersion: 1,
    core: persistentStateFromGame(state),
    stallMenus,
  });

  const runtime = { game: undefined as Phaser.Game | undefined };
  let activeScene: HawkerScene | undefined;
  let selectedBuildId: string | undefined;
  let selectedObjectId: string | undefined;
  let pendingMoveId: string | undefined;
  let queueEditingStallId: string | undefined;
  let queueDraft: readonly GridPoint[] = [];
  let buildTool: BuildTool = "select";
  let selectedAccessPointId: string | undefined;
  let pendingAccessKind: "entrance" | "exit" | undefined;
  let accessSequence = state.accessPoints.length + 1;
  let selectedRotation: Rotation = 0;
  let speed: GameSpeed = 1;
  let speedBeforeAccess: GameSpeed = 1;
  let reducedMotion = options.settings.reducedMotion;
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

  function isCentreOpen() {
    return Object.values(state.objects).some(
      (object) => catalog.placeables[object.definitionId]?.kind === "stall" && object.open,
    );
  }

  function runCommand(command: GameCommand, persist = true) {
    const result = dispatchCommand(state, command);
    state = result.state;
    for (const event of result.events) {
      const runtimeEvent = formatSimulationEvent(event);
      if (runtimeEvent) options.onEvent(runtimeEvent);
    }
    if (result.accepted && persist) options.onPersistentChange(persistentPayload());
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
      snapshot.accessPoints.map((point) => point.position),
    );
    const blocked = getBlockedTileKeys(state.objects, catalog);
    const routeCells = new Map<string, GridPoint>();
    for (const entrance of snapshot.accessPoints.filter((point) => point.kind === "entrance")) {
      for (const exit of snapshot.accessPoints.filter((point) => point.kind === "exit")) {
        for (const point of findPath(snapshot.map, entrance.position, exit.position, { blocked }).path ?? []) {
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
    return {
      cash: snapshot.economy.currency,
      reputation: snapshot.progression.reputation * 20,
      level: snapshot.progression.level,
      experience: snapshot.progression.xp,
      nextLevelExperience,
      day: 1 + Math.floor(snapshot.elapsedMs / (8 * 60 * 1_000)),
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

    selectedObjectId = objectAt(point)?.id;
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
        else if (key === "escape") setBuildTool("select");
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
        lastSimulationMs = performance.now() - startedAt;
        for (const event of result.events) {
          const runtimeEvent = formatSimulationEvent(event);
          if (runtimeEvent) options.onEvent(runtimeEvent);
        }
        if (state.progression.unlockedDefinitionIds.length > beforeUnlockCount) {
          options.onEvent({
            kind: "success",
            message: "New catalogue choices are now available.",
            importance: "important",
          });
          options.onPersistentChange(persistentPayload());
          lastPeriodicSaveAt = now;
        }
        if (state.economy.lifetimeRevenue !== lastPersistentRevenue) {
          lastPersistentRevenue = state.economy.lifetimeRevenue;
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

    // Keep the route legend truthful by drawing the current walkable path.
    // Because this is derived from the live map and furniture blockers, it
    // follows turns and reaches the migrated exit after every expansion.
    graphics.lineStyle(3, 0xfff7e5, 0.82);
    for (const entrance of snapshot.accessPoints.filter((point) => point.kind === "entrance")) {
      for (const exit of snapshot.accessPoints.filter((point) => point.kind === "exit")) {
        const guestRoute = findPath(snapshot.map, entrance.position, exit.position, {
          blocked: getBlockedTileKeys(state.objects, catalog),
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
    const markWidth = Math.min(30, Math.max(18, bounds.width - 18));
    const startX = bounds.centreX - markWidth / 2;
    const y = bounds.maxY - 9;
    graphics.fillStyle(0xfff4d8, 0.88);
    graphics.fillRoundedRect(startX - 3, y - 4, markWidth + 6, 8, 3);
    graphics.fillStyle(recipe.accent, 1);
    for (let bit = 0; bit < 7; bit += 1) {
      const bitX = startX + (bit / 6) * markWidth;
      if ((recipe.makerMark & (1 << bit)) !== 0) {
        graphics.fillCircle(bitX, y, 2.2);
      } else {
        graphics.fillRect(bitX - 1, y - 1, 2, 2);
      }
    }
  }

  function drawObjectShadow(
    graphics: Phaser.GameObjects.Graphics,
    bounds: ObjectVisualBounds,
    round = false,
  ) {
    graphics.fillStyle(0x17352e, 0.16);
    if (round) {
      graphics.fillEllipse(bounds.centreX + 3, bounds.centreY + 7, bounds.width - 9, bounds.height - 12);
    } else {
      graphics.fillRoundedRect(bounds.minX + 7, bounds.minY + 10, bounds.width - 8, bounds.height - 5, 7);
    }
  }

  function drawStallGraphic(
    scene: HawkerScene,
    graphics: Phaser.GameObjects.Graphics,
    object: PlacedObject,
    bounds: ObjectVisualBounds,
    visual: VisualDefinition,
  ) {
    const primary = colour(visual.palette[0] ?? "#6b877c", 0x6b877c);
    const secondary = colour(visual.palette[1] ?? "#f3e0b4", 0xf3e0b4);
    const accent = colour(visual.palette[2] ?? "#d56d50", 0xd56d50);
    const stallVariant = Math.max(0, STALLS.findIndex((stall) => stall.id === object.definitionId));
    drawObjectShadow(graphics, bounds);
    graphics.fillStyle(primary, 1);
    graphics.fillRoundedRect(bounds.minX + 3, bounds.minY + 3, bounds.width - 6, bounds.height - 6, 9);
    graphics.fillStyle(secondary, 1);
    graphics.fillRoundedRect(bounds.minX + 10, bounds.minY + 17, bounds.width - 20, bounds.height - 29, 5);
    const panelWidth = Math.max(12, (bounds.width - 12) / (5 + (stallVariant % 3)));
    for (let stripeX = bounds.minX + 6, index = 0; stripeX < bounds.maxX - 6; stripeX += panelWidth, index += 1) {
      graphics.fillStyle(index % 2 === 0 ? accent : secondary, 1);
      if (stallVariant % 3 === 0) {
        graphics.fillRect(stripeX, bounds.minY + 4, Math.min(panelWidth, bounds.maxX - 6 - stripeX), 13);
      } else if (stallVariant % 3 === 1) {
        graphics.fillTriangle(stripeX, bounds.minY + 4, stripeX + panelWidth, bounds.minY + 4, stripeX + panelWidth / 2, bounds.minY + 18);
      } else {
        graphics.fillCircle(stripeX + panelWidth / 2, bounds.minY + 9, Math.min(7, panelWidth * 0.42));
      }
    }
    graphics.fillStyle(0x2f4d42, 1);
    graphics.fillRect(bounds.minX + 14, bounds.maxY - 20, bounds.width - 28, 9);
    graphics.fillStyle(accent, 1);
    const motifX = bounds.centreX;
    const motifY = bounds.minY + bounds.height * 0.66;
    if (stallVariant === 2) {
      graphics.fillRoundedRect(motifX - 7, motifY - 7, 11, 14, 3);
      graphics.lineStyle(2, accent, 1);
      graphics.strokeCircle(motifX + 7, motifY - 2, 5);
    } else if (stallVariant === 3 || stallVariant === 7) {
      graphics.fillTriangle(motifX - 8, motifY + 6, motifX, motifY - 8, motifX + 8, motifY + 6);
    } else if (stallVariant === 5) {
      graphics.fillEllipse(motifX, motifY, 18, 9);
      graphics.fillStyle(0x4d8753, 1);
      graphics.fillEllipse(motifX + 6, motifY - 6, 8, 13);
    } else {
      graphics.fillEllipse(motifX, motifY, 20, 10);
      graphics.lineStyle(2, accent, 1);
      graphics.strokeRoundedRect(motifX - 10, motifY - 7, 20, 10, 5);
    }
    graphics.lineStyle(3, 0x17352e, 0.82);
    graphics.strokeRoundedRect(bounds.minX + 3, bounds.minY + 3, bounds.width - 6, bounds.height - 6, 9);
    scene.addLabel(bounds.centreX, bounds.centreY - 3, visual.name);
    if (!object.open) {
      graphics.fillStyle(0x17352e, 0.48);
      graphics.fillRect(bounds.minX + 10, bounds.minY + 20, bounds.width - 20, bounds.height - 30);
      scene.addLabel(bounds.centreX, bounds.centreY + 21, "CLOSED", "#9a3e31");
    }
  }

  function drawTableGraphic(
    graphics: Phaser.GameObjects.Graphics,
    id: string,
    bounds: ObjectVisualBounds,
    recipe: PlaceableVisualRecipe,
  ) {
    const round = id.includes("round") || id.includes("terrazzo");
    drawObjectShadow(graphics, bounds, round);
    graphics.fillStyle(0x7e5738, 0.9);
    graphics.fillCircle(bounds.minX + 13, bounds.maxY - 12, 4);
    graphics.fillCircle(bounds.maxX - 13, bounds.maxY - 12, 4);
    graphics.fillStyle(recipe.accent, 1);
    if (round) {
      graphics.fillEllipse(bounds.centreX, bounds.centreY - 2, bounds.width - 10, bounds.height - 15);
      graphics.lineStyle(4, 0x6b4c32, 0.82);
      graphics.strokeEllipse(bounds.centreX, bounds.centreY - 2, bounds.width - 10, bounds.height - 15);
    } else if (id.includes("snack-ledge")) {
      graphics.fillRoundedRect(bounds.minX + 5, bounds.centreY - 8, bounds.width - 10, 16, 5);
      graphics.lineStyle(4, 0x6b4c32, 0.85);
      graphics.lineBetween(bounds.minX + 12, bounds.centreY + 8, bounds.minX + 12, bounds.maxY - 7);
      graphics.lineBetween(bounds.maxX - 12, bounds.centreY + 8, bounds.maxX - 12, bounds.maxY - 7);
    } else {
      const inset = id.includes("communal") || id.includes("family") ? 5 : 8;
      graphics.fillRoundedRect(bounds.minX + inset, bounds.minY + 7, bounds.width - inset * 2, bounds.height - 17, id.includes("folding") ? 2 : 7);
      graphics.lineStyle(4, 0x6b4c32, 0.82);
      graphics.strokeRoundedRect(bounds.minX + inset, bounds.minY + 7, bounds.width - inset * 2, bounds.height - 17, id.includes("folding") ? 2 : 7);
    }
    if (id.includes("trestle") || id.includes("folding")) {
      graphics.lineStyle(3, 0x6b4c32, 0.8);
      graphics.lineBetween(bounds.minX + 12, bounds.minY + 14, bounds.maxX - 12, bounds.maxY - 13);
      graphics.lineBetween(bounds.maxX - 12, bounds.minY + 14, bounds.minX + 12, bounds.maxY - 13);
    }
    if (id.includes("terrazzo")) {
      const speckleColours = [0xf6cf68, 0xc8624c, 0x477c86, 0xfff4d8];
      for (let index = 0; index < 9; index += 1) {
        const angle = (index / 9) * Math.PI * 2;
        graphics.fillStyle(speckleColours[index % speckleColours.length] as number, 0.95);
        graphics.fillCircle(bounds.centreX + Math.cos(angle) * bounds.width * 0.25, bounds.centreY - 2 + Math.sin(angle) * bounds.height * 0.23, 2.5);
      }
    }
    if (id.includes("accessible")) {
      graphics.lineStyle(3, 0xe8f4ff, 1);
      graphics.strokeCircle(bounds.centreX, bounds.centreY - 4, 8);
      graphics.lineBetween(bounds.centreX, bounds.centreY + 4, bounds.centreX + 8, bounds.centreY + 11);
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
    drawObjectShadow(graphics, bounds, isStool);
    graphics.fillStyle(recipe.accent, 1);
    if (isStool) {
      const radius = Math.min(bounds.width, bounds.height) * (id.includes("high-counter") ? 0.3 : 0.35);
      graphics.fillCircle(bounds.centreX, bounds.centreY - 2, radius);
      graphics.lineStyle(3, 0x294d42, 0.9);
      graphics.strokeCircle(bounds.centreX, bounds.centreY - 2, radius);
      graphics.lineBetween(bounds.centreX, bounds.centreY + radius - 2, bounds.centreX, bounds.maxY - 7);
      if (id.includes("swivel")) {
        graphics.lineBetween(bounds.centreX - 10, bounds.maxY - 8, bounds.centreX + 10, bounds.maxY - 8);
      }
    } else if (isBench) {
      graphics.fillRoundedRect(bounds.minX + 7, bounds.minY + 12, bounds.width - 14, bounds.height - 21, id.includes("acoustic") ? 10 : 5);
      graphics.fillStyle(0x294d42, 0.8);
      graphics.fillRoundedRect(bounds.minX + 8, bounds.minY + 7, bounds.width - 16, 8, 3);
      if (id.includes("acoustic")) {
        graphics.fillRect(bounds.minX + 7, bounds.minY + 7, 6, bounds.height - 16);
        graphics.fillRect(bounds.maxX - 13, bounds.minY + 7, 6, bounds.height - 16);
      }
      const places = id.includes("three-person") ? 3 : 2;
      for (let index = 1; index < places; index += 1) {
        const x = bounds.minX + (bounds.width * index) / places;
        graphics.lineStyle(2, 0xfff4d8, 0.55);
        graphics.lineBetween(x, bounds.minY + 16, x, bounds.maxY - 11);
      }
    } else {
      const inset = id.includes("easy-rise") ? 7 : 10;
      graphics.fillRoundedRect(bounds.minX + inset, bounds.minY + 15, bounds.width - inset * 2, bounds.height - 24, 7);
      graphics.fillStyle(0x294d42, 0.88);
      graphics.fillRoundedRect(bounds.minX + inset, bounds.minY + 7, bounds.width - inset * 2, 10, 4);
      if (id.includes("arm-chair")) {
        graphics.fillRect(bounds.minX + 5, bounds.minY + 16, 7, bounds.height - 22);
        graphics.fillRect(bounds.maxX - 12, bounds.minY + 16, 7, bounds.height - 22);
      }
      if (id.includes("booster")) {
        graphics.fillStyle(0xf6cf68, 1);
        graphics.fillRoundedRect(bounds.centreX - 7, bounds.centreY - 4, 14, 11, 4);
      }
      if (id.includes("cushioned")) {
        graphics.fillStyle(0xffe8cf, 0.9);
        graphics.fillCircle(bounds.centreX, bounds.centreY, 3);
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
    graphics.fillStyle(0x57776e, 1);
    graphics.fillRoundedRect(x, y, width, height, 6);
    graphics.lineStyle(3, 0x294d42, 0.82);
    graphics.strokeRoundedRect(x, y, width, height, 6);
    if (id.includes("ticket")) {
      graphics.fillStyle(0xfff4d8, 1);
      graphics.fillRoundedRect(bounds.centreX - 10, y + 5, 20, 15, 3);
      graphics.fillStyle(recipe.accent, 1);
      graphics.fillRect(bounds.centreX - 5, y + 11, 10, 3);
      graphics.fillRect(bounds.centreX - 8, y + 25, 16, 5);
    } else if (id.includes("condiment")) {
      const bottleColours = [0xc8624c, 0xd69a35, 0x4d8753];
      for (let index = 0; index < 3; index += 1) {
        graphics.fillStyle(bottleColours[index] as number, 1);
        graphics.fillRoundedRect(bounds.centreX - 14 + index * 11, bounds.centreY - 10, 8, 20, 3);
      }
    } else if (id.includes("cutlery")) {
      graphics.lineStyle(3, 0xdce8e4, 1);
      for (let index = -1; index <= 1; index += 1) {
        graphics.lineBetween(bounds.centreX + index * 8, bounds.centreY - 12, bounds.centreX + index * 8, bounds.centreY + 12);
      }
    } else if (id.includes("water")) {
      graphics.fillStyle(0x70bfd0, 1);
      graphics.fillCircle(bounds.centreX, bounds.centreY - 5, 11);
      graphics.fillTriangle(bounds.centreX - 7, bounds.centreY, bounds.centreX + 7, bounds.centreY, bounds.centreX, bounds.centreY + 15);
    } else if (id.includes("pickup")) {
      graphics.fillStyle(0xfff4d8, 1);
      for (let row = 0; row < 3; row += 1) graphics.fillRect(x + 6, y + 7 + row * 11, width - 12, 4);
      graphics.fillStyle(recipe.accent, 1);
      graphics.fillCircle(bounds.centreX, y + 8, 4);
    } else if (id.includes("display-case")) {
      graphics.fillStyle(id.includes("chilled") ? 0xa9d9e2 : 0xf4b567, 0.9);
      graphics.fillRoundedRect(x + 4, y + 4, width - 8, height - 12, 4);
      graphics.lineStyle(2, 0xffffff, 0.8);
      graphics.lineBetween(bounds.centreX, y + 5, bounds.centreX, y + height - 9);
      for (let row = 0; row < 2; row += 1) {
        graphics.fillStyle(0xd27b4c, 1);
        graphics.fillEllipse(bounds.centreX - 8 + row * 16, bounds.centreY + 4, 12, 7);
      }
    } else {
      graphics.fillStyle(recipe.accent, 1);
      graphics.fillRect(x + 5, y + 6, width - 10, height - 16);
      graphics.fillStyle(0x294d42, 1);
      graphics.fillCircle(x + 7, y + height, 5);
      graphics.fillCircle(x + width - 7, y + height, 5);
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
    graphics.fillStyle(0x598078, 1);
    graphics.fillRoundedRect(bounds.minX + 6, bounds.minY + 5, bounds.width - 12, bounds.height - 10, 5);
    graphics.lineStyle(3, 0x294d42, 0.8);
    graphics.strokeRoundedRect(bounds.minX + 6, bounds.minY + 5, bounds.width - 12, bounds.height - 10, 5);
    if (id.includes("tray-return") || id.includes("dish-drop") || id.includes("tray-stack")) {
      const bays = id.includes("dual") ? 2 : 1;
      for (let bay = 0; bay < bays; bay += 1) {
        const bayX = bounds.minX + 11 + (bay * (bounds.width - 22)) / bays;
        const bayWidth = (bounds.width - 27) / bays;
        graphics.fillStyle(0xc8d7d2, 1);
        for (let row = 0; row < 3; row += 1) graphics.fillRect(bayX, bounds.minY + 15 + row * 10, bayWidth, 5);
      }
      scene.addLabel(bounds.centreX, bounds.minY - 3, id.includes("tray-stack") ? "CLEAN TRAYS" : "RETURN");
    } else if (id.includes("recycling")) {
      const colours = [0x4d8753, 0xf2c14e, 0x4d7390];
      for (let index = 0; index < 3; index += 1) {
        graphics.fillStyle(colours[index] as number, 1);
        graphics.fillCircle(bounds.minX + 15 + index * ((bounds.width - 30) / 2), bounds.centreY, 7);
      }
    } else if (id.includes("food-waste")) {
      graphics.fillStyle(0x8b5b27, 1);
      graphics.fillEllipse(bounds.centreX, bounds.minY + 15, bounds.width - 22, 12);
      graphics.fillStyle(0x4d8753, 1);
      graphics.fillEllipse(bounds.centreX + 4, bounds.centreY, 13, 8);
    } else if (id.includes("trolley")) {
      graphics.fillStyle(recipe.accent, 1);
      graphics.fillRect(bounds.minX + 12, bounds.minY + 12, bounds.width - 24, bounds.height - 25);
      graphics.fillStyle(0x294d42, 1);
      graphics.fillCircle(bounds.minX + 15, bounds.maxY - 9, 5);
      graphics.fillCircle(bounds.maxX - 15, bounds.maxY - 9, 5);
    } else {
      graphics.fillStyle(0x263d38, 1);
      graphics.fillEllipse(bounds.centreX, bounds.minY + 14, bounds.width - 20, 11);
      graphics.fillStyle(recipe.accent, 1);
      graphics.fillRect(bounds.centreX - 3, bounds.minY + 20, 6, 15);
    }
    drawMakerMark(graphics, bounds, recipe);
  }

  function drawLightingGraphic(
    graphics: Phaser.GameObjects.Graphics,
    id: string,
    bounds: ObjectVisualBounds,
    recipe: PlaceableVisualRecipe,
  ) {
    const pulse = reducedMotion ? 0.16 : 0.12 + Math.sin(state.tick * 0.09 + recipe.seed) * 0.04;
    graphics.fillStyle(0xffd86b, pulse);
    graphics.fillCircle(bounds.centreX, bounds.centreY, Math.min(bounds.width, bounds.height) * 0.48);
    graphics.fillStyle(0xffefb0, 1);
    if (id.includes("tube")) {
      graphics.fillRoundedRect(bounds.minX + 5, bounds.centreY - 5, bounds.width - 10, 10, 5);
    } else if (id.includes("pendant")) {
      graphics.lineStyle(3, 0x294d42, 1);
      graphics.lineBetween(bounds.centreX, bounds.minY + 4, bounds.centreX, bounds.centreY - 9);
      graphics.fillTriangle(bounds.centreX - 13, bounds.centreY + 5, bounds.centreX + 13, bounds.centreY + 5, bounds.centreX, bounds.centreY - 12);
    } else if (id.includes("lantern-cluster")) {
      for (let index = 0; index < 3; index += 1) {
        graphics.fillStyle(index === 1 ? recipe.accent : 0xffd86b, 1);
        graphics.fillCircle(bounds.centreX - 12 + index * 12, bounds.centreY - 4 + Math.abs(index - 1) * 8, 8);
      }
    } else if (id.includes("path-light")) {
      graphics.fillRoundedRect(bounds.centreX - 6, bounds.centreY - 12, 12, 24, 4);
      graphics.fillStyle(recipe.accent, 1);
      graphics.fillRect(bounds.centreX - 6, bounds.centreY + 3, 12, 5);
    } else if (id.includes("skylight")) {
      graphics.fillStyle(0xb9e2e8, 1);
      graphics.fillRoundedRect(bounds.minX + 6, bounds.minY + 6, bounds.width - 12, bounds.height - 12, 5);
      graphics.lineStyle(2, 0xffffff, 0.9);
      graphics.lineBetween(bounds.minX + 9, bounds.minY + 9, bounds.maxX - 9, bounds.maxY - 9);
    } else if (id.includes("string")) {
      graphics.lineStyle(2, 0x6b4c32, 1);
      graphics.lineBetween(bounds.minX + 5, bounds.centreY, bounds.maxX - 5, bounds.centreY);
      for (let index = 0; index < 5; index += 1) {
        graphics.fillStyle(index % 2 === 0 ? 0xf4c65a : recipe.accent, 1);
        graphics.fillCircle(bounds.minX + 8 + index * ((bounds.width - 16) / 4), bounds.centreY + (index % 2) * 5, 4);
      }
    } else {
      graphics.fillCircle(bounds.centreX, bounds.centreY, 12);
      graphics.fillStyle(recipe.accent, 1);
      graphics.fillRect(bounds.centreX - 10, bounds.centreY + 8, 20, 5);
    }
    drawMakerMark(graphics, bounds, recipe);
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
      graphics.fillStyle(id.includes("quiet") ? 0xe4ece8 : 0xc9d9d5, 1);
      graphics.fillCircle(bounds.centreX, bounds.centreY - 2, radius + 5);
      graphics.lineStyle(2, 0x476f68, 0.75);
      graphics.strokeCircle(bounds.centreX, bounds.centreY - 2, radius + 5);
      const bladeCount = id.includes("high-volume") ? 5 : id.includes("ceiling") ? 4 : 3;
      for (let blade = 0; blade < bladeCount; blade += 1) {
        const radians = PhaserRuntime.Math.DegToRad(
          (blade * 360) / bladeCount + state.tick * (reducedMotion ? 0 : id.includes("quiet") ? 1.4 : 3.2),
        );
        const bladeX = bounds.centreX + Math.cos(radians) * radius * 0.54;
        const bladeY = bounds.centreY - 2 + Math.sin(radians) * radius * 0.54;
        graphics.fillStyle(recipe.accent, 0.95);
        graphics.fillEllipse(bladeX, bladeY, radius * 0.9, radius * 0.34);
      }
      graphics.fillStyle(0x294d42, 1);
      graphics.fillCircle(bounds.centreX, bounds.centreY - 2, 5);
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
    if (id.includes("trellis")) {
      graphics.lineStyle(3, 0x8b5b4c, 1);
      for (let column = 0; column < 3; column += 1) {
        const x = bounds.minX + 10 + column * ((bounds.width - 20) / 2);
        graphics.lineBetween(x, bounds.minY + 7, x, bounds.maxY - 8);
      }
      graphics.lineBetween(bounds.minX + 8, bounds.centreY, bounds.maxX - 8, bounds.centreY);
    }
    graphics.fillStyle(id.includes("rain-garden") ? 0x477c86 : 0x9a6844, 1);
    const potHeight = id.includes("border-bed") || id.includes("trough") ? 13 : 17;
    graphics.fillRoundedRect(bounds.minX + bounds.width * 0.22, bounds.maxY - potHeight - 5, bounds.width * 0.56, potHeight, 5);
    const leafCount = id.includes("areca") || id.includes("banana") ? 7 : id.includes("pandan") ? 9 : 5;
    for (let leaf = 0; leaf < leafCount; leaf += 1) {
      const angle = -Math.PI * 0.85 + (leaf / Math.max(1, leafCount - 1)) * Math.PI * 0.7;
      const length = (id.includes("areca") || id.includes("banana") ? 25 : 17) + (leaf % 3) * 3;
      const baseX = bounds.centreX + (id.includes("trough") || id.includes("pandan") ? (leaf - leafCount / 2) * 5 : 0);
      const baseY = bounds.maxY - potHeight - 4;
      const tipX = baseX + Math.cos(angle) * length;
      const tipY = baseY + Math.sin(angle) * length;
      graphics.lineStyle(id.includes("banana") ? 8 : 5, leaf % 2 === 0 ? 0x4d8753 : recipe.accent, 1);
      graphics.lineBetween(baseX, baseY, tipX, tipY);
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
    graphics.fillStyle(id.includes("first-aid") ? 0xf2f0e6 : 0x7ba39a, 1);
    graphics.fillRoundedRect(bounds.minX + 6, bounds.minY + 6, bounds.width - 12, bounds.height - 14, 6);
    graphics.lineStyle(3, 0x294d42, 0.82);
    graphics.strokeRoundedRect(bounds.minX + 6, bounds.minY + 6, bounds.width - 12, bounds.height - 14, 6);
    if (id.includes("sink") || id.includes("basin")) {
      graphics.fillStyle(0xdce8e4, 1);
      graphics.fillEllipse(bounds.centreX, bounds.centreY + 4, bounds.width - 22, bounds.height * 0.35);
      graphics.lineStyle(4, recipe.accent, 1);
      graphics.lineBetween(bounds.centreX, bounds.minY + 10, bounds.centreX, bounds.centreY - 4);
      graphics.lineBetween(bounds.centreX, bounds.centreY - 4, bounds.centreX + 8, bounds.centreY - 4);
    } else if (id.includes("fountain")) {
      graphics.fillStyle(0x70bfd0, 1);
      graphics.fillCircle(bounds.centreX, bounds.centreY - 5, 11);
      graphics.fillStyle(0xdce8e4, 1);
      graphics.fillCircle(bounds.centreX + 6, bounds.centreY - 10, 3);
    } else if (id.includes("first-aid")) {
      graphics.fillStyle(0xc75542, 1);
      graphics.fillRect(bounds.centreX - 4, bounds.centreY - 14, 8, 28);
      graphics.fillRect(bounds.centreX - 14, bounds.centreY - 4, 28, 8);
    } else if (id.includes("cupboard")) {
      graphics.lineStyle(3, 0x294d42, 1);
      graphics.lineBetween(bounds.centreX, bounds.minY + 8, bounds.centreX, bounds.maxY - 10);
      graphics.fillStyle(0xf4c65a, 1);
      graphics.fillCircle(bounds.centreX - 5, bounds.centreY, 2.5);
      graphics.fillCircle(bounds.centreX + 5, bounds.centreY, 2.5);
    } else {
      graphics.fillStyle(recipe.accent, 1);
      graphics.fillCircle(bounds.centreX, bounds.centreY, 12);
      graphics.fillStyle(0xfff4d8, 1);
      graphics.fillCircle(bounds.centreX, bounds.centreY, 5);
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
      graphics.lineBetween(bounds.minX + 4, bounds.minY + 10, bounds.maxX - 4, bounds.minY + 10);
      for (let index = 0; index < 5; index += 1) {
        graphics.fillStyle(index % 2 ? recipe.accent : 0xf4c65a, 1);
        const x = bounds.minX + 7 + index * ((bounds.width - 14) / 4);
        graphics.fillTriangle(x - 5, bounds.minY + 10, x + 5, bounds.minY + 10, x, bounds.minY + 24);
      }
    } else if (id.includes("flower-vase")) {
      graphics.fillStyle(0x477c86, 1);
      graphics.fillRoundedRect(bounds.centreX - 6, bounds.centreY, 12, 17, 5);
      for (let index = 0; index < 5; index += 1) {
        const angle = (index / 5) * Math.PI * 2;
        graphics.fillStyle(index % 2 ? 0xf4c65a : recipe.accent, 1);
        graphics.fillCircle(bounds.centreX + Math.cos(angle) * 9, bounds.centreY - 5 + Math.sin(angle) * 7, 5);
      }
    } else if (id.includes("clock")) {
      graphics.fillStyle(0xfff4d8, 1);
      graphics.fillCircle(bounds.centreX, bounds.centreY, Math.min(bounds.width, bounds.height) * 0.32);
      graphics.lineStyle(3, recipe.accent, 1);
      graphics.strokeCircle(bounds.centreX, bounds.centreY, Math.min(bounds.width, bounds.height) * 0.32);
      graphics.lineBetween(bounds.centreX, bounds.centreY, bounds.centreX, bounds.centreY - 10);
      graphics.lineBetween(bounds.centreX, bounds.centreY, bounds.centreX + 8, bounds.centreY + 4);
    } else {
      drawObjectShadow(graphics, bounds);
      graphics.fillStyle(id.includes("noticeboard") ? 0x8b5b4c : recipe.accent, 1);
      graphics.fillRoundedRect(bounds.minX + 5, bounds.minY + 6, bounds.width - 10, bounds.height - 15, 5);
      const patternCount = id.includes("mural") ? 8 : 4;
      for (let index = 0; index < patternCount; index += 1) {
        graphics.fillStyle(index % 2 ? 0xfff4d8 : 0xf4c65a, 0.85);
        const x = bounds.minX + 11 + (index % 4) * ((bounds.width - 22) / 3);
        const y = bounds.minY + 13 + Math.floor(index / 4) * 14;
        graphics.fillRect(x - 3, y - 3, 6, 6);
      }
    }
    drawMakerMark(graphics, bounds, recipe);
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
        drawStallGraphic(scene, graphics, object, bounds, visual);
      } else {
        const recipe = visualRecipeForPlaceable(object.definitionId, visual.category);
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

  function drawDishServing(
    graphics: Phaser.GameObjects.Graphics,
    dishId: string | undefined,
    x: number,
    y: number,
    scale: number,
    eatenFraction = 0,
  ) {
    const dish = dishId ? DISH_BY_ID.get(dishId) : undefined;
    if (!dish) return;
    const recipe = DISH_VISUAL_BY_ID.get(dish.id) ?? visualRecipeForDish(dish);
    const remaining = Math.max(0.22, 1 - eatenFraction);
    graphics.fillStyle(0x17352e, 0.16);
    graphics.fillEllipse(x + 1, y + 3 * scale, 25 * scale, 10 * scale);
    if (recipe.vessel === "cup") {
      graphics.fillStyle(0xf5efe1, 1);
      graphics.fillRoundedRect(x - 7 * scale, y - 7 * scale, 13 * scale, 16 * scale, 3 * scale);
      graphics.lineStyle(2 * scale, 0x7a6650, 1);
      graphics.strokeCircle(x + 7 * scale, y, 5 * scale);
      graphics.fillStyle(recipe.portionColour, 1);
      graphics.fillEllipse(x - 0.5 * scale, y - 5 * scale, 10 * scale * remaining, 4 * scale);
    } else if (recipe.vessel === "bowl") {
      graphics.fillStyle(0xf5efe1, 1);
      graphics.fillEllipse(x, y, 24 * scale, 17 * scale);
      graphics.lineStyle(2 * scale, 0x7a6650, 0.9);
      graphics.strokeEllipse(x, y, 24 * scale, 17 * scale);
      graphics.fillStyle(recipe.portionColour, 1);
      graphics.fillEllipse(x, y - 1 * scale, 18 * scale * remaining, 10 * scale * remaining);
    } else {
      graphics.fillStyle(recipe.vessel === "tray" ? 0xd7b46d : 0xf5efe1, 1);
      if (recipe.vessel === "tray") {
        graphics.fillRoundedRect(x - 13 * scale, y - 8 * scale, 26 * scale, 16 * scale, 3 * scale);
      } else {
        graphics.fillCircle(x, y, 12 * scale);
        graphics.lineStyle(2 * scale, 0x7a6650, 0.75);
        graphics.strokeCircle(x, y, 12 * scale);
      }
      graphics.fillStyle(recipe.portionColour, 1);
      if (recipe.foodForm === "bread" || recipe.foodForm === "seafood") {
        graphics.fillEllipse(x, y, 18 * scale * remaining, 8 * scale * remaining);
      } else {
        graphics.fillCircle(x, y, 8 * scale * remaining);
      }
    }
    graphics.fillStyle(recipe.garnishColour, 1);
    for (let index = 0; index < recipe.garnishCount; index += 1) {
      const angle = (index / recipe.garnishCount) * Math.PI * 2 + recipe.garnishCount;
      graphics.fillCircle(
        x + Math.cos(angle) * 5 * scale * remaining,
        y + Math.sin(angle) * 4 * scale * remaining,
        1.7 * scale,
      );
    }
    if (recipe.steam !== "none" && !reducedMotion && eatenFraction < 0.82) {
      const wisps = recipe.steam === "full" ? 3 : 1;
      graphics.lineStyle(1.5 * scale, 0xffffff, 0.62);
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

  function drawCustomers(graphics: Phaser.GameObjects.Graphics, snapshot: GameSnapshot) {
    for (const customer of snapshot.customers) {
      const archetype = CUSTOMER_BY_ID.get(customer.archetypeId) ?? CUSTOMER_ARCHETYPES[0];
      if (!archetype) continue;
      const visual = CUSTOMER_VISUAL_BY_ID.get(archetype.id) ?? visualRecipeForCustomer(archetype);
      const customerSeed = stableVisualHash(customer.id);
      const pose = animationPoseForCustomer(customer.status, snapshot.tick, customerSeed, reducedMotion);
      const position = interpolatedCustomerPosition(customer);
      const next = customer.path[customer.pathIndex];
      const directionX = next ? Math.sign(next.x - customer.position.x) : 0;
      const directionY = next ? Math.sign(next.y - customer.position.y) : 1;
      const x = (position.x + 0.5) * TILE_SIZE;
      const y = (position.y + 0.5) * TILE_SIZE + pose.bob;
      const bodyWidth = 18 + (visual.bodyVariant % 3) * 2;
      const bodyHeight = pose.pose === "eat" ? 18 : 21;

      graphics.fillStyle(0x17352e, 0.16);
      graphics.fillEllipse(x, y + 13, bodyWidth + 9, 9);
      if (pose.stride !== 0) {
        graphics.lineStyle(4, visual.clothing, 1);
        graphics.lineBetween(x - 4, y + 7, x - 5 + pose.stride, y + 14);
        graphics.lineBetween(x + 4, y + 7, x + 5 - pose.stride, y + 14);
      }
      graphics.fillStyle(visual.clothing, 1);
      graphics.fillRoundedRect(x - bodyWidth / 2, y - 5, bodyWidth, bodyHeight, 8);
      graphics.fillStyle(visual.accent, 1);
      graphics.fillRect(x - bodyWidth / 2, y + 4, bodyWidth, 4);
      graphics.fillStyle(visual.skin, 1);
      graphics.fillCircle(x + directionX * 2, y - 10 + directionY * 0.5, 7.5);
      graphics.lineStyle(2, 0x17352e, 0.7);
      graphics.strokeCircle(x + directionX * 2, y - 10 + directionY * 0.5, 7.5);
      graphics.lineStyle(3.5, visual.skin, 1);
      graphics.lineBetween(x - bodyWidth / 2 + 2, y, x - bodyWidth / 2 - 3 + pose.armSwing, y + 8);
      graphics.lineBetween(x + bodyWidth / 2 - 2, y, x + bodyWidth / 2 + 3 - pose.armSwing, y + 8);

      if (((customerSeed >>> 7) % 1_000) / 1_000 < visual.accessoryChance) {
        drawCustomerAccessory(graphics, visual.accessory, x, y, visual.accent);
      }

      if (pose.carriesFood || (customer.hasTray && customer.status !== "eating")) {
        graphics.fillStyle(0xd7b46d, 1);
        graphics.fillRoundedRect(x - 13, y + 8, 26, 8, 2);
        graphics.lineStyle(1.5, 0x7a5a35, 0.9);
        graphics.strokeRoundedRect(x - 13, y + 8, 26, 8, 2);
        if (pose.carriesFood) drawDishServing(graphics, customer.orderedDishId, x, y + 7, 0.55);
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
        graphics.fillStyle(0xd7b46d, 1);
        graphics.fillRoundedRect(anchor.x - 15, anchor.y - 10, 30, 20, 3);
        drawDishServing(graphics, customer.orderedDishId, anchor.x, anchor.y, 0.72, eatenFraction);
        graphics.lineStyle(2.5, visual.skin, 1);
        graphics.lineBetween(x + 5, y + 2, anchor.x + pose.armSwing * 0.35, anchor.y - 2);
        graphics.lineStyle(1.5, 0x5f5142, 1);
        graphics.lineBetween(anchor.x + 9, anchor.y - 7, anchor.x + 13, anchor.y + 7);
      }

      drawCustomerIndicator(graphics, pose.indicator, x + 15, y - 19, visual.accent);

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

  function interpolatedCustomerPosition(customer: Customer) {
    const next = customer.path[customer.pathIndex];
    if (!next || reducedMotion) return customer.position;
    const progress = Math.max(0, Math.min(1, customer.movementProgress));
    return {
      x: customer.position.x + (next.x - customer.position.x) * progress,
      y: customer.position.y + (next.y - customer.position.y) * progress,
    };
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
      snapshot.accessPoints.map((point) => point.position),
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
          reservedPoints: state.accessPoints.map((point) => point.position),
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
    const leavingAccess = buildTool === "access" && tool !== "access";
    if (tool === "access" && buildTool !== "access") {
      speedBeforeAccess = speed === 0 ? 1 : speed;
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
    if (leavingAccess) speed = speedBeforeAccess;
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
      if (itemId) buildTool = "place";
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
      runCommand({ type: "set-quality-mode", mode: quality });
      game.loop.setFPSLimit(quality === "standard" ? 60 : 30);
    },
    setReducedMotion(enabled) {
      reducedMotion = enabled;
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
      stallMenus = decoded.menus;
      catalog = withStallMenus(baseCatalog, stallMenus);
      state = reconcileRuntimeUnlocks(
        assertRuntimeMap(deserializeGameState(decoded.core, catalog)),
      );
      recomputeObjectSequence();
      lastPersistentRevenue = state.economy.lifetimeRevenue;
      activeScene?.syncWorldBounds(true);
      activeScene?.render(true);
      emitHud(true);
    },
    reset() {
      stallMenus = defaultStallMenus();
      catalog = withStallMenus(baseCatalog, stallMenus);
      state = freshState(catalog);
      recomputeObjectSequence();
      selectedBuildId = undefined;
      selectedObjectId = undefined;
      selectedAccessPointId = undefined;
      pendingAccessKind = undefined;
      buildTool = "select";
      speed = 1;
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
      queueEditingStallId = objectId;
      queueDraft = stall.queuePath?.length ? stall.queuePath.map((point) => ({ ...point })) : [anchor];
      buildTool = "queue";
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
      catalog = withStallMenus(baseCatalog, stallMenus);
      state = { ...state, catalog };
      options.onPersistentChange(persistentPayload());
      emitHud(true);
      options.onEvent({
        kind: "info",
        message: `${localized(definition.nameKey)} menu updated.`,
      });
      return true;
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
    upgradeStall(definitionId) {
      const accepted = runCommand({ type: "upgrade-stall", definitionId });
      if (accepted) options.onEvent({ kind: "success", message: "Stall mastery upgrade purchased.", importance: "important" });
      return accepted;
    },
  };

  return controller;
}
