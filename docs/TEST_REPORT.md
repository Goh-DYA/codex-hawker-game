# Test Report

Report date: 2026-07-12
Build/commit: Current working source; replacement Git/Sites commit pending
Release verdict: **NO-GO pending exact-production browser/offline QA and required human reviews**

## Evidence status

The queue, expansion, graphics, food, animation, and utility changes are integrated. The final current-source release gate passes. A targeted development-browser pass captured the starter layout, live service, queue routing/editing, and expanded layouts. The replacement production artifact was built and served locally with HTTP 200 responses for the game shell, manifest, and versioned service worker.

Current-source automated evidence: final `npm run test:release` passed typecheck, lint, 10 Vitest files / 57 tests, production build, and 2 rendered-output/offline-shell tests. Both `npm audit --omit=dev --audit-level=high` and `npm audit --audit-level=high` reported 0 vulnerabilities.

## Gate record

| Gate | Current result | Evidence / required update |
|---|---|---|
| Typecheck | **Pass** | `npm run typecheck`, exit 0 after the latest source changes |
| Vitest unit/integration/content/performance | **Pass** | 10 files / 57 tests passed after the latest source changes |
| Content validator | **Pass** | Exact 8 stalls / 30 dishes / 80 placeables / 8 archetypes / 252 localization entries plus references, unlock graph, categories, and copy checks |
| Visual-recipe validator | **Pass** | All 80 placeables have distinct visual contracts/motifs; all 30 dishes consume food/vessel metadata; all 8 archetypes and all 11 lifecycle states are covered, including moving and reduced-motion signatures |
| Queue selection/routing/expansion | **Pass** | Balanced selection, furniture avoidance, globally unique cells/anchors, custom-route conflicts, closed stalls, live-order preservation, geometry/undo reflow, persistence, admitted-customer walkability, perimeter migration, and old-exit continuity are covered |
| Utility mechanics | **Pass** | All 14 signage/facility definitions expose nonzero utility; spatial falloff, global wayfinding, and bounded satisfaction effects are covered |
| Deterministic lifecycle and target recovery | **Pass** | Full visit lifecycle, fixed-step chunking, low-end cap, stall/tray/seat target removal, and invariant checks are covered |
| Build/economy/progression | **Pass** | Place/move/rotate/remove/refund/undo/expansion, operated-stall undo safety, path blocking, thresholds, sales, XP, and reputation are covered |
| Seeded simulation benchmark | **Pass, automated scope** | 80 agents / 1,200 steps passed; this does not establish Phaser FPS or the required two-hour browser soak |
| Development-browser visual pass | **Partial pass** | Eight screenshots cover starter, live service, automatic/custom queue routing/editing, and one/two expansion states; final audit fixes have automated/static evidence and await a fresh frozen-artifact capture; see `GRAPHICS_VERIFICATION.md` |
| Lint | **Pass** | Final `npm run test:release`, exit 0 |
| Production build | **Pass** | Vinext/Vite completed all five environments; replacement artifact is `dist/` |
| Rendered production output/PWA | **Pass, automated scope** | 2/2 Node assertions passed; production shell, manifest, and service worker returned HTTP 200 locally; real offline restart/update remains open |
| Dependency audit | **Pass** | Production-only and all-dependencies audits both reported 0 vulnerabilities |
| Active/backup IndexedDB and quota/private mode | Implementation present; browser not verified | Requires exact-production storage fault injection, reload, and recovery evidence |
| Chrome exact-production critical path | **Not complete** | Exact stable browser/OS, viewport/zoom, console, network, save/reload, and responsive evidence required |
| Offline first load/reload/restart/save/update | **Not run on replacement artifact** | Static worker assertions from the earlier build are not sufficient |
| Edge and Firefox smoke | **Not run** | Exact versions and limitations required |
| Accessibility matrix | **Not run in an exact production browser** | Keyboard, focus, zoom/reflow, contrast, reduced motion, audio equivalents, screen reader, and human audit required |
| Cultural/legal/security review | **Not performed** | Required external review records remain release blockers |

## Automated coverage represented by the current run

- `tests/content.test.ts`: exact launch counts, category minimums, reciprocal links, localization completeness, duplicate IDs, missing references, unreachable unlocks, and prerequisite cycles.
- `tests/core/grid-pathfinding.test.ts`: grid conversion, rotations/footprints, invalid placement, deterministic A*, and unreachable routes.
- `tests/core/commands-economy.test.ts`: build commands, undo safety/expiry, trusted expansion price, service-after-undo behavior, route protection, and economy/progression formulas.
- `tests/core/lifecycle.test.ts`: end-to-end simulated visit, fixed-step determinism, low-end budgets, and live target/reservation recovery.
- `tests/core/persistence-soak.test.ts`: save round trip, migration/recovery, catalogue validation, deterministic soak, and leak checks.
- `tests/core/queue-selection-expansion.test.ts`: stall-choice balancing, queue-direction/custom-path behavior, obstacle avoidance, persistence, perimeter migration, and exit-path continuity.
- `tests/core/queue-layout-overlap.test.ts`: insertion-order-independent global planning, unique cells, protected foreign anchors, crossing custom paths, closed stalls, and custom-first automatic rerouting.
- `tests/utility-effects.test.ts`: meaningful signage/facility mappings and bounded spatial/global effects.
- `tests/visual-recipes.test.ts`: exhaustive placeable, stall/dish metadata, archetype, animation-state, tick, and reduced-motion visual contracts.
- `tests/performance.test.ts`: repeatable 80-agent Node simulation budget with queue reservations active.

## Current execution record

Executed from the current working source on the required bundled Node 24 runtime:

```powershell
npm run test:release
npm audit --omit=dev --audit-level=high
npm audit --audit-level=high
```

All commands exited 0. Vitest reported 10 files / 57 tests passing, the production build completed, both rendered-output tests passed, and both audits reported 0 vulnerabilities. The benchmark and artifact metrics are recorded in `PERFORMANCE_REPORT.md`.

For the exact-production browser tests, record browser/OS version, viewport, DPR/zoom, production URL, scenario results, screenshots, console/network findings, save/reload, and offline/update steps.

See `TEST_PLAN.md` for the full matrix, `GRAPHICS_VERIFICATION.md` for the current visual evidence, `PERFORMANCE_REPORT.md` for benchmark evidence, and `KNOWN_ISSUES.md` for the remaining gates.
