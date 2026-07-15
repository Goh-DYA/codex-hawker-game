import { describe, expect, it } from "vitest";
import {
  createGridMap,
  createNewGame,
  stepSimulation,
  walkingSatisfactionScore,
  withTile,
  type GameState,
  type SimulationCatalog,
} from "../../src/game/core";
import { makeGame, TEST_CATALOG } from "./fixtures";

function runUntil(
  source: GameState,
  predicate: (state: GameState) => boolean,
  maxSteps = 3_000,
): GameState {
  let state = source;
  for (let step = 0; step < maxSteps && !predicate(state); step += 1) {
    state = stepSimulation(state);
  }
  if (!predicate(state)) throw new Error(`Condition was not reached after ${maxSteps} steps`);
  return state;
}

function catalogWithMealDuration(preparationMs: number, eatingMs: number): SimulationCatalog {
  return {
    ...TEST_CATALOG,
    dishes: Object.fromEntries(
      Object.entries(TEST_CATALOG.dishes).map(([id, dish]) => [
        id,
        { ...dish, preparationMs, eatingMs },
      ]),
    ),
  };
}

function completeFirstVisit(catalog: SimulationCatalog): GameState {
  return runUntil(
    makeGame({
      catalog,
      seed: "walking-duration-control",
      config: {
        spawnIntervalMs: 1_000_000,
        maxVisitMs: 300_000,
      },
    }),
    (state) => state.metrics.visitRatings.length > 0,
  );
}

function makeRouteGame(serpentine: boolean): GameState {
  let map = createGridMap(30, 16);
  if (serpentine) {
    for (const [wallX, gapY] of [[8, 14], [16, 1], [24, 14]] as const) {
      for (let y = 0; y < map.height; y += 1) {
        if (y !== gapY) map = withTile(map, { x: wallX, y }, "wall");
      }
    }
  }
  return createNewGame({
    map,
    entrance: { x: 0, y: 7 },
    exit: { x: 29, y: 7 },
    catalog: TEST_CATALOG,
    seed: "walking-route-comparison",
    initialObjects: [
      { id: "stall-1", definitionId: "stall", origin: { x: 2, y: 0 }, rotation: 0, open: true },
      { id: "seat-1", definitionId: "seat", origin: { x: 27, y: 2 }, rotation: 0, open: false },
      { id: "tray-1", definitionId: "tray", origin: { x: 27, y: 12 }, rotation: 0, open: false },
    ],
    config: {
      spawnIntervalMs: 1_000_000,
      maxVisitMs: 300_000,
    },
  });
}

function completeRouteJourney(serpentine: boolean): { readonly distance: number; readonly score: number } {
  const exiting = runUntil(
    makeRouteGame(serpentine),
    (state) => Object.values(state.customers).some(
      (customer) => customer.status === "walking-to-exit" && customer.path.length > 0,
    ),
  );
  const customer = Object.values(exiting.customers).find(
    (candidate) => candidate.status === "walking-to-exit" && candidate.path.length > 0,
  );
  if (!customer) throw new Error("Expected an exiting customer with a prepared path");
  const distance = customer.walkingDistanceTiles + Math.max(0, customer.path.length - customer.pathIndex);
  const completed = runUntil(exiting, (state) => state.metrics.visitRatings.length > 0);
  const score = completed.metrics.visitRatings[0]?.components.walking;
  if (score === undefined) throw new Error("Expected a completed walking rating");
  return { distance, score };
}

describe("walking satisfaction", () => {
  it("keeps routine journeys high and reserves sub-fifty scores for very long routes", () => {
    expect(walkingSatisfactionScore(20)).toBe(100);
    expect(walkingSatisfactionScore(32)).toBe(90);
    expect(walkingSatisfactionScore(60)).toBeCloseTo(66.67, 1);
    expect(walkingSatisfactionScore(80)).toBe(50);
    expect(walkingSatisfactionScore(100)).toBeCloseTo(33.33, 1);
    expect(walkingSatisfactionScore(116)).toBe(20);
  });

  it("does not penalize the same route for longer preparation and eating", () => {
    const quickVisit = completeFirstVisit(catalogWithMealDuration(100, 200));
    const slowVisit = completeFirstVisit(catalogWithMealDuration(40_000, 60_000));
    const quickRating = quickVisit.metrics.visitRatings[0];
    const slowRating = slowVisit.metrics.visitRatings[0];

    expect(slowVisit.tick).toBeGreaterThan(quickVisit.tick + 900);
    expect(slowRating?.components.walking).toBe(quickRating?.components.walking);
    expect(slowRating?.components.walking).toBeGreaterThanOrEqual(80);
  });

  it("includes the walk to the exit before settling the rating", () => {
    const exiting = runUntil(
      makeGame({
        seed: "walking-exit-leg",
        config: { spawnIntervalMs: 1_000_000 },
      }),
      (state) => Object.values(state.customers).some(
        (customer) => customer.status === "walking-to-exit" && customer.path.length > 0,
      ),
    );
    const customer = Object.values(exiting.customers).find(
      (candidate) => candidate.status === "walking-to-exit" && candidate.path.length > 0,
    );
    expect(customer).toBeDefined();
    expect(exiting.metrics.visitRatings).toHaveLength(0);
    const remainingExitTiles = Math.max(
      0,
      (customer?.path.length ?? 0) - (customer?.pathIndex ?? 0),
    );
    const expectedDistance = (customer?.walkingDistanceTiles ?? 0) + remainingExitTiles;

    const completed = runUntil(exiting, (state) => state.metrics.visitRatings.length > 0);
    expect(completed.metrics.visitRatings[0]?.components.walking).toBe(
      walkingSatisfactionScore(expectedDistance),
    );
  });

  it("scores a serpentine obstacle route below the same destinations on an open map", () => {
    const open = completeRouteJourney(false);
    const serpentine = completeRouteJourney(true);

    expect(open.distance).toBeLessThan(60);
    expect(open.score).toBe(walkingSatisfactionScore(open.distance));
    expect(open.score).toBeGreaterThan(70);
    expect(serpentine.distance).toBeGreaterThanOrEqual(open.distance + 45);
    expect(serpentine.score).toBe(walkingSatisfactionScore(serpentine.distance));
    expect(serpentine.score).toBeLessThan(40);
  });
});
