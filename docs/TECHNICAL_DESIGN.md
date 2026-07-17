# Technical Design

Status: Accepted architecture implemented in the release candidate; browser verification pending
Decision records: adr/0001, adr/0002, adr/0003

## Stack

- TypeScript 5.9 with strict project settings.
- Phaser 4.2.1 for the game canvas, input, camera, and rendering.
- React 19 inside the existing Vinext 0.0.50 / Vite 8 / Sites-hosted application for accessible shell UI, panels, settings, and lifecycle.
- Zod 4 for runtime content and save validation.
- IndexedDB through idb 8 for local-first persistence.
- Vitest 4 for unit, integration, content, save, and simulation tests; browser QA remains a separate release gate.
- A versioned service worker and web manifest for the production offline shell.

Versions are lockfile-pinned. Version selection does not imply that compatibility or vulnerability review is complete.

## Runtime boundary

React owns semantic UI, routing, settings, modals, focus, announcements, and the canvas container. A client-only game host creates exactly one Phaser game after mount and destroys it on unmount. Phaser owns the world scene and visual input. A typed bridge exchanges commands and read-only view snapshots; React never mutates simulation entities and Phaser never creates essential DOM controls.

## Domain layout

- src/content: schemas, launch definitions, localization, deterministic nutrition snapshot, and reference validation.
- src/game/world and building: coordinates, footprints, placement commands, undo.
- src/game/navigation: walkability grid, A-star, path invalidation and cache.
- src/game/customers, queues, seating, stalls: explicit state machines and reservations.
- src/game/economy and progression: pure calculations and unlock predicates.
- src/game/simulation: fixed-step scheduler, seeded random source, events, metrics.
- src/game/rendering and scenes: Phaser adapters, procedural assets, camera, overlays.
- src/game/persistence: save DTOs, validation, migration, backup, recovery.
- src/ui: React panels and accessibility adapters.
- public: manifest, icons, service worker, and immutable runtime assets.

The exact folder tree may evolve, but pure domain modules must not import Phaser or React.

## Simulation model

Rendering is variable-rate; gameplay advances on a fixed 10 Hz simulation step with a capped catch-up count. Expensive agent decisions are staggered. Randomness comes from an injectable seeded generator. Customer state transitions are pure or command-driven and produce typed events.

Grid coordinates are integers. World conversion is centralized. Navigation uses four-way A-star with deterministic tie-breaking, a monotonically increasing map revision, and path-cache keys that include the revision. Changes invalidate affected paths and reservations. Object pooling is used only after profiling identifies allocation pressure.

## State ownership

Persistent state:

- Player: cash, experience, reputation, level, settings-safe preferences.
- Map: unlocked cells and placed object instances with stable instance IDs.
- Progression: unlocks, objectives, tutorial state, stall upgrades, active menus.
- Nutrition: active reviewed variants plus aggregate and bounded recent-serving metrics; order-time profiles are snapshotted for historical stability.

Runtime-only state:

- Customers, paths, queue and seat reservations, timers, effects, derived counters, UI selection, and debug overlays.

Commands validate before mutation and commit all related changes atomically. Events inform presentation and derived-stat systems. Save snapshots never serialize transient Phaser objects.

## Content contracts

Content definitions include stable IDs, localization keys, footprints, rotations, interaction points, depth anchors, visual/audio references, economy values, unlock requirements, and explicit nutrition profile/variant status. Nutrition source rows are joined only by authored exact mappings during a deterministic build-time import; raw CSV parsing and fuzzy matching never run in the browser. Development startup and tests perform Zod parsing, cross-reference checks, uniqueness checks, nutrition plausibility checks, localization completeness, and exact launch counts. A malformed production definition fails to a readable safe screen, never a partially loaded simulation.

## Persistence

IndexedDB stores two last-known-good save slots plus metadata. The write sequence is validate snapshot → write staging record in one transaction → read/verify checksum → promote current and retain previous. Saves include schemaVersion, contentVersion, timestamp, payload, and checksum. Autosave is debounced, runs after important build/progression actions and at a safe interval, and surfaces quota/private-mode failures.

Load order is current → backup → new-game prompt. Migrations are one-way pure functions with fixtures. Removed content maps through an explicit ID alias or converts safely to recoverable cash; runtime customers normalize to an empty centre while player/map/progression state is preserved.

No save is deleted during a cache update. Reset requires confirmation and clears only game-owned IndexedDB/cache data.

## Offline and update model

The service worker precaches the hashed application shell and minimum runtime assets generated by the production build. Runtime caching is same-origin only. Navigation falls back to the cached shell. Cache names contain a release manifest version; activation keeps the active version until all required new entries succeed, then removes old application caches. The UI detects a waiting worker and offers a safe “save and reload” action.

Development output, source maps not intended for release, environment files, and secrets are excluded. Mixed code/content versions cause a controlled reload or migration message.

## Failure handling

- WebGL loss pauses and attempts Phaser restoration; a persistent message offers reload.
- Visibility suspension pauses catch-up rather than simulating an unbounded elapsed interval.
- Resize and zoom recalculate viewport/UI without changing grid state.
- Storage, audio, and service-worker failures degrade independently and visibly.
- A top-level error boundary preserves export/reset support when the game scene fails.

## Debug and observability

Development-only flags expose tile coordinates, collisions, walkability, interaction cells, queue slots, reservations, agent state/path, spawn controls, time scale, currency/unlocks, save inspection, content checks, and frame/simulation counters. Production builds default these off and do not expose economy mutation controls.

No analytics or telemetry ships in 1.0. Local benchmark and error summaries may be exported manually by the player.

## Verification

Required commands are documented in TEST_PLAN.md and DEPLOYMENT.md. The architecture is not accepted for release until production build, offline reload, save recovery, current stable Chrome, secondary browsers, and performance budgets are verified with recorded evidence.
