# Project Status

Last updated: 2026-07-12
Phase: Release candidate implementation complete; independent verification in progress
Release status: **NO-GO for production approval**

## Current position

Hawker Simulator is implemented as a deployable, local-first browser game. The React interface mounts a Phaser world backed by a deterministic TypeScript simulation, the complete launch catalogue is runtime-integrated, and production build, save, offline-shell, accessibility, and release-gate code paths are present.

The current source also includes per-item visual recipes, visible meals and lifecycle animation, balanced stall selection, globally unique obstacle-safe configurable queues, coherent expansion-boundary migration, and functional signage/facility effects. The final current-source gate passes: typecheck, lint, 10 Vitest files / 57 tests, production build, and rendered-output/offline-shell assertions. The replacement `dist/` artifact and service-worker build `710894d70709` are recorded in the test and performance reports.

Package version `1.0.0` remains an internal artifact identifier until the exact-production browser/offline gates and required human reviews close.

## Release-candidate summary

| Area | State | Current evidence / remaining gate |
|---|---|---|
| Product/game/technical/art plans | Implemented and documented | Product brief, GDD, technical design, art bible, economy, content, accessibility, testing, security, deployment, and ADRs are present |
| Stack and architecture | Implemented | TypeScript + React/Vinext/Vite/Sites with Phaser 4.2.1; deterministic simulation is separated from rendering |
| Perspective/style | Implemented | Orthographic top-down square grid with code-native, shape-led illustrated 2D rendering |
| Launch content | Automated validation and visual-recipe coverage present | Exactly 8 stalls, 30 dishes, 80 placeables, 8 customer archetypes, 11 customer states, and 252 English localization entries |
| Core simulation | Automated coverage present | Placement/path validation, deterministic lifecycle, balanced stall selection, obstacle-safe queue reservations, custom queue routes, target recovery, economy, progression, moving expansion boundaries/entry/exit, and undo |
| Game/UI integration | Implemented | Build catalogue, camera/input, menus, tutorial, objectives/insights, settings, save tools, coherent expansion, per-stall queue counts/direction/bend editor, utility descriptions, visible food, and live status UI |
| Persistence | Implemented with automated core coverage | IndexedDB active/backup envelopes, checksums, serialized writes, V1-to-V2 migration, recovery, import/export, and reset; real-browser storage fault injection remains open |
| Offline/PWA | Implemented; replacement static assertions pass | Real offline restart/update verification must still be exercised on the replacement production artifact |
| Automated QA | Current-source release gate passed | Final `npm run test:release` passed typecheck, lint, 10 files / 57 tests, production build, and 2 rendered-output/offline-shell tests |
| Browser QA | Targeted development-browser visual pass captured | Starter, live service, queue routing/editing, and expansion states have screenshot evidence in `GRAPHICS_VERIFICATION.md`; exact-production critical path, console/network, secondary-browser, viewport/zoom, save/reload, and offline behavior remain open |
| Performance | Partial automated evidence | Latest Node benchmark exercised 80 active agents for 1,200 fixed steps within its simulation budget; browser FPS/frame time, memory, TTI, and supported customer caps remain unclaimed |
| Accessibility | Engineering support implemented; human audit pending | Semantic DOM controls, keyboard actions, focus-managed dialogs, text scaling, high contrast, reduced motion, visual audio equivalents, and degradation messages are present; assistive-technology and human review remain open |
| Cultural review | Research-informed internal review only | Fictional names/marks and original presentation are used; Singapore-informed human review remains a release blocker |
| Security/privacy/legal | Engineering controls implemented; independent reviews pending | Local-only data posture, bounded save import, no analytics/accounts/payments, CSP/security headers, and notices are present; both final npm audits report 0 vulnerabilities, while independent reviews remain open |
| Deployment | Replacement artifact built and smoked locally | Artifact inventory/hash and HTTP 200 production smoke are recorded; Git commit and Sites publication evidence are pending |

## Implemented launch scope

- Complete customer lifecycle: arrive, choose a stall, queue, order, collect food, reserve a seat, eat a visibly rendered meal, return a tray when possible, exit, and despawn.
- Balanced customer choice: preferences, quality, price, wait, novelty, distance, and wayfinding influence stall selection instead of entrance proximity dominating.
- Dynamic queue management: per-stall counts, automatic direction, player-authored bends, reserved positions, and obstacle-safe movement.
- Operational build mode: place, inspect, move, rotate, remove/sell, undo, edit queues, and expand while protecting navigation and migrating the live perimeter, entrance, and exit.
- Code-native visual system: 80 distinct placeable contracts, eight stall identities, 30 food/vessel recipes, eight archetype appearances, all 11 lifecycle poses, carried/seated meals, queue overlays, and reduced-motion-safe animation.
- Meaningful facilities and signage: spatial/global wayfinding, patience, movement, turnover, cleanliness, ambience, satisfaction, tray-return, and facility effects are surfaced and applied by the simulation.
- Economy/progression, onboarding, objectives, diagnostics, accessibility settings, procedural audio, local saves, PWA manifest, offline fallback, and update-ready flow.

## Remaining NO-GO gates

1. Run the critical path on the frozen production artifact in current stable Chrome and record browser/OS version, viewport/zoom, screenshots, console/network state, save/reload, responsive behavior, and measured performance. Record Edge and Firefox smoke results or explicit limitations.
2. Verify first-load caching, reload, browser restart, saving while offline, and service-worker update/rollback behavior on the exact production artifact and origin.
3. Complete and record human Singapore cultural review.
4. Complete and record human accessibility/assistive-technology review.
5. Complete and record independent security review (or accountable written waiver) and qualified legal/privacy review.

## Evidence rule

Do not translate "implemented," "compiled," or "unit-tested" into an exact-production browser, accessibility, cultural, legal, security, or compliance claim. Before approval, add the outstanding build, browser/offline, and human-review records to the release evidence.
