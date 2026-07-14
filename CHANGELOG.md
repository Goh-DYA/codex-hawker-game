# Changelog

All notable project changes are recorded here. The project is pre-release; semantic version numbers in package/cache metadata do not imply release acceptance.

## Unreleased — release candidate

### Added

- Adaptive uncapped guest demand, rolling 0–100 visit ratings, three daily objectives, permanent centre milestones, and open-ended stall mastery with authored upgrades.
- Multiple movable boundary entrances/exits with atomic validation, undo, multi-route spawning, and schema-v3 save migration.
- A 10× simulation option and an original state-aware procedural soundtrack with separate master mute, music, ambience, and effects controls.
- Complete React/Phaser Hawker Simulator interface, top-down game world, onboarding, build catalogue, stall/dish menu management, objectives/insights, expansion, settings, accessibility controls, and local save tools.
- Deterministic fixed-step customer lifecycle with queueing, ordering, collection, seat reservation, dining, tray return, exit, target recovery, economy, XP, reputation, levels, and unlock reconciliation.
- Exact launch catalogue of 8 original stalls, 30 dishes, 80 meaningful placeables, 8 customer archetypes, and 252 English localization entries.
- Code-native illustrated rendering and procedural WebAudio cues/ambience with original project identity.
- IndexedDB current/backup envelopes, checksums, serialized writes, migrations, backup recovery, import/export, and confirmed reset flow.
- PWA manifest, offline fallback, deterministic content-derived service-worker cache version, acknowledged runtime warming, and save-gated update activation.
- Vitest coverage for content, grid/pathfinding, commands/economy, lifecycle/recovery, persistence/migrations, deterministic soak, and the 80-agent simulation budget.
- Rendered production-output checks for the release shell, security headers, PWA protocol, and absence of starter-facing copy.
- Product, game design, technical, art, content, economy, accessibility, cultural-review, test, performance, security/privacy, deployment, release, support, risk, and project-status documentation plus ADRs.

### Changed

- Replaced the Sites starter-facing experience with the original Hawker Simulator release candidate.
- Selected orthographic top-down, shape-led illustrated 2D as the final launch perspective and visual system.
- Deferred Phaser/runtime code from the initial React shell and added standard/lower-end runtime budgets.
- Hardened worker headers, save validation/recovery, cache ownership/update behavior, responsive layout, focus handling, and production debug exclusion during integration review.

### Security and privacy

- The candidate excludes accounts, analytics, trackers, payments, advertising, chat, and cloud saves.
- Imported content is bounded/validated, player data remains local, and the host worker applies CSP, permissions, referrer, content-type, and framing headers.
- Final clean install and both all-dependencies and production-only audits reported 0 vulnerabilities after patched build-tool pins and narrow transitive overrides.

### Known limitations and release gates

- Real-browser critical-path, offline/update, browser performance, long-soak, and secondary-browser evidence is unavailable for the exact candidate.
- Human Singapore cultural and accessibility review, independent security review, and qualified legal/privacy review are pending.
- No production approval, certification, or compliance claim is made until the release checklist is complete.
