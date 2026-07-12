import { describe, expect, it } from "vitest";
import {
  createGridMap,
  findPath,
  getOccupiedTiles,
  rotatePoint,
  rotatedFootprint,
  tileToWorld,
  validatePlacement,
  withTile,
  worldToTile,
  type PlacedObject,
} from "../../src/game/core";
import { TEST_CATALOG } from "./fixtures";

describe("grid conversion", () => {
  it("round-trips tile centers with a non-zero origin", () => {
    const map = createGridMap(8, 6, { tileSize: 32, worldOrigin: { x: 16, y: -8 } });
    expect(tileToWorld(map, { x: 2, y: 3 })).toEqual({ x: 96, y: 104 });
    expect(worldToTile(map, { x: 96, y: 104 })).toEqual({ x: 2, y: 3 });
    expect(worldToTile(map, { x: 15.99, y: -8 })).toEqual({ x: -1, y: 0 });
  });
});

describe("footprints, rotation, and placement", () => {
  it("rotates rectangular footprints and relative interaction points", () => {
    const footprint = { width: 2, height: 1 };
    expect(rotatedFootprint(footprint, 90)).toMatchObject({ width: 1, height: 2 });
    expect(rotatePoint({ x: 1, y: 0 }, footprint, 90)).toEqual({ x: 0, y: 1 });
    expect(getOccupiedTiles({ x: 3, y: 2 }, footprint, 90)).toEqual([
      { x: 3, y: 2 },
      { x: 3, y: 3 },
    ]);
  });

  it("rejects overlaps, blocked terrain, reserved navigation tiles, and disallowed bounds", () => {
    let map = createGridMap(5, 5);
    map = withTile(map, { x: 4, y: 4 }, "wall");
    const existing: PlacedObject = {
      id: "table-a",
      definitionId: "table",
      origin: { x: 1, y: 1 },
      rotation: 0,
      open: false,
    };
    const overlap: PlacedObject = { ...existing, id: "table-b", origin: { x: 2, y: 1 } };
    expect(validatePlacement(map, { [existing.id]: existing }, TEST_CATALOG, overlap).valid).toBe(false);

    const wall: PlacedObject = { ...existing, id: "table-c", origin: { x: 4, y: 4 } };
    expect(validatePlacement(map, {}, TEST_CATALOG, wall).reasons.join(" ")).toContain("cannot be built");

    const reserved: PlacedObject = { ...existing, id: "table-d", origin: { x: 0, y: 0 } };
    expect(
      validatePlacement(map, {}, TEST_CATALOG, reserved, { reservedPoints: [{ x: 0, y: 0 }] }).reasons.join(" "),
    ).toContain("reserved");

    const outside: PlacedObject = { ...existing, id: "table-e", origin: { x: 4, y: 0 } };
    expect(validatePlacement(map, {}, TEST_CATALOG, outside).valid).toBe(false);
  });
});

describe("deterministic A*", () => {
  it("finds the stable shortest route through a gap", () => {
    let map = createGridMap(7, 5);
    for (let y = 0; y < 5; y += 1) {
      if (y !== 2) map = withTile(map, { x: 3, y }, "wall");
    }
    const first = findPath(map, { x: 0, y: 1 }, { x: 6, y: 1 });
    const second = findPath(map, { x: 0, y: 1 }, { x: 6, y: 1 });
    expect(first.path).toEqual(second.path);
    expect(first.path).toContainEqual({ x: 3, y: 2 });
    expect(first.path?.length).toBe(9);
  });

  it("reports an unreachable destination without exceeding the map search budget", () => {
    let map = createGridMap(5, 5);
    for (let y = 0; y < 5; y += 1) map = withTile(map, { x: 2, y }, "wall");
    const result = findPath(map, { x: 0, y: 2 }, { x: 4, y: 2 });
    expect(result.path).toBeNull();
    expect(result.visited).toBeLessThanOrEqual(25);
  });
});
