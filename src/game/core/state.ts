import { getUnlockedDefinitionIds } from "./economy";
import { getTile, pointKey, validatePlacement } from "./grid";
import { isReachable, validateWorldNavigation } from "./pathfinding";
import { hashSeed } from "./rng";
import { compareIds } from "./ordering";
import type {
  Customer,
  GameSnapshot,
  GameState,
  GridMap,
  NewGameOptions,
  PlacedObject,
  SimulationConfig,
  SimulationConfigOverrides,
  SimulationMetrics,
  UndoSnapshot,
} from "./types";
import { assertValidCatalog, isValidSimulationId } from "./validation";

export const DEFAULT_SIMULATION_CONFIG: SimulationConfig = {
  fixedStepMs: 100,
  spawnIntervalMs: 2_500,
  stuckRecoveryMs: 3_000,
  maxVisitMs: 120_000,
  reputationGainPerVisit: 0.02,
  expansionBaseCostPerTile: 5,
  expansionCostGrowth: 1.35,
  buildUndoWindowMs: 5_000,
  standard: { maxActiveCustomers: 80, maxFixedStepsPerAdvance: 20 },
  lowerEnd: { maxActiveCustomers: 40, maxFixedStepsPerAdvance: 10 },
};

function mergeConfig(config: SimulationConfigOverrides | undefined): SimulationConfig {
  const merged: SimulationConfig = {
    ...DEFAULT_SIMULATION_CONFIG,
    ...config,
    standard: { ...DEFAULT_SIMULATION_CONFIG.standard, ...config?.standard },
    lowerEnd: { ...DEFAULT_SIMULATION_CONFIG.lowerEnd, ...config?.lowerEnd },
  };
  for (const [name, value] of [
    ["fixedStepMs", merged.fixedStepMs],
    ["spawnIntervalMs", merged.spawnIntervalMs],
    ["stuckRecoveryMs", merged.stuckRecoveryMs],
    ["maxVisitMs", merged.maxVisitMs],
    ["expansionBaseCostPerTile", merged.expansionBaseCostPerTile],
    ["expansionCostGrowth", merged.expansionCostGrowth],
    ["buildUndoWindowMs", merged.buildUndoWindowMs],
  ] as const) {
    if (!Number.isFinite(value) || value <= 0) throw new RangeError(`${name} must be positive`);
  }
  if (!Number.isFinite(merged.reputationGainPerVisit) || merged.reputationGainPerVisit < 0) {
    throw new RangeError("reputationGainPerVisit must be non-negative");
  }
  for (const [name, settings] of [["standard", merged.standard], ["lowerEnd", merged.lowerEnd]] as const) {
    if (!Number.isInteger(settings.maxActiveCustomers) || settings.maxActiveCustomers <= 0) {
      throw new RangeError(`${name}.maxActiveCustomers must be a positive integer`);
    }
    if (!Number.isInteger(settings.maxFixedStepsPerAdvance) || settings.maxFixedStepsPerAdvance <= 0) {
      throw new RangeError(`${name}.maxFixedStepsPerAdvance must be a positive integer`);
    }
  }
  return merged;
}

function assertValidMap(map: GridMap): void {
  if (!Number.isInteger(map.width) || !Number.isInteger(map.height) || map.width <= 0 || map.height <= 0) {
    throw new RangeError("Map dimensions must be positive integers");
  }
  if (map.tiles.length !== map.width * map.height) throw new RangeError("Map tile count is invalid");
}

const EMPTY_METRICS: SimulationMetrics = {
  spawnedCustomers: 0,
  despawnedCustomers: 0,
  completedCustomers: 0,
  pathRequests: 0,
  pathFailures: 0,
  recoveredTargets: 0,
};

export function createNewGame(options: NewGameOptions): GameState {
  assertValidCatalog(options.catalog);
  assertValidMap(options.map);
  if (getTile(options.map, options.entrance) !== "floor" || getTile(options.map, options.exit) !== "floor") {
    throw new RangeError("Entrance and exit must be floor tiles inside the map");
  }
  if (!isReachable(options.map, options.entrance, options.exit)) {
    throw new RangeError("Entrance and exit must be connected by floor tiles");
  }
  if (!Number.isFinite(options.startingCurrency ?? 1_000) || (options.startingCurrency ?? 1_000) < 0) {
    throw new RangeError("Starting currency must be non-negative");
  }

  const objects: Record<string, PlacedObject> = {};
  for (const source of options.initialObjects ?? []) {
    if (!isValidSimulationId(source.id)) throw new RangeError(`Invalid initial object id: ${source.id}`);
    if (objects[source.id]) throw new RangeError(`Duplicate initial object id: ${source.id}`);
    const object = clonePlacedObject(source);
    const validation = validatePlacement(options.map, objects, options.catalog, object, {
      reservedPoints: [options.entrance, options.exit],
    });
    if (!validation.valid) throw new RangeError(`Invalid initial object ${object.id}: ${validation.reasons.join("; ")}`);
    objects[object.id] = object;
  }
  const navigationError = validateWorldNavigation(
    options.map,
    options.entrance,
    options.exit,
    objects,
    options.catalog,
  );
  if (navigationError) throw new RangeError(`Invalid initial world navigation: ${navigationError}`);

  const initialLevel = 1;
  return {
    schemaVersion: 2,
    map: cloneMap(options.map),
    entrance: { ...options.entrance },
    exit: { ...options.exit },
    catalog: options.catalog,
    config: mergeConfig(options.config),
    qualityMode: options.qualityMode ?? "standard",
    objects,
    customers: {},
    queues: Object.fromEntries(
      Object.values(objects)
        .filter((object) => options.catalog.placeables[object.definitionId]?.kind === "stall")
        .map((object) => [object.id, []]),
    ),
    seatReservations: {},
    economy: {
      currency: options.startingCurrency ?? 1_000,
      lifetimeRevenue: 0,
      lifetimeSpend: 0,
      completedVisits: 0,
      abandonedVisits: 0,
    },
    progression: {
      xp: 0,
      level: initialLevel,
      reputation: 2.5,
      unlockedDefinitionIds: getUnlockedDefinitionIds(
        options.catalog,
        initialLevel,
        options.initiallyUnlockedDefinitionIds,
      ),
      expansionCount: 0,
    },
    rngState: hashSeed(options.seed ?? "hawker-simulator"),
    nextCustomerSequence: 1,
    spawnCountdownMs: 0,
    accumulatorMs: 0,
    tick: 0,
    elapsedMs: 0,
    undoStack: [],
    metrics: { ...EMPTY_METRICS },
    events: [],
  };
}

export function cloneMap(map: GridMap): GridMap {
  return { ...map, worldOrigin: { ...map.worldOrigin }, tiles: [...map.tiles] };
}

export function clonePlacedObject(object: PlacedObject): PlacedObject {
  return { ...object, origin: { ...object.origin } };
}

export function cloneCustomer(customer: Customer): Customer {
  return {
    ...customer,
    position: { ...customer.position },
    path: customer.path.map((point) => ({ ...point })),
  };
}

export function captureUndoSnapshot(state: GameState): UndoSnapshot {
  return {
    map: cloneMap(state.map),
    objects: Object.fromEntries(Object.entries(state.objects).map(([id, object]) => [id, clonePlacedObject(object)])),
    economy: { ...state.economy },
    expansionCount: state.progression.expansionCount,
    xp: state.progression.xp,
  };
}

export function createSnapshot(state: GameState): GameSnapshot {
  const objects = Object.values(state.objects).map(clonePlacedObject).sort((a, b) => compareIds(a.id, b.id));
  const customers = Object.values(state.customers).map(cloneCustomer).sort((a, b) => compareIds(a.id, b.id));
  return {
    schemaVersion: 2,
    tick: state.tick,
    elapsedMs: state.elapsedMs,
    map: cloneMap(state.map),
    qualityMode: state.qualityMode,
    entrance: { ...state.entrance },
    exit: { ...state.exit },
    objects,
    customers,
    queues: Object.fromEntries(Object.entries(state.queues).map(([id, queue]) => [id, [...queue]])),
    seatReservations: { ...state.seatReservations },
    economy: { ...state.economy },
    progression: { ...state.progression, unlockedDefinitionIds: [...state.progression.unlockedDefinitionIds] },
    metrics: { ...state.metrics },
    canUndo: state.undoStack.length > 0,
    events: state.events.map((event) => ({ ...event })),
  };
}

export function stateDigest(state: GameState): string {
  const snapshot = createSnapshot(state);
  return JSON.stringify({
    ...snapshot,
    map: { ...snapshot.map, tiles: [...snapshot.map.tiles] },
    objectKeys: snapshot.objects.map((object) => pointKey(object.origin)),
  });
}
