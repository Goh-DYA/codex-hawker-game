import assert from "node:assert/strict";
import { describe, it } from "vitest";

import { CUSTOMER_ARCHETYPES, DISHES, PLACEABLES } from "../src/content/index";
import type { CustomerStatus } from "../src/game/core/index";
import {
  animationPoseForCustomer,
  visualRecipeForCustomer,
  visualRecipeForDish,
  visualRecipeForPlaceable,
} from "../src/game/runtime/visualRecipes";

describe("code-native placeable visual recipes", () => {
  it("assigns every launch placeable a stable, unique visual contract", () => {
    const recipes = PLACEABLES.map((item) =>
      visualRecipeForPlaceable(item.id, item.category),
    );

    assert.equal(recipes.length, 80);
    assert.equal(new Set(recipes.map((recipe) => recipe.contractKey)).size, 80);
    assert.equal(new Set(recipes.map((recipe) => recipe.motif)).size, 80);
    assert.ok(recipes.every((recipe) => recipe.motif.length >= 4));
    assert.deepEqual(
      recipes,
      PLACEABLES.map((item) => visualRecipeForPlaceable(item.id, item.category)),
    );
  });

  it("consumes all food, container, portion, and steam metadata", () => {
    const recipes = DISHES.map(visualRecipeForDish);

    assert.equal(recipes.length, 30);
    assert.equal(new Set(recipes.map((recipe) => recipe.contractKey)).size, 30);
    for (const [index, recipe] of recipes.entries()) {
      assert.match(recipe.foodFrame, /.+:.+/);
      assert.match(recipe.containerFrame, /.+:.+/);
      assert.equal(recipe.steam, DISHES[index]?.steamEffect);
      assert.ok(recipe.portionColour > 0);
    }
  });

  it("maps all archetypes and customer states to readable visual contracts", () => {
    const archetypes = CUSTOMER_ARCHETYPES.map(visualRecipeForCustomer);
    assert.equal(archetypes.length, 8);
    assert.equal(new Set(archetypes.map((recipe) => recipe.contractKey)).size, 8);

    const states: CustomerStatus[] = [
      "choosing-stall",
      "walking-to-queue",
      "queued",
      "ordering",
      "waiting-for-food",
      "seeking-seat",
      "walking-to-seat",
      "eating",
      "seeking-tray-return",
      "walking-to-tray-return",
      "walking-to-exit",
    ];
    const poses = states.map((status) => animationPoseForCustomer(status, 7, 19, false));
    assert.equal(new Set(poses.map((pose) => pose.signature)).size, states.length);
    assert.ok(poses.some((pose) => Math.abs(pose.stride) > 0));

    const walkingEarly = animationPoseForCustomer("walking-to-seat", 7, 19, false);
    const walkingLate = animationPoseForCustomer("walking-to-seat", 8, 19, false);
    assert.notEqual(walkingEarly.stride, walkingLate.stride);
    assert.notEqual(walkingEarly.bob, walkingLate.bob);

    for (const status of states) {
      const still = animationPoseForCustomer(status, 7, 19, true);
      assert.equal(still.bob, 0);
      assert.equal(still.stride, 0);
      assert.equal(still.armSwing, 0);
    }
  });
});
