import type { PlaceableDefinition } from "@/src/content";
import type { UtilityEffects } from "@/src/game/core";

function hasAny(values: ReadonlySet<string>, candidates: readonly string[]) {
  return candidates.some((candidate) => values.has(candidate));
}

/** Converts authored catalogue utility metadata into simulation-ready effects. */
export function utilityEffectsForPlaceable(item: PlaceableDefinition): UtilityEffects {
  const roles = new Set(item.interactionPoints.map((point) => point.role));
  const tags = new Set(item.tags);
  let cleanliness = item.cleanlinessModifier;
  let queuePatience = item.serviceModifiers.queuePatience;
  let eatingSpeed = item.serviceModifiers.eatingSpeed;
  let cleaningEfficiency = item.serviceModifiers.cleaningEfficiency;
  let movementSpeed = item.serviceModifiers.movementSpeed;
  let wayfinding = 0;

  if (item.category === "signage") {
    wayfinding += roles.has("inspect-menu") ? 0.16 : 0.08;
    if (hasAny(tags, ["queue", "courtesy"])) queuePatience += 0.04;
    if (hasAny(tags, ["accessible", "route", "directional"])) movementSpeed += 0.03;
    if (hasAny(tags, ["tray-return", "return"])) cleaningEfficiency += 0.08;
  }
  if (roles.has("wash-hands")) {
    cleanliness += 6;
    cleaningEfficiency += 0.08;
  }
  if (roles.has("collect-water")) {
    queuePatience += 0.03;
    eatingSpeed += 0.02;
  }
  if (roles.has("dispose-waste")) {
    cleanliness += 5;
    cleaningEfficiency += 0.08;
  }
  if (roles.has("return-tray")) {
    cleanliness += 6;
    cleaningEfficiency += 0.12;
  }
  if (item.queuePoints.length > 0 || roles.has("queue")) queuePatience += 0.025;
  if (item.category === "facility" && roles.has("use")) {
    cleanliness += 1;
    queuePatience += 0.01;
  }
  if (item.category === "facility" && hasAny(tags, ["safety", "first-aid"])) {
    queuePatience += 0.02;
  }
  if (item.category === "facility" && hasAny(tags, ["power", "temporary-equipment"])) {
    cleaningEfficiency += 0.04;
  }

  const categoryRadius: Partial<Record<PlaceableDefinition["category"], number>> = {
    signage: 8,
    facility: 6,
    fan: 6,
    lighting: 6,
    "tray-waste": 5,
    "stall-fixture": 4,
    plant: 4,
    decor: 4,
    divider: 3,
    table: 3,
    seat: 2,
  };

  return {
    radius: Math.max(1, item.lightRadius, categoryRadius[item.category] ?? 3),
    ambience: item.ambienceValue,
    cleanliness,
    queuePatience,
    eatingSpeed,
    cleaningEfficiency,
    movementSpeed,
    wayfinding,
  };
}

export function hasMeaningfulUtility(item: PlaceableDefinition): boolean {
  const utility = utilityEffectsForPlaceable(item);
  return Object.entries(utility).some(
    ([key, value]) => key !== "radius" && Math.abs(value) > Number.EPSILON,
  );
}
