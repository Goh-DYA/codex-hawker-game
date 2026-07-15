import type { StallDefinition } from "../../content";

const DEFAULT_DISPLAY_DISH_LIMIT = 4;

/**
 * Selects the active dishes that may be represented as props on a stall.
 * The catalogue order is used only as a safe fallback when no active ID is valid.
 */
export function displayDishIdsForStall(
  stall: StallDefinition,
  activeIds: readonly string[],
  limit = DEFAULT_DISPLAY_DISH_LIMIT,
): readonly string[] {
  if (!Number.isSafeInteger(limit) || limit <= 0) {
    throw new RangeError("Stall display dish limit must be a positive integer.");
  }

  const permittedIds = new Set(stall.dishIds);
  const selectedIds: string[] = [];
  const seenIds = new Set<string>();

  for (const dishId of activeIds) {
    if (!permittedIds.has(dishId) || seenIds.has(dishId)) continue;
    selectedIds.push(dishId);
    seenIds.add(dishId);
    if (selectedIds.length === limit) return selectedIds;
  }

  if (selectedIds.length > 0) return selectedIds;
  const fallbackId = stall.dishIds[0];
  return fallbackId ? [fallbackId] : [];
}
