import { describe, expect, it } from "vitest";
import {
  applySale,
  calculateExpansionCost,
  calculateLevel,
  createGridMap,
  createNewGame,
  dispatchCommand,
  stepSimulation,
  withTile,
  xpRequiredForLevel,
  type SimulationCatalog,
} from "../../src/game/core";
import { makeGame, TEST_CATALOG } from "./fixtures";

describe("build commands and undo", () => {
  it("places, moves, rotates, and undoes without losing economy state", () => {
    const initial = makeGame();
    const placed = dispatchCommand(initial, {
      type: "place-object",
      objectId: "table-new",
      definitionId: "table",
      origin: { x: 4, y: 6 },
    });
    expect(placed.accepted).toBe(true);
    expect(placed.state.economy.currency).toBe(initial.economy.currency - 40);

    const moved = dispatchCommand(placed.state, {
      type: "move-object",
      objectId: "table-new",
      origin: { x: 5, y: 6 },
      rotation: 90,
    });
    expect(moved.accepted).toBe(true);
    expect(moved.state.objects["table-new"]?.rotation).toBe(90);

    const undoMove = dispatchCommand(moved.state, { type: "undo" });
    expect(undoMove.accepted).toBe(true);
    expect(undoMove.state.objects["table-new"]?.origin).toEqual({ x: 4, y: 6 });
    expect(undoMove.state.economy.currency).toBe(initial.economy.currency - 40);

    const undoPlace = dispatchCommand(undoMove.state, { type: "undo" });
    expect(undoPlace.state.objects["table-new"]).toBeUndefined();
    expect(undoPlace.state.economy.currency).toBe(initial.economy.currency);
  });

  it("keeps recent undo usable during live simulation and then expires it", () => {
    const initial = makeGame();
    const placed = dispatchCommand(initial, {
      type: "place-object",
      objectId: "table-new",
      definitionId: "table",
      origin: { x: 4, y: 6 },
    }).state;
    expect(placed.undoStack).toHaveLength(1);
    const advanced = stepSimulation(placed);
    expect(advanced.undoStack).toHaveLength(1);
    expect(dispatchCommand(advanced, { type: "undo" }).accepted).toBe(true);
    let live = placed;
    for (let index = 0; index < 30; index += 1) live = stepSimulation(live);
    const liveRevenue = live.economy.lifetimeRevenue;
    const liveUndo = dispatchCommand(live, { type: "undo" });
    expect(liveUndo.accepted).toBe(true);
    expect(liveUndo.state.objects["table-new"]).toBeUndefined();
    expect(liveUndo.state.economy.lifetimeRevenue).toBe(liveRevenue);
    expect(liveUndo.state.economy.currency).toBe(live.economy.currency + 40);
    let stale = placed;
    for (let index = 0; index < 51; index += 1) stale = stepSimulation(stale);
    expect(stale.undoStack).toHaveLength(0);
  });

  it("cycles through the definition's allowed rotations and ignores no-op moves", () => {
    const catalog: SimulationCatalog = {
      ...TEST_CATALOG,
      placeables: {
        ...TEST_CATALOG.placeables,
        table: { ...TEST_CATALOG.placeables.table, allowedRotations: [0, 180] },
      },
    };
    const placed = dispatchCommand(makeGame({ catalog }), {
      type: "place-object",
      objectId: "table-new",
      definitionId: "table",
      origin: { x: 4, y: 6 },
    }).state;
    const rotated = dispatchCommand(placed, { type: "rotate-object", objectId: "table-new" });
    expect(rotated.accepted).toBe(true);
    expect(rotated.state.objects["table-new"]?.rotation).toBe(180);
    const noOp = dispatchCommand(rotated.state, {
      type: "move-object",
      objectId: "table-new",
      origin: { x: 4, y: 6 },
      rotation: 180,
    });
    expect(noOp.accepted).toBe(true);
    expect(noOp.state.undoStack).toHaveLength(rotated.state.undoStack.length);
  });

  it("derives map expansion price from trusted progression configuration", () => {
    const initial = makeGame({ startingCurrency: 5_000 });
    const expectedCost = calculateExpansionCost(initial.map, initial.progression, initial.config, 1, 0);
    const expanded = dispatchCommand(initial, { type: "expand-map", addColumns: 1, addRows: 0 });
    expect(expanded.accepted).toBe(true);
    expect(expanded.state.map.width).toBe(initial.map.width + 1);
    expect(expanded.state.economy.currency).toBe(initial.economy.currency - expectedCost);
    const undone = dispatchCommand(expanded.state, { type: "undo" });
    expect(undone.state.map.width).toBe(initial.map.width);
    expect(undone.state.economy.currency).toBe(initial.economy.currency);
  });

  it("downgrades a placed-stall undo to normal resale once service has generated progression", () => {
    const initial = makeGame();
    const placed = dispatchCommand(initial, {
      type: "place-object",
      objectId: "stall-2",
      definitionId: "stall",
      origin: { x: 5, y: 0 },
    }).state;
    let operated = placed;
    for (let index = 0; index < 45 && operated.economy.lifetimeRevenue === 0; index += 1) {
      operated = stepSimulation(operated);
    }
    expect(operated.economy.lifetimeRevenue).toBeGreaterThan(0);
    const earnedRevenue = operated.economy.lifetimeRevenue - placed.economy.lifetimeRevenue;
    const normalResaleRefund = 50;
    const undone = dispatchCommand(operated, { type: "undo" });
    expect(undone.accepted).toBe(true);
    expect(undone.state.objects["stall-2"]).toBeUndefined();
    expect(undone.state.economy.currency).toBe(
      initial.economy.currency - TEST_CATALOG.placeables.stall.price + earnedRevenue + normalResaleRefund,
    );
    expect(undone.state.economy.currency).not.toBe(initial.economy.currency + earnedRevenue);
    expect(undone.state.economy.lifetimeSpend).toBe(
      initial.economy.lifetimeSpend + TEST_CATALOG.placeables.stall.price,
    );
    expect(undone.state.progression.xp).toBe(operated.progression.xp);
  });

  it("rejects unaffordable and route-blocking placements atomically", () => {
    const poor = makeGame({ startingCurrency: 0 });
    const unaffordable = dispatchCommand(poor, {
      type: "place-object",
      objectId: "table-new",
      definitionId: "table",
      origin: { x: 4, y: 6 },
    });
    expect(unaffordable.accepted).toBe(false);
    expect(unaffordable.state.objects["table-new"]).toBeUndefined();
    expect(unaffordable.state.economy.currency).toBe(0);

    let corridor = createGridMap(7, 3);
    for (let x = 0; x < corridor.width; x += 1) {
      corridor = withTile(corridor, { x, y: 0 }, "wall");
      corridor = withTile(corridor, { x, y: 2 }, "wall");
    }
    const narrow = createNewGame({
      map: corridor,
      entrance: { x: 0, y: 1 },
      exit: { x: 6, y: 1 },
      catalog: TEST_CATALOG,
      startingCurrency: 100,
    });
    const blocking = dispatchCommand(narrow, {
      type: "place-object",
      objectId: "blocker",
      definitionId: "table",
      origin: { x: 3, y: 1 },
    });
    expect(blocking.accepted).toBe(false);
    expect(blocking.error).toContain("entrance-to-exit");
    expect(blocking.state.economy.currency).toBe(100);

    const interactionBlock = dispatchCommand(makeGame(), {
      type: "place-object",
      objectId: "queue-blocker",
      definitionId: "table",
      origin: { x: 2, y: 2 },
    });
    expect(interactionBlock.accepted).toBe(false);
    expect(interactionBlock.error).toContain("Interaction point");
  });
});

describe("economy and progression", () => {
  it("uses explicit quadratic level thresholds", () => {
    expect(xpRequiredForLevel(1)).toBe(0);
    expect(xpRequiredForLevel(2)).toBe(100);
    expect(xpRequiredForLevel(3)).toBe(400);
    expect(calculateLevel(99)).toBe(1);
    expect(calculateLevel(100)).toBe(2);
  });

  it("credits sales, XP, reputation, and a level-up deterministically", () => {
    const state = makeGame();
    const update = applySale(state.economy, { ...state.progression, xp: 99, level: 1 }, 10, 5);
    expect(update.economy.currency).toBe(state.economy.currency + 10);
    expect(update.economy.lifetimeRevenue).toBe(10);
    expect(update.progression.xp).toBe(119);
    expect(update.progression.level).toBe(2);
    expect(update.levelUp).toBe(true);
  });
});
