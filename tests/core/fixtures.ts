import {
  createGridMap,
  createNewGame,
  type GameState,
  type NewGameOptions,
  type PlacedObject,
  type SimulationCatalog,
} from "../../src/game/core";

export const TEST_CATALOG: SimulationCatalog = {
  dishes: {
    noodles: {
      id: "noodles",
      price: 8,
      preparationMs: 200,
      eatingMs: 300,
      quality: 4,
      preferenceTags: ["noodles"],
    },
    rice: {
      id: "rice",
      price: 6,
      preparationMs: 100,
      eatingMs: 200,
      quality: 3,
      preferenceTags: ["rice"],
    },
  },
  archetypes: {
    regular: {
      id: "regular",
      budget: 30,
      patienceMs: 8_000,
      walkingSpeed: 8,
      priceSensitivity: 0.1,
      qualitySensitivity: 1,
      queueSensitivity: 0.25,
      distanceSensitivity: 0.05,
      preferenceTags: ["noodles"],
    },
    valueSeeker: {
      id: "valueSeeker",
      budget: 12,
      patienceMs: 6_000,
      walkingSpeed: 6,
      priceSensitivity: 0.5,
      qualitySensitivity: 0.4,
      queueSensitivity: 0.5,
      distanceSensitivity: 0.1,
      preferenceTags: ["rice"],
    },
  },
  placeables: {
    stall: {
      id: "stall",
      kind: "stall",
      footprint: { width: 2, height: 2 },
      allowedRotations: [0, 90, 180, 270],
      blocksMovement: true,
      price: 100,
      refundRate: 0.5,
      servicePoint: { x: 1, y: 2 },
      queueAnchor: { x: 0, y: 2 },
      stall: {
        dishIds: ["noodles", "rice"],
        orderMs: 100,
        preparationCapacity: 1,
        queueCapacity: 4,
        popularity: 1,
        quality: 3,
      },
    },
    seat: {
      id: "seat",
      kind: "seat",
      footprint: { width: 1, height: 1 },
      allowedRotations: [0, 90, 180, 270],
      blocksMovement: false,
      price: 20,
      seatPoints: [{ x: 0, y: 0 }],
    },
    tray: {
      id: "tray",
      kind: "tray-return",
      footprint: { width: 1, height: 1 },
      allowedRotations: [0, 90, 180, 270],
      blocksMovement: true,
      price: 30,
      trayReturnPoint: { x: -1, y: 0 },
    },
    table: {
      id: "table",
      kind: "table",
      footprint: { width: 2, height: 1 },
      allowedRotations: [0, 90, 180, 270],
      blocksMovement: true,
      price: 40,
    },
  },
};

export const INITIAL_OBJECTS: readonly PlacedObject[] = [
  { id: "stall-1", definitionId: "stall", origin: { x: 2, y: 0 }, rotation: 0, open: true },
  { id: "seat-1", definitionId: "seat", origin: { x: 6, y: 2 }, rotation: 0, open: false },
  { id: "seat-2", definitionId: "seat", origin: { x: 7, y: 4 }, rotation: 0, open: false },
  { id: "tray-1", definitionId: "tray", origin: { x: 10, y: 6 }, rotation: 0, open: false },
];

export function makeGame(overrides: Partial<NewGameOptions> = {}): GameState {
  return createNewGame({
    map: createGridMap(12, 8, { tileSize: 32, worldOrigin: { x: 16, y: 24 } }),
    entrance: { x: 0, y: 3 },
    exit: { x: 11, y: 3 },
    catalog: TEST_CATALOG,
    seed: "test-seed",
    startingCurrency: 500,
    initialObjects: INITIAL_OBJECTS,
    config: {
      fixedStepMs: 100,
      spawnIntervalMs: 700,
      stuckRecoveryMs: 1_000,
      maxVisitMs: 30_000,
      standard: { maxActiveCustomers: 20, maxFixedStepsPerAdvance: 100 },
      lowerEnd: { maxActiveCustomers: 8, maxFixedStepsPerAdvance: 50 },
    },
    ...overrides,
  });
}
