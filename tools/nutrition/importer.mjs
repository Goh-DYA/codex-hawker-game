import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  EXPECTED_FOOD_FILE_SHA256,
  EXPECTED_GUIDELINE_FILE_SHA256,
  NUTRITION_DISCLOSURE,
  NUTRITION_INTENTS,
  PRIMARY_PROFILE_MAPPINGS,
  VARIANT_FAMILY_MAPPINGS,
} from "./manifest.mjs";

const TOOL_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_OUTPUT_PATH = path.resolve(
  TOOL_DIRECTORY,
  "../../src/content/nutrition.generated.json",
);

export const NUTRIENT_COLUMNS = {
  energyKcal: "Energy (kcal) - Per Serving",
  proteinG: "Protein (g) - Per Serving",
  totalFatG: "Total Fat (g) - Per Serving",
  saturatedFatG: "Saturated Fat (g) - Per Serving",
  transFatG: "Trans Fat (g) - Per Serving",
  carbohydrateG: "Carbohydrate (g) - Per Serving",
  totalSugarG: "Sugar (g) - Per Serving",
  dietaryFibreG: "Dietary Fibre (g) - Per Serving",
  sodiumMg: "Sodium (mg) - Per Serving",
  calciumMg: "Calcium (mg) - Per Serving",
  ironMg: "Iron (mg) - Per Serving",
  waterG: "Water (g) - Per Serving",
};

const GUIDELINE_IDS = {
  "kcal (Energy)": "energy",
  Fats: "fats",
  "Saturated Fat": "saturated-fat",
  "Trans Fat": "trans-fat",
  Protein: "protein",
  Carbohydrates: "carbohydrates",
  Sugar: "added-sugar",
  Fiber: "fibre",
  Cholesterol: "cholesterol",
  Sodium: "sodium",
  Water: "drinking-water",
};

const sha256 = (input) =>
  createHash("sha256").update(input).digest("hex");

const round = (value) => Math.round((value + Number.EPSILON) * 10_000) / 10_000;
const roundRating = (value) => Math.round((value + Number.EPSILON) * 10) / 10;

export const HEALTH_RATING_SCHEMES = {
  overall: [
    ["energyKcal", "lower", 0.16],
    ["proteinG", "higher", 0.12],
    ["totalFatG", "lower", 0.08],
    ["saturatedFatG", "lower", 0.1],
    ["transFatG", "lower", 0.08],
    ["totalSugarG", "lower", 0.12],
    ["dietaryFibreG", "higher", 0.14],
    ["sodiumMg", "lower", 0.12],
    ["calciumMg", "higher", 0.04],
    ["ironMg", "higher", 0.04],
  ],
  "high-cholesterol": [
    ["saturatedFatG", "lower", 0.35],
    ["transFatG", "lower", 0.2],
    ["totalFatG", "lower", 0.2],
    ["dietaryFibreG", "higher", 0.15],
    ["energyKcal", "lower", 0.1],
  ],
  obesity: [
    ["energyKcal", "lower", 0.35],
    ["totalFatG", "lower", 0.18],
    ["saturatedFatG", "lower", 0.07],
    ["totalSugarG", "lower", 0.15],
    ["dietaryFibreG", "higher", 0.15],
    ["proteinG", "higher", 0.1],
  ],
  diabetes: [
    ["carbohydrateG", "lower", 0.3],
    ["totalSugarG", "lower", 0.3],
    ["dietaryFibreG", "higher", 0.2],
    ["energyKcal", "lower", 0.12],
    ["proteinG", "higher", 0.08],
  ],
  hypertension: [
    ["sodiumMg", "lower", 0.65],
    ["energyKcal", "lower", 0.1],
    ["saturatedFatG", "lower", 0.1],
    ["dietaryFibreG", "higher", 0.1],
    ["proteinG", "higher", 0.05],
  ],
};

const NEUTRAL_CONDITION_RATINGS = {
  "high-cholesterol": 3,
  obesity: 3,
  diabetes: 3,
  hypertension: 3,
};

const UNGROUPED_NUMERIC_PATTERN = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/;
const GROUPED_NUMERIC_PATTERN = /^[+-]?\d{1,3}(?:,\d{3})+(?:\.\d*)?$/;

/**
 * Parses RFC 4180-style CSV, including quoted commas, escaped quotes, embedded
 * newlines, CRLF input, and an optional UTF-8 byte-order mark.
 */
export const parseCsv = (text) => {
  const input = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const records = [];
  let record = [];
  let cell = "";
  let quoted = false;

  const pushRecord = () => {
    record.push(cell);
    cell = "";
    if (record.some((value) => value.length > 0)) records.push(record);
    record = [];
  };

  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    if (quoted) {
      if (character === '"') {
        if (input[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        cell += character;
      }
      continue;
    }

    if (character === '"' && cell.length === 0) {
      quoted = true;
    } else if (character === ",") {
      record.push(cell);
      cell = "";
    } else if (character === "\n" || character === "\r") {
      if (character === "\r" && input[index + 1] === "\n") index += 1;
      pushRecord();
    } else {
      cell += character;
    }
  }

  if (quoted) throw new Error("CSV input ends inside a quoted field.");
  if (cell.length > 0 || record.length > 0) pushRecord();
  if (records.length === 0) throw new Error("CSV input has no records.");

  const headers = records[0].map((header) => header.trim());
  if (new Set(headers).size !== headers.length) {
    throw new Error("CSV input contains duplicate column headings.");
  }

  const rows = records.slice(1).map((values, index) => {
    if (values.length !== headers.length) {
      throw new Error(
        `CSV record ${index + 2} has ${values.length} fields; expected ${headers.length}.`,
      );
    }
    return {
      sourceRowNumber: index + 2,
      values: Object.fromEntries(
        headers.map((header, columnIndex) => [header, values[columnIndex]]),
      ),
    };
  });

  return { headers, rows };
};

export const canonicalRowHash = (headers, row) =>
  sha256(JSON.stringify(headers.map((header) => [header, row[header]])));

export const parseNutritionValue = (rawValue, multiplier = 1) => {
  const value = rawValue.trim();
  if (value === "" || value === "-") {
    return { status: "unavailable", reason: "not-reported" };
  }
  if (/^trace$/i.test(value)) return { status: "trace" };

  if (
    !UNGROUPED_NUMERIC_PATTERN.test(value) &&
    !GROUPED_NUMERIC_PATTERN.test(value)
  ) {
    return { status: "unavailable", reason: "invalid-source" };
  }

  const normalized = value.replaceAll(",", "");
  const numericValue = Number(normalized) * multiplier;
  if (!Number.isFinite(numericValue) || numericValue < 0) {
    return { status: "unavailable", reason: "invalid-source" };
  }
  return { status: "known", value: round(numericValue) };
};

export const parseServing = (rawValue, multiplier = 1, labelOverride) => {
  const match = rawValue
    .trim()
    .match(/^Per Serving\s*\(\s*(\d+(?:\.\d+)?)\s*(g|ml)\s*\)$/i);
  if (!match) return undefined;
  const amount = round(Number(match[1]) * multiplier);
  return {
    amount,
    unit: match[2].toLocaleLowerCase("en"),
    label: labelOverride ?? `${amount} ${match[2].toLocaleLowerCase("en")}`,
  };
};

const knownValue = (nutrients, metric) => {
  const value = nutrients[metric];
  return value.status === "known" ? value.value : undefined;
};

export const findQuarantineReasons = (serving, nutrients) => {
  const reasons = [];
  if (!serving || !Number.isFinite(serving.amount) || serving.amount <= 0) {
    reasons.push("Serving amount is missing or invalid.");
  }

  for (const [metric, value] of Object.entries(nutrients)) {
    if (value.status === "unavailable" && value.reason === "invalid-source") {
      reasons.push(`${metric} contains an invalid source value.`);
    }
    if (value.status === "known" && (!Number.isFinite(value.value) || value.value < 0)) {
      reasons.push(`${metric} must be finite and non-negative.`);
    }
  }

  const totalFat = knownValue(nutrients, "totalFatG");
  const saturatedFat = knownValue(nutrients, "saturatedFatG");
  const transFat = knownValue(nutrients, "transFatG");
  const carbohydrate = knownValue(nutrients, "carbohydrateG");
  const totalSugar = knownValue(nutrients, "totalSugarG");
  const dietaryFibre = knownValue(nutrients, "dietaryFibreG");
  const protein = knownValue(nutrients, "proteinG");
  const energy = knownValue(nutrients, "energyKcal");

  if (totalFat !== undefined && saturatedFat !== undefined && saturatedFat > totalFat + 0.1) {
    reasons.push("Saturated fat exceeds total fat.");
  }
  if (totalFat !== undefined && transFat !== undefined && transFat > totalFat + 0.1) {
    reasons.push("Trans fat exceeds total fat.");
  }
  if (carbohydrate !== undefined && totalSugar !== undefined && totalSugar > carbohydrate + 0.1) {
    reasons.push("Total sugar exceeds carbohydrate.");
  }
  if (carbohydrate !== undefined && dietaryFibre !== undefined && dietaryFibre > carbohydrate + 0.1) {
    reasons.push("Dietary fibre exceeds carbohydrate.");
  }

  if (
    serving &&
    protein !== undefined &&
    totalFat !== undefined &&
    carbohydrate !== undefined &&
    protein + totalFat + carbohydrate > serving.amount * 1.05
  ) {
    reasons.push("Macronutrient mass exceeds the listed serving mass.");
  }

  if (
    energy !== undefined &&
    protein !== undefined &&
    totalFat !== undefined &&
    carbohydrate !== undefined
  ) {
    const estimatedEnergy = protein * 4 + totalFat * 9 + carbohydrate * 4;
    if (estimatedEnergy > 0 && (energy < estimatedEnergy * 0.5 || energy > estimatedEnergy * 2)) {
      reasons.push("Energy falls outside the permitted macronutrient cross-check range.");
    }
  }

  if (energy !== undefined && energy > 5_000) {
    reasons.push("Energy exceeds the manual-review threshold.");
  }
  if (dietaryFibre !== undefined && dietaryFibre > 50) {
    reasons.push("Dietary fibre exceeds the manual-review threshold.");
  }

  return [...new Set(reasons)];
};

const unavailableNutrients = (reason) =>
  Object.fromEntries(
    Object.keys(NUTRIENT_COLUMNS).map((metric) => [
      metric,
      { status: "unavailable", reason },
    ]),
  );

export const findUniqueFoodRow = (parsedFood, foodName) => {
  const matches = parsedFood.rows.filter(
    ({ values }) => values["Food Name"] === foodName,
  );
  if (matches.length !== 1) {
    throw new Error(
      `Expected exactly one case-sensitive Food Name match for "${foodName}"; found ${matches.length}.`,
    );
  }
  return matches[0];
};

const buildReleasedProfile = ({
  mapping,
  profileId,
  variantId,
  parsedFood,
  foodSnapshot,
}) => {
  const source = findUniqueFoodRow(parsedFood, mapping.foodName);
  const multiplier = mapping.multiplier ?? 1;
  const nutrients = Object.fromEntries(
    Object.entries(NUTRIENT_COLUMNS).map(([metric, column]) => [
      metric,
      parseNutritionValue(source.values[column] ?? "", multiplier),
    ]),
  );
  const defaultServingLabel = source.values["Default Serving Size"]?.trim();
  const serving = parseServing(
    source.values["Per Serving Size"] ?? "",
    multiplier,
    mapping.servingLabel ??
      (multiplier === 1 && defaultServingLabel && defaultServingLabel !== "-"
        ? defaultServingLabel
        : undefined),
  );
  const quarantineReasons = findQuarantineReasons(serving, nutrients);
  const provenance = {
    snapshotId: foodSnapshot.id,
    sourceFile: foodSnapshot.fileName,
    sourceFileSha256: foodSnapshot.sha256,
    sourceRowNumber: source.sourceRowNumber,
    sourceFoodName: source.values["Food Name"],
    sourceRowSha256: canonicalRowHash(parsedFood.headers, source.values),
    sourceDataType: source.values["Source of Data"],
    mappingKind: mapping.mappingKind,
    multiplier,
    reviewNote: mapping.reviewNote,
  };

  return {
    id: profileId,
    dishId: mapping.dishId,
    ...(variantId === undefined ? {} : { variantId }),
    status: quarantineReasons.length > 0 ? "quarantined" : "released",
    nutritionClass: mapping.nutritionClass,
    ...(serving === undefined ? {} : { serving }),
    nutrients,
    healthRating: 3,
    conditionRatings: { ...NEUTRAL_CONDITION_RATINGS },
    intentFits: {},
    provenance,
    reviewNote: mapping.reviewNote,
    ...(quarantineReasons.length === 0 ? {} : { quarantineReasons }),
  };
};

const buildUnavailableProfile = (mapping) => ({
  id: mapping.dishId,
  dishId: mapping.dishId,
  status: "unavailable",
  nutritionClass: mapping.nutritionClass,
  nutrients: unavailableNutrients("unmapped"),
  healthRating: 3,
  conditionRatings: { ...NEUTRAL_CONDITION_RATINGS },
  intentFits: {},
  unavailableReason: "unmapped",
  reviewNote: mapping.reviewNote,
});

export const computeRelativeFits = (entries, direction) => {
  const fits = new Map();
  if (entries.length === 0) return fits;
  const sorted = [...entries].sort(
    (left, right) => left.value - right.value || left.id.localeCompare(right.id, "en"),
  );
  let index = 0;
  while (index < sorted.length) {
    const value = sorted[index].value;
    let end = index;
    while (end + 1 < sorted.length && sorted[end + 1].value === value) end += 1;
    const averageIndex = (index + end) / 2;
    const ascendingPercentile =
      sorted.length === 1 ? 1 : averageIndex / (sorted.length - 1);
    const fit =
      direction === "higher"
        ? ascendingPercentile
        : sorted.length === 1
          ? 1
          : 1 - ascendingPercentile;
    for (let candidateIndex = index; candidateIndex <= end; candidateIndex += 1) {
      fits.set(sorted[candidateIndex].id, round(fit));
    }
    index = end + 1;
  }
  return fits;
};

/**
 * Keeps the source-facing `trace` state intact while giving it the lowest
 * numeric amount for relative comparisons. Unavailable values stay excluded.
 */
export const nutritionValueForComparison = (nutrient) => {
  if (nutrient.status === "known") return nutrient.value;
  if (nutrient.status === "trace") return 0;
  return undefined;
};

const addIntentFits = (profiles) => {
  for (const intent of NUTRITION_INTENTS) {
    const candidates = profiles
      .filter(
        (profile) =>
          profile.status === "released" &&
          profile.nutritionClass === intent.nutritionClass,
      )
      .map((profile) => ({
        profile,
        value: nutritionValueForComparison(profile.nutrients[intent.metric]),
      }))
      .filter((candidate) => candidate.value !== undefined);
    if (candidates.length === 0) continue;

    const fits = computeRelativeFits(
      candidates.map((candidate) => ({
        id: candidate.profile.id,
        value: candidate.value,
      })),
      intent.direction,
    );
    for (const { profile } of candidates) {
      profile.intentFits[intent.id] = fits.get(profile.id);
    }
  }
};

export const addHealthRatings = (profiles) => {
  const profileFits = new Map();
  const directionsByMetric = new Map();
  for (const scheme of Object.values(HEALTH_RATING_SCHEMES)) {
    for (const [metric, direction] of scheme) {
      const previous = directionsByMetric.get(metric);
      if (previous && previous !== direction) {
        throw new Error(`Nutrition metric ${metric} has conflicting rating directions.`);
      }
      directionsByMetric.set(metric, direction);
    }
  }

  for (const nutritionClass of ["meal", "drink"]) {
    const classProfiles = profiles.filter(
      (profile) =>
        profile.status === "released" && profile.nutritionClass === nutritionClass,
    );
    for (const [metric, direction] of directionsByMetric) {
      const candidates = classProfiles
        .map((profile) => ({
          profile,
          value: nutritionValueForComparison(profile.nutrients[metric]),
        }))
        .filter((candidate) => candidate.value !== undefined);
      const fits = computeRelativeFits(
        candidates.map((candidate) => ({
          id: candidate.profile.id,
          value: candidate.value,
        })),
        direction,
      );
      for (const { profile } of candidates) {
        const existing = profileFits.get(profile.id) ?? {};
        existing[metric] = fits.get(profile.id);
        profileFits.set(profile.id, existing);
      }
    }
  }

  const rate = (profile, scheme) => {
    const fits = profileFits.get(profile.id) ?? {};
    let weightedFit = 0;
    let availableWeight = 0;
    for (const [metric, , weight] of scheme) {
      const fit = fits[metric];
      if (fit === undefined) continue;
      weightedFit += fit * weight;
      availableWeight += weight;
    }
    const normalizedFit = availableWeight === 0 ? 0.5 : weightedFit / availableWeight;
    return roundRating(1 + 4 * normalizedFit);
  };

  for (const profile of profiles) {
    if (profile.status !== "released") {
      profile.healthRating = 3;
      profile.conditionRatings = { ...NEUTRAL_CONDITION_RATINGS };
      continue;
    }
    profile.healthRating = rate(profile, HEALTH_RATING_SCHEMES.overall);
    profile.conditionRatings = Object.fromEntries(
      Object.entries(HEALTH_RATING_SCHEMES)
        .filter(([id]) => id !== "overall")
        .map(([id, scheme]) => [id, rate(profile, scheme)]),
    );
  }
};

const buildGuidelines = (parsedGuidelines) =>
  parsedGuidelines.rows.map(({ values }) => {
    const nutrient = values.Nutrient;
    const id = GUIDELINE_IDS[nutrient];
    if (!id) throw new Error(`Unknown guideline nutrient "${nutrient}".`);

    const notComparableReason =
      nutrient === "Sugar"
        ? "The food dataset reports total sugar, while this guideline refers to added sugar."
        : nutrient === "Cholesterol"
          ? "The food dataset does not report cholesterol."
          : nutrient === "Water"
            ? "Food water in grams is not comparable with drinking-water guidance in millilitres."
            : undefined;

    return {
      id,
      nutrient,
      lowerLimit: values["Recommended Daily Range (Lower Limit)"],
      upperLimit: values["Recommended Daily Range (Upper Limit)"],
      remarks: values["Remarks (if any)"],
      source: values.Source,
      comparison: notComparableReason === undefined ? "context-only" : "not-comparable",
      ...(notComparableReason === undefined ? {} : { notComparableReason }),
    };
  });

export const verifySourceHash = (label, actual, expected, acceptSourceUpdate) => {
  if (actual === expected) return;
  if (!acceptSourceUpdate) {
    throw new Error(
      `${label} SHA-256 changed from ${expected} to ${actual}. Review the source diff and rerun with --accept-source-update only after approval.`,
    );
  }
};

export const extractPreservedGuidelines = (content) => {
  if (!content || typeof content !== "object") {
    throw new Error("Preserved guideline content must be a generated nutrition object.");
  }
  const snapshots = Array.isArray(content.sourceSnapshots)
    ? content.sourceSnapshots
    : [];
  const snapshot = snapshots.find(
    (candidate) =>
      candidate &&
      typeof candidate === "object" &&
      typeof candidate.id === "string" &&
      candidate.id.startsWith("guidelines-"),
  );
  if (!Array.isArray(content.guidelines) || content.guidelines.length !== 11) {
    throw new Error("Preserved guideline content must contain exactly 11 rows.");
  }
  if (
    !snapshot ||
    typeof snapshot.fileName !== "string" ||
    /[\\/]/.test(snapshot.fileName) ||
    typeof snapshot.sha256 !== "string" ||
    !/^[a-f0-9]{64}$/.test(snapshot.sha256) ||
    snapshot.id !== `guidelines-${snapshot.sha256.slice(0, 12)}` ||
    !Number.isInteger(snapshot.rowCount) ||
    snapshot.rowCount !== content.guidelines.length
  ) {
    throw new Error("Preserved guideline snapshot metadata is invalid.");
  }
  const guidelines = structuredClone(content.guidelines);
  for (const guideline of guidelines) {
    if (
      !guideline ||
      typeof guideline !== "object" ||
      typeof guideline.id !== "string" ||
      typeof guideline.nutrient !== "string" ||
      typeof guideline.lowerLimit !== "string" ||
      typeof guideline.upperLimit !== "string" ||
      typeof guideline.remarks !== "string" ||
      typeof guideline.source !== "string" ||
      !["context-only", "not-comparable"].includes(guideline.comparison)
    ) {
      throw new Error("Preserved guideline row structure is invalid.");
    }
  }
  return { snapshot: structuredClone(snapshot), guidelines };
};

/**
 * @param {{
 *   foodText: string;
 *   guidelineText?: string;
 *   preservedGuidelines?: {
 *     snapshot: {
 *       id: string;
 *       fileName: string;
 *       sha256: string;
 *       rowCount: number;
 *     };
 *     guidelines: Array<Record<string, unknown>>;
 *   };
 *   foodFileName?: string;
 *   guidelineFileName?: string;
 *   expectedFoodSha256?: string;
 *   expectedGuidelineSha256?: string;
 *   acceptSourceUpdate?: boolean;
 * }} options
 */
export const buildNutritionContent = ({
  foodText,
  guidelineText = undefined,
  preservedGuidelines = undefined,
  foodFileName = "food_nutrition_sgfoodid_combined_nutrition_subset.csv",
  guidelineFileName = "daily_nutrition_sgadults.csv",
  expectedFoodSha256,
  expectedGuidelineSha256,
  acceptSourceUpdate = false,
}) => {
  const foodSha256 = sha256(foodText);
  if ((guidelineText === undefined) === (preservedGuidelines === undefined)) {
    throw new Error(
      "Provide either guidelineText or preservedGuidelines, but not both.",
    );
  }
  const guidelineSha256 =
    guidelineText === undefined
      ? preservedGuidelines.snapshot.sha256
      : sha256(guidelineText);
  if (expectedFoodSha256) {
    verifySourceHash("Food source", foodSha256, expectedFoodSha256, acceptSourceUpdate);
  }
  if (expectedGuidelineSha256) {
    verifySourceHash(
      "Guideline source",
      guidelineSha256,
      expectedGuidelineSha256,
      acceptSourceUpdate,
    );
  }

  const parsedFood = parseCsv(foodText);
  const parsedGuidelines =
    guidelineText === undefined ? undefined : parseCsv(guidelineText);
  const requiredFoodHeaders = [
    "Food Name",
    "Default Serving Size",
    "Source of Data",
    "Per Serving Size",
    ...Object.values(NUTRIENT_COLUMNS),
  ];
  for (const header of requiredFoodHeaders) {
    if (!parsedFood.headers.includes(header)) {
      throw new Error(`Food source is missing required column "${header}".`);
    }
  }
  if (parsedGuidelines) {
    for (const header of [
      "Nutrient",
      "Recommended Daily Range (Lower Limit)",
      "Recommended Daily Range (Upper Limit)",
      "Remarks (if any)",
      "Source",
    ]) {
      if (!parsedGuidelines.headers.includes(header)) {
        throw new Error(`Guideline source is missing required column "${header}".`);
      }
    }
  }

  const foodSnapshot = {
    id: `food-${foodSha256.slice(0, 12)}`,
    fileName: path.basename(foodFileName),
    sha256: foodSha256,
    rowCount: parsedFood.rows.length,
  };
  const guidelineSnapshot = parsedGuidelines
    ? {
        id: `guidelines-${guidelineSha256.slice(0, 12)}`,
        fileName: path.basename(guidelineFileName),
        sha256: guidelineSha256,
        rowCount: parsedGuidelines.rows.length,
      }
    : structuredClone(preservedGuidelines.snapshot);

  const profiles = PRIMARY_PROFILE_MAPPINGS.map((mapping) =>
    mapping.foodName
      ? buildReleasedProfile({
          mapping,
          profileId: mapping.dishId,
          parsedFood,
          foodSnapshot,
        })
      : buildUnavailableProfile(mapping),
  );
  const primaryByDishId = new Map(profiles.map((profile) => [profile.dishId, profile]));

  const variantFamilies = VARIANT_FAMILY_MAPPINGS.map((family) => {
    const primary = primaryByDishId.get(family.dishId);
    if (!primary) throw new Error(`Variant family has no primary profile: ${family.dishId}.`);
    const variants = family.variants.map((mapping) => {
      const isDefault = mapping.id === family.defaultVariantId;
      let profile;
      if (isDefault) {
        const primarySourceName = primary.provenance?.sourceFoodName;
        if (primarySourceName !== mapping.foodName) {
          throw new Error(
            `Default variant ${mapping.id} uses ${mapping.foodName}, but the primary profile uses ${primarySourceName}.`,
          );
        }
        primary.variantId = mapping.id;
        profile = primary;
      } else {
        profile = buildReleasedProfile({
          mapping: {
            ...mapping,
            dishId: family.dishId,
            nutritionClass: primary.nutritionClass,
          },
          profileId: `${family.dishId}:${mapping.id}`,
          variantId: mapping.id,
          parsedFood,
          foodSnapshot,
        });
        profiles.push(profile);
      }

      return {
        id: mapping.id,
        name: mapping.name,
        profileId: profile.id,
        unlockRank: mapping.unlockRank,
        visualKey: mapping.visualKey,
      };
    });
    return {
      dishId: family.dishId,
      defaultVariantId: family.defaultVariantId,
      variants,
    };
  });

  addIntentFits(profiles);
  addHealthRatings(profiles);

  return {
    schemaVersion: 2,
    dataVersion: `sg-${foodSha256.slice(0, 12)}-${guidelineSha256.slice(0, 12)}`,
    sourceSnapshots: [foodSnapshot, guidelineSnapshot],
    profiles,
    variantFamilies,
    intents: NUTRITION_INTENTS,
    guidelines: parsedGuidelines
      ? buildGuidelines(parsedGuidelines)
      : structuredClone(preservedGuidelines.guidelines),
    disclosure: NUTRITION_DISCLOSURE,
  };
};

const parseArguments = (argumentsList) => {
  const options = { acceptSourceUpdate: false, outputPath: DEFAULT_OUTPUT_PATH };
  for (let index = 0; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index];
    if (argument === "--food") options.foodPath = argumentsList[++index];
    else if (argument === "--guidelines") options.guidelinePath = argumentsList[++index];
    else if (argument === "--preserve-guidelines-from") {
      options.preservedGuidelinesPath = argumentsList[++index];
    }
    else if (argument === "--output") options.outputPath = path.resolve(argumentsList[++index]);
    else if (argument === "--accept-source-update") options.acceptSourceUpdate = true;
    else throw new Error(`Unknown argument: ${argument}`);
  }
  if (
    !options.foodPath ||
    (options.guidelinePath === undefined) ===
      (options.preservedGuidelinesPath === undefined)
  ) {
    throw new Error(
      "Usage: node tools/nutrition/importer.mjs --food <food.csv> (--guidelines <guidelines.csv> | --preserve-guidelines-from <generated.json>) [--output <json>] [--accept-source-update]",
    );
  }
  return options;
};

export const runImporter = async (argumentsList) => {
  const options = parseArguments(argumentsList);
  const [foodText, guidelineSourceText] = await Promise.all([
    readFile(options.foodPath, "utf8"),
    readFile(
      options.guidelinePath ?? options.preservedGuidelinesPath,
      "utf8",
    ),
  ]);
  const guidelineText = options.guidelinePath ? guidelineSourceText : undefined;
  const preservedGuidelines = options.preservedGuidelinesPath
    ? extractPreservedGuidelines(JSON.parse(guidelineSourceText))
    : undefined;
  const content = buildNutritionContent({
    foodText,
    guidelineText,
    preservedGuidelines,
    foodFileName: options.foodPath,
    guidelineFileName: options.guidelinePath,
    expectedFoodSha256: EXPECTED_FOOD_FILE_SHA256,
    expectedGuidelineSha256: EXPECTED_GUIDELINE_FILE_SHA256,
    acceptSourceUpdate: options.acceptSourceUpdate,
  });
  await writeFile(options.outputPath, `${JSON.stringify(content, null, 2)}\n`, "utf8");
  return content;
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runImporter(process.argv.slice(2))
    .then((content) => {
      process.stdout.write(
        `Generated ${content.profiles.length} nutrition profiles at ${DEFAULT_OUTPUT_PATH}.\n`,
      );
    })
    .catch((error) => {
      process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      process.exitCode = 1;
    });
}
