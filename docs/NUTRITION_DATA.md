# Nutrition data and educational-use policy

Status: Implemented content contract; source and cultural review remain required before release

## Purpose

Hawker Balance uses nutrition data to teach comparison and trade-offs inside a restaurant-management game. It does not diagnose customers, prescribe diets, rank dishes as healthy or unhealthy, or turn a single serving into a daily-target score.

The game presents five fictional, visit-specific intents: lighter energy, protein forward, fibre forward, sodium aware, and lower total sugar for drinks. These are assigned independently of customer persona or demographics. A match means that the selected serving compares favourably with other reviewed in-game options for that intent; it is not medical or dietary advice.

## Supplied source snapshots

The build-time importer accepts two operator-supplied CSV paths:

- food and drink nutrition records with serving information;
- general daily nutrition guidance for Singapore adults.

Raw CSV files and machine-specific source paths are not committed. The generated launch snapshot records only the source filename, file hash, source row number and name, row hash, mapping method, serving multiplier, source type, and review note. This keeps builds reproducible without redistributing the source dataset.

## Value semantics

Every nutrient is represented as one of:

- `known`: a finite, non-negative measured or reported value;
- `trace`: explicitly reported as a trace amount and never silently converted to zero;
- `unavailable`: missing, invalid, quarantined, or not defensibly mapped.

The importer rejects or quarantines invalid servings, non-finite or negative values, fat subtypes above total fat, sugar or fibre above carbohydrate, implausible nutrient mass, and extreme energy or fibre values that lack explicit review. Dish mappings are exact and authored; runtime fuzzy matching is prohibited.

## Guideline boundaries

Daily guidance appears only as collapsed educational context. It is not divided into meal allowances or used in customer scoring. In particular:

- total sugar is not compared with an added-sugar limit;
- food water in grams is not compared with beverage-water guidance;
- cholesterol guidance is not compared when the food source has no matching field;
- calcium and iron may be displayed without implying a game target.

Displayed averages use a separate known-value denominator for each nutrient. `Trace` and unavailable values remain visibly distinct.

## Player-facing disclosure

> Hawker Balance is an educational game, not medical or dietary advice. Nutrition values describe the listed serving in the source data; recipes and portions vary. Daily reference ranges are general guidance for Singaporean adults and do not represent individual needs. Total sugar is not the same as added sugar. In Hawker Balance, balance means comparing trade-offs—not labelling a dish good or bad.

## Review requirements

Before release, a qualified reviewer must verify source permissions, mappings, serving multipliers, variant names, nutrient units, and the contextual guideline transcription. Singapore cultural review must also check that recipe variants and their visuals are recognizable without implying halal, vegetarian, allergy-safe, or other certification claims.
