# Project Status

Last updated: 2026-07-20
Phase: Content `1.3.0` nutrition and stall expansion passes working-source automation and targeted nutrition browser QA; exact-production and human verification pending
Release status: **NO-GO for production approval**

## Current position

Hawker Balance is implemented as a deployable, local-first browser game. The React interface mounts a Phaser world backed by a deterministic TypeScript simulation, the complete launch catalogue and reviewed nutrition snapshot are runtime-integrated, and production build, save, offline-shell, accessibility, and release-gate code paths are present.

The working source includes layered stall facades, active-menu food displays, 14 vendor identities, per-item and per-variant visual recipes, visible meals and lifecycle animation, progression- and schedule-aware customer personas, balanced stall selection, globally unique obstacle-safe configurable queues, a saved preferred-route editor, geometry-aware queue-flow guidance, distance-based route-efficiency ratings, coherent expansion-boundary migration, functional signage/facility effects, nutrition-aware customer decisions and objectives, the Nutrition Lens, Variant Lab, customer inspector, Nutrition Pulse, and an approval-gated Vercel delivery pipeline. Content `1.3.0` defines 14 stalls, 54 dishes, 80 placeables, 12 customer archetypes, and 320 English localization entries. Its 104 source profiles are all released; 14 variant families expose 64 selectable preparations, every dish has a distinct Star rating, and every profile has overall and condition-specific Health ratings.

On bundled Node.js `v24.14.0`, the content `1.3.0` working source passes typecheck, lint, 29 Vitest files / 181 tests, the five-environment Sites/Vinext build, 2/2 rendered-output/offline-shell assertions, and the native Next.js Vercel build. Its generated service-worker build ID is `7d3da6d67b11`. A targeted 1280 x 720 development-browser pass covered the expanded nutrition menu, variant comparison, and condition-aware customer inspector without browser warning or error messages. Commit/artifact hashes, payload totals, exact-production browser/offline evidence, exhaustive galleries, and human reviews remain pending.

Package version `1.0.0` remains an internal artifact identifier until the exact-production browser/offline gates and required human reviews close.

## Release-candidate summary

| Area | State | Current evidence / remaining gate |
|---|---|---|
| Product/game/technical/art plans | Implemented and documented | Product brief, GDD, technical design, art bible, economy, content, accessibility, testing, security, deployment, and ADRs are present |
| Stack and architecture | Implemented | TypeScript + React/Vinext/Vite/Sites with Phaser 4.2.1; deterministic simulation is separated from rendering |
| Perspective/style | Implemented | Orthographic top-down square grid with code-native, shape-led illustrated 2D rendering |
| Launch content | Content `1.3.0` typed roster passes automated validation | Exactly 14 stalls, 54 dishes, 80 placeables, 12 customer archetypes, 11 customer states, and 320 English localization entries; 104 profiles are released, 14 reviewed variant families expose 64 variants, and every profile has overall and condition-specific Health ratings |
| Core simulation | Automated coverage present | Placement/path validation, deterministic lifecycle, balanced stall selection, weighted preferred guest routes, obstacle-safe queue reservations, custom queue routes, target recovery, economy, progression, moving expansion boundaries/entry/exit, and undo |
| Game/UI integration | Implemented | Build catalogue, camera/input, menus, separate legacy and nutrition tutorials, objectives/insights, Nutrition Lens, Variant Lab, selectable customer inspector, responsive Focus access, Nutrition Pulse, settings, save tools, coherent expansion, preferred-route and per-stall queue editors, utility descriptions, visible food, and live status UI |
| Persistence | Implemented with automated core coverage | IndexedDB active/backup envelopes, checksums, serialized writes, core V3-to-V4 and runtime V1-to-V2 migrations, nutrition history and active-variant recovery, import/export, and reset; real-browser storage fault injection remains open |
| Offline/PWA | Implemented; replacement static assertions pass | Real offline restart/update verification must still be exercised on the replacement production artifact |
| Automated QA | Current working-source gate passes | Bundled Node.js `v24.14.0`: typecheck, lint, 29 Vitest files / 181 tests, both production builds, and 2/2 rendered-output/offline-shell assertions pass |
| Browser QA | Current targeted nutrition pass plus retained earlier evidence | At 1280 x 720, the development browser passed nutrition badges, 12-field details, condition ratings, variant comparison, and a condition-aware customer inspector with no warning/error console messages. Exact-production, all-14-stall / all-54-dish, 1024 x 640, offline, storage, accessibility, and secondary-browser gates remain open |
| Performance | Node budget passed; browser evidence open | `benchmark-80-agents` exercised 80 active agents for 1,200 fixed steps within its simulation budget; browser FPS/frame time, memory, TTI, and supported caps remain unclaimed, especially because the renderer still performs full-frame redraws and recreates text during frame rendering |
| Accessibility | Engineering support implemented; human audit pending | Semantic DOM controls, keyboard actions, focus-managed dialogs, text scaling, high contrast, reduced motion, visual audio equivalents, a text-paired customer-status legend, and degradation messages are present; assistive-technology and human review remain open |
| Cultural review | Research-informed internal review only | Fictional names/marks and original presentation are used; Singapore-informed human review remains a release blocker |
| Security/privacy/legal | Engineering controls implemented; independent reviews pending | Local-only data posture, bounded save import, no analytics/accounts/payments, CSP/security headers, and notices are present; both previously recorded npm audits report 0 vulnerabilities but were not rerun in this validation update, while independent reviews remain open |
| Deployment | Content `1.3.0` local builds pass; publication pending | Sites/Vinext and native Vercel builds pass locally with service-worker build ID `7d3da6d67b11`. The recorded private Sites commit and URL predate the expansion; current commit/publication, Vercel project setup, protected environment, Preview, and staged deployment evidence remain open |

## Implemented launch scope

- Complete customer lifecycle: arrive, choose a stall, queue, order, collect food, reserve a seat, eat a visibly rendered meal, return a tray when possible, exit, and despawn.
- Balanced customer choice: preferences, quality, price, wait, novelty, distance, and wayfinding influence stall selection instead of entrance proximity dominating.
- Dynamic queue management: per-stall counts, automatic direction, player-authored bends, reserved positions, and obstacle-safe movement.
- Operational build mode: place, inspect, move, rotate, remove/sell, undo, paint preferred guest lanes, edit queues, and expand while protecting navigation and migrating the live perimeter, entrance, and exit.
- Code-native visual system: the working source defines and automatically validates 80 distinct placeable contracts, 14 layered stall identities with vendor workwear/tools/actions, active-menu food displays, 54 food/vessel recipes, twelve archetype appearances, all 11 lifecycle poses, carried/seated meals, queue overlays, high-contrast separation, and reduced-motion-safe animation. The complete browser gallery and human visual/cultural review remain open; no source contract constitutes human approval.
- Meaningful facilities and signage: spatial/global wayfinding, patience, movement, turnover, cleanliness, ambience, satisfaction, tray-return, and facility effects are surfaced and applied by the simulation.
- Economy/progression, onboarding, objectives, diagnostics, accessibility settings, procedural audio, local saves, PWA manifest, offline fallback, and update-ready flow.
- Reviewed nutrition variants, separate Health and Star ratings, independently assigned condition-aware customer choices and bounded satisfaction effects, fictional nutrition intents, order-time variant snapshots, serving feedback, daily nutrition objectives, contextual Singapore-adult reference data, and an explicit educational-not-medical-advice disclosure.

## Remaining NO-GO gates

1. Record the validated source commit plus current artifact payload/hash, then run the artifact's critical path in current stable Chrome and record browser/OS version, viewport/zoom, screenshots, console/network state, save/reload, responsive behavior, and measured performance. Include the full-frame redraw/text-recreation path in profiling. Record Edge and Firefox smoke results or explicit limitations.
2. Verify first-load caching, reload, browser restart, saving while offline, and service-worker update/rollback behavior on the exact production artifact and origin.
3. Complete and record human Singapore cultural review.
4. Complete and record human accessibility/assistive-technology review.
5. Complete and record independent security review (or accountable written waiver) and qualified legal/privacy review.

## Evidence rule

Do not translate "implemented," "compiled," or "unit-tested" into an exact-production browser, accessibility, cultural, legal, security, or compliance claim. Before approval, add the outstanding build, browser/offline, and human-review records to the release evidence.
