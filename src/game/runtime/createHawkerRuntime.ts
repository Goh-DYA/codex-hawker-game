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
  calculateExpansionCost,
  createGridMap,
  createNewGame,
  createSnapshot,
  deserializeGameState,
  dispatchCommand,
  getObjectOccupiedTiles,
  getObjectQueueAnchor,
  getSeatLocations,
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
  type Rotation,
  type SimulationCatalog,
  type SimulationEvent,
} from "@/src/game/core";
import type {
  BuildTool,
  GameSpeed,
  RuntimeController,
  RuntimeOptions,
  RuntimeSnapshot,
} from "./types";

const TILE_SIZE = 48;
const MAP_WIDTH = 24;
const MAP_HEIGHT = 16;
const CUSTOMER_PALETTES = [
  [0xd57d63, 0x355e78],
  [0x8d654f, 0xd6a64f],
  [0x6d493a, 0x6d8e5d],
  [0xc9946e, 0x9a5e77],
  [0xe1ae82, 0x3d7d74],
  [0x744a39, 0xc8624c],
  [0xb87958, 0x71669c],
  [0xe0b18f, 0x4d7390],
] as const;

const BUILDABLE_CONTENT = [...PLACEABLES, ...STALLS] as const;
const CONTENT_PLACEABLE_BY_ID = new Map(PLACEABLES.map((item) => [item.id, item]));
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

function formatSimulationEvent(event: SimulationEvent): {
  kind: "info" | "success" | "warning" | "error";
  message: string;
} | undefined {
  if (event.type === "sale-completed") {
    return { kind: "success", message: `A neighbour enjoyed their meal · +$${event.amount ?? 0}` };
  }
  if (event.type === "level-up") {
    return { kind: "success", message: "Centre level increased — new catalogue entries unlocked." };
  }
  if (event.type === "command-rejected") {
    return { kind: "error", message: event.message ?? "That build action is not valid." };
  }
  if (event.type === "target-recovered") {
    return { kind: "warning", message: "A guest rerouted after the layout changed." };
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
  let buildTool: BuildTool = "select";
  let selectedRotation: Rotation = 0;
  let speed: GameSpeed = 1;
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

  function currentSnapshot(): RuntimeSnapshot {
    const snapshot = createSnapshot(state);
    const seats = getSeatLocations(state.objects, catalog);
    const queueCount = Object.values(snapshot.queues).reduce((sum, queue) => sum + queue.length, 0);
    const placedContent = snapshot.objects
      .map((object) => CONTENT_PLACEABLE_BY_ID.get(object.definitionId))
      .filter((item) => item !== undefined);
    const ambience = placedContent.reduce((sum, item) => sum + item.ambienceValue, 0);
    const cleanlinessSupport = placedContent.reduce(
      (sum, item) => sum + item.cleanlinessModifier,
      0,
    );
    const trayReturnStations = snapshot.objects.filter(
      (object) => catalog.placeables[object.definitionId]?.kind === "tray-return",
    ).length;
    const averageSatisfaction = snapshot.customers.length
      ? (snapshot.customers.reduce((sum, customer) => sum + customer.satisfaction, 0) /
          snapshot.customers.length) *
          20 +
        Math.min(8, ambience * 0.25)
      : 100;
    const nextLevelExperience = xpRequiredForLevel(snapshot.progression.level + 1);
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
      averageSatisfaction: Math.max(0, Math.min(100, averageSatisfaction)),
      queuePressure: Math.min(100, queueCount * 13),
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
      unlockedContentIds: snapshot.progression.unlockedDefinitionIds,
      stallMenus,
      canUndo: snapshot.canUndo,
      objectiveProgress: Math.min(5, snapshot.economy.completedVisits),
      objectiveTarget: 5,
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
      drawMap(this.worldGraphics, snapshot);
      drawObjects(this, this.worldGraphics, snapshot);
      drawCustomers(this.worldGraphics, snapshot);
      drawOverlay(this.overlayGraphics, snapshot);
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

  function drawMap(graphics: Phaser.GameObjects.Graphics, snapshot: GameSnapshot) {
    const width = snapshot.map.width * TILE_SIZE;
    const height = snapshot.map.height * TILE_SIZE;
    graphics.fillStyle(0x6f8a71, 1);
    graphics.fillRect(-80, -80, width + 160, height + 160);
    graphics.fillStyle(0xead9b9, 1);
    graphics.fillRect(0, 0, width, height);
    for (let y = 0; y < snapshot.map.height; y += 1) {
      for (let x = 0; x < snapshot.map.width; x += 1) {
        const tile = snapshot.map.tiles[y * snapshot.map.width + x];
        const alternate = (x + y) % 2 === 0;
        graphics.fillStyle(
          tile === "wall" ? 0x466c5d : alternate ? 0xeedfc2 : 0xe8d5b4,
          1,
        );
        graphics.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
        graphics.lineStyle(1, tile === "wall" ? 0x355648 : 0xd3be9b, 0.52);
        graphics.strokeRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
      }
    }

    graphics.fillStyle(0xf7c85e, 1);
    graphics.fillRect(0, 7 * TILE_SIZE + 8, 16, TILE_SIZE - 16);
    graphics.fillRect(width - 16, 7 * TILE_SIZE + 8, 16, TILE_SIZE - 16);
    graphics.lineStyle(3, 0xffffff, 0.7);
    for (let x = 26; x < width - 26; x += 22) {
      graphics.lineBetween(x, 7 * TILE_SIZE + TILE_SIZE / 2, x + 10, 7 * TILE_SIZE + TILE_SIZE / 2);
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
      const cells = getObjectOccupiedTiles(object, catalog);
      if (!definition || cells.length === 0) continue;
      const minX = Math.min(...cells.map((cell) => cell.x)) * TILE_SIZE;
      const minY = Math.min(...cells.map((cell) => cell.y)) * TILE_SIZE;
      const maxX = (Math.max(...cells.map((cell) => cell.x)) + 1) * TILE_SIZE;
      const maxY = (Math.max(...cells.map((cell) => cell.y)) + 1) * TILE_SIZE;
      const objectWidth = maxX - minX;
      const objectHeight = maxY - minY;
      const primary = colour(visual.palette[0] ?? "#6b877c", 0x6b877c);
      const secondary = colour(visual.palette[1] ?? "#f3e0b4", 0xf3e0b4);
      const accent = colour(visual.palette[2] ?? "#d56d50", 0xd56d50);

      graphics.fillStyle(0x17352e, 0.18);
      graphics.fillRoundedRect(minX + 7, minY + 10, objectWidth - 8, objectHeight - 5, 8);

      if (visual.category === "stall") {
        graphics.fillStyle(primary, 1);
        graphics.fillRoundedRect(minX + 3, minY + 3, objectWidth - 6, objectHeight - 6, 8);
        graphics.fillStyle(secondary, 1);
        graphics.fillRoundedRect(minX + 10, minY + 14, objectWidth - 20, objectHeight - 25, 5);
        const stripeWidth = Math.max(16, Math.floor((objectWidth - 12) / 7));
        for (let stripeX = minX + 6, index = 0; stripeX < maxX - 6; stripeX += stripeWidth, index += 1) {
          graphics.fillStyle(index % 2 === 0 ? accent : secondary, 1);
          graphics.fillRect(stripeX, minY + 4, Math.min(stripeWidth, maxX - 6 - stripeX), 13);
        }
        graphics.fillStyle(0x2f4d42, 1);
        graphics.fillRect(minX + 14, maxY - 20, objectWidth - 28, 9);
        graphics.lineStyle(3, 0x17352e, 0.8);
        graphics.strokeRoundedRect(minX + 3, minY + 3, objectWidth - 6, objectHeight - 6, 8);
        scene.addLabel(minX + objectWidth / 2, minY + objectHeight / 2, visual.name);
        if (!object.open) {
          graphics.fillStyle(0x17352e, 0.48);
          graphics.fillRect(minX + 10, minY + 20, objectWidth - 20, objectHeight - 30);
          scene.addLabel(minX + objectWidth / 2, minY + objectHeight / 2 + 20, "CLOSED", "#9a3e31");
        }
      } else if (visual.category === "table") {
        graphics.fillStyle(primary, 1);
        graphics.fillEllipse(minX + objectWidth / 2, minY + objectHeight / 2, objectWidth - 10, objectHeight - 14);
        graphics.lineStyle(4, 0x6b4c32, 0.85);
        graphics.strokeEllipse(minX + objectWidth / 2, minY + objectHeight / 2, objectWidth - 10, objectHeight - 14);
      } else if (visual.category === "seat") {
        graphics.fillStyle(primary, 1);
        graphics.fillRoundedRect(minX + 9, minY + 10, objectWidth - 18, objectHeight - 18, 8);
        graphics.lineStyle(4, 0x294d42, 0.8);
        graphics.strokeRoundedRect(minX + 9, minY + 10, objectWidth - 18, objectHeight - 18, 8);
      } else if (visual.category === "plant") {
        graphics.fillStyle(0x9a6844, 1);
        graphics.fillRoundedRect(minX + objectWidth * 0.3, minY + objectHeight * 0.52, objectWidth * 0.4, objectHeight * 0.36, 5);
        graphics.fillStyle(0x4d8753, 1);
        graphics.fillCircle(minX + objectWidth * 0.36, minY + objectHeight * 0.42, objectWidth * 0.2);
        graphics.fillCircle(minX + objectWidth * 0.62, minY + objectHeight * 0.34, objectWidth * 0.22);
        graphics.fillCircle(minX + objectWidth * 0.52, minY + objectHeight * 0.18, objectWidth * 0.2);
      } else if (visual.category === "fan") {
        graphics.fillStyle(0xc9d9d5, 1);
        graphics.fillCircle(minX + objectWidth / 2, minY + objectHeight / 2, Math.min(objectWidth, objectHeight) * 0.38);
        graphics.fillStyle(0x476f68, 1);
        for (let angle = 0; angle < 360; angle += 90) {
          const radians = PhaserRuntime.Math.DegToRad(angle + state.tick * (reducedMotion ? 0 : 3));
          graphics.fillCircle(
            minX + objectWidth / 2 + Math.cos(radians) * objectWidth * 0.22,
            minY + objectHeight / 2 + Math.sin(radians) * objectHeight * 0.22,
            Math.min(objectWidth, objectHeight) * 0.1,
          );
        }
      } else if (visual.category === "tray-waste") {
        graphics.fillStyle(primary, 1);
        graphics.fillRoundedRect(minX + 6, minY + 5, objectWidth - 12, objectHeight - 10, 5);
        graphics.fillStyle(secondary, 1);
        for (let row = 0; row < 3; row += 1) {
          graphics.fillRect(minX + 13, minY + 12 + row * 10, objectWidth - 26, 5);
        }
        scene.addLabel(minX + objectWidth / 2, minY - 3, "RETURN");
      } else {
        graphics.fillStyle(primary, 1);
        graphics.fillRoundedRect(minX + 6, minY + 6, objectWidth - 12, objectHeight - 12, 7);
        graphics.lineStyle(3, secondary, 0.9);
        graphics.strokeRoundedRect(minX + 6, minY + 6, objectWidth - 12, objectHeight - 12, 7);
      }

      if (selectedObjectId === object.id) {
        graphics.lineStyle(4, 0x287ec0, 1);
        graphics.strokeRoundedRect(minX + 1, minY + 1, objectWidth - 2, objectHeight - 2, 6);
        graphics.fillStyle(0xffffff, 1);
        graphics.fillCircle(maxX - 4, minY + 4, 7);
        graphics.lineStyle(2, 0x287ec0, 1);
        graphics.strokeCircle(maxX - 4, minY + 4, 7);
      }
    }
  }

  function drawCustomers(graphics: Phaser.GameObjects.Graphics, snapshot: GameSnapshot) {
    for (const customer of snapshot.customers) {
      const index = Number.parseInt(customer.id.replace(/\D/g, ""), 10) || 0;
      const palette = CUSTOMER_PALETTES[index % CUSTOMER_PALETTES.length] as readonly [number, number];
      const position = interpolatedCustomerPosition(customer);
      const x = (position.x + 0.5) * TILE_SIZE;
      const y = (position.y + 0.5) * TILE_SIZE;
      graphics.fillStyle(0x17352e, 0.16);
      graphics.fillEllipse(x, y + 10, 25, 10);
      graphics.fillStyle(palette[1], 1);
      graphics.fillCircle(x, y + 2, 11);
      graphics.fillStyle(palette[0], 1);
      graphics.fillCircle(x, y - 10, 7);
      graphics.lineStyle(2, 0x17352e, 0.74);
      graphics.strokeCircle(x, y - 10, 7);
      if (customer.hasTray) {
        graphics.fillStyle(0xf5d277, 1);
        graphics.fillRoundedRect(x - 12, y + 7, 24, 7, 2);
      }
      if (customer.status === "queued" || customer.status === "waiting-for-food") {
        graphics.lineStyle(2, 0xe8b94f, 1);
        graphics.strokeCircle(x, y + 1, 16);
      }
      if (debugOverlay) {
        graphics.lineStyle(2, 0x287ec0, 0.55);
        let previous = { x, y };
        for (const step of customer.path.slice(customer.pathIndex)) {
          const next = tileToWorld(snapshot.map, step);
          graphics.lineBetween(previous.x, previous.y, next.x, next.y);
          previous = next;
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

  function drawOverlay(graphics: Phaser.GameObjects.Graphics, snapshot: GameSnapshot) {
    for (const [stallId, queue] of Object.entries(snapshot.queues)) {
      const stall = snapshot.objects.find((object) => object.id === stallId);
      if (!stall || queue.length === 0) continue;
      const anchor = getObjectQueueAnchor(stall, catalog);
      if (!anchor) continue;
      for (let index = 0; index < queue.length; index += 1) {
        const x = (anchor.x + 0.5) * TILE_SIZE;
        const y = (anchor.y + index + 0.5) * TILE_SIZE;
        graphics.lineStyle(2, 0xe8b94f, 0.9);
        graphics.strokeCircle(x, y, 14);
        graphics.fillStyle(0x17352e, 0.8);
        graphics.fillCircle(x + 11, y - 11, 7);
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
          reservedPoints: [state.entrance, state.exit],
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
    buildTool = tool;
    if (tool !== "move") pendingMoveId = undefined;
    if (tool !== "place") selectedBuildId = undefined;
    selectedObjectId = undefined;
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
        });
      }
      return accepted;
    },
    setDishEnabled(stallId, dishId, enabled) {
      const definition = STALLS.find((stall) => stall.id === stallId);
      if (!definition || !definition.dishIds.includes(dishId)) return false;
      const current = [...(stallMenus[stallId] ?? [])];
      const hasDish = current.includes(dishId);
      if (enabled === hasDish) return true;
      if (enabled && current.length >= definition.menuSlots) {
        options.onEvent({
          kind: "warning",
          message: `${localized(definition.nameKey)} has ${definition.menuSlots} menu slots. Turn off another dish first.`,
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
  };

  return controller;
}
