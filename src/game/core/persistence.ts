import { calculateLevel, getUnlockedDefinitionIds } from "./economy";
import { validatePlacement } from "./grid";
import { createNewGame } from "./state";
import { compareIds } from "./ordering";
import type {
  AnyPersistentGameState,
  GameState,
  GridMap,
  PersistentGameStateV1,
  PersistentGameStateV2,
  PlacedObject,
  QualityMode,
  SimulationCatalog,
  SimulationConfigOverrides,
} from "./types";

export const PERSISTENT_SCHEMA_VERSION = 2 as const;

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
    },
    rngState: safeInteger(value.rngState, "rngState", 1, 0xffff_ffff),
    nextCustomerSequence,
    elapsedMs: safeInteger(value.elapsedMs, "elapsedMs", 0),
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

export function migratePersistentState(value: unknown): PersistentGameStateV2 {
  if (!isRecord(value)) throw new PersistenceError("Save data must be an object");
  if (value.schemaVersion === 2) return parseV2(value);
  if (value.schemaVersion !== 1) throw new PersistenceError(`Unsupported save version: ${String(value.schemaVersion)}`);
  const old = parseV1(value);
  const level = 1 + Math.floor(Math.sqrt(old.xp / 100));
  return {
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
    },
    rngState: old.seed,
    nextCustomerSequence: 1,
    elapsedMs: 0,
  };
}

export function persistentStateFromGame(state: GameState): PersistentGameStateV2 {
  return {
    schemaVersion: 2,
    savedAtTick: state.tick,
    map: {
      ...state.map,
      worldOrigin: { ...state.map.worldOrigin },
      tiles: [...state.map.tiles],
    },
    entrance: { ...state.entrance },
    exit: { ...state.exit },
    qualityMode: state.qualityMode,
    objects: Object.values(state.objects)
      .sort((a, b) => compareIds(a.id, b.id))
      .map((object) => ({
        ...object,
        origin: { ...object.origin },
        queuePath: object.queuePath?.map((point) => ({ ...point })),
      })),
    economy: { ...state.economy },
    progression: { ...state.progression, unlockedDefinitionIds: [...state.progression.unlockedDefinitionIds] },
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
  save: PersistentGameStateV2,
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
    const object: PlacedObject = { ...source, definitionId };
    const validation = validatePlacement(save.map, accepted, catalog, object, {
      reservedPoints: [save.entrance, save.exit],
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
      map: save.map,
      entrance: save.entrance,
      exit: save.exit,
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
