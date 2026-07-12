import { describe, expect, it } from "vitest";
import {
  advanceSimulation,
  assertSimulationInvariants,
  dispatchCommand,
  stepSimulation,
  type GameState,
} from "../../src/game/core";
import { makeGame } from "./fixtures";

function runUntil(state: GameState, predicate: (value: GameState) => boolean, maxSteps = 500): GameState {
  let current = state;
  for (let step = 0; step < maxSteps && !predicate(current); step += 1) current = stepSimulation(current);
  return current;
}

describe("customer lifecycle", () => {
  it("runs spawn through stall, queue, food, reserved seat, tray return, exit, and despawn", () => {
    const completed = runUntil(makeGame(), (state) => state.metrics.completedCustomers > 0);
    expect(completed.metrics.spawnedCustomers).toBeGreaterThan(0);
    expect(completed.economy.lifetimeRevenue).toBeGreaterThan(0);
    expect(completed.metrics.completedCustomers).toBeGreaterThan(0);
    expect(completed.events.some((event) => event.type === "customer-despawned")).toBe(true);
    expect(() => assertSimulationInvariants(completed)).not.toThrow();
  });

  it("fixed-step accumulation is independent of render-frame chunking", () => {
    let oneChunk = makeGame({ seed: 42 });
    let tenChunks = makeGame({ seed: 42 });
    oneChunk = advanceSimulation(oneChunk, 1_000).state;
    for (let index = 0; index < 10; index += 1) tenChunks = advanceSimulation(tenChunks, 100).state;
    expect(oneChunk).toMatchObject({
      tick: tenChunks.tick,
      rngState: tenChunks.rngState,
      customers: tenChunks.customers,
      queues: tenChunks.queues,
      economy: tenChunks.economy,
    });
  });

  it("lower-end mode enforces its fixed-step and crowd budgets", () => {
    const low = makeGame({
      qualityMode: "lower-end",
      config: {
        fixedStepMs: 100,
        spawnIntervalMs: 100,
        lowerEnd: { maxActiveCustomers: 2, maxFixedStepsPerAdvance: 3 },
      },
    });
    const advanced = advanceSimulation(low, 1_000);
    expect(advanced.fixedSteps).toBe(3);
    expect(advanced.droppedMs).toBe(700);
    const crowded = runUntil(advanced.state, (state) => state.tick >= 50, 100);
    expect(Object.keys(crowded.customers).length).toBeLessThanOrEqual(2);
  });
});

describe("reservation and target recovery", () => {
  it("releases a reserved seat immediately when its object is removed", () => {
    const reserved = runUntil(makeGame(), (state) => Object.keys(state.seatReservations).length > 0);
    const [seatKey, customerId] = Object.entries(reserved.seatReservations)[0] ?? [];
    expect(seatKey).toBeTruthy();
    const seatObjectId = seatKey?.split(":")[0] as string;
    const removed = dispatchCommand(reserved, { type: "remove-object", objectId: seatObjectId });
    expect(removed.accepted).toBe(true);
    expect(removed.state.seatReservations[seatKey as string]).toBeUndefined();
    expect(removed.state.customers[customerId as string]?.reservedSeatKey).toBeUndefined();
    expect(["seeking-seat", "choosing-stall"]).toContain(removed.state.customers[customerId as string]?.status);
    expect(() => assertSimulationInvariants(removed.state)).not.toThrow();
  });

  it("clears the queue and recovers every customer when a stall is removed", () => {
    const queued = runUntil(
      makeGame(),
      (state) => (state.queues["stall-1"]?.length ?? 0) > 0 || Object.values(state.customers).some((c) => c.targetStallId === "stall-1"),
    );
    const affected = Object.values(queued.customers).filter((customer) => customer.targetStallId === "stall-1").map((c) => c.id);
    expect(affected.length).toBeGreaterThan(0);
    const removed = dispatchCommand(queued, { type: "remove-object", objectId: "stall-1" });
    expect(removed.accepted).toBe(true);
    expect(removed.state.queues["stall-1"]).toBeUndefined();
    for (const id of affected) expect(removed.state.customers[id]?.targetStallId).toBeUndefined();
    expect(removed.state.metrics.recoveredTargets).toBeGreaterThan(queued.metrics.recoveredTargets);
    expect(() => assertSimulationInvariants(removed.state)).not.toThrow();
  });

  it("reselects or skips tray return when that destination is removed", () => {
    const returning = runUntil(
      makeGame(),
      (state) => Object.values(state.customers).some((customer) => customer.status === "walking-to-tray-return"),
    );
    const customer = Object.values(returning.customers).find((value) => value.status === "walking-to-tray-return");
    expect(customer?.targetTrayReturnId).toBe("tray-1");
    const removed = dispatchCommand(returning, { type: "remove-object", objectId: "tray-1" });
    expect(removed.state.customers[customer?.id as string]?.status).toBe("seeking-tray-return");
    expect(removed.state.customers[customer?.id as string]?.targetTrayReturnId).toBeUndefined();
    const recovered = stepSimulation(removed.state);
    expect(recovered.customers[customer?.id as string]?.status).toBe("walking-to-exit");
    expect(() => assertSimulationInvariants(recovered)).not.toThrow();
  });
});
