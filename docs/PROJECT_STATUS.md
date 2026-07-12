# Project Status

Last updated: 2026-07-12
Phase: Release candidate implementation complete; independent verification in progress
Release status: **NO-GO for production approval**

## Current position

Hawker Simulator is implemented as a deployable, local-first browser game. The React interface mounts a Phaser world backed by a deterministic TypeScript simulation, the complete launch catalogue is runtime-integrated, and production build, save, offline-shell, accessibility, and release-gate code paths are present.

The remaining NO-GO gates are evidence gates rather than missing launch-content definitions: the exact production artifact has not been exercised in an available real browser, offline restart/update behavior has not been observed on that artifact, and the required human cultural, accessibility, security, and qualified legal/privacy reviews have not been completed. Package version `1.0.0` remains an internal artifact identifier until those gates close.

## Release-candidate summary

| Area | State | Current evidence / remaining gate |
|---|---|---|
| Product/game/technical/art plans | Implemented and documented | Product brief, GDD, technical design, art bible, economy, content, accessibility, testing, security, deployment, and ADRs are present |
| Stack and architecture | Implemented | TypeScript + React/Vinext/Vite/Sites with Phaser 4.2.1; deterministic simulation is separated from rendering |
| Perspective/style | Implemented | Orthographic top-down square grid with code-native, shape-led illustrated 2D rendering |
| Launch content | Automated validation present | Exactly 8 stalls, 30 dishes, 80 placeables, 8 customer archetypes, and 252 English localization entries |
| Core simulation | Automated coverage present | Placement/path validation, deterministic fixed-step lifecycle, reservations, target recovery, economy, progression, expansion, and undo |
| Game/UI integration | Implemented | Build catalogue, camera/input, menus, tutorial, objectives/insights, settings, save tools, expansion, stall controls, and live status UI |
| Persistence | Implemented with automated core coverage | IndexedDB active/backup envelopes, checksums, serialized writes, V1-to-V2 migration, recovery, import/export, and reset; quota/private-mode browser fault injection remains part of real-browser QA |
| Offline/PWA | Implemented; static assertions present | Manifest, offline fallback, deterministic cache build ID, acknowledged cache warming, and save-before-activation update gate; real offline restart/update test remains open |
| Automated QA | Final automated gate passed | `npm run test:release` exited 0: typecheck, lint, 35/35 Vitest tests, all five Vinext build environments, and 2/2 rendered-output/PWA checks |
| Browser QA | Blocked by unavailable browser control | Current stable Chrome critical path, secondary-browser smoke, console/network review, screenshots, viewport/zoom checks, and offline behavior remain open |
| Performance | Partial automated evidence | Repeatable Node benchmark exercised 80 active agents within its simulation budget; browser FPS/frame time, memory, TTI, and supported customer caps remain unclaimed |
| Accessibility | Engineering support implemented; human audit pending | Semantic DOM controls, keyboard actions, focus-managed dialogs, text scaling, high contrast, reduced motion, visual audio equivalents, and degradation messages are present; assistive-technology and human review remain open |
| Cultural review | Research-informed internal review only | Fictional names/marks and original presentation are used; Singapore-informed human review remains a release blocker |
| Security/privacy/legal | Engineering controls implemented; independent reviews pending | Local-only data posture, bounded save import, no analytics/accounts/payments, dependency audit, CSP/security headers, and notices are present; independent security and qualified legal/privacy review remain open |
| Deployment | Artifact verified; publication tracked separately | `dist/` contains 35 files / 13,637,680 bytes; content SHA-256 `5d03915e18c96548430d44e3a0c7c4e9e6c0bc71601ec960841fe63e9c65ba93`; Git/Sites IDs are recorded by the release handoff |

## Implemented launch scope

- Complete customer lifecycle: arrive, choose a stall, queue, order, collect food, reserve a seat, eat, return a tray when possible, exit, and despawn.
- Operational build mode: place, inspect, move, rotate, remove/sell, undo, and expand while protecting required navigation.
- Economy and progression: purchases/refunds, revenue, XP, levels, reputation, unlock prerequisites, menu slots, and persistent unlock reconciliation.
- Player-facing systems: onboarding tutorial, objectives, diagnostics/insights, speed controls, quality modes, accessibility settings, procedural audio, and clear storage/audio degradation.
- Local-first release shell: current/backup saves, import/export/reset, PWA manifest, service worker, offline fallback, and update-ready flow.

## Remaining NO-GO gates

1. Run the critical path on the exact production artifact in current stable Chrome and record browser/OS version, viewport/zoom, screenshots, console/network state, save/reload, responsive behavior, and measured performance. Record Edge and Firefox smoke results or explicit limitations.
2. Verify first-load caching, reload, browser restart, saving while offline, and service-worker update/rollback behavior on the exact production artifact and origin.
3. Complete and record human Singapore cultural review.
4. Complete and record human accessibility/assistive-technology review.
5. Complete and record independent security review (or accountable written waiver) and qualified legal/privacy review.

## Evidence rule

Do not translate “implemented,” “compiled,” or “unit-tested” into a browser, accessibility, cultural, legal, security, or compliance claim. Before approval, add the outstanding browser/offline and human-review records to the release evidence.
