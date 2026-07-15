const WALKING_GRACE_TILES = 20;
const WALKING_CONCERN_TILES = 80;
const WALKING_MINIMUM_SCORE = 20;
const WALKING_PENALTY_PER_TILE = 50 / (WALKING_CONCERN_TILES - WALKING_GRACE_TILES);

/**
 * Scores the distance travelled during a guest's complete centre journey.
 * Routine trips receive generous headroom, while scores below 50 are reserved
 * for journeys longer than roughly eighty tiles.
 */
export function walkingSatisfactionScore(distanceTiles: number): number {
  const safeDistance = Number.isFinite(distanceTiles)
    ? Math.max(0, distanceTiles)
    : Number.POSITIVE_INFINITY;
  const distanceBeyondGrace = Math.max(0, safeDistance - WALKING_GRACE_TILES);
  const penalty = distanceBeyondGrace * WALKING_PENALTY_PER_TILE;
  return Math.max(WALKING_MINIMUM_SCORE, Math.min(100, 100 - penalty));
}
