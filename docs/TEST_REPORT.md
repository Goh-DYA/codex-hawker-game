# Test Report

Report date: 2026-07-12
Build/commit: Final verified source tree; Git/Sites commit is recorded by the release handoff
Release verdict: **NO-GO pending real-browser/offline QA and required human reviews**

## Evidence status

The final integrated release gate passed after the social asset, dependency-security updates, and release cleanup. Automated evidence is complete for the source tree; browser, offline, assistive-technology, and external-review claims remain explicitly open.

Final automated environment: Windows, Node.js 24.14.0, npm 10.9.2, 2026-07-12 12:47 SGT. The supported minimum is Node.js 22.15.0. Browser testing was unavailable: the Chrome connector was not available and the in-app browser later rejected the local URL under its URL policy. No browser screenshot, browser-console, offline, or measured-frame-rate claim is made.

## Gate record

| Gate | Current result | Evidence / required update |
|---|---|---|
| Clean dependency install | **Pass** | Final `npm ci --ignore-scripts`: 644 packages installed, 651 audited, 0 vulnerabilities; the first attempt was retried after stopping a development server that held a Windows native-module lock |
| Typecheck | **Pass** | `npm run typecheck`, exit 0 at 12:47 SGT |
| Lint | **Pass** | `npm run lint`, exit 0 at 12:47 SGT |
| Vitest unit/integration/content/performance | **Pass** | 6 files / 35 tests passed; 812 ms runner duration in the final release command |
| Content validator | **Pass** | Exact 8 stalls / 30 dishes / 80 placeables / 8 archetypes / 252 localization entries plus references, unlock graph, categories, and copy checks |
| Production build | **Pass** | Vinext completed all five environments with Vite 8.1.4; service-worker build ID `7d222dc84ce3`; `dist/` content SHA-256 `5d03915e18c96548430d44e3a0c7c4e9e6c0bc71601ec960841fe63e9c65ba93` |
| Rendered production output | **Pass** | 2/2 Node checks passed in 235.6 ms: status/HTML/security headers/no starter copy plus versioned update-gated PWA shell |
| Dependency audit | **Pass** | Final all-dependencies and production-only npm audits both reported 0 vulnerabilities |
| Core save/migration/recovery | **Pass** | V2 round trip, V1 migration, removed-content recovery/refund, unlock alias, and malformed-catalog cases are covered |
| Active/backup IndexedDB and quota/private mode | Implementation present; browser not verified | Requires real-browser storage fault injection, reload, and recovery evidence |
| Deterministic lifecycle and target recovery | **Pass** | Full visit lifecycle, fixed-step chunking, low-end cap, stall/tray/seat target removal, and invariant checks are covered |
| Build/economy/progression | **Pass** | Place/move/rotate/remove/refund/undo/expansion, operated-stall undo safety, path blocking, thresholds, sales, XP, and reputation are covered |
| Seeded soak | **Pass, automated scope** | Reproducibility plus drained queues and seat reservations after closing are asserted; this is not the required two-hour browser soak |
| Chrome critical path | **Not run** | Exact stable browser/OS, viewport/zoom, screenshot, console, network, save/reload, and responsive evidence required |
| Offline first load/reload/restart/save/update | **Not run** | Static worker assertions pass; real service-worker behavior on the built artifact remains required |
| Edge and Firefox smoke | **Not run** | Exact versions and limitations required |
| Accessibility matrix | **Not run in a real browser** | Keyboard, focus, zoom/reflow, contrast, reduced motion, audio equivalents, screen reader, and human audit required |
| Cultural/legal/security review | **Not performed** | Required external review records remain release blockers |

## Automated coverage represented by the final run

- `tests/content.test.ts`: exact launch counts, category minimums, reciprocal links, localization completeness, duplicate IDs, missing references, unreachable unlocks, and prerequisite cycles.
- `tests/core/grid-pathfinding.test.ts`: grid conversion, rotations/footprints, invalid placement, deterministic A*, and unreachable routes.
- `tests/core/commands-economy.test.ts`: build commands, undo safety/expiry, trusted expansion price, service-after-undo behavior, route protection, and economy/progression formulas.
- `tests/core/lifecycle.test.ts`: end-to-end simulated visit, fixed-step determinism, low-end budgets, and live target/reservation recovery.
- `tests/core/persistence-soak.test.ts`: save round trip, migration/recovery, catalogue validation, deterministic soak, and leak checks.
- `tests/performance.test.ts`: repeatable 80-agent Node simulation budget.
- `tests/rendered-html.test.mjs`: production server rendering, key release UI, security headers, manifest, cache build ID, warm/activate protocol, and absence of install-time `skipWaiting`.

## Final execution record

Executed from the final candidate under Node.js 24.14.0:

```powershell
npm run test:release
npm audit --omit=dev --audit-level=high
```

`npm run test:release` exited 0 in 14.6 seconds. The independent all-dependency and production-only audits both exited 0 with no findings. A documentation-comment-only rebuild then passed with 2/2 rendered-output checks. Final output: 35/35 Vitest tests, 2/2 rendered-output tests, 35 files and 13,637,680 bytes in `dist/`. For the remaining browser tests, record browser/OS version, viewport, DPR/zoom, production URL, scenario results, screenshots, console/network findings, and offline/update steps.

See `TEST_PLAN.md` for the full browser and accessibility matrix, `PERFORMANCE_REPORT.md` for benchmark evidence, and `KNOWN_ISSUES.md` for the remaining release gates.
