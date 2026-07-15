import {
  DISHES,
  STALLS,
  type DishDefinition,
} from "../../content";

export interface StallMenuProgression {
  readonly level: number;
  /** Content reputation points, as displayed in the UI. */
  readonly reputation: number;
}

export interface ResolveStallMenusOptions extends StallMenuProgression {
  readonly slotBonuses?: Readonly<Record<string, number>>;
}

const DISH_BY_ID = new Map(DISHES.map((dish) => [dish.id, dish]));

export function isDishUnlockedForMenu(
  dish: DishDefinition,
  progression: StallMenuProgression,
) {
  return (
    dish.unlockRequirement.level <= progression.level &&
    dish.unlockRequirement.reputation <= progression.reputation
  );
}

export function normalizeStallMenuSelection(
  value: unknown,
): Readonly<Record<string, readonly string[]>> {
  const source = value && typeof value === "object"
    ? value as Readonly<Record<string, unknown>>
    : {};
  return Object.fromEntries(
    STALLS.map((stall) => {
      const rawCandidate = source[stall.id];
      const candidate: readonly unknown[] = Array.isArray(rawCandidate)
        ? rawCandidate
        : [];
      const permitted = new Set<string>(stall.dishIds);
      return [
        stall.id,
        [...new Set(
          candidate.filter(
            (id): id is string => typeof id === "string" && permitted.has(id),
          ),
        )],
      ];
    }),
  );
}

export function resolveStallMenus(
  value: unknown,
  options: ResolveStallMenusOptions,
): Readonly<Record<string, readonly string[]>> {
  const normalized = normalizeStallMenuSelection(value);
  return Object.fromEntries(
    STALLS.map((stall) => {
      const unlocked = stall.dishIds.filter((dishId) => {
        const dish = DISH_BY_ID.get(dishId);
        return dish ? isDishUnlockedForMenu(dish, options) : false;
      });
      const capacity = Math.max(
        1,
        stall.menuSlots + Math.max(0, options.slotBonuses?.[stall.id] ?? 0),
      );
      const unlockedSet = new Set(unlocked);
      const selected = (normalized[stall.id] ?? [])
        .filter((dishId) => unlockedSet.has(dishId))
        .slice(0, capacity);
      return [
        stall.id,
        selected.length > 0 ? selected : unlocked.slice(0, capacity),
      ];
    }),
  );
}

export function defaultStallMenusForProgression(
  progression: StallMenuProgression,
) {
  return resolveStallMenus({}, progression);
}

export function isDishIdUnlockedForMenu(
  dishId: string,
  progression: StallMenuProgression,
) {
  const dish = DISH_BY_ID.get(dishId);
  return dish ? isDishUnlockedForMenu(dish, progression) : false;
}
