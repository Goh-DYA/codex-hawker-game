import { describe, expect, it } from "vitest";
import { DISHES, STALLS } from "../src/content";
import {
  defaultStallMenusForProgression,
  isDishUnlockedForMenu,
  resolveStallMenus,
} from "../src/game/runtime/stallMenus";

const DISH_BY_ID = new Map(DISHES.map((dish) => [dish.id, dish]));

describe("stall menu progression", () => {
  it("starts with only dishes unlocked by the initial level and reputation", () => {
    const progression = { level: 1, reputation: 8 };
    const menus = defaultStallMenusForProgression(progression);
    const activeDishIds = Object.values(menus).flat();

    expect(activeDishIds.length).toBeGreaterThan(0);
    expect(activeDishIds.every((dishId) => {
      const dish = DISH_BY_ID.get(dishId);
      return dish ? isDishUnlockedForMenu(dish, progression) : false;
    })).toBe(true);
  });

  it("repairs legacy or tampered selections without admitting locked dishes", () => {
    const progression = { level: 1, reputation: 8 };
    const lockedDish = DISHES.find(
      (dish) => !isDishUnlockedForMenu(dish, progression),
    );
    const stall = STALLS.find((candidate) =>
      candidate.dishIds.includes(lockedDish?.id ?? ""),
    );

    expect(lockedDish).toBeDefined();
    expect(stall).toBeDefined();
    const menus = resolveStallMenus(
      stall && lockedDish
        ? { [stall.id]: [lockedDish.id, "dish.not-real"] }
        : {},
      progression,
    );

    expect(Object.values(menus).flat()).not.toContain(lockedDish?.id);
    expect(Object.values(menus).flat().every((dishId) => {
      const dish = DISH_BY_ID.get(dishId);
      return dish ? isDishUnlockedForMenu(dish, progression) : false;
    })).toBe(true);
  });

  it("preserves a fourth selected dish when an upgraded stall adds a slot", () => {
    const stall = STALLS.find((candidate) => candidate.dishIds.length >= 4);

    expect(stall).toBeDefined();
    if (!stall) return;
    const selected = stall.dishIds.slice(0, 4);
    const menus = resolveStallMenus(
      { [stall.id]: selected },
      {
        level: 99,
        reputation: 100,
        slotBonuses: { [stall.id]: 1 },
      },
    );

    expect(menus[stall.id]).toEqual(selected);
  });
});
