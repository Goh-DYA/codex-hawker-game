# Decision Log

Status: Active; architecture decisions have detailed ADRs under docs/adr

| ID | Decision | Rationale | Status |
|---|---|---|---|
| D-001 | TypeScript + Phaser 4.2.1 embedded in React/Vinext/Vite/Sites | Browser-native tooling, solo productivity, game rendering plus accessible DOM UI, existing host integration | Accepted |
| D-002 | Orthographic top-down square grid | Highest build clarity, low occlusion/depth burden, four-direction animation, accessible overlays | Accepted |
| D-003 | Shape-led vector-like illustrated 2D generated from code/procedural recipes | Reproducible, license-clean, performant, consistent across 80 items | Accepted |
| D-004 | Local-first IndexedDB; no gameplay backend/accounts | Offline requirement, privacy minimization, static-host feasibility | Accepted |
| D-005 | Versioned service worker with safe update prompt | Core offline play while protecting save/cache version compatibility | Accepted, verification pending |
| D-006 | React owns semantic UI; Phaser owns the world canvas | Clear lifecycle/state boundary and keyboard/screen-reader support | Accepted |
| D-007 | Fixed 10 Hz simulation independent of render | Determinism, seeded testing, stable behavior across quality tiers | Provisional until profiling |
| D-008 | Four cardinal character facings with restrained frame counts | Solo-sustainable animation without sacrificing route readability | Accepted |
| D-009 | One cash currency, XP, and reputation; no monetization in 1.0 | Ethical, fully free progression and no privacy/payment dependency | Accepted |
| D-010 | Eight fictional stalls / 30 dishes / 80 meaningful placeables / eight behavior archetypes | Minimum launch contract; avoids palette-only count inflation | Accepted |
| D-011 | English launch UI; reviewed multilingual environmental text only | Prevent inaccurate scripts/translations | Accepted |
| D-012 | No analytics or telemetry in 1.0 | Privacy minimization and full offline operation | Accepted |
| D-013 | Vitest for pure logic/content/save/simulation tests plus real browser QA | Fast deterministic coverage while retaining target-browser evidence | Accepted |
| D-014 | Accessibility target is WCAG 2.2 AA where applicable, not a present conformance claim | Concrete design bar with honest canvas/human-audit limits | Accepted |
| D-015 | Package version does not determine release state | Prevent premature 1.0 claims; checklist and signed evidence decide release | Accepted |

## Decision changes

A reversal requires a new ADR when it affects persistence, content IDs, rendering perspective, offline behavior, accessibility boundary, or release compatibility. Small balance changes belong in the changelog and data review, not an ADR.
