import assert from "node:assert/strict";
import { describe, it } from "vitest";

import { PLACEABLES } from "../src/content";
import {
  adjustedEatingDurationMs,
  getGlobalWayfinding,
  getUtilityInfluence,
  mealConsumptionFraction,
  utilitySatisfactionBonus,
  type PlaceableDefinition,
  type PlacedObject,
  type SimulationCatalog,
} from "../src/game/core";
import {
  hasMeaningfulUtility,
  utilityEffectsForPlaceable,
} from "../src/game/runtime/contentUtility";

function utilityFixture(itemId: string): {
  readonly catalog: SimulationCatalog;
  readonly objects: Readonly<Record<string, PlacedObject>>;
} {
  const item = PLACEABLES.find((candidate) => candidate.id === itemId);
  assert.ok(item);
  const definition: PlaceableDefinition = {
    id: item.id,
    kind: item.category === "signage" ? "decoration" : "facility",
    footprint: item.footprint,
    allowedRotations: item.rotations,
    blocksMovement: item.walkability === "blocked",
    price: item.price,
    utility: utilityEffectsForPlaceable(item),
  };
  return {
    catalog: {
      placeables: { [definition.id]: definition },
      dishes: {},
      archetypes: {},
    },
    objects: {
      utility: {
        id: "utility",
        definitionId: definition.id,
        origin: { x: 4, y: 4 },
        rotation: 0,
        open: false,
      },
    },
  };
}

describe("placeable gameplay utility", () => {
  it("gives every sign and facility a discoverable, non-zero simulation effect", () => {
    const managed = PLACEABLES.filter(
      (item) => item.category === "signage" || item.category === "facility",
    );
    assert.equal(managed.length, 14);
    assert.ok(managed.every(hasMeaningfulUtility));
    assert.ok(
      managed
        .filter((item) => item.category === "signage")
        .every((item) => utilityEffectsForPlaceable(item).wayfinding > 0),
    );
  });

  it("resolves spatial falloff and a centre-wide wayfinding effect", () => {
    const fixture = utilityFixture("item.menu-preview-board");
    const near = getUtilityInfluence(fixture.objects, fixture.catalog, { x: 4, y: 4 });
    const mid = getUtilityInfluence(fixture.objects, fixture.catalog, { x: 8, y: 4 });
    const far = getUtilityInfluence(fixture.objects, fixture.catalog, { x: 30, y: 30 });

    assert.ok(near.wayfinding > mid.wayfinding);
    assert.ok(mid.wayfinding > far.wayfinding);
    assert.equal(far.sources, 0);
    assert.ok(getGlobalWayfinding(fixture.objects, fixture.catalog) > 0);
  });

  it("turns cleanliness and ambience support into bounded satisfaction", () => {
    const fixture = utilityFixture("item.public-handwash-sink");
    const influence = getUtilityInfluence(fixture.objects, fixture.catalog, { x: 4, y: 4 });
    assert.ok(influence.cleanliness > 0);
    assert.ok(influence.cleaningEfficiency > 0);
    assert.ok(utilitySatisfactionBonus(influence) > 0);
    assert.ok(utilitySatisfactionBonus({ ...influence, ambience: 10_000 }) <= 0.65);
  });

  it("keeps rendered meal depletion aligned with utility-adjusted eating time", () => {
    const adjusted = adjustedEatingDurationMs(1_000, 0.5);
    assert.ok(adjusted < 1_000);
    assert.ok(mealConsumptionFraction(adjusted * 0.9, 1_000, 0.5) >= 0.89);
    assert.equal(mealConsumptionFraction(adjusted, 1_000, 0.5), 0.94);
  });
});
