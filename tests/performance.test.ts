import { performance } from "node:perf_hooks";
import { describe, expect, it } from "vitest";
import {
  assertSimulationInvariants,
  stepSimulation,
  type Customer,
  type GameState,
} from "../src/game/core";
import { makeGame } from "./core/fixtures";

function percentile(values: readonly number[], ratio: number): number {
  const ordered = [...values].sort((a, b) => a - b);
  return ordered[Math.min(ordered.length - 1, Math.floor(ordered.length * ratio))] ?? 0;
}

describe("repeatable 80-agent simulation benchmark", () => {
  it("keeps fixed-step work inside the simulation budget", () => {
    let state: GameState = stepSimulation(
      makeGame({
        seed: "benchmark-80-agents",
        config: {
          fixedStepMs: 100,
          spawnIntervalMs: 100_000,
          standard: { maxActiveCustomers: 80, maxFixedStepsPerAdvance: 100 },
          lowerEnd: { maxActiveCustomers: 40, maxFixedStepsPerAdvance: 50 },
        },
      }),
    );
    const template = Object.values(state.customers)[0];
    expect(template).toBeDefined();

    const customers: Record<string, Customer> = {};
    for (let index = 0; index < 80; index += 1) {
      const id = `benchmark-${index + 1}`;
      customers[id] = {
        ...template!,
        id,
        position: { ...state.entrance },
        path: [],
        pathIndex: 0,
        movementProgress: 0,
        stateElapsedMs: 0,
        visitElapsedMs: 0,
        walkingDistanceTiles: 0,
        targetStallId: undefined,
        orderedDishId: undefined,
        reservedSeatKey: undefined,
        targetTrayReturnId: undefined,
      };
    }
    state = {
      ...state,
      customers,
      queues: Object.fromEntries(Object.keys(state.queues).map((stallId) => [stallId, []])),
      spawnCountdownMs: 100_000,
      nextCustomerSequence: 81,
      metrics: { ...state.metrics, spawnedCustomers: 80, despawnedCustomers: 0 },
    };

    const samples: number[] = [];
    let peakActive = 80;
    const heapBefore = process.memoryUsage().heapUsed;
    const startedAt = performance.now();
    for (let index = 0; index < 1_200; index += 1) {
      const tickStartedAt = performance.now();
      state = stepSimulation(state);
      samples.push(performance.now() - tickStartedAt);
      peakActive = Math.max(peakActive, Object.keys(state.customers).length);
      if (index % 100 === 0) assertSimulationInvariants(state);
    }
    const durationMs = performance.now() - startedAt;
    const heapDeltaBytes = process.memoryUsage().heapUsed - heapBefore;
    const result = {
      seed: "benchmark-80-agents",
      fixedSteps: samples.length,
      peakActiveCustomers: peakActive,
      meanSimulationMs: samples.reduce((sum, sample) => sum + sample, 0) / samples.length,
      p95SimulationMs: percentile(samples, 0.95),
      maxSimulationMs: Math.max(...samples),
      totalDurationMs: durationMs,
      heapDeltaBytes,
      finalActiveCustomers: Object.keys(state.customers).length,
      completedVisits: state.economy.completedVisits,
    };
    process.stdout.write(`BENCHMARK_RESULT ${JSON.stringify(result)}\n`);

    expect(result.peakActiveCustomers).toBe(80);
    expect(result.p95SimulationMs).toBeLessThan(10);
    expect(result.meanSimulationMs).toBeLessThan(4);
    assertSimulationInvariants(state);
  });
});
