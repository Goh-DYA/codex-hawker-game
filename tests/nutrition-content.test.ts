import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { describe, it } from "vitest";

import {
  DISHES,
  LAUNCH_CONTENT,
  NUTRITION_CONTENT,
  getNutritionIntent,
  getNutritionProfile,
  getNutritionVariant,
  getNutritionVariantFamily,
  validateContent,
} from "../src/content/index";

const VARIANT_FAMILY_DISHES = [
  "dish.kopi",
  "dish.teh-tarik",
  "dish.nasi-lemak",
  "dish.fried-carrot-cake",
  "dish.roti-prata",
  "dish.sliced-fish-soup",
  "dish.bak-chor-mee",
  "dish.chicken-murtabak",
  "dish.nasi-briyani",
  "dish.masala-thosai",
  "dish.yong-tau-foo",
  "dish.ban-mian",
  "dish.bak-kut-teh",
  "dish.duck-rice",
];

const VARIANT_IDS: Readonly<Record<string, readonly string[]>> = {
  "dish.kopi": ["kopi-default", "kopi-siu-dai", "kopi-c", "kopi-c-kosong", "kopi-o", "kopi-o-kosong"],
  "dish.teh-tarik": ["teh-tarik", "teh", "teh-siu-dai", "teh-c", "teh-c-kosong", "teh-o", "teh-o-kosong"],
  "dish.nasi-lemak": ["nasi-lemak-chicken-wing", "nasi-lemak-chicken-cutlet", "nasi-lemak-wing-cutlet", "nasi-lemak-egg-ikan-bilis-peanut", "nasi-lemak-fish", "nasi-lemak-rice-only"],
  "dish.fried-carrot-cake": ["carrot-cake-white", "carrot-cake-black"],
  "dish.roti-prata": ["prata-two-plain-curry", "prata-plain", "prata-egg", "prata-egg-onion", "prata-egg-onion-cheese"],
  "dish.sliced-fish-soup": ["fish-soup-beehoon-no-milk", "fish-soup-beehoon-milk", "fish-soup-sliced-no-milk", "fish-soup-sliced-milk"],
  "dish.bak-chor-mee": ["bak-chor-mee-dry", "bak-chor-mee-soup"],
  "dish.chicken-murtabak": ["murtabak-chicken", "murtabak-chicken-mushroom-cheese", "murtabak-mutton", "murtabak-vegetable"],
  "dish.nasi-briyani": ["briyani-chicken", "briyani-fish-prawn", "briyani-mutton", "briyani-vegetable"],
  "dish.masala-thosai": ["thosai-masala", "thosai-plain", "thosai-egg", "thosai-ghee"],
  "dish.yong-tau-foo": ["ytf-clear-boiled", "ytf-clear-fried", "ytf-clear-mixed", "ytf-clear-noodles", "ytf-laksa-boiled", "ytf-laksa-fried", "ytf-laksa-mixed", "ytf-laksa-noodles"],
  "dish.ban-mian": ["ban-mian-soup", "ban-mian-dry", "chilli-ban-mian", "pork-dumpling-ban-mian", "seafood-tom-yum-ban-mian", "vegetable-ban-mian"],
  "dish.bak-kut-teh": ["bak-kut-teh-soup", "bak-kut-teh-dry", "bak-kut-teh-herbal"],
  "dish.duck-rice": ["duck-rice-braised", "duck-rice-roasted", "duck-rice-rice-only"],
};

describe("nutrition content", () => {
  it("keeps the reviewed generated snapshot byte-for-byte deterministic", async () => {
    const bytes = await readFile(
      new URL("../src/content/nutrition.generated.json", import.meta.url),
    );
    assert.equal(
      createHash("sha256").update(bytes).digest("hex"),
      "f733b693e44a7767074bd84d263e357fcfd2ac7212e30ad388afc4cc7c5e580c",
    );
  });

  it("mounts deterministic schema-v2 nutrition content", () => {
    const report = validateContent();

    assert.equal(LAUNCH_CONTENT.version, "1.3.0");
    assert.equal(LAUNCH_CONTENT.nutrition, NUTRITION_CONTENT);
    assert.equal(NUTRITION_CONTENT.schemaVersion, 2);
    assert.equal(report.counts.nutritionProfiles, 104);
    assert.equal(report.counts.nutritionVariantFamilies, 14);
    assert.equal(NUTRITION_CONTENT.dataVersion, "sg-1bc212db6eda-c87987b4281c");
    assert.deepEqual(
      NUTRITION_CONTENT.sourceSnapshots.map((snapshot) => snapshot.rowCount),
      [2_689, 11],
    );
    assert.deepEqual(
      NUTRITION_CONTENT.sourceSnapshots.map((snapshot) => snapshot.sha256),
      [
        "1bc212db6eda06c29a5f8a1ddfe8a0ca82b02a71ffc34c07ced45d8b2f9b273e",
        "c87987b4281c8557f75b61fefa96d95d13e9ff60c2c41e38fe4a428219064ab4",
      ],
    );
    assert.doesNotMatch(JSON.stringify(NUTRITION_CONTENT), /H:\\\\|My Drive/i);
  });

  it("gives all 54 dishes and every variant a released source profile", () => {
    const primary = NUTRITION_CONTENT.profiles.filter(
      (profile) => profile.id === profile.dishId,
    );
    assert.equal(primary.length, 54);
    assert.deepEqual(
      primary.map((profile) => profile.dishId).sort(),
      DISHES.map((dish) => dish.id).sort(),
    );
    assert.ok(primary.every((profile) => profile.status === "released"));
    assert.ok(
      NUTRITION_CONTENT.profiles.every(
        (profile) => profile.status === "released",
      ),
    );
  });

  it("ships fourteen approved variant families with deterministic mastery ranks", () => {
    assert.deepEqual(
      NUTRITION_CONTENT.variantFamilies.map((family) => family.dishId),
      VARIANT_FAMILY_DISHES,
    );

    for (const family of NUTRITION_CONTENT.variantFamilies) {
      assert.deepEqual(
        family.variants.map((variant) => variant.id),
        VARIANT_IDS[family.dishId],
      );
      assert.equal(family.variants[0].id, family.defaultVariantId);
      family.variants.forEach((variant, index) => {
        assert.equal(
          variant.unlockRank,
          index === 0 ? 1 : index === 1 ? 2 : index === 2 ? 4 : 7,
        );
        const profile = NUTRITION_CONTENT.profiles.find(
          (candidate) => candidate.id === variant.profileId,
        );
        assert.equal(profile?.dishId, family.dishId);
        assert.equal(profile?.variantId, variant.id);
      });
    }
    assert.equal(
      new Set(
        NUTRITION_CONTENT.variantFamilies.flatMap((family) =>
          family.variants.map((variant) => variant.visualKey),
        ),
      ).size,
      64,
    );
  });

  it("assigns bounded ratings and condition-sensitive variant trade-offs", () => {
    for (const dish of DISHES) {
      assert.ok(dish.starRating >= 1 && dish.starRating <= 5);
      assert.equal(dish.starRating * 10, Math.round(dish.starRating * 10));
    }
    for (const profile of NUTRITION_CONTENT.profiles) {
      assert.ok(profile.healthRating >= 1 && profile.healthRating <= 5);
      assert.deepEqual(Object.keys(profile.conditionRatings).sort(), [
        "diabetes",
        "high-cholesterol",
        "hypertension",
        "obesity",
      ]);
      for (const rating of Object.values(profile.conditionRatings)) {
        assert.ok(rating >= 1 && rating <= 5);
      }
    }

    const kopi = getNutritionProfile("dish.kopi");
    const kopiKosong = getNutritionProfile("dish.kopi", "kopi-o-kosong");
    assert.equal(kopi?.nutrients.totalSugarG.status, "known");
    assert.equal(kopiKosong?.nutrients.totalSugarG.status, "known");
    assert.ok(
      (kopiKosong?.nutrients.totalSugarG.value ?? Infinity) <
        (kopi?.nutrients.totalSugarG.value ?? -Infinity),
    );
    assert.ok(
      (kopiKosong?.conditionRatings.diabetes ?? 0) >
        (kopi?.conditionRatings.diabetes ?? 5),
    );
  });

  it("preserves trace, unavailable, scaled, and provenance semantics", () => {
    const chickenRice = getNutritionProfile("dish.poached-chicken-rice");
    assert.equal(chickenRice?.nutrients.totalSugarG.status, "trace");

    const sugarcane = getNutritionProfile("dish.sugarcane-juice");
    assert.deepEqual(sugarcane?.nutrients.dietaryFibreG, {
      status: "unavailable",
      reason: "not-reported",
    });

    const charSiewBao = getNutritionProfile("dish.char-siew-bao");
    assert.equal(charSiewBao?.serving?.amount, 168);
    assert.equal(charSiewBao?.serving?.label, "3 pieces (168 g)");
    assert.deepEqual(charSiewBao?.nutrients.energyKcal, {
      status: "known",
      value: 441,
    });
    assert.equal(charSiewBao?.provenance?.multiplier, 3);
    assert.equal(charSiewBao?.provenance?.mappingKind, "scaled-exact");

    for (const profile of NUTRITION_CONTENT.profiles.filter(
      (candidate) => candidate.status === "released",
    )) {
      assert.ok(profile.serving);
      assert.match(profile.provenance?.sourceRowSha256 ?? "", /^[a-f0-9]{64}$/);
      assert.doesNotMatch(profile.provenance?.sourceFile ?? "", /[\\/]/);
    }
  });

  it("precomputes only compatible relative intent fits", () => {
    const intentById = new Map(
      NUTRITION_CONTENT.intents.map((intent) => [intent.id, intent]),
    );
    for (const profile of NUTRITION_CONTENT.profiles) {
      for (const [intentId, fit] of Object.entries(profile.intentFits)) {
        const intent = intentById.get(intentId as never);
        assert.ok(intent);
        assert.equal(intent.nutritionClass, profile.nutritionClass);
        assert.ok(
          profile.nutrients[intent.metric].status === "known" ||
            profile.nutrients[intent.metric].status === "trace",
        );
        assert.ok(fit >= 0 && fit <= 1);
      }
      if (profile.status !== "released") assert.deepEqual(profile.intentFits, {});
    }

    assert.equal(getNutritionIntent("lower-total-sugar-drink")?.metric, "totalSugarG");
    assert.equal(
      getNutritionProfile("dish.kopi", "kopi-o-kosong")?.intentFits[
        "lower-total-sugar-drink"
      ],
      1,
    );
  });

  it("resolves default and selected variant profiles through public helpers", () => {
    const family = getNutritionVariantFamily("dish.fried-carrot-cake");
    assert.equal(family?.defaultVariantId, "carrot-cake-white");
    assert.equal(
      getNutritionVariant("dish.fried-carrot-cake")?.id,
      "carrot-cake-white",
    );
    assert.equal(
      getNutritionProfile("dish.fried-carrot-cake", "carrot-cake-black")
        ?.provenance?.sourceFoodName,
      "Fried carrot cake (black)",
    );
    assert.equal(
      getNutritionProfile("dish.fried-carrot-cake", "invalid-variant")?.id,
      "dish.fried-carrot-cake",
    );
    assert.equal(getNutritionVariantFamily("dish.mee-rebus"), undefined);
  });

  it("keeps adult guidelines contextual and excludes incompatible comparisons", () => {
    assert.equal(NUTRITION_CONTENT.guidelines.length, 11);
    for (const id of ["added-sugar", "cholesterol", "drinking-water"]) {
      const guideline = NUTRITION_CONTENT.guidelines.find(
        (candidate) => candidate.id === id,
      );
      assert.equal(guideline?.comparison, "not-comparable");
      assert.ok(guideline?.notComparableReason);
    }
    assert.match(NUTRITION_CONTENT.disclosure, /not medical or dietary advice/i);
    assert.match(NUTRITION_CONTENT.disclosure, /Total sugar is not the same as added sugar/);
  });
});
