import { describe, expect, it } from "vitest";
import {
  createGridMap,
  createNewGame,
  dispatchCommand,
  getStallQueueCells,
  planStallQueueLayouts,
  pointKey,
  type GridPoint,
  type PlacedObject,
  type StallQueueLayouts,
} from "../../src/game/core";
import { TEST_CATALOG } from "./fixtures";

const map = createGridMap(14, 8);
const portals: readonly [GridPoint, GridPoint] = [{ x: 0, y: 6 }, { x: 13, y: 6 }];

function stall(id: string, x: number, queueDirection: "east" | "west" = "east"): PlacedObject {
  return {
    id,
    definitionId: "stall",
    origin: { x, y: 0 },
    rotation: 0,
    open: true,
    queueDirection,
  };
}

function expectGloballyUnique(layouts: StallQueueLayouts): void {
  const keys = Object.values(layouts).flatMap((points) => points.map(pointKey));
  expect(new Set(keys).size).toBe(keys.length);
}

describe("global stall queue layout planning", () => {
  it("is insertion-order independent and keeps automatic queue cells unique", () => {
    const stallA = stall("stall-a", 2, "east");
    const stallB = stall("stall-b", 6, "west");
    const forward = { [stallA.id]: stallA, [stallB.id]: stallB };
    const reversed = { [stallB.id]: stallB, [stallA.id]: stallA };

    const forwardPlan = planStallQueueLayouts(map, forward, TEST_CATALOG, portals);
    const reversedPlan = planStallQueueLayouts(map, reversed, TEST_CATALOG, portals);

    expect(forwardPlan).toEqual(reversedPlan);
    expect(forwardPlan[stallA.id]).toHaveLength(4);
    expect(forwardPlan[stallB.id]).toHaveLength(4);
    expectGloballyUnique(forwardPlan);
    expect(getStallQueueCells(map, forward, TEST_CATALOG, stallB, portals)).toEqual(forwardPlan[stallB.id]);
  });

  it("invalidates crossing custom routes and rejects the second configured crossing", () => {
    const stallA = stall("stall-a", 2);
    const stallB = stall("stall-b", 6, "west");
    const pathA = [{ x: 2, y: 2 }, { x: 3, y: 2 }, { x: 4, y: 2 }, { x: 5, y: 2 }];
    const pathB = [{ x: 6, y: 2 }, { x: 5, y: 2 }, { x: 5, y: 3 }, { x: 4, y: 3 }];
    const crossingObjects = {
      [stallA.id]: { ...stallA, queuePath: pathA },
      [stallB.id]: { ...stallB, queuePath: pathB },
    };

    const crossingPlan = planStallQueueLayouts(map, crossingObjects, TEST_CATALOG, portals);
    expect(crossingPlan[stallA.id]).toEqual([]);
    expect(crossingPlan[stallB.id]).toEqual([]);

    const game = createNewGame({
      map,
      entrance: portals[0],
      exit: portals[1],
      catalog: TEST_CATALOG,
      initialObjects: [stallA, stallB],
      seed: "custom-queue-crossing",
    });
    const configuredA = dispatchCommand(game, { type: "configure-queue", objectId: stallA.id, points: pathA });
    expect(configuredA.accepted).toBe(true);
    const configuredB = dispatchCommand(configuredA.state, {
      type: "configure-queue",
      objectId: stallB.id,
      points: pathB,
    });
    expect(configuredB.accepted).toBe(false);
    expect(configuredB.error).toContain("overlaps the configured queue");
  });

  it("protects every open stall anchor from earlier automatic tails and authored routes", () => {
    const stallA = stall("stall-a", 2, "east");
    const stallB = stall("stall-b", 5, "west");
    const objects = { [stallA.id]: stallA, [stallB.id]: stallB };

    const automaticPlan = planStallQueueLayouts(map, objects, TEST_CATALOG, portals);
    expect(automaticPlan[stallA.id]?.[0]).toEqual({ x: 2, y: 2 });
    expect(automaticPlan[stallB.id]?.[0]).toEqual({ x: 5, y: 2 });
    expect(automaticPlan[stallA.id]).not.toContainEqual({ x: 5, y: 2 });
    expect(automaticPlan[stallA.id]?.length).toBeGreaterThan(0);
    expect(automaticPlan[stallB.id]?.length).toBeGreaterThan(0);
    expectGloballyUnique(automaticPlan);

    const game = createNewGame({
      map,
      entrance: portals[0],
      exit: portals[1],
      catalog: TEST_CATALOG,
      initialObjects: [stallA, stallB],
      seed: "protected-queue-anchors",
    });
    const claimedAnchor = dispatchCommand(game, {
      type: "configure-queue",
      objectId: stallA.id,
      points: [{ x: 2, y: 2 }, { x: 3, y: 2 }, { x: 4, y: 2 }, { x: 5, y: 2 }],
    });
    expect(claimedAnchor.accepted).toBe(false);
    expect(claimedAnchor.error).toContain("queue anchor for stall-b");
  });

  it("does not let closed stalls reserve operational queue cells", () => {
    const automatic = stall("stall-a", 2, "east");
    const closed = {
      ...stall("stall-b", 5, "west"),
      open: false,
      queuePath: [{ x: 5, y: 2 }, { x: 4, y: 2 }, { x: 3, y: 2 }, { x: 2, y: 2 }],
    };
    const baseline = planStallQueueLayouts(map, { [automatic.id]: automatic }, TEST_CATALOG, portals);
    const withClosed = planStallQueueLayouts(
      map,
      { [automatic.id]: automatic, [closed.id]: closed },
      TEST_CATALOG,
      portals,
    );

    expect(withClosed[automatic.id]).toEqual(baseline[automatic.id]);
    expect(withClosed[closed.id]).toEqual([]);
    expect(getStallQueueCells(map, { [closed.id]: closed }, TEST_CATALOG, closed, portals)).toEqual(closed.queuePath);
  });

  it("reserves custom cells before autos so an automatic route reroutes around the claim", () => {
    const automatic = stall("stall-a", 2, "east");
    const custom = {
      ...stall("stall-z", 6, "west"),
      queuePath: [{ x: 6, y: 2 }, { x: 5, y: 2 }, { x: 4, y: 2 }, { x: 3, y: 2 }],
    };
    const baseline = planStallQueueLayouts(map, { [automatic.id]: automatic }, TEST_CATALOG, portals);
    const withCustom = planStallQueueLayouts(
      map,
      { [automatic.id]: automatic, [custom.id]: custom },
      TEST_CATALOG,
      portals,
    );

    expect(baseline[automatic.id]).toEqual([{ x: 2, y: 2 }, { x: 3, y: 2 }, { x: 4, y: 2 }, { x: 5, y: 2 }]);
    expect(withCustom[custom.id]).toEqual(custom.queuePath);
    expect(withCustom[automatic.id]).not.toEqual(baseline[automatic.id]);
    expect(withCustom[automatic.id]).toHaveLength(4);
    expectGloballyUnique(withCustom);
  });
});
