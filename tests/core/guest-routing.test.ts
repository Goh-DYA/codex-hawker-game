import { describe, expect, it } from "vitest";
import {
  assertSimulationInvariants,
  createGridMap,
  createNewGame,
  deserializeGameState,
  dispatchCommand,
  findPath,
  pointKey,
  serializeGameState,
  stepSimulation,
  withTile,
  type CommandResult,
  type Customer,
  type GameState,
  type GridPoint,
} from "../../src/game/core";
import { makeGame, TEST_CATALOG } from "./fixtures";

const ROUTE_MAP_WIDTH = 14;
const ROUTE_MAP_HEIGHT = 9;
const ROUTE_START = { x: 0, y: 4 } as const;
const ROUTE_END = { x: ROUTE_MAP_WIDTH - 1, y: 4 } as const;

function guideRow(y: number): readonly GridPoint[] {
  return Array.from(
    { length: ROUTE_MAP_WIDTH - 2 },
    (_, index) => ({ x: index + 1, y }),
  );
}

function preferredKeys(points: readonly GridPoint[]): ReadonlySet<string> {
  return new Set(points.map(pointKey));
}

function makeRoutingGame(routeGuidePoints: readonly GridPoint[] = []): GameState {
  return createNewGame({
    map: createGridMap(ROUTE_MAP_WIDTH, ROUTE_MAP_HEIGHT),
    entrance: ROUTE_START,
    exit: ROUTE_END,
    routeGuidePoints,
    catalog: TEST_CATALOG,
    seed: "guest-route-guides",
    startingCurrency: 1_000,
    config: {
      fixedStepMs: 100,
      spawnIntervalMs: 100_000,
      stuckRecoveryMs: 1_000,
      maxVisitMs: 60_000,
    },
  });
}

function expectAtomicRouteRejection(
  result: CommandResult,
  baseline: GameState,
): void {
  expect(result.accepted).toBe(false);
  expect(result.state.routeGuidePoints).toEqual(baseline.routeGuidePoints);
  expect(result.state.undoStack).toEqual(baseline.undoStack);
  expect(result.state.objects).toEqual(baseline.objects);
  expect(result.state.customers).toEqual(baseline.customers);
  expect(result.state.economy).toEqual(baseline.economy);
}

describe("weighted guest route guidance", () => {
  it("deterministically shifts to a nearby preferred corridor and ignores a costly detour", () => {
    const map = createGridMap(ROUTE_MAP_WIDTH, ROUTE_MAP_HEIGHT);
    const direct = findPath(map, ROUTE_START, ROUTE_END);
    const upperGuide = guideRow(3);
    const lowerGuide = guideRow(5);

    const upperFirst = findPath(map, ROUTE_START, ROUTE_END, {
      preferred: preferredKeys(upperGuide),
    });
    const upperSecond = findPath(map, ROUTE_START, ROUTE_END, {
      preferred: preferredKeys(upperGuide),
    });
    const lower = findPath(map, ROUTE_START, ROUTE_END, {
      preferred: preferredKeys(lowerGuide),
    });
    const remote = findPath(map, ROUTE_START, ROUTE_END, {
      preferred: preferredKeys(guideRow(1)),
    });

    expect(direct.path?.every((point) => point.y === ROUTE_START.y)).toBe(true);
    expect(upperFirst.path).toEqual(upperSecond.path);
    expect(upperFirst.path).toContainEqual({ x: 6, y: 3 });
    expect(lower.path).toContainEqual({ x: 6, y: 5 });
    expect(lower.path).not.toContainEqual({ x: 6, y: 3 });
    expect(remote.path).toEqual(direct.path);
  });

  it("canonicalizes configured tiles and does not add undo history for a reordered no-op", () => {
    const initial = makeGame();
    const configured = dispatchCommand(initial, {
      type: "configure-guest-route",
      points: [
        { x: 8, y: 5 },
        { x: 2, y: 5 },
        { x: 8, y: 5 },
      ],
    });

    expect(configured.accepted).toBe(true);
    expect(configured.state.routeGuidePoints).toEqual([
      { x: 2, y: 5 },
      { x: 8, y: 5 },
    ]);

    const noOp = dispatchCommand(configured.state, {
      type: "configure-guest-route",
      points: [
        { x: 8, y: 5 },
        { x: 2, y: 5 },
      ],
    });
    expect(noOp.accepted).toBe(true);
    expect(noOp.state.routeGuidePoints).toEqual(configured.state.routeGuidePoints);
    expect(noOp.state.undoStack).toHaveLength(configured.state.undoStack.length);
  });

  it("rejects invalid guide tiles atomically", () => {
    const baseline = dispatchCommand(makeGame(), {
      type: "configure-guest-route",
      points: [{ x: 4, y: 5 }],
    }).state;

    for (const point of [
      { x: 99, y: 5 },
      { x: 0, y: 3 },
      { x: 4.5, y: 5 },
      { x: 2, y: 0 },
    ]) {
      expectAtomicRouteRejection(
        dispatchCommand(baseline, {
          type: "configure-guest-route",
          points: [point],
        }),
        baseline,
      );
    }

    const wallGame = makeGame({
      map: withTile(makeGame().map, { x: 4, y: 5 }, "wall"),
    });
    expectAtomicRouteRejection(
      dispatchCommand(wallGame, {
        type: "configure-guest-route",
        points: [{ x: 4, y: 5 }],
      }),
      wallGame,
    );
  });

  it("reserves guide tiles from movement-blocking placement", () => {
    const guided = dispatchCommand(makeGame(), {
      type: "configure-guest-route",
      points: [{ x: 4, y: 6 }],
    }).state;
    const blocked = dispatchCommand(guided, {
      type: "place-object",
      objectId: "route-blocker",
      definitionId: "table",
      origin: { x: 4, y: 6 },
    });

    expect(blocked.accepted).toBe(false);
    expect(blocked.error).toContain("reserved");
    expect(blocked.state.objects["route-blocker"]).toBeUndefined();
    expect(blocked.state.routeGuidePoints).toEqual(guided.routeGuidePoints);
    expect(blocked.state.economy).toEqual(guided.economy);
  });

  it("invalidates a live path while preserving the visit and replans through the new corridor", () => {
    const initial = makeRoutingGame();
    const directPath = findPath(initial.map, ROUTE_START, ROUTE_END).path;
    if (!directPath) throw new Error("Expected a direct test route");
    const archetype = TEST_CATALOG.archetypes.regular;
    const customer: Customer = {
      id: "live-route-guest",
      archetypeId: archetype.id,
      status: "walking-to-exit",
      position: { ...ROUTE_START },
      path: directPath,
      pathIndex: 1,
      movementProgress: 0.25,
      stateElapsedMs: 200,
      visitElapsedMs: 2_000,
      walkingDistanceTiles: 3,
      patienceRemainingMs: archetype.patienceMs,
      satisfaction: 3,
      healthConditions: [],
      sourceEntranceId: "entrance-1",
      targetExitId: "exit-1",
      hasTray: false,
      served: true,
      spent: 8,
      stuckMs: 400,
    };
    const active: GameState = {
      ...initial,
      customers: { [customer.id]: customer },
      metrics: { ...initial.metrics, spawnedCustomers: 1 },
      spawnCountdownMs: 100_000,
    };

    const configured = dispatchCommand(active, {
      type: "configure-guest-route",
      points: guideRow(3),
    });
    expect(configured.accepted).toBe(true);
    expect(configured.state.customers[customer.id]).toMatchObject({
      status: "walking-to-exit",
      position: ROUTE_START,
      path: [],
      pathIndex: 0,
      movementProgress: 0,
      walkingDistanceTiles: 3,
      targetExitId: "exit-1",
      served: true,
      spent: 8,
      stuckMs: 0,
    });
    expect(configured.state.metrics.recoveredTargets).toBe(
      active.metrics.recoveredTargets,
    );
    expect(configured.state.metrics.despawnedCustomers).toBe(0);

    const replanned = stepSimulation(configured.state);
    expect(replanned.customers[customer.id]?.status).toBe("walking-to-exit");
    expect(replanned.customers[customer.id]?.path).toContainEqual({ x: 6, y: 3 });
    expect(replanned.customers[customer.id]?.targetExitId).toBe("exit-1");
    expect(() => assertSimulationInvariants(replanned)).not.toThrow();
  });

  it("restores successive route edits through undo without changing cash", () => {
    const initial = makeRoutingGame();
    const upper = dispatchCommand(initial, {
      type: "configure-guest-route",
      points: guideRow(3),
    });
    const lower = dispatchCommand(upper.state, {
      type: "configure-guest-route",
      points: guideRow(5),
    });

    expect(upper.accepted).toBe(true);
    expect(lower.accepted).toBe(true);
    const undoLower = dispatchCommand(lower.state, { type: "undo" });
    expect(undoLower.accepted).toBe(true);
    expect(undoLower.state.routeGuidePoints).toEqual(upper.state.routeGuidePoints);
    expect(undoLower.state.economy.currency).toBe(initial.economy.currency);

    const undoUpper = dispatchCommand(undoLower.state, { type: "undo" });
    expect(undoUpper.accepted).toBe(true);
    expect(undoUpper.state.routeGuidePoints).toEqual([]);
    expect(undoUpper.state.economy.currency).toBe(initial.economy.currency);
  });

  it("round-trips route guides and defaults older schema-v3 saves to automatic routing", () => {
    const configured = dispatchCommand(makeRoutingGame(), {
      type: "configure-guest-route",
      points: guideRow(3),
    }).state;
    const loaded = deserializeGameState(
      serializeGameState(configured),
      TEST_CATALOG,
      { config: configured.config },
    );
    expect(loaded.routeGuidePoints).toEqual(configured.routeGuidePoints);

    const legacy = JSON.parse(serializeGameState(configured)) as Record<string, unknown>;
    delete legacy.routeGuidePoints;
    const migrated = deserializeGameState(legacy, TEST_CATALOG, {
      config: configured.config,
    });
    expect(migrated.routeGuidePoints).toEqual([]);
  });
});
