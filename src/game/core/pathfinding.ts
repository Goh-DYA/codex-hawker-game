import {
  getBlockedTileKeys,
  getObjectQueueAnchor,
  getObjectOccupiedTiles,
  getObjectServicePoint,
  getObjectTrayReturnPoint,
  getSeatLocations,
  getTile,
  isInBounds,
  pointKey,
  samePoint,
} from "./grid";
import type { AccessPoint, GridMap, GridPoint, PlacedObject, SimulationCatalog } from "./types";
import { compareIds } from "./ordering";
import { validateConfiguredQueuePath } from "./queueing";

export interface PathfindingOptions {
  readonly blocked?: ReadonlySet<string>;
  readonly allowEndBlocked?: boolean;
  readonly maxVisited?: number;
}

export interface PathResult {
  /** Includes both the start and destination. Null means unreachable. */
  readonly path: readonly GridPoint[] | null;
  readonly visited: number;
}

interface Node {
  readonly point: GridPoint;
  readonly key: string;
  readonly g: number;
  readonly h: number;
  readonly f: number;
  readonly order: number;
}

class MinHeap {
  private readonly nodes: Node[] = [];

  get size(): number {
    return this.nodes.length;
  }

  push(node: Node): void {
    this.nodes.push(node);
    let index = this.nodes.length - 1;
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (compareNodes(this.nodes[parent] as Node, node) <= 0) break;
      this.nodes[index] = this.nodes[parent] as Node;
      index = parent;
    }
    this.nodes[index] = node;
  }

  pop(): Node | undefined {
    const first = this.nodes[0];
    const last = this.nodes.pop();
    if (!first || !last || this.nodes.length === 0) return first;
    let index = 0;
    while (true) {
      const left = index * 2 + 1;
      const right = left + 1;
      if (left >= this.nodes.length) break;
      let child = left;
      if (right < this.nodes.length && compareNodes(this.nodes[right] as Node, this.nodes[left] as Node) < 0) {
        child = right;
      }
      if (compareNodes(last, this.nodes[child] as Node) <= 0) break;
      this.nodes[index] = this.nodes[child] as Node;
      index = child;
    }
    this.nodes[index] = last;
    return first;
  }
}

function compareNodes(a: Node, b: Node): number {
  return a.f - b.f || a.h - b.h || a.point.y - b.point.y || a.point.x - b.point.x || a.order - b.order;
}

function distance(a: GridPoint, b: GridPoint): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

const NEIGHBOURS: readonly GridPoint[] = [
  { x: 0, y: -1 },
  { x: -1, y: 0 },
  { x: 1, y: 0 },
  { x: 0, y: 1 },
];

export function findPath(
  map: GridMap,
  start: GridPoint,
  end: GridPoint,
  options: PathfindingOptions = {},
): PathResult {
  if (!isInBounds(map, start) || !isInBounds(map, end) || getTile(map, start) !== "floor" || getTile(map, end) !== "floor") {
    return { path: null, visited: 0 };
  }
  if (samePoint(start, end)) return { path: [{ ...start }], visited: 1 };

  const blocked = options.blocked ?? new Set<string>();
  if (blocked.has(pointKey(end)) && !options.allowEndBlocked) return { path: null, visited: 0 };
  const maxVisited = options.maxVisited ?? Math.max(1, map.width * map.height);
  const open = new MinHeap();
  const startKey = pointKey(start);
  const gScores = new Map<string, number>([[startKey, 0]]);
  const cameFrom = new Map<string, string>();
  const points = new Map<string, GridPoint>([[startKey, { ...start }]]);
  const closed = new Set<string>();
  let order = 0;
  const startH = distance(start, end);
  open.push({ point: { ...start }, key: startKey, g: 0, h: startH, f: startH, order: order++ });
  let visited = 0;

  while (open.size > 0 && visited < maxVisited) {
    const current = open.pop() as Node;
    if (closed.has(current.key)) continue;
    closed.add(current.key);
    visited += 1;

    if (samePoint(current.point, end)) {
      const path: GridPoint[] = [{ ...end }];
      let cursor = current.key;
      while (cursor !== startKey) {
        const parent = cameFrom.get(cursor);
        if (!parent) return { path: null, visited };
        cursor = parent;
        path.push({ ...(points.get(cursor) as GridPoint) });
      }
      path.reverse();
      return { path, visited };
    }

    for (const offset of NEIGHBOURS) {
      const point = { x: current.point.x + offset.x, y: current.point.y + offset.y };
      const key = pointKey(point);
      if (!isInBounds(map, point) || getTile(map, point) !== "floor" || closed.has(key)) continue;
      if (blocked.has(key) && !(options.allowEndBlocked && samePoint(point, end))) continue;
      const tentative = current.g + 1;
      if (tentative >= (gScores.get(key) ?? Number.POSITIVE_INFINITY)) continue;
      gScores.set(key, tentative);
      cameFrom.set(key, current.key);
      points.set(key, point);
      const h = distance(point, end);
      open.push({ point, key, g: tentative, h, f: tentative + h, order: order++ });
    }
  }
  return { path: null, visited };
}

export function isReachable(
  map: GridMap,
  start: GridPoint,
  end: GridPoint,
  options: PathfindingOptions = {},
): boolean {
  return findPath(map, start, end, options).path !== null;
}

/** Validates every operational interaction point against the entrance. */
export function validateWorldNavigation(
  map: GridMap,
  entrance: GridPoint,
  exit: GridPoint,
  objects: Readonly<Record<string, PlacedObject>>,
  catalog: SimulationCatalog,
): string | undefined {
  return validateWorldNavigationAccess(
    map,
    [
      { id: "entrance-1", kind: "entrance", position: entrance },
      { id: "exit-1", kind: "exit", position: exit },
    ],
    objects,
    catalog,
  );
}

/** Validates all access points and every operational interaction against the shared walkable network. */
export function validateWorldNavigationAccess(
  map: GridMap,
  accessPoints: readonly AccessPoint[],
  objects: Readonly<Record<string, PlacedObject>>,
  catalog: SimulationCatalog,
): string | undefined {
  const entrances = accessPoints.filter((point) => point.kind === "entrance");
  const exits = accessPoints.filter((point) => point.kind === "exit");
  if (entrances.length === 0 || exits.length === 0) return "At least one entrance and one exit are required";
  const blocked = getBlockedTileKeys(objects, catalog);
  for (const entrance of entrances) {
    if (!exits.some((exit) => isReachable(map, entrance.position, exit.position, { blocked }))) {
      return `Placement would block the entrance-to-exit route for ${entrance.id}`;
    }
  }
  for (const exit of exits) {
    if (!entrances.some((entrance) => isReachable(map, entrance.position, exit.position, { blocked }))) {
      return `Exit ${exit.id} would not be reachable from an entrance`;
    }
  }
  const reservedPoints = accessPoints.map((point) => point.position);

  for (const object of Object.values(objects).sort((a, b) => compareIds(a.id, b.id))) {
    const definition = catalog.placeables[object.definitionId];
    if (!definition) continue;
    if (definition.kind === "stall" && object.queuePath !== undefined) {
      const queueValidation = validateConfiguredQueuePath(
        map,
        objects,
        catalog,
        object,
        object.queuePath,
        reservedPoints,
      );
      if (!queueValidation.valid) return `Queue path for ${object.id} is invalid: ${queueValidation.reasons.join("; ")}`;
    }
    const destinations: GridPoint[] = [];
    const queueAnchor = getObjectQueueAnchor(object, catalog);
    if (definition.kind === "stall" && queueAnchor) destinations.push(queueAnchor);
    const servicePoint = getObjectServicePoint(object, catalog);
    if (definition.kind === "stall" && servicePoint && (!queueAnchor || !samePoint(servicePoint, queueAnchor))) {
      destinations.push(servicePoint);
    }
    const trayPoint = getObjectTrayReturnPoint(object, catalog);
    if (trayPoint) destinations.push(trayPoint);
    const ownOccupied = new Set(getObjectOccupiedTiles(object, catalog).map(pointKey));
    for (const destination of destinations) {
      if (!isInBounds(map, destination)) return `Interaction point for ${object.id} is outside the map`;
      const blockedByOwnObject = ownOccupied.has(pointKey(destination));
      if (blocked.has(pointKey(destination)) && !blockedByOwnObject) {
        return `Interaction point for ${object.id} is blocked by another object`;
      }
      if (!entrances.some((entrance) => isReachable(map, entrance.position, destination, { blocked, allowEndBlocked: blockedByOwnObject }))) {
        return `Interaction point for ${object.id} would be unreachable`;
      }
    }
  }
  for (const seat of getSeatLocations(objects, catalog)) {
    if (!isInBounds(map, seat.point)) return `Seat point for ${seat.objectId} is outside the map`;
    const owner = objects[seat.objectId];
    const blockedByOwnObject = owner
      ? new Set(getObjectOccupiedTiles(owner, catalog).map(pointKey)).has(pointKey(seat.point))
      : false;
    if (blocked.has(pointKey(seat.point)) && !blockedByOwnObject) {
      return `Seat point for ${seat.objectId} is blocked by another object`;
    }
    if (!entrances.some((entrance) => isReachable(map, entrance.position, seat.point, { blocked, allowEndBlocked: blockedByOwnObject }))) {
      return `Seat point for ${seat.objectId} would be unreachable`;
    }
  }
  return undefined;
}
