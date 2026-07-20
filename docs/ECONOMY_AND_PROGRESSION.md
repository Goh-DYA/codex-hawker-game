# Economy and Progression

Status: Provisional balance specification; not playtest-validated

## Principles

- One earnable cash currency; no premium currency, purchases, advertisements, or real-time waits.
- Ordinary service always advances experience.
- Reputation communicates recent operational quality and cannot permanently lock the player out.
- Experimentation is cheap: full refund during placement preview, predictable resale, undo, and no hidden upkeep.
- A weak economy slows expansion but cannot end the game.

Amounts use fictional centre credits (C), not Singapore dollars.

## Starting state and bands

- Starting cash: C4,200.
- Starting reputation: 8 / 100.
- Starter setup must include or make immediately affordable at least one level-1 stall, four seats, necessary tables/facilities, and an earning menu; granted items are not double-charged.
- Dish prices: C3–C24.
- Placeables: C20–C650.
- Stall purchases: C1,200–C4,700.
- Stall upgrades use authored level costs and service/capacity/quality/menu effects.
- Expansion bays: C1,000, C2,500, C5,000, then C9,000, each also reputation-gated.

These are tuning bands. Runtime data is authoritative after validation.

## Visit settlement

Gross sale equals the menu price. Abstracted food cost is a data-defined percentage, initially 28–42% by dish. Contribution is:

gross sale − food cost − any explicit refund + objective bonus

Upkeep is charged in visible, capped operating intervals only while open. Cash never becomes negative from upkeep; an unpaid interval pauses the affected optional bonus and creates a readable warning.

Satisfaction is 0–100 and combines food quality 30%, wait 20%, value 15%, route efficiency 10%, seating comfort 10%, cleanliness 10%, and ambience 5%. Route efficiency uses the full distance walked from entrance to exit: the first 20 tiles carry no penalty, an 80-tile journey scores 50, and journeys of 116 tiles or more floor at 20. Missing-seat or unserved departures use dedicated penalties rather than fabricated food scores.

Experience per completed visit is a small base plus satisfaction and novelty bonuses. Reputation uses a rolling sample so one bad visit is informative but not catastrophic. Exact rounding is centralized and covered by unit tests.

## Unlock curve

| Phase | Levels | Player learning | Representative unlocks |
|---|---:|---|---|
| Starter | 1–3 | Build, service, tray return, first bottleneck | Sunrise Roost, Coconut & Lime, Kopi Canopy, Cinder Wok |
| Variety | 4–7 | Menu mix, group seating, queue design | Mee Pok Junction, Tiffin Lantern, Sweet Monsoon, Satay Meridian, Tamarind Leaf, first expansion |
| Optimization | 8–12 | Peak flow, ambience, upgrades | Bamboo Basket, Straits Hearth, Harbour Ember, advanced facilities |
| Mastery | 13–20 | Dense layouts and self-directed goals | premium families, final expansions, feature decorations |

Every required launch stall and catalogue item is earnable by level 20 without premium payment. Unlocks reveal no more than a manageable group at a time.

## Objectives

Objectives are optional guidance, not blockers. Templates include serve a count, keep wait below a threshold, sustain satisfaction, offer a category mix, improve tray return, maintain clear paths, and complete a reversible build task. Each has seeded test fixtures and avoids requiring a specific cultural dish as a novelty stunt.

## Recovery safeguards

- Essential starter objects may be reclaimed for free if none remain.
- If cash is below the cheapest valid earning setup and no openable stall exists, grant C650 once per recovery condition and explain why.
- Selling returns 70% of base price; the confirmation shows resulting capability.
- A stall can always run at least one owned starter menu.
- Reset and new game require confirmation; import/export is a debug/support feature.
- No debt, bankruptcy timer, forced restart, or paid rescue.

## Balance acceptance

Before release, seeded simulation plus human playtests must demonstrate:

- A novice can reach level 3 without grinding or an unrecoverable placement.
- At least three materially different viable layout/menu strategies exist.
- No catalogue item creates infinite cash, reputation, or reservation loops.
- All 80 items and 14 stalls are affordable within a reasonable complete playthrough.
- The final expansion is aspirational but does not require idle real-world time.

No economy stability claim is made yet.
