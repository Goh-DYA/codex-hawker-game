# Known Issues

Status: Release-candidate verification list; not a customer-facing production issue list

## Remaining release blockers

1. **Exact-production browser QA is incomplete.** A targeted development-browser visual pass and screenshots exist, and the final production artifact passes build/SSR/HTTP smoke, but current stable Chrome critical-path evidence, console/network review, viewports/zoom, save/reload, resize/suspension/WebGL-loss behavior, and measured browser performance must be repeated on that artifact. Edge/Firefox smoke results are also absent.
2. **Real offline/PWA behavior is unverified on the replacement artifact.** First-load cache population, offline reload, browser restart, offline saving, waiting-worker update, mixed-version avoidance, and rollback must be exercised on the final origin.
3. **Human Singapore cultural review is pending.** Internal research and safeguards do not substitute for Singapore-informed review.
4. **Human accessibility and assistive-technology review is pending.** Keyboard, screen-reader, zoom/reflow, contrast, reduced-motion, focus, and audio-equivalence behavior needs human verification in the exact browser build.
5. **Independent security and qualified legal/privacy review are pending.** Internal controls, tests, notices, and zero-vulnerability dependency-audit results are evidence inputs, not an approval or compliance claim.

## Implemented but awaiting exact-production evidence

- All 80 placeables, 8 stalls, 30 dishes, 8 archetypes, and 11 customer states have code-native visual contracts; food is rendered while carried and eaten, and reduced-motion poses are deterministic. Automated recipe coverage is exhaustive, while final human visual/cultural review remains open.
- Per-stall queue counts, automatic direction, editable bends, obstacle-safe reserved queue cells, and customer movement through the resulting cells are implemented and covered by core tests. Long-running browser crowd behavior and extreme player-authored layouts still require soak/playtest evidence.
- Expansion migrates the former right/bottom perimeter outward, projects entrance/exit points to the new boundary, refreshes exiting paths, and restores endpoints on undo. Core regressions and development-browser expansion screenshots pass; exact-production save/reload and repeated-expansion play remain open.
- Signage/facilities now apply visible, documented effects such as wayfinding, patience, movement, turnover, cleanliness, ambience, satisfaction, and tray-return support. Balance tuning across a complete progression playthrough is not yet accepted.
- IndexedDB, service-worker, accessibility, audio-degradation, and security-header implementations retain automated coverage, but final browser/fault-injection evidence must target the replacement artifact.
- The current Node benchmark passes with 80 active agents, but it cannot establish Phaser FPS, TTI, memory stability, or a supported browser customer cap.

## Previously listed concerns closed by implementation or current automated evidence

- Entrance-nearest-stall crowding is mitigated by a deterministic score that accounts for preference, quality, price, wait, novelty, scaled distance, and global wayfinding; comparable stalls and preference-over-distance behavior have regression tests.
- Straight queues through furniture are replaced with obstacle-aware automatic paths and validated custom routes; every admitted customer is asserted to receive walkable route cells.
- Expansion no longer leaves the old right/bottom boundary as an internal seam, and customers do not despawn at the old exit after expansion.
- Furniture and facilities are no longer represented only by category-identical graphics: all 80 placeable IDs have distinct visual contracts/motifs and catalogue previews.
- Customers visibly carry and consume dish-specific food/vessel graphics; all authored dish metadata is consumed by the visual recipe layer.
- Signage and facility utility is no longer presentation-only: every authored signage/facility item maps to at least one simulation effect.
- Exact launch counts, lifecycle recovery, save migration, economy/progression, undo, and deterministic soak checks remain automated.

## Reporting rule

Do not remove a remaining blocker without a dated evidence record. Development-browser screenshots demonstrate targeted visual behavior; they do not replace an exact-production critical-path, offline, performance, accessibility, cultural, legal, or security review.
