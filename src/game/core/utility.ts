import { getObjectOccupiedTiles } from "./grid";
import type {
  GridPoint,
  PlaceableDefinition,
  PlacedObject,
  SimulationCatalog,
  UtilityEffects,
} from "./types";

export interface UtilityInfluence extends Omit<UtilityEffects, "radius"> {
  readonly sources: number;
}

type UtilityDefinition = PlaceableDefinition & { readonly utility?: UtilityEffects };

export const EMPTY_UTILITY_INFLUENCE: UtilityInfluence = {
  ambience: 0,
  cleanliness: 0,
  queuePatience: 0,
  eatingSpeed: 0,
  cleaningEfficiency: 0,
  movementSpeed: 0,
  wayfinding: 0,
  sources: 0,
};

function distanceToObject(
  point: GridPoint,
  object: PlacedObject,
  catalog: SimulationCatalog,
): number {
  const cells = getObjectOccupiedTiles(object, catalog);
  return cells.reduce(
    (best, cell) => Math.min(best, Math.abs(point.x - cell.x) + Math.abs(point.y - cell.y)),
    Number.POSITIVE_INFINITY,
  );
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value));
}

/**
 * Resolves spatial, diminishing utility effects at a tile. This makes signs,
 * fans, lights, cleaning equipment, sinks, greenery, and service fixtures real
 * layout decisions instead of catalogue-only flavour text.
 */
export function getUtilityInfluence(
  objects: Readonly<Record<string, PlacedObject>>,
  catalog: SimulationCatalog,
  point: GridPoint,
): UtilityInfluence {
  const totals = { ...EMPTY_UTILITY_INFLUENCE };
  for (const object of Object.values(objects)) {
    const definition = catalog.placeables[object.definitionId] as UtilityDefinition | undefined;
    const utility = definition?.utility;
    if (!definition || !utility || utility.radius <= 0) continue;
    const distance = distanceToObject(point, object, catalog);
    if (distance > utility.radius) continue;
    const falloff = 1 - distance / (utility.radius + 1);
    totals.ambience += utility.ambience * falloff;
    totals.cleanliness += utility.cleanliness * falloff;
    totals.queuePatience += utility.queuePatience * falloff;
    totals.eatingSpeed += utility.eatingSpeed * falloff;
    totals.cleaningEfficiency += utility.cleaningEfficiency * falloff;
    totals.movementSpeed += utility.movementSpeed * falloff;
    totals.wayfinding += utility.wayfinding * falloff;
    totals.sources += 1;
  }
  return {
    ambience: clamp(totals.ambience, -30, 40),
    cleanliness: clamp(totals.cleanliness, -30, 40),
    queuePatience: clamp(totals.queuePatience, -0.35, 0.6),
    eatingSpeed: clamp(totals.eatingSpeed, -0.35, 0.6),
    cleaningEfficiency: clamp(totals.cleaningEfficiency, -0.35, 0.7),
    movementSpeed: clamp(totals.movementSpeed, -0.25, 0.45),
    wayfinding: clamp(totals.wayfinding, 0, 0.75),
    sources: totals.sources,
  };
}

/** Route and menu signage has a centre-wide discovery effect once placed. */
export function getGlobalWayfinding(
  objects: Readonly<Record<string, PlacedObject>>,
  catalog: SimulationCatalog,
): number {
  const total = Object.values(objects).reduce((sum, object) => {
    const definition = catalog.placeables[object.definitionId] as UtilityDefinition | undefined;
    return sum + Math.max(0, definition?.utility?.wayfinding ?? 0);
  }, 0);
  return clamp(total, 0, 0.75);
}

export function utilitySatisfactionBonus(influence: UtilityInfluence): number {
  return clamp(
    influence.ambience * 0.008 + influence.cleanliness * 0.012,
    -0.45,
    0.65,
  );
}

/** Shared by simulation timing and meal rendering so the visible portion is
 * nearly finished at the exact utility-adjusted lifecycle transition. */
export function adjustedEatingDurationMs(baseEatingMs: number, eatingSpeed: number): number {
  return Math.max(1, baseEatingMs) / Math.max(0.1, 1 + eatingSpeed);
}

export function mealConsumptionFraction(
  elapsedMs: number,
  baseEatingMs: number,
  eatingSpeed: number,
): number {
  return clamp(
    elapsedMs / adjustedEatingDurationMs(baseEatingMs, eatingSpeed),
    0,
    0.94,
  );
}
