# Test Report

Report date: 2026-07-16
Build/commit: Expanded 12-stall / 46-dish working source validated with bundled Node.js `v24.14.0`; commit/publication record pending
Release verdict: **NO-GO pending exact-production browser/offline QA and required human reviews**

## Evidence status

The expanded source integrates the queue, preferred-route editor, expansion, graphics, food, animation, and utility changes alongside 12 stalls, 46 dishes, 80 placeables, 12 archetypes, and 300 English localization entries. Every stall and dish has a unique primary visual reference. Current local-browser passes inspected the expandable 12-persona roster, seven live mixed visitors, and the route editor at 1024 × 640 with no client-console errors. A fresh 1280 × 720 stall pass also inspected compact and 5 × 3 facades, four simultaneously operating vendors, closed shutters, active-menu food changes, reduced motion, high contrast, and standard/lower-end quality without game console warnings or errors. These are targeted development-runtime checks, not exhaustive human or exact-production review.

The route-efficiency correction was also checked in a deterministic 360-second production starter-layout run. The retained 50 ratings averaged 88.2, ranged from 75.83 to 95.83, and contained no score below 50; average travelled distance was 34.16 tiles. This run separately exposed that the 120-second visit cap can interrupt served guests during eating or tray return, which remains an open balance issue rather than part of the route score.

Current supported-runtime evidence: the complete release-equivalent gate passed on bundled Node.js `v24.14.0`, including typecheck, lint, 24 Vitest files / 131 tests, the five-environment Sites/Vinext build, and 2/2 rendered-output/offline-shell tests. The native Next.js Vercel build also passed. The generated service-worker build ID is `c5ed3679ba56`. These automated results do not establish exact-production browser/offline behavior or human visual, accessibility, cultural, security, or legal approval.

## Gate record

| Gate | Current result | Evidence / required update |
|---|---|---|
| Typecheck | **Pass** | `npm run test:release` on bundled Node.js `v24.14.0`, exit 0 |
| Vitest unit/integration/content/performance/hosting | **Pass** | 24 files / 131 tests passed |
| Content validator | **Pass** | Exact 12 stalls / 46 dishes / 80 placeables / 12 archetypes / 300 localization entries, reciprocal references, opening menus, unique primary stall/food visuals, unlock graph, categories, and copy checks |
| Visual-recipe validator | **Pass, automated scope** | 80 unique placeable semantic contracts, 46 distinct dish profiles, and 12 unique vendor identities/tools/actions passed alongside 12 archetypes, all 11 lifecycle states, reduced-motion invariants, and the exact indicator legend; active-menu prop selection is reciprocal, ordered, deduplicated, bounded, and deterministic |
| Queue selection/routing/expansion | **Pass** | Balanced selection, furniture avoidance, globally unique cells/anchors, custom-route conflicts, closed stalls, live-order preservation, geometry/undo reflow, persistence, admitted-customer walkability, perimeter migration, and old-exit continuity are covered |
| Preferred guest routes | **Pass** | Weighted deterministic corridor shifts, fallback paths, canonical validation, live rerouting, blocking-placement protection, undo, and schema-v3 round-trip/backward defaults are covered |
| Utility mechanics | **Pass** | All 14 signage/facility definitions expose nonzero utility; spatial falloff, global wayfinding, and bounded satisfaction effects are covered |
| Deterministic lifecycle and target recovery | **Pass** | Full visit lifecycle, fixed-step chunking, low-end cap, stall/tray/seat target removal, route-efficiency scoring, and invariant checks are covered |
| Build/economy/progression | **Pass** | Place/move/rotate/remove/refund/undo/expansion, operated-stall undo safety, path blocking, thresholds, sales, XP, and reputation are covered |
| Seeded simulation benchmark | **Pass, automated scope** | `benchmark-80-agents` completed 1,200 fixed steps with a peak of 80 active agents within budget; this does not establish Phaser FPS or the required two-hour browser soak |
| Development-browser visual pass | **Current targeted pass** | The persona inspector, Settings guide, and route editor passed earlier targeted checks; the stall upgrade was checked at 1280 × 720 with compact and large stalls, live menu changes, full/open and opaque-closed scenes, reduced motion, high contrast, and both quality modes. All 12 stalls and 46 dishes still require an exact-production gallery and human review; see `GRAPHICS_VERIFICATION.md` |
| Lint | **Pass** | `npm run test:release` on bundled Node.js `v24.14.0`, exit 0 |
| Production build | **Pass** | Sites/Vinext completed all five environments; generated service-worker build ID `c5ed3679ba56` |
| Vercel build | **Pass** | `npm run build:vercel` completed the native Next.js 16 build |
| Vercel Preview/stage/promotion | **Not run** | Requires the documented Vercel project, GitHub secrets, protected `production` Environment, and user approval |
| Rendered production output/PWA | **Pass, automated scope** | 2/2 Node assertions passed; real-browser offline restart/update remains open |
| Dependency audit | **Recorded pass; not rerun in this update** | The previously recorded production-only and all-dependencies audits both reported 0 vulnerabilities |
| Active/backup IndexedDB and quota/private mode | Implementation present; browser not verified | Requires exact-production storage fault injection, reload, and recovery evidence |
| Chrome exact-production critical path | **Not complete** | Exact stable browser/OS, viewport/zoom, console, network, save/reload, and responsive evidence required |
| Offline first load/reload/restart/save/update | **Not run on replacement artifact** | Static worker assertions from the earlier build are not sufficient |
| Edge and Firefox smoke | **Not run** | Exact versions and limitations required |
| Accessibility matrix | **Not run in an exact production browser** | Keyboard, focus, zoom/reflow, contrast, reduced motion, audio equivalents, screen reader, and human audit required |
| Cultural/legal/security review | **Not performed** | Required external review records remain release blockers |

## Automated suites in current source

The expanded source contains the suites below. Content, spawn weighting, and visual-recipe coverage include the complete 12-persona roster in the recorded full-gate execution.

- `tests/content.test.ts`: exact expanded launch counts, category minimums, reciprocal links, opening-dish availability, unique primary stall/food references, localization completeness, duplicate IDs, missing references, unreachable unlocks, and prerequisite cycles.
- `tests/core/grid-pathfinding.test.ts`: grid conversion, rotations/footprints, invalid placement, deterministic A*, and unreachable routes.
- `tests/core/guest-routing.test.ts`: weighted preferred corridors and fallback, canonical/atomic route commands, live rerouting, placement protection, undo, and save compatibility.
- `tests/core/commands-economy.test.ts`: build commands, undo safety/expiry, trusted expansion price, service-after-undo behavior, route protection, and economy/progression formulas.
- `tests/core/lifecycle.test.ts`: end-to-end simulated visit, fixed-step determinism, low-end budgets, and live target/reservation recovery.
- `tests/core/persistence-soak.test.ts`: save round trip, migration/recovery, catalogue validation, deterministic soak, and leak checks.
- `tests/core/walking-satisfaction.test.ts`: distance-based score anchors, preparation/eating independence, exit-leg inclusion, and open-versus-serpentine route scoring.
- `tests/core/customer-personas.test.ts`: progression gates, visit-window weighting, and locked-persona spawn exclusion.
- `tests/core/queue-selection-expansion.test.ts`: stall-choice balancing, queue-direction/custom-path behavior, obstacle avoidance, persistence, perimeter migration, and exit-path continuity.
- `tests/core/queue-layout-overlap.test.ts`: insertion-order-independent global planning, unique cells, protected foreign anchors, crossing custom paths, closed stalls, and custom-first automatic rerouting.
- `tests/utility-effects.test.ts`: meaningful signage/facility mappings and bounded spatial/global effects.
- `tests/stall-visuals.test.ts`: active-menu food-prop reciprocity, order, deduplication, caps, tamper rejection, fallback, and deterministic menu-change behavior.
- `tests/visual-recipes.test.ts`: exhaustive 80-placeable semantic contracts, 46 distinct dish profiles, 12 unique vendor recipes/actions, archetype, animation-state, tick, reduced-motion, and customer-status legend visual contracts.
- `tests/performance.test.ts`: repeatable 80-agent Node simulation budget with queue reservations active.
- `tests/queue-insight.test.ts`: geometry-aware queue-flow messaging, route-capacity warnings, demand imbalance, and calm-state recovery.

## Current supported-runtime execution

Executed from the expanded source with the bundled Node.js `v24.14.0` binary using the release-script equivalents:

```powershell
node node_modules/typescript/bin/tsc --noEmit
node node_modules/eslint/bin/eslint.js . --ignore-pattern dist --ignore-pattern .next
node node_modules/vitest/vitest.mjs run --config vitest.config.ts
node tools/stamp-service-worker.mjs; node node_modules/vinext/dist/cli.js build
node --test tests/rendered-html.test.mjs
node tools/stamp-service-worker.mjs; node node_modules/next/dist/bin/next build
```

Both release targets exited 0. Typecheck and lint passed; Vitest reported 24 files / 131 tests; the five-environment Sites/Vinext build and native Vercel build completed; 2/2 rendered-output/offline-shell tests passed; and the service worker was stamped `c5ed3679ba56`. Dependency audits were not part of this validation update. The benchmark details are recorded in `PERFORMANCE_REPORT.md`.

For the exact-production browser tests, record browser/OS version, viewport, DPR/zoom, production URL, scenario results, screenshots, console/network findings, save/reload, and offline/update steps.

See `TEST_PLAN.md` for the full matrix, `GRAPHICS_VERIFICATION.md` for the current visual evidence, `PERFORMANCE_REPORT.md` for benchmark evidence, and `KNOWN_ISSUES.md` for the remaining gates.
