import assert from "node:assert/strict";
import { describe, it } from "vitest";

import { CUSTOMER_ARCHETYPES, DISHES, PLACEABLES, STALLS } from "../src/content/index";
import type { CustomerStatus } from "../src/game/core/index";
import {
  CUSTOMER_INDICATOR_LEGEND,
  animationPoseForCustomer,
  customerAppearanceForId,
  type CustomerIndicator,
  vendorAnimationPoseForStall,
  visualRecipeForCustomer,
  visualRecipeForDish,
  visualRecipeForPlaceable,
  visualRecipeForStallVendor,
} from "../src/game/runtime/visualRecipes";

describe("code-native placeable visual recipes", () => {
  it("assigns every launch placeable a stable, materially distinct semantic contract", () => {
    const recipes = PLACEABLES.map((item) =>
      visualRecipeForPlaceable(item.id, item.category, item.tags),
    );

    assert.equal(recipes.length, 80);
    assert.equal(new Set(recipes.map((recipe) => recipe.contractKey)).size, 80);
    assert.equal(new Set(recipes.map((recipe) => recipe.semanticKey)).size, 80);
    assert.equal(new Set(recipes.map((recipe) => recipe.motif)).size, 80);
    assert.ok(recipes.every((recipe) => recipe.motif.length >= 4));
    assert.ok(recipes.every((recipe) => recipe.form.length >= 4));
    assert.ok(recipes.every((recipe) => recipe.material !== "composite"));
    assert.ok(recipes.every((recipe) => recipe.detailCues.length >= 2));
    assert.deepEqual(
      recipes,
      PLACEABLES.map((item) => visualRecipeForPlaceable(item.id, item.category, item.tags)),
    );
  });

  it("gives every dish a unique, recognisable real-life serving profile", () => {
    const recipes = DISHES.map(visualRecipeForDish);

    assert.equal(recipes.length, 46);
    assert.equal(new Set(recipes.map((recipe) => recipe.contractKey)).size, DISHES.length);
    assert.equal(
      new Set(recipes.map((recipe) => recipe.presentation.semanticKey)).size,
      DISHES.length,
    );
    assert.equal(
      new Set(recipes.map((recipe) => recipe.presentation.motif)).size,
      DISHES.length,
    );
    for (const [index, recipe] of recipes.entries()) {
      assert.match(recipe.foodFrame, /.+:.+/);
      assert.match(recipe.containerFrame, /.+:.+/);
      assert.equal(recipe.steam, DISHES[index]?.steamEffect);
      assert.ok(recipe.portionColour > 0);
      assert.equal(recipe.presentation.source, "catalogue");
      assert.ok(recipe.presentation.ingredientCues.length >= 2);
      assert.ok(recipe.presentation.detailCues.length >= 1);
      assert.doesNotMatch(recipe.presentation.motif, /generic|catalogue/);
    }
  });

  it("distinguishes visually similar menu families with real ingredient and serviceware cues", () => {
    const recipes = new Map(
      DISHES.map((dish) => [dish.id, visualRecipeForDish(dish)]),
    );

    assert.deepEqual(
      recipes.get("dish.poached-chicken-rice")?.presentation.ingredientCues,
      ["fragrant-rice", "poached-chicken", "cucumber"],
    );
    assert.deepEqual(
      recipes.get("dish.roast-chicken-rice")?.presentation.ingredientCues,
      ["fragrant-rice", "roast-chicken", "cucumber"],
    );
    assert.equal(
      recipes.get("dish.kopi")?.presentation.vessel,
      "kopitiam-cup-and-saucer",
    );
    assert.equal(
      recipes.get("dish.sugarcane-juice")?.presentation.vessel,
      "tall-drinking-glass",
    );
    assert.equal(
      recipes.get("dish.ice-kacang")?.presentation.portionShape,
      "shaved-ice",
    );
    assert.ok(
      recipes.get("dish.black-pepper-crab")?.presentation.ingredientCues.includes("whole-crab"),
    );
    assert.ok(
      recipes.get("dish.har-gow")?.presentation.detailCues.includes("bamboo-steamer"),
    );
    assert.equal(
      recipes.get("dish.har-gow")?.presentation.vessel,
      "bamboo-steamer",
    );
    assert.ok(
      recipes.get("dish.siew-mai")?.presentation.detailCues.includes("diced-carrot"),
    );
    assert.equal(
      recipes.get("dish.siew-mai")?.presentation.vessel,
      "bamboo-steamer",
    );
    assert.equal(
      recipes.get("dish.sambal-grilled-squid")?.presentation.vessel,
      "banana-leaf-lined-plate",
    );
    assert.equal(
      recipes.get("dish.chicken-satay-set")?.presentation.vessel,
      "shared-oval-platter",
    );
    assert.equal(
      recipes.get("dish.teh-tarik")?.presentation.vessel,
      "tall-drinking-glass",
    );
    assert.ok(
      recipes.get("dish.chicken-satay-set")?.presentation.detailCues.includes("bamboo-skewers"),
    );
    assert.ok(
      recipes.get("dish.pulut-hitam")?.presentation.detailCues.includes("white-coconut-swirl"),
    );
  });

  it("infers a useful deterministic profile for future catalogue dishes", () => {
    const source = DISHES[0];
    assert.ok(source);
    const futureDish = {
      ...source,
      id: "dish.future-spicy-noodle-bowl",
      category: "noodles" as const,
      preferenceTags: ["noodles", "spicy", "vegetable-forward"],
      dietaryTags: ["spicy" as const],
      foodSprite: { atlas: "food", frame: "future-spicy-noodle-bowl" },
      containerSprite: { atlas: "serviceware", frame: "bowl" },
    };

    const first = visualRecipeForDish(futureDish);
    const second = visualRecipeForDish(futureDish);
    assert.deepEqual(first, second);
    assert.equal(first.presentation.source, "inferred");
    assert.equal(first.presentation.portionShape, "noodle-tangle");
    assert.equal(first.presentation.vessel, "deep-ceramic-bowl");
    assert.ok(first.presentation.ingredientCues.includes("noodles"));
    assert.deepEqual(first.presentation.detailCues, ["chilli-garnish"]);
  });

  it("maps all archetypes and customer states to readable visual contracts", () => {
    const archetypes = CUSTOMER_ARCHETYPES.map(visualRecipeForCustomer);
    assert.equal(archetypes.length, 12);
    assert.equal(
      new Set(archetypes.map((recipe) => recipe.renderSignature)).size,
      archetypes.length,
    );

    const appearances = Array.from({ length: 24 }, (_, index) =>
      customerAppearanceForId(`customer-${index + 1}`),
    );
    assert.deepEqual(customerAppearanceForId("customer-7"), customerAppearanceForId("customer-7"));
    assert.ok(new Set(appearances.map((appearance) => appearance.skin)).size > 1);
    assert.ok(new Set(appearances.map((appearance) => appearance.clothing)).size > 1);

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

  it("gives every stall vendor a deterministic and materially distinct work profile", () => {
    const recipes = STALLS.map(visualRecipeForStallVendor);

    assert.equal(recipes.length, 12);
    assert.deepEqual(recipes, STALLS.map(visualRecipeForStallVendor));
    assert.equal(new Set(recipes.map((recipe) => recipe.contractKey)).size, STALLS.length);
    assert.equal(new Set(recipes.map((recipe) => recipe.renderSignature)).size, STALLS.length);
    assert.equal(new Set(recipes.map((recipe) => recipe.tool)).size, STALLS.length);
    assert.equal(new Set(recipes.map((recipe) => recipe.workAction)).size, STALLS.length);
    assert.equal(new Set(recipes.map((recipe) => recipe.emblem)).size, STALLS.length);
    assert.ok(new Set(recipes.map((recipe) => recipe.skin)).size >= 5);
    assert.ok(new Set(recipes.map((recipe) => recipe.hair)).size >= 4);
    assert.ok(new Set(recipes.map((recipe) => recipe.shirt)).size >= 6);
    assert.ok(new Set(recipes.map((recipe) => recipe.apron)).size >= 10);
    for (const recipe of recipes) {
      assert.ok(recipe.skin > 0);
      assert.ok(recipe.hair > 0);
      assert.ok(recipe.shirt > 0);
      assert.ok(recipe.apron > 0);
      assert.ok(recipe.apronTrim > 0);
      assert.ok(recipe.hairStyle.length >= 4);
      assert.ok(recipe.apronStyle.length >= 3);
      assert.ok(recipe.headwear.length >= 5);
      assert.ok(recipe.tool.length >= 5);
      assert.ok(recipe.workAction.length >= 4);
      assert.ok(recipe.emblem.length >= 5);
      assert.match(recipe.contractKey, new RegExp(`^${recipe.stallId.replace(".", "\\.")}:`));
    }

    const source = STALLS[0];
    assert.ok(source);
    const futureStall = {
      ...source,
      id: "stall.future-steamer",
      animationReferences: [
        "stall.common.idle",
        "stall.steamer-lid.prepare",
        "stall.basket-stack.serve",
      ],
    };
    const futureRecipe = visualRecipeForStallVendor(futureStall);
    assert.deepEqual(futureRecipe, visualRecipeForStallVendor(futureStall));
    assert.equal(futureRecipe.tool, "steamer-cloth");
    assert.equal(futureRecipe.workAction, "lift-steamer");
  });

  it("animates stall vendors deterministically across idle, ordering, and preparation", () => {
    const stall = STALLS.find((candidate) => candidate.id === "stall.cinder-wok");
    assert.ok(stall);
    const recipe = visualRecipeForStallVendor(stall);

    for (const activity of ["idle", "order", "prepare"] as const) {
      const early = vendorAnimationPoseForStall(recipe, 7, false, activity);
      const repeated = vendorAnimationPoseForStall(recipe, 7, false, activity);
      const late = vendorAnimationPoseForStall(recipe, 11, false, activity);
      assert.deepEqual(early, repeated);
      assert.notDeepEqual(early, late);
      assert.ok(
        [
          early.bob,
          early.lean,
          early.headTurn,
          early.workingArm,
          early.supportArm,
          early.toolAngle,
          early.toolLift,
          early.reach,
        ].some((offset) => Math.abs(offset) > 0),
      );
    }
  });

  it("freezes every stall vendor offset when reduced motion is enabled", () => {
    const stall = STALLS.find((candidate) => candidate.id === "stall.bamboo-basket");
    assert.ok(stall);
    const recipe = visualRecipeForStallVendor(stall);

    for (const activity of ["idle", "order", "prepare"] as const) {
      const early = vendorAnimationPoseForStall(recipe, 1, true, activity);
      const late = vendorAnimationPoseForStall(recipe, 10_000, true, activity);
      assert.deepEqual(early, late);
      assert.deepEqual(
        {
          bob: early.bob,
          lean: early.lean,
          headTurn: early.headTurn,
          workingArm: early.workingArm,
          supportArm: early.supportArm,
          toolAngle: early.toolAngle,
          toolLift: early.toolLift,
          reach: early.reach,
        },
        {
          bob: 0,
          lean: 0,
          headTurn: 0,
          workingArm: 0,
          supportArm: 0,
          toolAngle: 0,
          toolLift: 0,
          reach: 0,
        },
      );
    }
  });

  it("keeps the customer status legend aligned with every runtime indicator", () => {
    const expectedIndicators: Readonly<Record<CustomerStatus, CustomerIndicator>> = {
      "choosing-stall": "question",
      "walking-to-queue": "footsteps",
      queued: "queue",
      ordering: "order",
      "waiting-for-food": "clock",
      "seeking-seat": "seat",
      "walking-to-seat": "footsteps",
      eating: "meal",
      "seeking-tray-return": "return",
      "walking-to-tray-return": "return",
      "walking-to-exit": "exit",
    };

    for (const [status, expectedIndicator] of Object.entries(expectedIndicators)) {
      const pose = animationPoseForCustomer(status as CustomerStatus, 7, 19, false);
      assert.equal(pose.indicator, expectedIndicator);
    }

    assert.deepEqual(
      CUSTOMER_INDICATOR_LEGEND.map((entry) => entry.indicator).sort(),
      [...new Set(Object.values(expectedIndicators))].sort(),
    );
    assert.equal(
      new Set(CUSTOMER_INDICATOR_LEGEND.map((entry) => entry.label)).size,
      CUSTOMER_INDICATOR_LEGEND.length,
    );
    assert.ok(CUSTOMER_INDICATOR_LEGEND.every((entry) => entry.description.length >= 24));
  });
});
