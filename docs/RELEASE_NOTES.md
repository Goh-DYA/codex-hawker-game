# Release Notes

## Unreleased — release candidate

Hawker Balance is a complete, free, local-first browser management and nutrition-education game candidate. It is not yet production-approved because exact-artifact real-browser/offline QA and required human reviews remain open.

### Playable launch scope

- Build and operate an original Singapore-inspired Community Courtyard using a top-down grid.
- Place, move, rotate, remove/sell, undo, and unlock 80 meaningfully distinct seating, facility, sign, greenery, lighting, cooling, tray/waste, floor, and utility definitions.
- Operate 14 fictional stalls and configure 54 dishes through per-stall menu slots, including Pick & Mix and Herbal Cauldron.
- Serve 12 customer archetypes through arrival, stall choice, queue, ordering, collection, reserved seating, dining, tray return, exit, and despawn.
- Paint saved preferred walking lanes that shift guest routes while retaining obstacle-safe fallback paths.
- Read live queue, cleanliness, seating, ambience, cash, reputation, level, objective, and diagnostic feedback.
- Expand the hall and progress through deterministic economy, XP, reputation, and unlock rules.
- Compare 104 released serving profiles through 14 recipe-variant families without changing prices, service timing, XP, reputation, or the dish family's Star rating.
- Compare the separate 1-to-5 Health and Star ratings assigned across the complete menu. Star rating represents taste and popularity; general and condition-specific Health ratings represent comparative nutrient fit within the reviewed in-game options.
- Serve customers who may be managing high cholesterol, obesity, diabetes, or hypertension. Their visit-specific condition is independent of archetype and appearance, increases preference for better-fitting options, and applies only a small bounded satisfaction effect from the ordered meal.
- Respond to fictional nutrition intents, inspect nutrient trade-offs, complete rotating nutrition objectives, and read current-day Nutrition Pulse analytics with an educational-not-medical-advice disclosure.

### Interface and accessibility engineering

- Semantic React controls surround the Phaser world for the catalogue, menus, settings, save tools, objectives, tutorials, Nutrition Lens, Variant Lab, customer inspector, Nutrition Pulse, and status.
- Pointer and keyboard camera/build controls, focus-managed dialogs, visible focus, Escape behavior, high contrast, reduced motion, text scaling, and separate audio controls are implemented.
- Important audio events have visual equivalents; unavailable audio/storage degrades with an explicit message.
- Standard and lower-end quality modes apply separate crowd/fixed-step/frame-rate limits.

### Saves and offline shell

- IndexedDB active/backup saves use versioned checksummed envelopes and serialized writes.
- Core V3-to-V4 and runtime V1-to-V2 migrations, newest-save backup recovery, content alias/refund recovery, nutrition variant fallback, export/import, and reset are implemented.
- The PWA includes a manifest, offline fallback, deterministic content-derived cache ID, acknowledged runtime warming, and an explicit save-before-update activation flow.

### Automated evidence boundary

- The content `1.3.0` working-source contract requires 14 stalls, 54 dishes, 80 placeables, 12 archetypes, and 320 English localization entries.
- The nutrition contract requires 104 released profiles, 14 variant families with 64 selectable variants, a released base profile and Star rating for every dish, complete Health/condition ratings, provenance hashes, scaling, trace values, quarantine rules, deterministic generation, and incompatible guideline comparisons.
- The retained automated report covers content `1.2.0`; the complete release gate and both production builds must be rerun before the expanded `1.3.0` contracts can be reported as passing.
- Deterministic simulation, grid/pathfinding, build/economy/progression, persistence/migration/recovery, target reconciliation, soak, and an 80-agent Node benchmark have automated tests.
- Production-render checks assert the release shell, security headers, PWA update protocol, and absence of starter-facing copy.
- See `TEST_REPORT.md` and `PERFORMANCE_REPORT.md` for the current supported-runtime automated results, the historical payload baseline, and remaining browser-only measurements.

### Not yet approved

- Current stable Chrome critical path, Edge/Firefox smoke, viewport/zoom/console/network checks, browser FPS/memory/TTI, and the long browser soak.
- First-load/offline reload, offline restart/save, waiting-worker update, and rollback behavior on the exact production artifact and origin.
- Human Singapore cultural and accessibility/assistive-technology review.
- Independent security review and qualified legal/privacy review.

The package/cache may use `1.0.0` as an artifact identifier. It does not indicate release acceptance, certification, or compliance.
