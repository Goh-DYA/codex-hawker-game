import type {
  Footprint,
  GridMap,
  GridPoint,
  PlacedObject,
  PlaceableDefinition,
  Rotation,
  SimulationCatalog,
  TileKind,
  WorldPoint,
} from "./types";
import { compareIds } from "./ordering";

export interface PlacementValidationOptions {
  readonly ignoreObjectId?: string;
  readonly reservedPoints?: readonly GridPoint[];
}

export interface PlacementValidationResult {
  readonly valid: boolean;
  readonly reasons: readonly string[];
  readonly occupiedTiles: readonly GridPoint[];
}

export interface SeatLocation {
  readonly key: string;
  readonly objectId: string;
  readonly index: number;
  readonly point: GridPoint;
}

export function pointKey(point: GridPoint): string {
  return `${point.x},${point.y}`;
}

export function samePoint(a: GridPoint, b: GridPoint): boolean {
  return a.x === b.x && a.y === b.y;
}

export function isInBounds(map: GridMap, point: GridPoint): boolean {
  return point.x >= 0 && point.y >= 0 && point.x < map.width && point.y < map.height;
}

export function tileIndex(map: GridMap, point: GridPoint): number {
  if (!isInBounds(map, point)) return -1;
  return point.y * map.width + point.x;
}

export function getTile(map: GridMap, point: GridPoint): TileKind | undefined {
  const index = tileIndex(map, point);
  return index < 0 ? undefined : map.tiles[index];
}

export function createGridMap(
  width: number,
  height: number,
  options: {
    readonly tileSize?: number;
    readonly worldOrigin?: WorldPoint;
    readonly tiles?: readonly TileKind[];
    readonly fill?: TileKind;
  } = {},
): GridMap {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    throw new RangeError("Grid dimensions must be positive integers");
  }
  const tileSize = options.tileSize ?? 32;
  if (!Number.isFinite(tileSize) || tileSize <= 0) throw new RangeError("Tile size must be positive");
  const tiles = options.tiles ? [...options.tiles] : Array<TileKind>(width * height).fill(options.fill ?? "floor");
  if (tiles.length !== width * height) throw new RangeError("Tile array length must equal width * height");
  return {
    width,
    height,
    tileSize,
    worldOrigin: { ...(options.worldOrigin ?? { x: 0, y: 0 }) },
    tiles,
  };
}

export function withTile(map: GridMap, point: GridPoint, tile: TileKind): GridMap {
  const index = tileIndex(map, point);
  if (index < 0) throw new RangeError("Cannot update a tile outside the map");
  const tiles = [...map.tiles];
  tiles[index] = tile;
  return { ...map, tiles };
}

export function worldToTile(map: GridMap, point: WorldPoint): GridPoint {
  return {
    x: Math.floor((point.x - map.worldOrigin.x) / map.tileSize),
    y: Math.floor((point.y - map.worldOrigin.y) / map.tileSize),
  };
}

export function tileToWorld(map: GridMap, point: GridPoint, center = true): WorldPoint {
  const offset = center ? 0.5 : 0;
  return {
    x: map.worldOrigin.x + (point.x + offset) * map.tileSize,
    y: map.worldOrigin.y + (point.y + offset) * map.tileSize,
  };
}

export function normalizeRotation(rotation: number): Rotation {
  const normalized = ((rotation % 360) + 360) % 360;
  if (normalized !== 0 && normalized !== 90 && normalized !== 180 && normalized !== 270) {
    throw new RangeError("Rotation must be a multiple of 90 degrees");
  }
  return normalized;
}

export function rotatePoint(point: GridPoint, footprint: Footprint, rotation: Rotation): GridPoint {
  switch (rotation) {
    case 0:
      return { ...point };
    case 90:
      return { x: footprint.height - 1 - point.y, y: point.x };
    case 180:
      return { x: footprint.width - 1 - point.x, y: footprint.height - 1 - point.y };
    case 270:
      return { x: point.y, y: footprint.width - 1 - point.x };
  }
}

export function rotatedFootprint(footprint: Footprint, rotation: Rotation): Footprint {
  const cells = footprintCells(footprint).map((point) => rotatePoint(point, footprint, rotation));
  return {
    width: rotation === 90 || rotation === 270 ? footprint.height : footprint.width,
    height: rotation === 90 || rotation === 270 ? footprint.width : footprint.height,
    cells,
  };
}

export function footprintCells(footprint: Footprint): readonly GridPoint[] {
  if (!Number.isInteger(footprint.width) || !Number.isInteger(footprint.height) || footprint.width <= 0 || footprint.height <= 0) {
    throw new RangeError("Footprint dimensions must be positive integers");
  }
  if (footprint.cells) return footprint.cells.map((cell) => ({ ...cell }));

  const cells: GridPoint[] = [];
  for (let y = 0; y < footprint.height; y += 1) {
    for (let x = 0; x < footprint.width; x += 1) cells.push({ x, y });
  }
  return cells;
}

export function getOccupiedTiles(
  origin: GridPoint,
  footprint: Footprint,
  rotation: Rotation,
): readonly GridPoint[] {
  return footprintCells(footprint).map((cell) => {
    const rotated = rotatePoint(cell, footprint, rotation);
    return { x: origin.x + rotated.x, y: origin.y + rotated.y };
  });
}

export function resolveRelativePoint(
  object: PlacedObject,
  definition: PlaceableDefinition,
  point: GridPoint,
): GridPoint {
  const rotated = rotatePoint(point, definition.footprint, object.rotation);
  return { x: object.origin.x + rotated.x, y: object.origin.y + rotated.y };
}

export function getObjectOccupiedTiles(
  object: PlacedObject,
  catalog: SimulationCatalog,
): readonly GridPoint[] {
  const definition = catalog.placeables[object.definitionId];
  return definition ? getOccupiedTiles(object.origin, definition.footprint, object.rotation) : [];
}

export function getObjectServicePoint(
  object: PlacedObject,
  catalog: SimulationCatalog,
): GridPoint | undefined {
  const definition = catalog.placeables[object.definitionId];
  return definition?.servicePoint
    ? resolveRelativePoint(object, definition, definition.servicePoint)
    : undefined;
}

export function getObjectQueueAnchor(
  object: PlacedObject,
  catalog: SimulationCatalog,
): GridPoint | undefined {
  const definition = catalog.placeables[object.definitionId];
  const anchor = definition?.queueAnchor ?? definition?.servicePoint;
  return definition && anchor ? resolveRelativePoint(object, definition, anchor) : undefined;
}

export function getObjectTrayReturnPoint(
  object: PlacedObject,
  catalog: SimulationCatalog,
): GridPoint | undefined {
  const definition = catalog.placeables[object.definitionId];
  return definition?.trayReturnPoint
    ? resolveRelativePoint(object, definition, definition.trayReturnPoint)
    : undefined;
}

export function getSeatLocations(
  objects: Readonly<Record<string, PlacedObject>>,
  catalog: SimulationCatalog,
): readonly SeatLocation[] {
  const seats: SeatLocation[] = [];
  for (const object of Object.values(objects).sort((a, b) => compareIds(a.id, b.id))) {
    const definition = catalog.placeables[object.definitionId];
    definition?.seatPoints?.forEach((point, index) => {
      seats.push({
        key: `${object.id}:${index}`,
        objectId: object.id,
        index,
        point: resolveRelativePoint(object, definition, point),
      });
    });
  }
  return seats;
}

export function getBlockedTileKeys(
  objects: Readonly<Record<string, PlacedObject>>,
  catalog: SimulationCatalog,
  ignoreObjectId?: string,
): ReadonlySet<string> {
  const blocked = new Set<string>();
  for (const object of Object.values(objects)) {
    if (object.id === ignoreObjectId) continue;
    const definition = catalog.placeables[object.definitionId];
    if (!definition?.blocksMovement) continue;
    for (const point of getOccupiedTiles(object.origin, definition.footprint, object.rotation)) {
      blocked.add(pointKey(point));
    }
  }
  return blocked;
}

export function isTileWalkable(
  map: GridMap,
  point: GridPoint,
  blocked: ReadonlySet<string> = new Set(),
  allowBlockedPoint?: GridPoint,
): boolean {
  if (getTile(map, point) !== "floor") return false;
  return samePoint(point, allowBlockedPoint ?? { x: Number.NaN, y: Number.NaN }) || !blocked.has(pointKey(point));
}

export function validatePlacement(
  map: GridMap,
  objects: Readonly<Record<string, PlacedObject>>,
  catalog: SimulationCatalog,
  candidate: PlacedObject,
  options: PlacementValidationOptions = {},
): PlacementValidationResult {
  const definition = catalog.placeables[candidate.definitionId];
  if (!definition) return { valid: false, reasons: [`Unknown definition: ${candidate.definitionId}`], occupiedTiles: [] };

  const reasons: string[] = [];
  if (!definition.allowedRotations.includes(candidate.rotation)) reasons.push("Rotation is not allowed");
  const occupiedTiles = getOccupiedTiles(candidate.origin, definition.footprint, candidate.rotation);
  const otherOccupied = new Set<string>();
  for (const object of Object.values(objects)) {
    if (object.id === options.ignoreObjectId || object.id === candidate.id) continue;
    const otherDefinition = catalog.placeables[object.definitionId];
    if (!otherDefinition) continue;
    for (const point of getOccupiedTiles(object.origin, otherDefinition.footprint, object.rotation)) {
      otherOccupied.add(pointKey(point));
    }
  }
  const reserved = new Set((options.reservedPoints ?? []).map(pointKey));

  for (const point of occupiedTiles) {
    if (!isInBounds(map, point)) reasons.push(`Tile ${pointKey(point)} is outside the map`);
    else if (getTile(map, point) !== "floor") reasons.push(`Tile ${pointKey(point)} cannot be built on`);
    if (otherOccupied.has(pointKey(point))) reasons.push(`Tile ${pointKey(point)} overlaps another object`);
    if (definition.blocksMovement && reserved.has(pointKey(point))) reasons.push(`Tile ${pointKey(point)} is reserved for navigation`);
  }

  const uniqueReasons = [...new Set(reasons)];
  return { valid: uniqueReasons.length === 0, reasons: uniqueReasons, occupiedTiles };
}

function boundaryProfile(
  map: GridMap,
  points: readonly GridPoint[],
): { readonly present: boolean; readonly kind: TileKind } {
  const counts = new Map<TileKind, number>();
  for (const point of points) {
    const tile = getTile(map, point) as TileKind;
    if (tile !== "floor") counts.set(tile, (counts.get(tile) ?? 0) + 1);
  }
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const [kind, count] = ranked[0] ?? ["wall" as TileKind, 0];
  return { present: count >= Math.max(1, Math.ceil(points.length / 2)), kind };
}

/** Seals accidental perimeter gaps while preserving registered access openings. */
export function normalizeBoundaryOpenings(
  map: GridMap,
  openings: readonly GridPoint[],
): GridMap {
  const tiles = [...map.tiles];
  const edges = [
    Array.from({ length: map.width }, (_, x) => ({ x, y: 0 })),
    Array.from({ length: map.width }, (_, x) => ({ x, y: map.height - 1 })),
    Array.from({ length: map.height }, (_, y) => ({ x: 0, y })),
    Array.from({ length: map.height }, (_, y) => ({ x: map.width - 1, y })),
  ];

  for (const points of edges) {
    const profile = boundaryProfile(map, points);
    if (!profile.present) continue;
    for (const point of points) tiles[point.y * map.width + point.x] = profile.kind;
  }
  for (const point of openings) {
    if (
      isInBounds(map, point) &&
      (point.x === 0 || point.y === 0 || point.x === map.width - 1 || point.y === map.height - 1)
    ) {
      tiles[point.y * map.width + point.x] = "floor";
    }
  }

  return { ...map, tiles };
}

export function expandGridMap(map: GridMap, addColumns: number, addRows: number): GridMap {
  if (!Number.isInteger(addColumns) || !Number.isInteger(addRows) || addColumns < 0 || addRows < 0) {
    throw new RangeError("Map expansion values must be non-negative integers");
  }
  if (addColumns === 0 && addRows === 0) throw new RangeError("Map expansion must add at least one row or column");
  const width = map.width + addColumns;
  const height = map.height + addRows;
  const tiles = Array<TileKind>(width * height).fill("floor");
  for (let y = 0; y < map.height; y += 1) {
    for (let x = 0; x < map.width; x += 1) {
      tiles[y * width + x] = map.tiles[y * map.width + x] as TileKind;
    }
  }

  const topPoints = Array.from({ length: map.width }, (_, x) => ({ x, y: 0 }));
  const bottomPoints = Array.from({ length: map.width }, (_, x) => ({ x, y: map.height - 1 }));
  const leftPoints = Array.from({ length: map.height }, (_, y) => ({ x: 0, y }));
  const rightPoints = Array.from({ length: map.height }, (_, y) => ({ x: map.width - 1, y }));
  const top = boundaryProfile(map, topPoints);
  const bottom = boundaryProfile(map, bottomPoints);
  const left = boundaryProfile(map, leftPoints);
  const right = boundaryProfile(map, rightPoints);
  const setExpandedTile = (point: GridPoint, tile: TileKind): void => {
    tiles[point.y * width + point.x] = tile;
  };

  // A perimeter wall is a property of the map boundary, not of the old plot.
  // Move right/bottom perimeters outward and clear the former seam so newly
  // purchased floor space is visually and navigationally continuous.
  if (addColumns > 0 && right.present) {
    for (let y = 0; y < map.height; y += 1) {
      const remainsOnTop = y === 0 && top.present;
      const remainsOnBottom = addRows === 0 && y === map.height - 1 && bottom.present;
      if (!remainsOnTop && !remainsOnBottom) setExpandedTile({ x: map.width - 1, y }, "floor");
      setExpandedTile({ x: width - 1, y }, getTile(map, { x: map.width - 1, y }) as TileKind);
    }
  }
  if (addRows > 0 && bottom.present) {
    for (let x = 0; x < map.width; x += 1) {
      const remainsOnLeft = x === 0 && left.present;
      const remainsOnRight = addColumns === 0 && x === map.width - 1 && right.present;
      if (!remainsOnLeft && !remainsOnRight) setExpandedTile({ x, y: map.height - 1 }, "floor");
      setExpandedTile({ x, y: height - 1 }, getTile(map, { x, y: map.height - 1 }) as TileKind);
    }
  }

  if (addColumns > 0 && top.present) {
    for (let x = map.width; x < width; x += 1) setExpandedTile({ x, y: 0 }, top.kind);
  }
  if (addColumns > 0 && bottom.present) {
    const y = addRows > 0 ? height - 1 : map.height - 1;
    for (let x = map.width; x < width; x += 1) setExpandedTile({ x, y }, bottom.kind);
  }
  if (addRows > 0 && left.present) {
    for (let y = map.height; y < height; y += 1) setExpandedTile({ x: 0, y }, left.kind);
  }
  if (addRows > 0 && right.present) {
    const x = addColumns > 0 ? width - 1 : map.width - 1;
    for (let y = map.height; y < height; y += 1) setExpandedTile({ x, y }, right.kind);
  }
  return { ...map, width, height, tiles };
}

/** Moves a portal on a purchased right/bottom boundary to the new perimeter. */
export function projectExpandedBoundaryPoint(
  point: GridPoint,
  previousMap: GridMap,
  addColumns: number,
  addRows: number,
): GridPoint {
  return {
    x: point.x === previousMap.width - 1 ? point.x + addColumns : point.x,
    y: point.y === previousMap.height - 1 ? point.y + addRows : point.y,
  };
}
