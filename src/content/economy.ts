import type { EconomyDefinition } from "./types";

export const ECONOMY = {
  startingCash: 4_200,
  startingReputation: 8,
  maxLevel: 20,
  maxReputation: 100,
  minimumVisitEarnings: 3,
  starterRequiredSeats: 4,
  recoveryGrant: 650,
  levelXpThresholds: [
    0, 120, 300, 540, 850, 1_250, 1_750, 2_360, 3_100, 3_980,
    5_020, 6_240, 7_660, 9_300, 11_180, 13_320, 15_740, 18_460,
    21_500, 24_880,
  ],
} as const satisfies EconomyDefinition;
