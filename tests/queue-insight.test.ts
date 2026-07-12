import { describe, expect, it } from "vitest";

import {
  deriveQueueFlowInsight,
  type QueueFlowStallDiagnostic,
} from "../src/game/runtime/queueInsight";

function stall(
  queueCount: number,
  occupiedCells: QueueFlowStallDiagnostic["occupiedCells"],
  routeCapacity = 7,
  designedCapacity = 7,
): QueueFlowStallDiagnostic {
  return {
    open: true,
    queueCount,
    routeCapacity,
    designedCapacity,
    occupiedCells,
  };
}

const mainRoute = Array.from({ length: 10 }, (_, x) => ({ x, y: 5 }));

describe("queue flow insight", () => {
  it("clears the shared-aisle warning when the same queue moves off the guest route", () => {
    const onAisle = deriveQueueFlowInsight(
      [stall(4, [{ x: 2, y: 5 }, { x: 3, y: 5 }, { x: 4, y: 5 }, { x: 5, y: 5 }])],
      mainRoute,
    );
    const clearApproach = deriveQueueFlowInsight(
      [stall(4, [{ x: 2, y: 2 }, { x: 2, y: 3 }, { x: 3, y: 3 }, { x: 4, y: 3 }])],
      mainRoute,
    );

    expect(onAisle.message).toContain("shared approach paths");
    expect(onAisle.state).toBe("warning");
    expect(clearApproach.message).toContain("active and flowing");
    expect(clearApproach.state).toBe("neutral");
    expect(clearApproach.pressure).toBe(onAisle.pressure);
  });

  it("distinguishes a shortened route from high demand", () => {
    const constrained = deriveQueueFlowInsight(
      [stall(2, [{ x: 2, y: 2 }, { x: 2, y: 3 }], 2, 7)],
      mainRoute,
    );
    const busyButClear = deriveQueueFlowInsight(
      [
        stall(6, Array.from({ length: 6 }, (_, y) => ({ x: 2, y: y + 10 }))),
        stall(6, Array.from({ length: 6 }, (_, y) => ({ x: 8, y: y + 10 }))),
      ],
      mainRoute,
    );

    expect(constrained.message).toContain("Furniture is shortening");
    expect(busyButClear.message).toContain("near capacity");
    expect(busyButClear.message).toContain("approach paths remain clear");
  });

  it("reports demand imbalance instead of claiming the aisle is crowded", () => {
    const insight = deriveQueueFlowInsight(
      [
        stall(5, Array.from({ length: 5 }, (_, y) => ({ x: 2, y: y + 10 }))),
        stall(1, [{ x: 9, y: 10 }]),
      ],
      mainRoute,
    );

    expect(insight.message).toContain("One stall is carrying most of the demand");
    expect(insight.message).not.toContain("main aisle");
  });

  it("shows a calm state when no queue exists", () => {
    const insight = deriveQueueFlowInsight([stall(0, [])], mainRoute);
    expect(insight).toMatchObject({ pressure: 0, state: "good" });
    expect(insight.message).toContain("No queues are forming");
  });
});
