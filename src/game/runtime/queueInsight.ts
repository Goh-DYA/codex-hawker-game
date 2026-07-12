import type { GridPoint } from "@/src/game/core";

export type QueueFlowState = "good" | "neutral" | "warning";

export interface QueueFlowStallDiagnostic {
  readonly open: boolean;
  readonly queueCount: number;
  readonly routeCapacity: number;
  readonly designedCapacity: number;
  readonly occupiedCells: readonly GridPoint[];
}

export interface QueueFlowInsight {
  readonly pressure: number;
  readonly state: QueueFlowState;
  readonly message: string;
}

function clampPercentage(value: number): number {
  return Math.max(0, Math.min(100, value));
}

function pointKey(point: GridPoint): string {
  return `${point.x}:${point.y}`;
}

/**
 * Turns live queue geometry into an actionable explanation. Demand pressure,
 * shortened routes, imbalance, and actual shared-aisle occupation are kept
 * separate so rearranging a healthy layout does not leave a stale warning.
 */
export function deriveQueueFlowInsight(
  stalls: readonly QueueFlowStallDiagnostic[],
  mainGuestRoute: readonly GridPoint[],
): QueueFlowInsight {
  const active = stalls.filter((stall) => stall.open);
  if (active.length === 0) {
    return {
      pressure: 0,
      state: "good",
      message: "Open a stall to begin measuring queue flow.",
    };
  }

  const totalQueued = active.reduce((sum, stall) => sum + stall.queueCount, 0);
  const totalCapacity = active.reduce((sum, stall) => sum + stall.routeCapacity, 0);
  const pressure = clampPercentage(
    totalCapacity > 0 ? (totalQueued / totalCapacity) * 100 : totalQueued > 0 ? 100 : 0,
  );
  if (totalQueued === 0) {
    return {
      pressure: 0,
      state: "good",
      message: "No queues are forming and every stall approach is clear.",
    };
  }

  const routeKeys = new Set(mainGuestRoute.slice(1, -1).map(pointKey));
  const occupied = active.flatMap((stall, stallIndex) =>
    stall.occupiedCells.map((point) => ({ point, stallIndex })),
  );
  const mainAisleQueueCount = occupied.filter(({ point }) => routeKeys.has(pointKey(point))).length;
  let adjacentForeignPairs = 0;
  for (let left = 0; left < occupied.length; left += 1) {
    for (let right = left + 1; right < occupied.length; right += 1) {
      const first = occupied[left];
      const second = occupied[right];
      if (!first || !second || first.stallIndex === second.stallIndex) continue;
      if (
        Math.abs(first.point.x - second.point.x) +
          Math.abs(first.point.y - second.point.y) ===
        1
      ) {
        adjacentForeignPairs += 1;
      }
    }
  }

  const sharedApproachCrowding =
    (mainAisleQueueCount >= 2 && mainAisleQueueCount / totalQueued >= 0.3) ||
    adjacentForeignPairs >= 2;
  if (sharedApproachCrowding) {
    return {
      pressure,
      state: "warning",
      message:
        "Queues are spilling into shared approach paths. Bend lines away from the guest route or move stalls apart.",
    };
  }

  const constrained = active.some(
    (stall) =>
      stall.routeCapacity < stall.designedCapacity &&
      stall.queueCount >= Math.max(1, Math.ceil(stall.routeCapacity * 0.5)),
  );
  if (constrained) {
    return {
      pressure,
      state: "warning",
      message:
        "Furniture is shortening an active queue line. Clear approach tiles or redraw that stall's route.",
    };
  }

  const busiestCount = Math.max(...active.map((stall) => stall.queueCount));
  const busiestUtilization = Math.max(
    ...active.map((stall) =>
      stall.routeCapacity > 0 ? stall.queueCount / stall.routeCapacity : stall.queueCount > 0 ? 1 : 0,
    ),
  );
  if (
    active.length > 1 &&
    totalQueued >= 3 &&
    busiestCount / totalQueued >= 0.7 &&
    busiestUtilization >= 0.6
  ) {
    return {
      pressure,
      state: "warning",
      message:
        "One stall is carrying most of the demand while others have room. Adjust its menu, price, or queue direction.",
    };
  }

  if (pressure >= 75) {
    return {
      pressure,
      state: "warning",
      message:
        "Queues are near capacity, but approach paths remain clear. Add or open a stall, or improve service speed.",
    };
  }
  if (pressure >= 45) {
    return {
      pressure,
      state: "neutral",
      message: "Queues are active and flowing. Watch the busiest stall as demand grows.",
    };
  }
  return {
    pressure,
    state: "good",
    message: "Approach paths are clear and queue pressure is comfortable.",
  };
}
