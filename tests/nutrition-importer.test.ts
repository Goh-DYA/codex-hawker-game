import assert from "node:assert/strict";
import { describe, it } from "vitest";

import {
  addHealthRatings,
  buildNutritionContent,
  canonicalRowHash,
  computeRelativeFits,
  extractPreservedGuidelines,
  findQuarantineReasons,
  findUniqueFoodRow,
  NUTRIENT_COLUMNS,
  nutritionValueForComparison,
  parseCsv,
  parseNutritionValue,
  parseServing,
  verifySourceHash,
} from "../tools/nutrition/importer.mjs";
import {
  PRIMARY_PROFILE_MAPPINGS,
  VARIANT_FAMILY_MAPPINGS,
} from "../tools/nutrition/manifest.mjs";

const unavailable = {
  status: "unavailable" as const,
  reason: "not-reported" as const,
};

const nutrientFixture = (overrides: Record<string, unknown> = {}) => ({
  energyKcal: unavailable,
  proteinG: unavailable,
  totalFatG: unavailable,
  saturatedFatG: unavailable,
  transFatG: unavailable,
  carbohydrateG: unavailable,
  totalSugarG: unavailable,
  dietaryFibreG: unavailable,
  sodiumMg: unavailable,
  calciumMg: unavailable,
  ironMg: unavailable,
  waterG: unavailable,
  ...overrides,
});

describe("nutrition CSV importer", () => {
  it("generates the complete artifact deterministically from identical source text", () => {
    const csvCell = (value: string) => `"${value.replaceAll('"', '""')}"`;
    const foodNames = [
      ...PRIMARY_PROFILE_MAPPINGS.flatMap((mapping) =>
        "foodName" in mapping && typeof mapping.foodName === "string"
          ? [mapping.foodName]
          : [],
      ),
      ...VARIANT_FAMILY_MAPPINGS.flatMap((family) =>
        family.variants.map((variant) => variant.foodName),
      ),
    ].filter((foodName, index, values) => values.indexOf(foodName) === index);
    const foodHeaders = [
      "Food Name",
      "Default Serving Size",
      "Source of Data",
      "Per Serving Size",
      ...Object.values(NUTRIENT_COLUMNS),
    ];
    const nutrientValues = [
      "400",
      "10",
      "10",
      "3",
      "0",
      "50",
      "5",
      "3",
      "500",
      "50",
      "2",
      "100",
    ];
    const foodText = [
      foodHeaders.map(csvCell).join(","),
      ...foodNames.map((foodName) => [
        foodName,
        "1 serving",
        "Synthetic deterministic test",
        "Per Serving (300g)",
        ...nutrientValues,
      ].map(csvCell).join(",")),
    ].join("\n");
    const guidelineHeaders = [
      "Nutrient",
      "Recommended Daily Range (Lower Limit)",
      "Recommended Daily Range (Upper Limit)",
      "Remarks (if any)",
      "Source",
    ];
    const guidelineNames = [
      "kcal (Energy)",
      "Fats",
      "Saturated Fat",
      "Trans Fat",
      "Protein",
      "Carbohydrates",
      "Sugar",
      "Fiber",
      "Cholesterol",
      "Sodium",
      "Water",
    ];
    const guidelineText = [
      guidelineHeaders.map(csvCell).join(","),
      ...guidelineNames.map((nutrient) => [
        nutrient,
        "General lower reference",
        "General upper reference",
        "Context only",
        "Synthetic deterministic test",
      ].map(csvCell).join(",")),
    ].join("\n");

    const first = buildNutritionContent({
      foodText,
      guidelineText,
      expectedFoodSha256: undefined,
      expectedGuidelineSha256: undefined,
    });
    const second = buildNutritionContent({
      foodText,
      guidelineText,
      expectedFoodSha256: undefined,
      expectedGuidelineSha256: undefined,
    });
    assert.deepEqual(second, first);
    assert.equal(JSON.stringify(second), JSON.stringify(first));
    assert.equal(first.schemaVersion, 2);
    assert.equal(first.profiles.length, 104);
    assert.equal(first.variantFamilies.length, 14);

    const foodOnlyRefresh = buildNutritionContent({
      foodText,
      preservedGuidelines: extractPreservedGuidelines(first),
      expectedFoodSha256: undefined,
      expectedGuidelineSha256: undefined,
    });
    assert.deepEqual(foodOnlyRefresh, first);
  });

  it("parses a BOM, quoted commas, embedded newlines, and malformed source booleans losslessly", () => {
    const parsed = parseCsv(
      '\uFEFFFood Name,Hawker Food,Description\r\n"Dish, Special","True\u200B","Line one\nline two"\r\n',
    );

    assert.deepEqual(parsed.headers, ["Food Name", "Hawker Food", "Description"]);
    assert.equal(parsed.rows.length, 1);
    assert.equal(parsed.rows[0].values["Food Name"], "Dish, Special");
    assert.equal(parsed.rows[0].values["Hawker Food"], "True\u200B");
    assert.equal(parsed.rows[0].values.Description, "Line one\nline two");
    assert.equal(parsed.rows[0].sourceRowNumber, 2);
  });

  it("keeps trace and unavailable values distinct from numeric zero", () => {
    assert.deepEqual(parseNutritionValue("0"), { status: "known", value: 0 });
    assert.deepEqual(parseNutritionValue("Trace"), { status: "trace" });
    assert.deepEqual(parseNutritionValue("-"), {
      status: "unavailable",
      reason: "not-reported",
    });
    assert.deepEqual(parseNutritionValue("not measured"), {
      status: "unavailable",
      reason: "invalid-source",
    });
    assert.deepEqual(parseNutritionValue("1.25", 3), {
      status: "known",
      value: 3.75,
    });
  });

  it("accepts standard numeric grouping and rejects malformed comma grouping", () => {
    assert.deepEqual(parseNutritionValue("1234.5"), {
      status: "known",
      value: 1234.5,
    });
    assert.deepEqual(parseNutritionValue("1,234.5"), {
      status: "known",
      value: 1234.5,
    });
    for (const malformed of ["1,2,3", "12,34", "1,234,56", "123,"]) {
      assert.deepEqual(parseNutritionValue(malformed), {
        status: "unavailable",
        reason: "invalid-source",
      });
    }
  });

  it("parses and scales listed serving bases", () => {
    assert.deepEqual(parseServing("Per Serving (56g)", 3, "3 pieces (168 g)"), {
      amount: 168,
      unit: "g",
      label: "3 pieces (168 g)",
    });
    assert.deepEqual(parseServing("Per Serving (250ml)"), {
      amount: 250,
      unit: "ml",
      label: "250 ml",
    });
    assert.equal(parseServing("Per 100 g"), undefined);
  });

  it("uses exact case-sensitive food names and rejects duplicates", () => {
    const parsed = parseCsv("Food Name,Value\nKopi,1\nkopi,2\n");
    assert.equal(findUniqueFoodRow(parsed, "Kopi").values.Value, "1");
    assert.throws(() => findUniqueFoodRow(parsed, "KOPI"), /found 0/);

    const duplicated = parseCsv("Food Name,Value\nKopi,1\nKopi,2\n");
    assert.throws(() => findUniqueFoodRow(duplicated, "Kopi"), /found 2/);
  });

  it("quarantines internally inconsistent or implausible rows", () => {
    const reasons = findQuarantineReasons(
      { amount: 100, unit: "g", label: "100 g" },
      nutrientFixture({
        energyKcal: { status: "known", value: 5_001 },
        proteinG: { status: "known", value: 80 },
        totalFatG: { status: "known", value: 10 },
        saturatedFatG: { status: "known", value: 12 },
        transFatG: { status: "known", value: 11 },
        carbohydrateG: { status: "known", value: 20 },
        totalSugarG: { status: "known", value: 22 },
        dietaryFibreG: { status: "known", value: 51 },
      }),
    );

    assert.ok(reasons.includes("Saturated fat exceeds total fat."));
    assert.ok(reasons.includes("Trans fat exceeds total fat."));
    assert.ok(reasons.includes("Total sugar exceeds carbohydrate."));
    assert.ok(reasons.includes("Dietary fibre exceeds carbohydrate."));
    assert.ok(reasons.includes("Macronutrient mass exceeds the listed serving mass."));
    assert.ok(reasons.includes("Energy exceeds the manual-review threshold."));
    assert.ok(reasons.includes("Dietary fibre exceeds the manual-review threshold."));

    const invalidReasons = findQuarantineReasons(
      undefined,
      nutrientFixture({
        energyKcal: { status: "known", value: Number.POSITIVE_INFINITY },
        proteinG: { status: "known", value: -1 },
      }),
    );
    assert.ok(invalidReasons.includes("Serving amount is missing or invalid."));
    assert.ok(invalidReasons.includes("energyKcal must be finite and non-negative."));
    assert.ok(invalidReasons.includes("proteinG must be finite and non-negative."));
    assert.deepEqual(parseNutritionValue("-1"), {
      status: "unavailable",
      reason: "invalid-source",
    });
  });

  it("computes average-rank percentiles for ties and handles a sole comparison", () => {
    const higher = computeRelativeFits(
      [
        { id: "a", value: 10 },
        { id: "b", value: 20 },
        { id: "c", value: 20 },
        { id: "d", value: 40 },
      ],
      "higher",
    );
    assert.equal(higher.get("a"), 0);
    assert.equal(higher.get("b"), 0.5);
    assert.equal(higher.get("c"), 0.5);
    assert.equal(higher.get("d"), 1);

    const lower = computeRelativeFits([{ id: "only", value: 5 }], "lower");
    assert.equal(lower.get("only"), 1);
  });

  it("ranks trace amounts as zero without changing their source state", () => {
    const trace = { status: "trace" as const };
    const known = { status: "known" as const, value: 1 };
    const unavailableValue = { status: "unavailable" as const, reason: "not-reported" };
    const comparisons = [
      { id: "trace", value: nutritionValueForComparison(trace) },
      { id: "known", value: nutritionValueForComparison(known) },
    ];

    assert.equal(nutritionValueForComparison(trace), 0);
    assert.equal(nutritionValueForComparison(unavailableValue), undefined);
    assert.equal(computeRelativeFits(comparisons, "lower").get("trace"), 1);
    assert.equal(computeRelativeFits(comparisons, "higher").get("trace"), 0);
    assert.deepEqual(trace, { status: "trace" });
  });

  it("computes bounded ratings in the authored beneficial and moderation directions", () => {
    const conditionRatings = {
      "high-cholesterol": 3,
      obesity: 3,
      diabetes: 3,
      hypertension: 3,
    };
    const profiles = [
      {
        id: "lower-risk",
        status: "released",
        nutritionClass: "meal",
        nutrients: nutrientFixture({
          energyKcal: { status: "known", value: 200 },
          proteinG: { status: "known", value: 30 },
          totalFatG: { status: "known", value: 5 },
          saturatedFatG: { status: "known", value: 1 },
          transFatG: { status: "known", value: 0 },
          carbohydrateG: { status: "known", value: 20 },
          totalSugarG: { status: "known", value: 2 },
          dietaryFibreG: { status: "known", value: 10 },
          sodiumMg: { status: "known", value: 200 },
          calciumMg: { status: "known", value: 200 },
          ironMg: { status: "known", value: 5 },
        }),
        healthRating: 3,
        conditionRatings: { ...conditionRatings },
      },
      {
        id: "higher-risk",
        status: "released",
        nutritionClass: "meal",
        nutrients: nutrientFixture({
          energyKcal: { status: "known", value: 900 },
          proteinG: { status: "known", value: 5 },
          totalFatG: { status: "known", value: 50 },
          saturatedFatG: { status: "known", value: 20 },
          transFatG: { status: "known", value: 5 },
          carbohydrateG: { status: "known", value: 100 },
          totalSugarG: { status: "known", value: 40 },
          dietaryFibreG: { status: "known", value: 1 },
          sodiumMg: { status: "known", value: 2_000 },
          calciumMg: { status: "known", value: 20 },
          ironMg: { status: "known", value: 1 },
        }),
        healthRating: 3,
        conditionRatings: { ...conditionRatings },
      },
    ];

    addHealthRatings(profiles);

    assert.equal(profiles[0].healthRating, 5);
    assert.equal(profiles[1].healthRating, 1);
    for (const condition of Object.keys(conditionRatings) as Array<
      keyof typeof conditionRatings
    >) {
      assert.equal(profiles[0].conditionRatings[condition], 5);
      assert.equal(profiles[1].conditionRatings[condition], 1);
    }
  });

  it("rejects drift between preserved guideline metadata and rows", () => {
    const guidelines = Array.from({ length: 11 }, (_, index) => ({
      id: `guideline-${index}`,
      nutrient: `Nutrient ${index}`,
      lowerLimit: "lower",
      upperLimit: "upper",
      remarks: "Context only",
      source: "Fixture",
      comparison: "context-only",
    }));
    const preserved = {
      sourceSnapshots: [
        {
          id: "guidelines-aaaaaaaaaaaa",
          fileName: "daily_nutrition_sgadults.csv",
          sha256: "a".repeat(64),
          rowCount: 10,
        },
      ],
      guidelines,
    };

    assert.throws(
      () => extractPreservedGuidelines(preserved),
      /snapshot metadata is invalid/,
    );
  });

  it("hashes canonical source rows deterministically and gates source drift", () => {
    const headers = ["Food Name", "Energy"];
    const row = { "Food Name": "Kopi", Energy: "193" };
    const first = canonicalRowHash(headers, row);
    const second = canonicalRowHash(headers, { ...row });
    assert.equal(first, second);
    assert.match(first, /^[a-f0-9]{64}$/);

    assert.throws(
      () => verifySourceHash("Food source", "new", "expected", false),
      /Review the source diff/,
    );
    assert.doesNotThrow(() =>
      verifySourceHash("Food source", "new", "expected", true),
    );
  });
});
