# Project Status

Last updated: 2026-07-18
Phase: Nutrition education retrofit validated automatically; independent browser and human verification in progress
Release status: **NO-GO for production approval**

## Current position

Hawker Balance is implemented as a deployable, local-first browser game. The React interface mounts a Phaser world backed by a deterministic TypeScript simulation, the complete launch catalogue and reviewed nutrition snapshot are runtime-integrated, and production build, save, offline-shell, accessibility, and release-gate code paths are present.

The current source also includes layered stall facades, active-menu food displays, 12 animated vendor identities, per-item and per-variant visual recipes, visible meals and lifecycle animation, progression- and schedule-aware customer personas, balanced stall selection, globally unique obstacle-safe configurable queues, a saved preferred-route editor, geometry-aware queue-flow guidance, distance-based route-efficiency ratings, coherent expansion-boundary migration, functional signage/facility effects, nutrition-aware customer decisions and objectives, the Nutrition Lens, Variant Lab, customer inspector, Nutrition Pulse, and an approval-gated Vercel delivery pipeline. The catalogue contains 12 stalls and 46 dishes with unique primary visual references alongside 80 placeables and 12 customer archetypes; nutrition content explicitly profiles 28 dishes and marks 18 unavailable rather than estimating them. On bundled Node.js `v24.14.0`, the release-equivalent gate passes typecheck, lint, 29 Vitest files / 168 tests, the five-environment Sites/Vinext build, and 2/2 rendered-output/offline-shell assertions; the native Next.js Vercel build also passes. The generated service-worker build ID is `1dc2aff781df`.

Package version `1.0.0` remains an internal artifact identifier until the exact-production browser/offline gates and required human reviews close.

## Release-candidate summary

| Area | State | Current evidence / remaining gate |
|---|---|---|
| Product/game/technical/art plans | Implemented and documented | Product brief, GDD, technical design, art bible, economy, content, accessibility, testing, security, deployment, and ADRs are present |
| Stack and architecture | Implemented | TypeScript + React/Vinext/Vite/Sites with Phaser 4.2.1; deterministic simulation is separated from rendering |
| Perspective/style | Implemented | Orthographic top-down square grid with code-native, shape-led illustrated 2D rendering |
| Launch content | Expanded typed roster and automated catalogue contracts present | Content `1.2.0`: exactly 12 stalls, 46 dishes, 80 placeables, 12 customer archetypes, 11 customer states, and 300 English localization entries; 28 dishes have reviewed nutrition mappings, 18 are explicitly unavailable, and ten reviewed variant families expose 44 variants |
| Core simulation | Automated coverage present | Placement/path validation, deterministic lifecycle, balanced stall selection, weighted preferred guest routes, obstacle-safe queue reservations, custom queue routes, target recovery, economy, progression, moving expansion boundaries/entry/exit, and undo |
| Game/UI integration | Implemented | Build catalogue, camera/input, menus, separate legacy and nutrition tutorials, objectives/insights, Nutrition Lens, Variant Lab, selectable customer inspector, responsive Focus access, Nutrition Pulse, settings, save tools, coherent expansion, preferred-route and per-stall queue editors, utility descriptions, visible food, and live status UI |
| Persistence | Implemented with automated core coverage | IndexedDB active/backup envelopes, checksums, serialized writes, core V3-to-V4 and runtime V1-to-V2 migrations, nutrition history and active-variant recovery, import/export, and reset; real-browser storage fault injection remains open |
| Offline/PWA | Implemented; replacement static assertions pass | Real offline restart/update verification must still be exercised on the replacement production artifact |
| Automated QA | Expanded-source release gate passed | Bundled Node.js `v24.14.0`: content validation, typecheck, lint, 29 files / 168 tests, five-environment Sites/Vinext build, native Vercel build, and 2/2 rendered-output/offline-shell tests passed; service-worker build `1dc2aff781df` |
| Browser QA | Targeted development-browser passes current | Route painting/clearing/undo/save-reload/pause-resume passed at 1024 × 640; stall facades/vendors/menu props passed compact/large, open/closed, quality, contrast, and reduced-motion checks at 1280 × 720 without game console errors. Exact-production, all-12-stall, and secondary-browser gates remain open |
| Performance | Node budget passed; browser evidence open | `benchmark-80-agents` exercised 80 active agents for 1,200 fixed steps within its simulation budget; browser FPS/frame time, memory, TTI, and supported caps remain unclaimed, especially because the renderer still performs full-frame redraws and recreates text during frame rendering |
| Accessibility | Engineering support implemented; human audit pending | Semantic DOM controls, keyboard actions, focus-managed dialogs, text scaling, high contrast, reduced motion, visual audio equivalents, a text-paired customer-status legend, and degradation messages are present; assistive-technology and human review remain open |
| Cultural review | Research-informed internal review only | Fictional names/marks and original presentation are used; Singapore-informed human review remains a release blocker |
| Security/privacy/legal | Engineering controls implemented; independent reviews pending | Local-only data posture, bounded save import, no analytics/accounts/payments, CSP/security headers, and notices are present; both previously recorded npm audits report 0 vulnerabilities but were not rerun in this validation update, while independent reviews remain open |
| Deployment | Expanded source builds pass; current publication pending | Sites/Vinext and native Vercel builds pass locally. The recorded private Sites commit `648efa1ad44c4ad078d6e626a63e3a3c30e5d2ac` and URL `https://hawker-simulator-neighbourhood.gohdya.chatgpt.site` predate the expansion; current commit/publication, Vercel project setup, protected environment, Preview, and staged deployment remain required; public production approval is blocked by the gates below |

## Implemented launch scope

- Complete customer lifecycle: arrive, choose a stall, queue, order, collect food, reserve a seat, eat a visibly rendered meal, return a tray when possible, exit, and despawn.
- Balanced customer choice: preferences, quality, price, wait, novelty, distance, and wayfinding influence stall selection instead of entrance proximity dominating.
- Dynamic queue management: per-stall counts, automatic direction, player-authored bends, reserved positions, and obstacle-safe movement.
- Operational build mode: place, inspect, move, rotate, remove/sell, undo, paint preferred guest lanes, edit queues, and expand while protecting navigation and migrating the live perimeter, entrance, and exit.
- Code-native visual system: 80 distinct placeable contracts, 12 layered stall identities with unique vendor workwear/tools/actions, active-menu food displays, 46 food/vessel recipes with unique primary references, twelve archetype appearances, all 11 lifecycle poses, carried/seated meals, queue overlays, high-contrast separation, and reduced-motion-safe animation. Automated uniqueness and recipe checks do not constitute human visual or cultural approval.
- Meaningful facilities and signage: spatial/global wayfinding, patience, movement, turnover, cleanliness, ambience, satisfaction, tray-return, and facility effects are surfaced and applied by the simulation.
- Economy/progression, onboarding, objectives, diagnostics, accessibility settings, procedural audio, local saves, PWA manifest, offline fallback, and update-ready flow.
- Reviewed nutrition variants, fictional customer intents, order-time variant snapshots, neutral serving feedback, daily nutrition objectives, contextual Singapore-adult reference data, and an explicit educational-not-medical-advice disclosure.

## Remaining NO-GO gates

1. Record the validated source commit plus current artifact payload/hash, then run the artifact's critical path in current stable Chrome and record browser/OS version, viewport/zoom, screenshots, console/network state, save/reload, responsive behavior, and measured performance. Include the full-frame redraw/text-recreation path in profiling. Record Edge and Firefox smoke results or explicit limitations.
2. Verify first-load caching, reload, browser restart, saving while offline, and service-worker update/rollback behavior on the exact production artifact and origin.
3. Complete and record human Singapore cultural review.
4. Complete and record human accessibility/assistive-technology review.
5. Complete and record independent security review (or accountable written waiver) and qualified legal/privacy review.

## Evidence rule

Do not translate "implemented," "compiled," or "unit-tested" into an exact-production browser, accessibility, cultural, legal, security, or compliance claim. Before approval, add the outstanding build, browser/offline, and human-review records to the release evidence.
