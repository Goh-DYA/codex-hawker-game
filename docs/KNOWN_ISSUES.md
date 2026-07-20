# Known Issues

Status: Release-candidate verification list; not a customer-facing production issue list

## Remaining release blockers

1. **Content `1.3.0` release and browser QA is incomplete.** The working source now defines 14 stalls, 54 dishes, and 104 released nutrition profiles, but the retained supported-runtime release gate, production builds, and development-browser screenshots apply to earlier content. The complete gate and both builds must be rerun, then current stable Chrome critical-path evidence, console/network review, viewports/zoom, save/reload, resize/suspension/WebGL-loss behavior, and measured browser performance must be recorded on the exact artifact. Edge/Firefox smoke results are also absent.
2. **Real offline/PWA behavior is unverified on the replacement artifact.** First-load cache population, offline reload, browser restart, offline saving, waiting-worker update, mixed-version avoidance, and rollback must be exercised on the final origin.
3. **Human Singapore cultural review is pending.** Internal research and safeguards do not substitute for Singapore-informed review.
4. **Human accessibility and assistive-technology review is pending.** Keyboard, screen-reader, zoom/reflow, contrast, reduced-motion, focus, and audio-equivalence behavior needs human verification in the exact browser build.
5. **Independent security and qualified legal/privacy review are pending.** Internal controls, tests, notices, and zero-vulnerability dependency-audit results are evidence inputs, not an approval or compliance claim.

## Open gameplay balance issues

- **The 120-second visit cap can interrupt already-served guests.** In a deterministic 360-second starter-layout run, 33 served guests reached the cap while eating or walking to a tray return. Their route-efficiency ratings now remain valid because only walked distance contributes, but meal completion and tray-return timing need a separate balance pass against the authored preparation and eating durations.
- **Some authored persona fields remain future hooks.** Budgets, patience, walking speed, stall-choice sensitivities, novelty, dish preferences, progression gates, and visit schedules are active. Seat preference, group range, satisfaction modifiers, spend multiplier, and tray-return chance are validated content metadata but do not yet alter the simulation.

## Implemented but awaiting exact-production evidence

- The working source defines code-native contracts for 80 placeables, 14 stalls, 54 dishes, 12 archetypes, and 11 customer states. The two new stall and eight new dish treatments still need the current automated recipe pass and exact-production gallery; automated contracts will not replace final human visual/cultural review.
- Per-stall queue counts, automatic direction, editable bends, obstacle-safe reserved queue cells, and customer movement through the resulting cells are implemented and covered by core tests. Long-running browser crowd behavior and extreme player-authored layouts still require soak/playtest evidence.
- Expansion migrates the former right/bottom perimeter outward, projects entrance/exit points to the new boundary, refreshes exiting paths, and restores endpoints on undo. Core regressions and development-browser expansion screenshots pass; exact-production save/reload and repeated-expansion play remain open.
- Signage/facilities now apply visible, documented effects such as wayfinding, patience, movement, turnover, cleanliness, ambience, satisfaction, and tray-return support. Balance tuning across a complete progression playthrough is not yet accepted.
- IndexedDB, service-worker, accessibility, audio-degradation, and security-header implementations retain automated coverage, but final browser/fault-injection evidence must target the replacement artifact.
- The current Node benchmark passes with 80 active agents over 1,200 fixed steps, but it cannot establish Phaser FPS, TTI, memory stability, or a supported browser customer cap.
- The renderer still uses full-frame redraw and recreates text during frame rendering. This browser CPU/allocation path is outside the Node benchmark and requires profiling and, if budgets are missed, optimization before performance approval.

## Previously listed concerns closed by implementation or current automated evidence

- Entrance-nearest-stall crowding is mitigated by a deterministic score that accounts for preference, quality, price, wait, novelty, scaled distance, and global wayfinding; comparable stalls and preference-over-distance behavior have regression tests.
- Straight queues through furniture are replaced with obstacle-aware automatic paths and validated custom routes; every admitted customer is asserted to receive walkable route cells.
- Expansion no longer leaves the old right/bottom boundary as an internal seam, and customers do not despawn at the old exit after expansion.
- Furniture and facilities are no longer represented only by category-identical graphics: all 80 placeable IDs have distinct visual contracts/motifs and catalogue previews.
- Customers visibly carry and consume dish-specific food/vessel graphics; all authored dish metadata is consumed by the visual recipe layer.
- Signage and facility utility is no longer presentation-only: every authored signage/facility item maps to at least one simulation effect.
- Validators and regressions remain present for launch counts, lifecycle recovery, save migration, economy/progression, undo, and deterministic soak behavior; the content `1.3.0` full run still needs to be recorded.

## Reporting rule

Do not remove a remaining blocker without a dated evidence record. Development-browser screenshots demonstrate targeted visual behavior; they do not replace an exact-production critical-path, offline, performance, accessibility, cultural, legal, or security review.
