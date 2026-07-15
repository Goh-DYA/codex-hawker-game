import { describe, expect, it } from "vitest";

import {
  OPERATING_DAY_MS,
  customerArchetypeSpawnWeight,
  operatingMinuteOfDay,
  stepSimulation,
  type CustomerArchetype,
  type GameState,
} from "../../src/game/core";
import { makeGame, TEST_CATALOG } from "./fixtures";

const AFTERNOON_PERSONA: CustomerArchetype = {
  id: "afternoon",
  budget: 8,
  patienceMs: 44_000,
  walkingSpeed: 2.25,
  priceSensitivity: 0.78,
  qualitySensitivity: 0.52,
  queueSensitivity: 0.82,
  distanceSensitivity: 0.66,
  unlockLevel: 3,
  unlockReputation: 0.6,
  visitSchedule: { startHour: 14, endHour: 18, peakMultiplier: 1.55 },
};

function runSteps(source: GameState, count: number): GameState {
  let state = source;
  for (let index = 0; index < count; index += 1) {
    state = stepSimulation(state);
  }
  return state;
}

describe("customer persona arrivals", () => {
  it("gates personas by progression and weights their authored visit window", () => {
    expect(customerArchetypeSpawnWeight(AFTERNOON_PERSONA, 2, 5, 270_000)).toBe(0);
    expect(customerArchetypeSpawnWeight(AFTERNOON_PERSONA, 3, 0.5, 270_000)).toBe(0);
    expect(customerArchetypeSpawnWeight(AFTERNOON_PERSONA, 3, 0.6, 0)).toBe(0.2);
    expect(customerArchetypeSpawnWeight(AFTERNOON_PERSONA, 3, 0.6, 270_000)).toBe(1.55);
  });

  it("resets persona schedules with each operating day", () => {
    expect(operatingMinuteOfDay(0)).toBe(10 * 60 + 30);
    expect(operatingMinuteOfDay(OPERATING_DAY_MS)).toBe(10 * 60 + 30);
    expect(
      customerArchetypeSpawnWeight(
        AFTERNOON_PERSONA,
        3,
        0.6,
        OPERATING_DAY_MS + 270_000,
      ),
    ).toBe(1.55);
  });

  it("keeps prerequisite-gated personas out until every requirement is unlocked", () => {
    const gated = {
      ...AFTERNOON_PERSONA,
      unlockPrerequisiteIds: ["stall.required"],
    };

    expect(
      customerArchetypeSpawnWeight(gated, 3, 0.6, 270_000, []),
    ).toBe(0);
    expect(
      customerArchetypeSpawnWeight(
        gated,
        3,
        0.6,
        270_000,
        ["stall.required"],
      ),
    ).toBe(1.55);
  });

  it("never spawns a locked persona", () => {
    const locked = {
      ...TEST_CATALOG.archetypes.valueSeeker,
      id: "locked",
      unlockLevel: 2,
    };
    const catalog = {
      ...TEST_CATALOG,
      archetypes: {
        regular: TEST_CATALOG.archetypes.regular,
        locked,
      },
    };
    const initial = makeGame({
      catalog,
      seed: "locked-persona",
      config: {
        fixedStepMs: 100,
        spawnIntervalMs: 1,
        maxVisitMs: 1_000_000,
        standard: { maxFixedStepsPerAdvance: 100 },
      },
    });
    const state = runSteps(initial, 30);

    expect(state.metrics.spawnedCustomers).toBeGreaterThan(0);
    expect(
      Object.values(state.customers).every(
        (customer) => customer.archetypeId === "regular",
      ),
    ).toBe(true);
  });
});
