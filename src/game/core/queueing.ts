import {
  getBlockedTileKeys,
  getObjectQueueAnchor,
  getObjectServicePoint,
  getTile,
  isInBounds,
  pointKey,
  samePoint,
} from "./grid";
import { compareIds } from "./ordering";
import type { GridMap, GridPoint, PlacedObject, SimulationCatalog } from "./types";

/** A defensive ceiling for authored and automatically generated queue lines. */
export const MAX_QUEUE_CELLS = 64;

export interface QueuePathValidationResult {
  readonly valid: boolean;
  readonly reasons: readonly string[];
}

/** Queue cells keyed by stall ID, with each path ordered from head to tail. */
export type StallQueueLayouts = Readonly<Record<string, readonly GridPoint[]>>;

const CARDINAL_DIRECTIONS: readonly GridPoint[] = [
  { x: 0, y: -1 },
  { x: -1, y: 0 },
  { x: 1, y: 0 },
  { x: 0, y: 1 },
];

function manhattanDistance(a: GridPoint, b: GridPoint): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function copyPoints(points: readonly GridPoint[]): readonly GridPoint[] {
  return points.map((point) => ({ ...point }));
}

function preferredDirection(stall: PlacedObject, anchor: GridPoint, servicePoint: GridPoint | undefined): GridPoint {
  if (stall.queueDirection === "north") return { x: 0, y: -1 };
  if (stall.queueDirection === "east") return { x: 1, y: 0 };
  if (stall.queueDirection === "south") return { x: 0, y: 1 };
  if (stall.queueDirection === "west") return { x: -1, y: 0 };
  if (!servicePoint) return { x: 0, y: 1 };
  const deltaX = anchor.x - servicePoint.x;
  const deltaY = anchor.y - servicePoint.y;
  if (Math.abs(deltaX) > Math.abs(deltaY)) return { x: Math.sign(deltaX), y: 0 };
  if (deltaY !== 0) return { x: 0, y: Math.sign(deltaY) };
  return { x: 0, y: 1 };
}

function orderedDirections(direction: GridPoint): readonly GridPoint[] {
  // Continue forward first, then turn right, then left, and only finally double
  // back. This produces familiar queue lines while still bending around objects.
  return [
    direction,
    { x: -direction.y, y: direction.x },
    { x: direction.y, y: -direction.x },
    { x: -direction.x, y: -direction.y },
  ];
}

function validateQueuePathGeometry(
  map: GridMap,
  objects: Readonly<Record<string, PlacedObject>>,
  catalog: SimulationCatalog,
  stall: PlacedObject,
  points: readonly GridPoint[] = stall.queuePath ?? [],
  reservedPoints: readonly GridPoint[] = [],
): QueuePathValidationResult {
  const definition = catalog.placeables[stall.definitionId];
  const anchor = getObjectQueueAnchor(stall, catalog);
  const reasons: string[] = [];
  if (definition?.kind !== "stall" || !definition.stall || !anchor) {
    return { valid: false, reasons: ["Queue paths can only be configured for a stall with a queue anchor"] };
  }
  if (points.length === 0) reasons.push("Queue path must contain at least its head cell");
  if (points.length > definition.stall.queueCapacity) {
    reasons.push(`Queue path exceeds this stall's capacity of ${definition.stall.queueCapacity}`);
  }
  if (points.length > MAX_QUEUE_CELLS) reasons.push(`Queue path may contain at most ${MAX_QUEUE_CELLS} cells`);
  if (points[0] && !samePoint(points[0], anchor)) {
    reasons.push(`Queue path must begin at the stall queue anchor ${pointKey(anchor)}`);
  }

  const blocked = getBlockedTileKeys(objects, catalog);
  const reserved = new Set(reservedPoints.map(pointKey));
  const visited = new Set<string>();
  points.forEach((point, index) => {
    if (!Number.isSafeInteger(point.x) || !Number.isSafeInteger(point.y)) {
      reasons.push(`Queue cell ${index + 1} must use integer coordinates`);
      return;
    }
    const key = pointKey(point);
    if (!isInBounds(map, point) || getTile(map, point) !== "floor") {
      reasons.push(`Queue cell ${key} must be a floor tile inside the map`);
    }
    if (blocked.has(key)) reasons.push(`Queue cell ${key} is blocked by furniture or a facility`);
    if (reserved.has(key)) reasons.push(`Queue cell ${key} is reserved for an entrance or exit`);
    if (visited.has(key)) reasons.push(`Queue cell ${key} is repeated`);
    visited.add(key);
    const previous = points[index - 1];
    if (previous && manhattanDistance(previous, point) !== 1) {
      reasons.push(`Queue cells ${pointKey(previous)} and ${key} must be orthogonally adjacent`);
    }
  });

  return { valid: reasons.length === 0, reasons: [...new Set(reasons)] };
}

function foreignActiveAnchorConflicts(
  objects: Readonly<Record<string, PlacedObject>>,
  catalog: SimulationCatalog,
  stall: PlacedObject,
  points: readonly GridPoint[],
): readonly string[] {
  const pathKeys = new Set(points.map(pointKey));
  const reasons: string[] = [];
  for (const other of Object.values(objects).sort((a, b) => compareIds(a.id, b.id))) {
    if (other.id === stall.id || !other.open || catalog.placeables[other.definitionId]?.kind !== "stall") continue;
    const anchor = getObjectQueueAnchor(other, catalog);
    if (anchor && pathKeys.has(pointKey(anchor))) {
      reasons.push(`Queue cell ${pointKey(anchor)} is the queue anchor for ${other.id}`);
    }
  }
  return reasons;
}

/**
 * Validates an authored queue route, including conflicts with every other
 * intrinsically valid authored route. A crossing therefore invalidates either
 * route regardless of which stall happens to be inspected first.
 */
export function validateConfiguredQueuePath(
  map: GridMap,
  objects: Readonly<Record<string, PlacedObject>>,
  catalog: SimulationCatalog,
  stall: PlacedObject,
  points: readonly GridPoint[] = stall.queuePath ?? [],
  reservedPoints: readonly GridPoint[] = [],
): QueuePathValidationResult {
  const geometry = validateQueuePathGeometry(map, objects, catalog, stall, points, reservedPoints);
  if (!geometry.valid) return geometry;

  const pointKeys = new Set(points.map(pointKey));
  const reasons = [...foreignActiveAnchorConflicts(objects, catalog, stall, points)];
  const otherStalls = Object.values(objects).sort((a, b) => compareIds(a.id, b.id));
  for (const other of otherStalls) {
    if (other.id === stall.id || !other.open || other.queuePath === undefined) continue;
    const otherGeometry = validateQueuePathGeometry(
      map,
      objects,
      catalog,
      other,
      other.queuePath,
      reservedPoints,
    );
    if (!otherGeometry.valid) continue;
    for (const point of other.queuePath) {
      if (pointKeys.has(pointKey(point))) {
        reasons.push(`Queue path overlaps the configured queue for ${other.id} at ${pointKey(point)}`);
      }
    }
  }

  return { valid: reasons.length === 0, reasons: [...new Set(reasons)] };
}

function planAutomaticQueue(
  map: GridMap,
  objects: Readonly<Record<string, PlacedObject>>,
  catalog: SimulationCatalog,
  stall: PlacedObject,
  reserved: ReadonlySet<string>,
  protectedAnchors: ReadonlySet<string>,
): readonly GridPoint[] {
  const definition = catalog.placeables[stall.definitionId];
  const anchor = getObjectQueueAnchor(stall, catalog);
  if (definition?.kind !== "stall" || !definition.stall || !anchor) return [];

  const blocked = getBlockedTileKeys(objects, catalog);
  const anchorKey = pointKey(anchor);
  if (!isInBounds(map, anchor) || getTile(map, anchor) !== "floor" || blocked.has(anchorKey) || reserved.has(anchorKey)) {
    return [];
  }

  const targetLength = Math.min(definition.stall.queueCapacity, MAX_QUEUE_CELLS, map.width * map.height);
  const initialDirection = preferredDirection(stall, anchor, getObjectServicePoint(stall, catalog));
  let best: readonly GridPoint[] = [{ ...anchor }];
  let searchBudget = Math.min(20_000, Math.max(512, map.width * map.height * 8));

  function search(path: readonly GridPoint[], direction: GridPoint): boolean {
    if (path.length > best.length) best = copyPoints(path);
    if (path.length >= targetLength) return true;
    if (searchBudget <= 0) return false;
    searchBudget -= 1;
    const current = path.at(-1) as GridPoint;
    const occupied = new Set(path.map(pointKey));
    for (const offset of orderedDirections(direction)) {
      const candidate = { x: current.x + offset.x, y: current.y + offset.y };
      const key = pointKey(candidate);
      if (
        occupied.has(key) ||
        reserved.has(key) ||
        protectedAnchors.has(key) ||
        blocked.has(key) ||
        !isInBounds(map, candidate) ||
        getTile(map, candidate) !== "floor"
      ) {
        continue;
      }
      if (search([...path, candidate], offset)) return true;
    }
    return false;
  }

  search([{ ...anchor }], initialDirection);
  return best;
}

/**
 * Plans every stall queue as one deterministic layout.
 *
 * Authored routes are validated together first; all routes taking part in an
 * authored-route overlap are invalidated. Valid authored cells are then
 * reserved before automatic queues are allocated in stable stall-ID order.
 * Portals, authored cells, and earlier automatic cells can never be reused by
 * a later automatic queue.
 */
export function planStallQueueLayouts(
  map: GridMap,
  objects: Readonly<Record<string, PlacedObject>>,
  catalog: SimulationCatalog,
  reservedPoints: readonly GridPoint[] = [],
): StallQueueLayouts {
  const stalls = Object.values(objects)
    .filter((object) => catalog.placeables[object.definitionId]?.kind === "stall")
    .sort((a, b) => compareIds(a.id, b.id));
  const activeStalls = stalls.filter((stall) => stall.open);
  const layouts: Record<string, readonly GridPoint[]> = Object.fromEntries(stalls.map((stall) => [stall.id, []]));
  const reserved = new Set(reservedPoints.map(pointKey));
  const protectedAnchors = new Set(
    activeStalls
      .map((stall) => getObjectQueueAnchor(stall, catalog))
      .filter((anchor): anchor is GridPoint => anchor !== undefined)
      .map(pointKey),
  );

  const validCustom = activeStalls
    .filter((stall) => stall.queuePath !== undefined)
    .filter((stall) =>
      validateQueuePathGeometry(map, objects, catalog, stall, stall.queuePath ?? [], reservedPoints).valid &&
      foreignActiveAnchorConflicts(objects, catalog, stall, stall.queuePath ?? []).length === 0,
    );
  const customClaims = new Map<string, string[]>();
  for (const stall of validCustom) {
    for (const point of stall.queuePath ?? []) {
      const key = pointKey(point);
      customClaims.set(key, [...(customClaims.get(key) ?? []), stall.id]);
    }
  }
  const invalidCustomIds = new Set(
    [...customClaims.values()].filter((ids) => ids.length > 1).flat(),
  );

  for (const stall of validCustom) {
    if (invalidCustomIds.has(stall.id)) continue;
    const cells = copyPoints(stall.queuePath ?? []);
    layouts[stall.id] = cells;
    cells.forEach((point) => reserved.add(pointKey(point)));
  }

  for (const stall of activeStalls) {
    if (stall.queuePath !== undefined) continue;
    const cells = planAutomaticQueue(map, objects, catalog, stall, reserved, protectedAnchors);
    layouts[stall.id] = cells;
    cells.forEach((point) => reserved.add(pointKey(point)));
  }

  return layouts;
}

/**
 * Returns one stall's queue cells from the globally planned layout. The stall
 * is merged into the supplied object set so callers that are previewing an
 * updated object retain the legacy getter behaviour.
 */
export function getStallQueueCells(
  map: GridMap,
  objects: Readonly<Record<string, PlacedObject>>,
  catalog: SimulationCatalog,
  stall: PlacedObject,
  reservedPoints: readonly GridPoint[] = [],
): readonly GridPoint[] {
  // Preserve the legacy getter's usefulness as a queue preview for a closed
  // stall, while the global operational plan intentionally gives closed stalls
  // no cells and no reservations.
  const previewStall = stall.open ? stall : { ...stall, open: true };
  const planningObjects = objects[stall.id] === previewStall ? objects : { ...objects, [stall.id]: previewStall };
  return copyPoints(planStallQueueLayouts(map, planningObjects, catalog, reservedPoints)[stall.id] ?? []);
}

/** Returns the assigned queue cell for an admitted customer. */
export function getCustomerQueueCell(
  queue: readonly string[],
  customerId: string,
  cells: readonly GridPoint[],
): GridPoint | undefined {
  const index = queue.indexOf(customerId);
  const point = index < 0 ? undefined : cells[index];
  return point ? { ...point } : undefined;
}

/** Exported for deterministic tests and editor affordances. */
export const QUEUE_CARDINAL_DIRECTIONS = CARDINAL_DIRECTIONS;
