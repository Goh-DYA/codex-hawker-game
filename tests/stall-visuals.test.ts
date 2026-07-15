import { describe, expect, it } from "vitest";

import { DISHES, STALLS } from "../src/content";
import { displayDishIdsForStall } from "../src/game/runtime/stallVisuals";

const DISH_BY_ID = new Map(DISHES.map((dish) => [dish.id, dish]));

describe("stall food prop selection", () => {
  it("selects reciprocal food props for all twelve stalls", () => {
    expect(STALLS).toHaveLength(12);

    for (const stall of STALLS) {
      const displayIds = displayDishIdsForStall(stall, stall.dishIds);

      expect(displayIds).toHaveLength(Math.min(4, stall.dishIds.length));
      for (const dishId of displayIds) {
        expect(stall.dishIds).toContain(dishId);
        expect(DISH_BY_ID.get(dishId)?.stallIds).toContain(stall.id);
      }
    }
  });

  it("preserves active-menu order while deduplicating and respecting the cap", () => {
    const stall = STALLS.find((candidate) => candidate.dishIds.length >= 4);
    expect(stall).toBeDefined();
    if (!stall) return;

    const [first, second, third, fourth] = stall.dishIds;
    expect(
      displayDishIdsForStall(
        stall,
        [third, first, third, second, fourth].filter(
          (dishId): dishId is string => dishId !== undefined,
        ),
        3,
      ),
    ).toEqual([third, first, second]);
  });

  it("rejects tampered, partial, and other-stall dish IDs by exact identity", () => {
    const stall = STALLS[0];
    const otherStall = STALLS[1];
    expect(stall).toBeDefined();
    expect(otherStall).toBeDefined();
    if (!stall || !otherStall) return;

    const validId = stall.dishIds[1];
    expect(validId).toBeDefined();
    if (!validId) return;

    expect(
      displayDishIdsForStall(stall, [
        "dish.not-real",
        `${validId}.variant`,
        otherStall.dishIds[0] ?? "dish.not-real",
        validId,
      ]),
    ).toEqual([validId]);
  });

  it("falls back to the first catalogue dish only when no active ID is valid", () => {
    const stall = STALLS[0];
    expect(stall).toBeDefined();
    if (!stall) return;

    expect(displayDishIdsForStall(stall, [])).toEqual([stall.dishIds[0]]);
    expect(displayDishIdsForStall(stall, ["dish.not-real"])).toEqual([
      stall.dishIds[0],
    ]);
    expect(displayDishIdsForStall(stall, [stall.dishIds[2] ?? ""])).toEqual([
      stall.dishIds[2],
    ]);
  });

  it("requires a positive integer limit", () => {
    const stall = STALLS[0];
    expect(stall).toBeDefined();
    if (!stall) return;

    for (const limit of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => displayDishIdsForStall(stall, stall.dishIds, limit)).toThrow(
        RangeError,
      );
    }
  });

  it("is deterministic and reacts to changed active-menu selections", () => {
    const stall = STALLS.find((candidate) => candidate.dishIds.length >= 3);
    expect(stall).toBeDefined();
    if (!stall) return;

    const firstSelection = stall.dishIds.slice(0, 2);
    const secondSelection = stall.dishIds.slice(1, 3);
    const firstResult = displayDishIdsForStall(stall, firstSelection);

    expect(displayDishIdsForStall(stall, firstSelection)).toEqual(firstResult);
    expect(displayDishIdsForStall(stall, secondSelection)).not.toEqual(
      firstResult,
    );
  });
});
