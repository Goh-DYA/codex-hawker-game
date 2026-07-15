import { describe, expect, it } from "vitest";
import {
  assertSimulationInvariants,
  createGridMap,
  createNewGame,
  deserializeGameState,
  dispatchCommand,
  getBlockedTileKeys,
  getStallQueueCells,
  getTile,
  pointKey,
  serializeGameState,
  stepSimulation,
  withTile,
  type Customer,
  type GameState,
  type PersistentGameStateV3,
  type PlacedObject,
  type SimulationCatalog,
} from "../../src/game/core";
import { TEST_CATALOG } from "./fixtures";

function withSlowBalancedStall(): SimulationCatalog {
  return {
    ...TEST_CATALOG,
    archetypes: {
      regular: {
        ...TEST_CATALOG.archetypes.regular,
        noveltyPreference: 0,
      },
    },
    placeables: {
      ...TEST_CATALOG.placeables,
      stall: {
        ...TEST_CATALOG.placeables.stall,
        stall: {
          ...(TEST_CATALOG.placeables.stall.stall as NonNullable<typeof TEST_CATALOG.placeables.stall.stall>),
          orderMs: 100_000,
          queueCapacity: 4,
        },
      },
    },
  };
}

function makeTwoStallGame(catalog = withSlowBalancedStall()): GameState {
  return createNewGame({
    map: createGridMap(14, 8),
    entrance: { x: 0, y: 4 },
    exit: { x: 13, y: 4 },
    catalog,
    seed: "balanced-stalls",
    startingCurrency: 5_000,
    initialObjects: [
      { id: "stall-a", definitionId: "stall", origin: { x: 2, y: 0 }, rotation: 0, open: true },
      { id: "stall-b", definitionId: "stall", origin: { x: 8, y: 0 }, rotation: 0, open: true },
    ],
    config: { fixedStepMs: 100, spawnIntervalMs: 100, standard: { maxActiveCustomers: 20 } },
  });
}

function runSteps(state: GameState, count: number): GameState {
  let current = state;
  for (let index = 0; index < count; index += 1) current = stepSimulation(current);
  return current;
}

describe("balanced deterministic stall choice", () => {
  it("balances committed demand instead of filling the entrance-nearest stall first", () => {
    const first = runSteps(makeTwoStallGame(), 8);
    const second = runSteps(makeTwoStallGame(), 8);

    expect(first.metrics.spawnedCustomers).toBe(8);
    expect(first.queues).toEqual(second.queues);
    expect(first.queues["stall-a"]).toHaveLength(4);
    expect(first.queues["stall-b"]).toHaveLength(4);
    expect(() => assertSimulationInvariants(first)).not.toThrow();
  });

  it("lets a preferred, higher-quality menu beat a modest distance advantage", () => {
    const base = withSlowBalancedStall();
    const catalog: SimulationCatalog = {
      ...base,
      placeables: {
        ...base.placeables,
        near: {
          ...base.placeables.stall,
          id: "near",
          stall: { ...(base.placeables.stall.stall as NonNullable<typeof base.placeables.stall.stall>), dishIds: ["rice"] },
        },
        far: {
          ...base.placeables.stall,
          id: "far",
          stall: { ...(base.placeables.stall.stall as NonNullable<typeof base.placeables.stall.stall>), dishIds: ["noodles"], quality: 4 },
        },
      },
    };
    const game = createNewGame({
      map: createGridMap(14, 8),
      entrance: { x: 0, y: 4 },
      exit: { x: 13, y: 4 },
      catalog,
      seed: 9,
      initialObjects: [
        { id: "near-stall", definitionId: "near", origin: { x: 2, y: 0 }, rotation: 0, open: true },
        { id: "far-stall", definitionId: "far", origin: { x: 8, y: 0 }, rotation: 0, open: true },
      ],
      config: { fixedStepMs: 100, spawnIntervalMs: 10_000 },
    });
    const selected = stepSimulation(game);
    expect(Object.values(selected.customers)[0]?.targetStallId).toBe("far-stall");
  });
});

describe("obstacle-safe configurable queues", () => {
  const objects: readonly PlacedObject[] = [
    {
      id: "stall-1",
      definitionId: "stall",
      origin: { x: 2, y: 0 },
      rotation: 0,
      open: true,
      queueDirection: "south",
    },
    { id: "blocker", definitionId: "table", origin: { x: 2, y: 3 }, rotation: 0, open: false },
  ];

  function makeQueueGame(initialObjects: readonly PlacedObject[] = objects): GameState {
    return createNewGame({
      map: createGridMap(10, 8),
      entrance: { x: 0, y: 5 },
      exit: { x: 9, y: 5 },
      catalog: withSlowBalancedStall(),
      seed: "bent-queue",
      startingCurrency: 5_000,
      initialObjects,
      config: { fixedStepMs: 100, spawnIntervalMs: 100 },
    });
  }

  it("bends the automatic route around furniture and honors a player direction", () => {
    const game = makeQueueGame();
    const stall = game.objects["stall-1"] as PlacedObject;
    const south = getStallQueueCells(game.map, game.objects, game.catalog, stall, [game.entrance, game.exit]);
    const blocked = getBlockedTileKeys(game.objects, game.catalog);
    expect(south).toHaveLength(4);
    expect(south[0]).toEqual({ x: 2, y: 2 });
    expect(south[1]).not.toEqual({ x: 2, y: 3 });
    expect(south.every((point) => !blocked.has(pointKey(point)))).toBe(true);

    const eastResult = dispatchCommand(game, {
      type: "set-stall-queue-direction",
      objectId: "stall-1",
      direction: "east",
    });
    expect(eastResult.accepted).toBe(true);
    const eastStall = eastResult.state.objects["stall-1"] as PlacedObject;
    const east = getStallQueueCells(
      eastResult.state.map,
      eastResult.state.objects,
      eastResult.state.catalog,
      eastStall,
      [eastResult.state.entrance, eastResult.state.exit],
    );
    expect(east.slice(0, 2)).toEqual([{ x: 2, y: 2 }, { x: 3, y: 2 }]);
  });

  it("accepts a bent authored route, rejects furniture intersections, and persists it", () => {
    const game = makeQueueGame();
    const points = [{ x: 2, y: 2 }, { x: 1, y: 2 }, { x: 1, y: 3 }, { x: 1, y: 4 }];
    const configured = dispatchCommand(game, { type: "configure-queue", objectId: "stall-1", points });
    expect(configured.accepted).toBe(true);
    const stall = configured.state.objects["stall-1"] as PlacedObject;
    expect(getStallQueueCells(configured.state.map, configured.state.objects, configured.state.catalog, stall)).toEqual(points);

    const blocked = dispatchCommand(game, {
      type: "configure-queue",
      objectId: "stall-1",
      points: [{ x: 2, y: 2 }, { x: 2, y: 3 }],
    });
    expect(blocked.accepted).toBe(false);
    expect(blocked.error).toContain("blocked by furniture");

    const loaded = deserializeGameState(serializeGameState(configured.state), configured.state.catalog);
    expect(loaded.objects["stall-1"]?.queuePath).toEqual(points);
    expect(loaded.objects["stall-1"]?.queueDirection).toBe("south");
  });

  it("moves a saved custom queue forward when its service anchor changes by one tile", () => {
    const game = makeQueueGame();
    const points = [{ x: 2, y: 2 }, { x: 1, y: 2 }, { x: 1, y: 3 }, { x: 1, y: 4 }];
    const configured = dispatchCommand(game, { type: "configure-queue", objectId: "stall-1", points });
    expect(configured.accepted).toBe(true);
    const stallDefinition = configured.state.catalog.placeables.stall!;
    const migratedCatalog: SimulationCatalog = {
      ...configured.state.catalog,
      placeables: {
        ...configured.state.catalog.placeables,
        stall: {
          ...stallDefinition,
          queueAnchor: { ...(stallDefinition.servicePoint as NonNullable<typeof stallDefinition.servicePoint>) },
        },
      },
    };

    const loaded = deserializeGameState(serializeGameState(configured.state), migratedCatalog);
    expect(loaded.objects["stall-1"]?.queuePath).toEqual([
      { x: 3, y: 2 },
      { x: 2, y: 2 },
      { x: 1, y: 2 },
      { x: 1, y: 3 },
    ]);
  });

  it("preserves live queue positions and prepared orders across rerouting and undo", () => {
    const seeded = runSteps(makeQueueGame(), 1);
    const template = Object.values(seeded.customers)[0] as Customer;
    expect(template).toBeDefined();
    const queued: Customer = {
      ...template,
      id: "queued-live",
      status: "queued",
      position: { x: 2, y: 2 },
      path: [],
      pathIndex: 0,
      movementProgress: 0,
      targetStallId: "stall-1",
      orderedDishId: undefined,
    };
    const waiting: Customer = {
      ...template,
      id: "waiting-live",
      status: "waiting-for-food",
      position: { x: 3, y: 2 },
      path: [],
      pathIndex: 0,
      movementProgress: 0,
      targetStallId: "stall-1",
      orderedDishId: "noodles",
    };
    const active: GameState = {
      ...seeded,
      customers: { [queued.id]: queued, [waiting.id]: waiting },
      queues: { ...seeded.queues, "stall-1": [queued.id] },
      spawnCountdownMs: 100_000,
      metrics: { ...seeded.metrics, spawnedCustomers: 2 },
    };

    const rerouted = dispatchCommand(active, {
      type: "set-stall-queue-direction",
      objectId: "stall-1",
      direction: "east",
    });
    expect(rerouted.accepted).toBe(true);
    expect(rerouted.state.queues["stall-1"]).toEqual([queued.id]);
    expect(rerouted.state.customers[queued.id]).toMatchObject({
      status: "queued",
      targetStallId: "stall-1",
    });
    expect(rerouted.state.customers[waiting.id]).toMatchObject({
      status: "waiting-for-food",
      targetStallId: "stall-1",
      orderedDishId: "noodles",
    });

    const undone = dispatchCommand(rerouted.state, { type: "undo" });
    expect(undone.accepted).toBe(true);
    expect(undone.state.objects["stall-1"]?.queueDirection).toBe("south");
    expect(undone.state.queues["stall-1"]).toEqual([queued.id]);
    expect(undone.state.customers[waiting.id]?.orderedDishId).toBe("noodles");
    expect(() => assertSimulationInvariants(undone.state)).not.toThrow();
  });

  it("releases only overflow guests when a live custom queue is shortened", () => {
    const seeded = runSteps(makeQueueGame(), 1);
    const template = Object.values(seeded.customers)[0] as Customer;
    const queueCells = getStallQueueCells(
      seeded.map,
      seeded.objects,
      seeded.catalog,
      seeded.objects["stall-1"] as PlacedObject,
      [seeded.entrance, seeded.exit],
    );
    const customers: Record<string, Customer> = {};
    const queueIds = queueCells.map((point, index) => {
      const id = `queued-${index}`;
      customers[id] = {
        ...template,
        id,
        status: "queued",
        position: { ...point },
        path: [],
        pathIndex: 0,
        movementProgress: 0,
        targetStallId: "stall-1",
        orderedDishId: undefined,
      };
      return id;
    });
    const waiting: Customer = {
      ...template,
      id: "waiting-order",
      status: "waiting-for-food",
      position: { x: 3, y: 2 },
      path: [],
      pathIndex: 0,
      movementProgress: 0,
      targetStallId: "stall-1",
      orderedDishId: "rice",
    };
    customers[waiting.id] = waiting;
    const active: GameState = {
      ...seeded,
      customers,
      queues: { ...seeded.queues, "stall-1": queueIds },
      spawnCountdownMs: 100_000,
      metrics: { ...seeded.metrics, spawnedCustomers: queueIds.length + 1 },
    };
    const shortened = dispatchCommand(active, {
      type: "configure-queue",
      objectId: "stall-1",
      points: queueCells.slice(0, 2),
    });

    expect(shortened.accepted).toBe(true);
    expect(shortened.state.queues["stall-1"]).toEqual(queueIds.slice(0, 2));
    for (const id of queueIds.slice(0, 2)) {
      expect(shortened.state.customers[id]).toMatchObject({ status: "queued", targetStallId: "stall-1" });
    }
    for (const id of queueIds.slice(2)) {
      expect(shortened.state.customers[id]).toMatchObject({ status: "choosing-stall" });
      expect(shortened.state.customers[id]?.targetStallId).toBeUndefined();
    }
    expect(shortened.state.customers[waiting.id]).toMatchObject({
      status: "waiting-for-food",
      targetStallId: "stall-1",
      orderedDishId: "rice",
    });
    expect(() => assertSimulationInvariants(shortened.state)).not.toThrow();
  });

  it("reconciles another live queue when new geometry shortens its global plan", () => {
    const baseCatalog = withSlowBalancedStall();
    const tightCatalog: SimulationCatalog = {
      ...baseCatalog,
      placeables: {
        ...baseCatalog.placeables,
        blocker: {
          id: "blocker",
          kind: "facility",
          footprint: { width: 1, height: 1 },
          allowedRotations: [0],
          blocksMovement: true,
          price: 1,
        },
      },
    };
    let tightMap = createGridMap(7, 4);
    for (let x = 0; x < tightMap.width; x += 1) {
      tightMap = withTile(tightMap, { x, y: 3 }, "wall");
    }
    const seeded = runSteps(
      createNewGame({
        map: tightMap,
        entrance: { x: 0, y: 2 },
        exit: { x: 6, y: 2 },
        catalog: tightCatalog,
        seed: "geometry-queue-reconcile",
        startingCurrency: 5_000,
        initialObjects: [
          { id: "stall-a", definitionId: "stall", origin: { x: 1, y: 0 }, rotation: 0, open: true, queueDirection: "east" },
          { id: "turn-blocker", definitionId: "blocker", origin: { x: 3, y: 1 }, rotation: 0, open: false },
        ],
        config: { fixedStepMs: 100, spawnIntervalMs: 100 },
      }),
      1,
    );
    const template = Object.values(seeded.customers)[0] as Customer;
    const initialCells = getStallQueueCells(
      seeded.map,
      seeded.objects,
      seeded.catalog,
      seeded.objects["stall-a"] as PlacedObject,
      [seeded.entrance, seeded.exit],
    );
    expect(initialCells).toHaveLength(4);
    const customers: Record<string, Customer> = {};
    const ids = initialCells.map((point, index) => {
      const id = `geometry-guest-${index}`;
      customers[id] = {
        ...template,
        id,
        status: "queued",
        position: { ...point },
        path: [],
        pathIndex: 0,
        movementProgress: 0,
        targetStallId: "stall-a",
        orderedDishId: undefined,
      };
      return id;
    });
    const active: GameState = {
      ...seeded,
      customers,
      queues: { ...seeded.queues, "stall-a": ids },
      spawnCountdownMs: 100_000,
      metrics: { ...seeded.metrics, spawnedCustomers: ids.length },
    };

    const placed = dispatchCommand(active, {
      type: "place-object",
      objectId: "stall-b",
      definitionId: "stall",
      origin: { x: 4, y: 0 },
      rotation: 0,
    });
    expect(placed.accepted).toBe(true);
    expect(placed.state.queues["stall-a"]).toEqual(ids.slice(0, 3));
    expect(placed.state.customers[ids[3] as string]).toMatchObject({ status: "choosing-stall" });
    expect(placed.state.queues["stall-b"]).toEqual([]);
    expect(() => assertSimulationInvariants(placed.state)).not.toThrow();
  });

  it("keeps every admitted customer's queue route off blocked tiles", () => {
    const queuePath = [{ x: 2, y: 2 }, { x: 1, y: 2 }, { x: 1, y: 3 }, { x: 1, y: 4 }];
    const configuredObjects = objects.map((object) =>
      object.id === "stall-1" ? { ...object, queuePath } : object,
    );
    const state = runSteps(makeQueueGame(configuredObjects), 12);
    const blocked = getBlockedTileKeys(state.objects, state.catalog);
    for (const customer of Object.values(state.customers)) {
      expect(customer.path.every((point) => !blocked.has(pointKey(point)))).toBe(true);
    }
    expect(() => assertSimulationInvariants(state)).not.toThrow();
  });
});

describe("coherent expansion boundaries and exits", () => {
  function perimeterMap() {
    let map = createGridMap(8, 6);
    for (let x = 0; x < map.width; x += 1) {
      map = withTile(map, { x, y: 0 }, "wall");
      map = withTile(map, { x, y: map.height - 1 }, "wall");
    }
    for (let y = 0; y < map.height; y += 1) {
      map = withTile(map, { x: 0, y }, "wall");
      map = withTile(map, { x: map.width - 1, y }, "wall");
    }
    map = withTile(map, { x: 0, y: 2 }, "floor");
    return withTile(map, { x: 7, y: 2 }, "floor");
  }

  function makeExpansionGame(): GameState {
    return createNewGame({
      map: perimeterMap(),
      entrance: { x: 0, y: 2 },
      exit: { x: 7, y: 2 },
      catalog: TEST_CATALOG,
      startingCurrency: 10_000,
      seed: 1,
    });
  }

  it("moves the perimeter and exit while opening the former right and bottom seams", () => {
    const initial = makeExpansionGame();
    const result = dispatchCommand(initial, { type: "expand-map", addColumns: 3, addRows: 2 });
    expect(result.accepted).toBe(true);
    expect(result.state.map).toMatchObject({ width: 11, height: 8 });
    expect(result.state.exit).toEqual({ x: 10, y: 2 });
    expect(getTile(result.state.map, { x: 7, y: 1 })).toBe("floor");
    expect(getTile(result.state.map, { x: 1, y: 5 })).toBe("floor");
    expect(getTile(result.state.map, { x: 10, y: 1 })).toBe("wall");
    expect(getTile(result.state.map, { x: 10, y: 2 })).toBe("floor");
    expect(getTile(result.state.map, { x: 1, y: 7 })).toBe("wall");
    expect(getTile(result.state.map, { x: 0, y: 5 })).toBe("wall");
    expect(getTile(result.state.map, { x: 7, y: 0 })).toBe("wall");

    const undone = dispatchCommand(result.state, { type: "undo" });
    expect(undone.accepted).toBe(true);
    expect(undone.state.exit).toEqual(initial.exit);
    expect(undone.state.map).toEqual(initial.map);
  });

  it("keeps stationary perimeter walls sealed across repeated expansions", () => {
    const first = dispatchCommand(makeExpansionGame(), {
      type: "expand-map",
      addColumns: 3,
      addRows: 2,
    });
    expect(first.accepted).toBe(true);
    const second = dispatchCommand(first.state, {
      type: "expand-map",
      addColumns: 3,
      addRows: 2,
    });
    expect(second.accepted).toBe(true);

    for (let y = 0; y < second.state.map.height; y += 1) {
      expect(getTile(second.state.map, { x: 0, y })).toBe(y === 2 ? "floor" : "wall");
    }
    for (let x = 0; x < second.state.map.width; x += 1) {
      expect(getTile(second.state.map, { x, y: 0 })).toBe("wall");
    }
  });

  it("repairs historical perimeter holes when loading a save", () => {
    const initial = makeExpansionGame();
    const save = JSON.parse(serializeGameState(initial)) as PersistentGameStateV3;
    const tiles = [...save.map.tiles];
    tiles[4 * save.map.width] = "floor";
    const loaded = deserializeGameState(
      { ...save, map: { ...save.map, tiles } },
      TEST_CATALOG,
      { config: initial.config },
    );

    expect(getTile(loaded.map, { x: 0, y: 4 })).toBe("wall");
    expect(getTile(loaded.map, loaded.entrance)).toBe("floor");
    expect(getTile(loaded.map, loaded.exit)).toBe("floor");
  });

  it("does not despawn an exiting customer at the former boundary after expansion", () => {
    const initial = makeExpansionGame();
    const archetype = TEST_CATALOG.archetypes.regular;
    const customer: Customer = {
      id: "customer-1",
      archetypeId: archetype.id,
      status: "walking-to-exit",
      position: { ...initial.exit },
      path: [{ ...initial.exit }],
      pathIndex: 1,
      movementProgress: 0,
      stateElapsedMs: 0,
      visitElapsedMs: 0,
      walkingDistanceTiles: 0,
      patienceRemainingMs: archetype.patienceMs,
      satisfaction: 3,
      hasTray: false,
      served: true,
      spent: 8,
      stuckMs: 0,
    };
    const active: GameState = {
      ...initial,
      customers: { [customer.id]: customer },
      metrics: { ...initial.metrics, spawnedCustomers: 1 },
      spawnCountdownMs: 100_000,
    };
    const expanded = dispatchCommand(active, { type: "expand-map", addColumns: 3, addRows: 0 }).state;
    const firstStep = stepSimulation(expanded);
    expect(firstStep.customers[customer.id]).toBeDefined();
    expect(firstStep.metrics.despawnedCustomers).toBe(0);

    const completed = runSteps(firstStep, 10);
    expect(completed.customers[customer.id]).toBeUndefined();
    expect(completed.metrics.despawnedCustomers).toBe(1);
    expect(() => assertSimulationInvariants(completed)).not.toThrow();
  });
});
