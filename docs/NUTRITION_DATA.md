# Nutrition data and educational-use policy

Status: Implemented schema-v2 content contract; source, clinical, and cultural review remain required before release

## Purpose

Hawker Balance uses serving-level nutrition data to teach comparison and trade-offs inside a restaurant-management game. Every base dish and selectable recipe variant has its own CSV-derived profile. A dish also has two separate signals:

- `starRating` represents authored taste and popularity;
- `healthRating` and `conditionRatings` are comparative nutrition scores.

The condition ratings let fictional customers with high cholesterol, obesity, diabetes, or hypertension prefer different nutrient trade-offs. They do not diagnose a customer, prescribe a diet, certify a dish as healthy, or replace individual advice from a clinician or dietitian.

## Supplied source snapshot

Food profiles come from `food_nutrition_sgfoodid_combined_nutrition_subset.csv` (2,689 rows, SHA-256 `1bc212db6eda06c29a5f8a1ddfe8a0ca82b02a71ffc34c07ced45d8b2f9b273e`). The launch snapshot contains 54 released primary dish profiles and 14 reviewed variant families, for 104 released profiles in total.

Raw CSV files and machine-specific paths are not committed. Generated provenance stores only the source filename, file hash, row number and name, canonical row hash, mapping method, serving multiplier, source type, and review note. Mappings are exact and authored; runtime fuzzy matching is prohibited.

When only the food CSV is available, regenerate profiles while retaining the reviewed immutable guideline block:

```powershell
node tools/nutrition/importer.mjs `
  --food data/food_nutrition_sgfoodid_combined_nutrition_subset.csv `
  --preserve-guidelines-from src/content/nutrition.generated.json
```

The importer checks that the retained guideline snapshot ID matches its SHA-256 prefix and that its row count matches the 11 retained guideline records. Supply `--guidelines <path>` instead when deliberately reviewing a new guideline source.

## Value semantics

Every nutrient is represented as one of:

- `known`: a finite, non-negative measured or reported value;
- `trace`: explicitly reported as a trace amount and always displayed as `Trace` rather than a measured zero;
- `unavailable`: missing, invalid, quarantined, or not defensibly mapped.

The importer rejects or quarantines invalid servings, non-finite or negative values, fat subtypes above total fat, sugar or fibre above carbohydrate, implausible nutrient mass, and extreme values that need manual review.

## Rating methodology

All ratings use a 1.0-5.0 scale rounded to one decimal place.

`starRating` is independent of nutrition and is calculated from authored dish quality and base demand: `1 + 4 x (0.65 x quality + 0.35 x demand)`.

Nutrition ratings compare the listed serving only with other released profiles in the same class (`meal` or `drink`). For each metric, the importer calculates a deterministic percentile in the beneficial direction, combines those percentiles using the weights below, and maps the result to 1.0-5.0. An unavailable metric is omitted and the remaining weights are renormalised. A `trace` observation remains labelled `Trace` in the profile and interface, but is represented as zero only for percentile ordering so that it ranks below reported numeric amounts instead of disappearing from the comparison.

The general `healthRating` weights are:

- lower energy 16%, total fat 8%, saturated fat 10%, trans fat 8%, total sugar 12%, and sodium 12%;
- higher protein 12%, dietary fibre 14%, calcium 4%, and iron 4%.

Condition-specific game ratings deliberately emphasise different trade-offs:

- high cholesterol: lower saturated fat 35%, trans fat 20%, and total fat 20%; higher fibre 15%; lower energy 10%;
- obesity: lower energy 35%, total fat 18%, saturated fat 7%, and total sugar 15%; higher fibre 15% and protein 10%;
- diabetes: lower carbohydrate 30% and total sugar 30%; higher fibre 20%; lower energy 12%; higher protein 8%;
- hypertension: lower sodium 65%, energy 10%, and saturated fat 10%; higher fibre 10% and protein 5%.

These weights are an in-game educational model, not a Health Promotion Board (HPB) formula or certification. Their rationale follows official Singapore guidance about [carbohydrate and fibre for diabetes](https://www.healthhub.sg/programmes/diabetes-hub/understanding-carbohydrates), [dietary fat and fibre for hyperlipidemia](https://www.healthhub.sg/health-conditions/hyperlipidemia), [sodium and balanced eating for blood pressure](https://www.healthhub.sg/well-being-and-lifestyle/food-diet-and-nutrition/what-to-eat-to-lower-blood-pressure), [nutrition-label choices for common health concerns](https://www.healthhub.sg/programmes/nutrition-hub/tools-and-resources/), and [adult dietary guidance on energy, fat, salt, sugar, and variety](https://www.healthhub.sg/well-being-and-lifestyle/food-diet-and-nutrition/dietary_guidelines_adults).

## Guideline boundaries

Daily guidance remains contextual and is not divided into meal allowances or used as an individual target. In particular:

- total sugar is not compared with an added-sugar limit;
- food water in grams is not compared with beverage-water guidance;
- cholesterol guidance is not compared directly because the food CSV has no cholesterol field;
- calcium and iron may contribute to the relative general rating without implying an individual daily target.

## Player-facing disclosure

> Hawker Balance is an educational game, not medical or dietary advice. Nutrition values describe the listed source serving; recipes and portions vary. Its 1-5 health and condition ratings compare servings only within this game's meal or drink catalogue: they are not diagnoses, treatment advice, Health Promotion Board certifications, or universal judgements. Daily reference ranges are general guidance for Singaporean adults and do not represent individual needs. Total sugar is not the same as added sugar.

## Review requirements

Before release, a qualified reviewer must verify source permissions, mappings, serving multipliers, variant names, nutrient units, rating weights, and the contextual guideline transcription. Singapore cultural review must also check that recipe variants and visuals are recognisable without implying halal, vegetarian, allergy-safe, or other certification claims.
