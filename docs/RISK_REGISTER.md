# Risk Register

Scale: probability and impact are Low / Medium / High. Owner is the solo developer unless marked Human review.

| ID | Risk | P | I | Mitigation / trigger | Status |
|---|---|---|---|---|---|
| R-01 | Scope exceeds solo capacity | H | H | Lock 1.0 non-goals; data-driven reuse; phase gates; cut optional polish first | Open |
| R-02 | Customer reservation/path deadlock | H | H | Explicit ownership/release, map revisions, stuck recovery, seeded soak assertions | Open |
| R-03 | Save corruption or migration loss | M | H | Staging/current/backup, checksum, fixtures, non-destructive failure UI | Open |
| R-04 | Service-worker mixed versions or stale shell | M | H | Atomic precache, version manifest, waiting-worker save/reload, update E2E | Open |
| R-05 | Cultural flattening, misattribution, or certification misuse | M | H | CULTURAL_REVIEW checklist, no marks/claims, compensated human review | Open; release blocker |
| R-06 | Canvas blocks keyboard/screen-reader access | H | H | DOM command layer, grid cursor, reason summaries, human AT audit | Open |
| R-07 | 120/60 proposed customer caps miss frame budget | H | M | Benchmark sweep, stagger AI, revision-safe path cache, lower documented cap | Open |
| R-08 | Phaser/React lifecycle leak on navigation/HMR | M | M | One host instance, destroy on unmount, mount/unmount regression test | Open |
| R-09 | Procedural art reads as placeholder or culturally generic | M | H | Art bible, silhouette/scale QA, final screenshot review, human art/culture review | Open |
| R-10 | Required 80 items are shallow recolours | M | H | Meaningful-difference rule and duplicate/content validator | Open |
| R-11 | Dependency vulnerability/license issue | M | H | Locked versions, audit triage, notices/license inventory, remove unused packages | Open |
| R-12 | Existing starter assets/code leak into production | M | M | Built-output asset/route scan; remove unused template UI/assets | Open |
| R-13 | PWA install/cache fails on Sites origin | M | H | Preview-origin HTTPS/offline/update test before promotion | Open |
| R-14 | Browser feature differences break saves/audio/WebGL | M | M | Chrome primary plus Edge/Firefox matrix, visible degradation | Open |
| R-15 | Economy has grind, exploit, or unrecoverable state | M | H | Pure formulas, seeded simulations, novice playtest, recovery grant | Open |
| R-16 | Data definitions and docs diverge | H | M | Runtime validators, generated count report, doc reconciliation per phase | Open |
| R-17 | False compliance or release-readiness claim | M | H | Checklist evidence; explicit external gates; human go/no-go | Mitigated, monitor |
| R-18 | Imported save causes XSS/resource exhaustion | L | H | Size/count/range validation; text-only rendering; no evaluation/HTML | Open |
| R-19 | Audio cannot be sourced license-cleanly in scope | M | M | Prefer synthesized/code-authored cues; provenance row per file; allow silent beta | Open |
| R-20 | Exact stable Chrome changes before release | H | M | Record exact version only during final RC test and retest if updated | Open |
| R-21 | Health ratings or chronic-condition traits are mistaken for medical advice, stigmatize customers, or moralize a cuisine | M | H | Separate Health from Star ratings; assign conditions independently of archetype/demographics; explain nutrients considered; bound gameplay effects; retain educational disclosure; require cultural/accessibility/content review | Open; release blocker |
| R-22 | Nutrition source drift, serving mismatch, or incorrect dish/variant mapping produces misleading values | M | H | Pin source and row hashes; require curated mappings and provenance; validate serving scaling/ranges; quarantine malformed rows; rerun deterministic importer and review source changes | Open |

Review at each phase boundary and whenever a trigger occurs. Closed risks retain evidence and date; they are not deleted.
