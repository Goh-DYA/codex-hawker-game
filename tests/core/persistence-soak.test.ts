import { describe, expect, it } from "vitest";
import {
  assertSimulationInvariants,
  deserializeGameState,
  deserializeGameStateWithReport,
  dispatchCommand,
  migratePersistentState,
  persistentStateFromGame,
  serializeGameState,
  simulationDigest,
  stepSimulation,
  validateCatalog,
  type GameState,
  type SimulationCatalog,
} from "../../src/game/core";
import { makeGame, TEST_CATALOG } from "./fixtures";

function runSteps(state: GameState, count: number): GameState {
  let current = state;
  for (let index = 0; index < count; index += 1) {
    current = stepSimulation(current);
    assertSimulationInvariants(current);
  }
  return current;
}

describe("versioned persistence", () => {
  it("round-trips persistent state and safely normalizes transient agents", () => {
    const active = runSteps(makeGame({ seed: 77 }), 25);
    expect(Object.keys(active.customers).length).toBeGreaterThan(0);
    const serialized = serializeGameState(active);
    const loaded = deserializeGameState(serialized, TEST_CATALOG, { config: active.config });
    expect(loaded.schemaVersion).toBe(2);
    expect(loaded.economy).toEqual(active.economy);
    expect(loaded.progression).toEqual(active.progression);
    expect(loaded.objects).toEqual(active.objects);
    expect(loaded.customers).toEqual({});
    expect(loaded.queues["stall-1"]).toEqual([]);
  });

  it("migrates a representative V1 save without discarding player currency or XP", () => {
    const current = makeGame();
    const migrated = migratePersistentState({
      schemaVersion: 1,
      map: current.map,
      entrance: current.entrance,
      exit: current.exit,
      objects: Object.values(current.objects),
      money: 321,
      xp: 450,
      reputation: 4,
      seed: 123,
    });
    expect(migrated.schemaVersion).toBe(2);
    expect(migrated.economy.currency).toBe(321);
    expect(migrated.progression).toMatchObject({ xp: 450, level: 3, reputation: 4 });
  });

  it("requires an explicit alias or refund when saved content has been removed", () => {
    const current = makeGame();
    const save = persistentStateFromGame(current);
    const changed = {
      ...save,
      objects: save.objects.map((object) =>
        object.id === "seat-1" ? { ...object, definitionId: "retired-seat" } : object,
      ),
    };
    expect(() => deserializeGameState(changed, TEST_CATALOG)).toThrow(/removed definition/);
    const recovered = deserializeGameStateWithReport(changed, TEST_CATALOG, {
      removedDefinitionRefunds: { "retired-seat": 25 },
    });
    expect(recovered.state.objects["seat-1"]).toBeUndefined();
    expect(recovered.state.economy.currency).toBe(current.economy.currency + 25);
    expect(recovered.recovery).toMatchObject({ removedObjectIds: ["seat-1"], currencyRefunded: 25 });
  });

  it("remaps explicit unlock progression through the same content alias table", () => {
    const save = persistentStateFromGame(makeGame());
    const changed = {
      ...save,
      progression: {
        ...save.progression,
        unlockedDefinitionIds: [...save.progression.unlockedDefinitionIds, "old-premium"],
      },
    };
    const catalog: SimulationCatalog = {
      ...TEST_CATALOG,
      placeables: {
        ...TEST_CATALOG.placeables,
        premium: { ...TEST_CATALOG.placeables.table, id: "premium", unlockLevel: 5 },
      },
    };
    const loaded = deserializeGameStateWithReport(changed, catalog, {
      definitionIdAliases: { "old-premium": "premium" },
    });
    expect(loaded.state.progression.unlockedDefinitionIds).toContain("premium");
    expect(loaded.recovery.warnings.join(" ")).toContain("old-premium");
  });

  it("reports malformed catalog references before simulation starts", () => {
    const malformed: SimulationCatalog = {
      ...TEST_CATALOG,
      placeables: {
        ...TEST_CATALOG.placeables,
        broken: {
          ...TEST_CATALOG.placeables.stall,
          id: "broken",
          stall: {
            dishIds: ["missing"],
            orderMs: 100,
            preparationCapacity: 1,
            queueCapacity: 4,
            popularity: 1,
            quality: 3,
          },
        },
      },
    };
    expect(validateCatalog(malformed).some((issue) => issue.message.includes("unknown dish"))).toBe(true);
    const deeplyMalformed = {
      ...TEST_CATALOG,
      placeables: {
        bad: {
          ...TEST_CATALOG.placeables.table,
          id: "bad",
          allowedRotations: "bad",
          seatPoints: "bad",
          footprint: { width: 1, height: 1, cells: [null] },
        },
      },
    } as unknown as SimulationCatalog;
    expect(() => validateCatalog(deeplyMalformed)).not.toThrow();
    expect(validateCatalog(deeplyMalformed).length).toBeGreaterThan(0);
    const emptyIdCatalog = {
      ...TEST_CATALOG,
      dishes: { ...TEST_CATALOG.dishes, "": { ...TEST_CATALOG.dishes.rice, id: "" } },
    } as SimulationCatalog;
    expect(validateCatalog(emptyIdCatalog).some((issue) => issue.message.includes("safe ID"))).toBe(true);
  });
});

describe("seeded soak", () => {
  it("is reproducible and leaks neither queues nor reservations after closing", () => {
    const first = runSteps(makeGame({ seed: "soak-2026" }), 600);
    const second = runSteps(makeGame({ seed: "soak-2026" }), 600);
    expect(simulationDigest(first)).toBe(simulationDigest(second));
    expect(first.metrics.spawnedCustomers).toBe(first.metrics.despawnedCustomers + Object.keys(first.customers).length);

    const closed = dispatchCommand(first, { type: "set-stall-open", objectId: "stall-1", open: false }).state;
    const drained = runSteps(closed, 300);
    expect(Object.keys(drained.customers)).toHaveLength(0);
    expect(drained.queues["stall-1"]).toEqual([]);
    expect(drained.seatReservations).toEqual({});
  });
});
