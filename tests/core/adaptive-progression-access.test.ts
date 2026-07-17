import { describe, expect, it } from "vitest";
import {
  averageVisitRating,
  deserializeGameState,
  dispatchCommand,
  persistentStateFromGame,
  stepSimulation,
  type GameState,
  type PersistentGameStateV2,
} from "../../src/game/core";
import { makeGame, TEST_CATALOG } from "./fixtures";

function runSteps(source: GameState, count: number): GameState {
  let state = source;
  for (let index = 0; index < count; index += 1) state = stepSimulation(state);
  return state;
}

describe("adaptive satisfaction, demand, and progression", () => {
  it("records completed visit ratings that can exceed seventy percent", () => {
    const state = runSteps(makeGame({ seed: "high-happiness" }), 1_200);
    expect(state.metrics.visitRatings.length).toBeGreaterThan(0);
    expect(averageVisitRating(state)).toBeGreaterThan(70);
    expect(state.metrics.visitRatings.every((rating) => rating.score >= 0 && rating.score <= 100)).toBe(true);
  });

  it("admits guests beyond the former lower-end ceiling without a count gate", () => {
    const initial = makeGame({
      seed: "uncapped-demand",
      qualityMode: "lower-end",
      config: {
        fixedStepMs: 100,
        spawnIntervalMs: 1,
        maxVisitMs: 1_000_000,
        lowerEnd: { maxFixedStepsPerAdvance: 100 },
      },
    });
    const state = runSteps(initial, 120);
    expect(state.config.lowerEnd.maxActiveCustomers).toBeUndefined();
    expect(state.metrics.spawnedCustomers).toBeGreaterThan(40);
  });

  it("creates three daily objectives and grants a completed reward once", () => {
    const initial = makeGame();
    expect(initial.progression.dailyObjectives).toHaveLength(3);
    const service = initial.progression.dailyObjectives.find((objective) => objective.kind === "serve");
    expect(service).toBeDefined();
    const prepared: GameState = {
      ...initial,
      economy: { ...initial.economy, completedVisits: initial.economy.completedVisits + (service?.target ?? 0) },
      progression: {
        ...initial.progression,
        dailyObjectives: initial.progression.dailyObjectives.map((objective) =>
          objective.id === service?.id ? objective : { ...objective, completed: true },
        ),
      },
    };
    const rewarded = stepSimulation(prepared);
    const cashAfterReward = rewarded.economy.currency;
    expect(rewarded.progression.dailyObjectives.find((objective) => objective.id === service?.id)?.completed).toBe(true);
    const repeated = stepSimulation(rewarded);
    expect(repeated.economy.currency).toBe(cashAfterReward);
  });

  it("persists ratings, objectives, milestone claims, and stall mastery", () => {
    const operated = runSteps(makeGame({ seed: "progression-persistence" }), 1_200);
    const saved = persistentStateFromGame(operated);
    const loaded = deserializeGameState(saved, TEST_CATALOG, { config: operated.config });
    expect(loaded.metrics.visitRatings).toEqual(operated.metrics.visitRatings);
    expect(loaded.progression.dailyObjectives).toEqual(operated.progression.dailyObjectives);
    expect(loaded.progression.claimedMilestoneIds).toEqual(operated.progression.claimedMilestoneIds);
    expect(loaded.progression.stallMastery).toEqual(operated.progression.stallMastery);
  });

  it("gates and purchases authored stall upgrades through mastery rank", () => {
    const catalog = {
      ...TEST_CATALOG,
      placeables: {
        ...TEST_CATALOG.placeables,
        stall: {
          ...TEST_CATALOG.placeables.stall,
          stall: {
            ...TEST_CATALOG.placeables.stall.stall!,
            upgradeLevels: [{ level: 2 as const, cost: 75, serviceTimeMultiplier: 0.9, capacityBonus: 1, qualityBonus: 0.05, menuSlotsBonus: 1 }],
          },
        },
      },
    };
    const initial = makeGame({ catalog, startingCurrency: 500 });
    expect(dispatchCommand(initial, { type: "upgrade-stall", definitionId: "stall" }).accepted).toBe(false);
    const mastered: GameState = {
      ...initial,
      progression: {
        ...initial.progression,
        stallMastery: { stall: { points: 100, rank: 2, upgradeLevel: 1 } },
      },
    };
    const upgraded = dispatchCommand(mastered, { type: "upgrade-stall", definitionId: "stall" });
    expect(upgraded.accepted).toBe(true);
    expect(upgraded.state.progression.stallMastery.stall?.upgradeLevel).toBe(2);
    expect(upgraded.state.progression.stallMastery.stall?.rank).toBe(2);
    expect(upgraded.state.progression.stallMastery.stall?.points).toBe(100);
    expect(upgraded.state.economy.currency).toBe(425);
  });
});

describe("multiple movable access points", () => {
  it("adds, moves, removes, and undoes boundary access points atomically", () => {
    const initial = makeGame();
    const added = dispatchCommand(initial, {
      type: "add-access-point",
      accessPoint: { id: "entrance-2", kind: "entrance", position: { x: 0, y: 5 } },
    });
    expect(added.accepted).toBe(true);
    expect(added.state.accessPoints).toHaveLength(3);
    const moved = dispatchCommand(added.state, {
      type: "move-access-point",
      accessPointId: "entrance-2",
      position: { x: 0, y: 6 },
    });
    expect(moved.accepted).toBe(true);
    expect(moved.state.accessPoints.find((point) => point.id === "entrance-2")?.position).toEqual({ x: 0, y: 6 });
    expect(moved.state.map.tiles[5 * moved.state.map.width]).toBe("wall");
    const removed = dispatchCommand(moved.state, { type: "remove-access-point", accessPointId: "entrance-2" });
    expect(removed.accepted).toBe(true);
    const undone = dispatchCommand(removed.state, { type: "undo" });
    expect(undone.state.accessPoints.some((point) => point.id === "entrance-2")).toBe(true);
  });

  it("rejects interior access points and preserves the last entrance and exit", () => {
    const initial = makeGame();
    expect(dispatchCommand(initial, {
      type: "add-access-point",
      accessPoint: { id: "bad-entry", kind: "entrance", position: { x: 4, y: 4 } },
    }).accepted).toBe(false);
    expect(dispatchCommand(initial, { type: "remove-access-point", accessPointId: "entrance-1" }).accepted).toBe(false);
    expect(dispatchCommand(initial, { type: "remove-access-point", accessPointId: "exit-1" }).accepted).toBe(false);
  });

  it("migrates singular schema-v2 access fields into schema v3", () => {
    const current = makeGame();
    const legacy: PersistentGameStateV2 = {
      schemaVersion: 2,
      savedAtTick: 0,
      map: current.map,
      entrance: current.entrance,
      exit: current.exit,
      qualityMode: current.qualityMode,
      objects: Object.values(current.objects),
      economy: current.economy,
      progression: current.progression,
      rngState: current.rngState,
      nextCustomerSequence: current.nextCustomerSequence,
      elapsedMs: current.elapsedMs,
    };
    const loaded = deserializeGameState(legacy, TEST_CATALOG, { config: current.config });
    expect(loaded.schemaVersion).toBe(4);
    expect(loaded.accessPoints.map((point) => point.kind)).toEqual(["entrance", "exit"]);
  });
});
