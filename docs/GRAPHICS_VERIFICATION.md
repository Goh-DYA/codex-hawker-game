# Graphics and Gameplay Verification

Verification date: 2026-07-12

Status: **Current-source release gate and automated graphics coverage passed; targeted development-browser visual evidence captured; exact-production visual review remains open.**

## Evidence boundary

- Final release checks pass on the current source: typecheck, lint, 11 Vitest files / 61 tests, production build, and two rendered-output/offline-shell tests.
- The 61 tests include exhaustive visual-recipe, utility, queue-selection/routing, cross-stall queue-layout, queue-flow diagnostics, expansion, active-order preservation, and 80-agent benchmark coverage.
- Eight browser screenshots were captured from the development build and are indexed below.
- The screenshots predate the final audit fixes for globally unique queue anchors, live-order-preserving reroutes, utility-adjusted meal depletion, and the restored route overlay; those fixes have final-source automated/static coverage but still require a fresh exact-production visual pass. The screenshots are targeted evidence, not a performance, accessibility, or cultural approval.
- Replacement artifact: `dist/`, 35 files / 13,772,093 bytes, service-worker build `3e25823ed59c`, deterministic file-manifest SHA-256 `3fbd941195ed69d51198940b64ce8007aa5d8133d8f9777fa4174c24d067d2db`.

## Verification matrix

| Artifact or behavior | Implementation in place | Current evidence | Status / remaining visual gate |
|---|---|---|---|
| 80 placeables and furniture variety | Per-ID semantic recipe, motif, accent, maker mark, silhouette/detail treatment, world renderer, and catalogue preview | `tests/visual-recipes.test.ts` asserts exactly 80 distinct visual contracts/motifs; starter catalogue capture shows varied previews | **Pass automated;** exhaustive human inspection of every placed item on the replacement artifact remains open |
| 8 stall identities | Eight fictional stall definitions render with identity-specific colour, fascia, sign, counter, and motif rules | Content validator asserts 8 stalls; renderer recipe review covers all eight; starter/live captures exercise both starter stalls | **Implemented;** exact-production gallery of all eight remains open |
| 30 dishes, vessels, and food while eating | Dish recipes consume authored food sprite, container sprite, portion colour, garnish/steam, carried tray, seated meal, tableware, and depletion states | Visual-recipe test covers all 30 metadata contracts; live-service capture exercises visible food/service states | **Pass automated and sampled visually;** human review of all 30 dishes remains open |
| 8 customer archetypes | Archetype visual rules vary body/garment/accessory proportions and are linked to preference/behavior data | Visual-recipe test asserts eight unique archetype signatures; live captures exercise mixed visitors | **Pass automated and sampled visually** |
| 11 lifecycle states and animation | `choosing-stall`, `walking-to-queue`, `queued`, `ordering`, `waiting-for-food`, `seeking-seat`, `walking-to-seat`, `eating`, `seeking-tray-return`, `walking-to-tray-return`, and `walking-to-exit` map to distinct poses/cues; tick changes motion and reduced-motion freezes it | Visual-recipe test asserts all 11 signatures, tick variation, and reduced-motion determinism; live captures sample movement, queueing, seating, and eating | **Pass automated and sampled visually;** recorded exact-production reduced-motion comparison remains open |
| Balanced stall choice | Preference, quality, price, queue load/preparation, novelty, scaled distance, and wayfinding contribute to deterministic selection | Core regression balances comparable stalls and confirms preferences can beat modest distance | **Pass automated;** long crowd-distribution playtest remains open |
| Queue overlay and count | Renderer uses the exact core queue cells and draws connected lines, reserved cells, direction, and per-stall count badges including zero | Queue-routing/live captures plus queue core tests | **Pass automated and visually sampled** |
| Queue editor and bends | Stall panel exposes cardinal automatic directions and `Bend line`; world edit mode appends/trims adjacent custom cells and persists them | Custom-path acceptance/rejection/persistence tests; queue-editing and custom-queue captures | **Pass automated and visually sampled** |
| Queue and customer obstacle avoidance | Automatic queue routes self-avoid around blocked/reserved tiles; customers reserve a queue position before walking and advance cell by cell | Core test places furniture in the nominal line and asserts the bend; every admitted customer's queue route is asserted walkable | **Pass automated;** extreme player-layout soak remains open |
| Cross-stall queue ownership | Global planning protects every open stall anchor, validates custom paths first, allocates automatic tails by stable ID, ignores closed stalls, and reconciles all live queues after any geometry mutation | Reversed insertion, crossing custom routes, foreign-anchor claims, closed stalls, custom-first reroutes, live queue shortening, active orders, undo, and placement-driven reflow have regressions | **Pass automated** |
| Expansion seams, walls, entry, and exit | Expansion removes the former right/bottom seam, moves the perimeter outward, projects entrance/exit to the live boundary, refreshes leaving routes, and restores endpoints on undo | Core tests cover perimeter/endpoint migration and old-exit non-despawn; first/wide/repeated expansion captures show the live enlarged hall | **Pass automated and visually sampled;** exact-production save/reload and repeated-expansion play remain open |
| Signage/facility utility | Authored modifiers/roles/tags map to spatial/global wayfinding, patience, movement, turnover, cleanliness, ambience, satisfaction, tray-return, water/waste, first-aid, power, and cleaning effects; catalogue surfaces the primary effect | `tests/utility-effects.test.ts` asserts all 14 signage/facility definitions have nonzero utility, all signs provide wayfinding, spatial falloff works, and satisfaction remains bounded | **Pass automated;** full-progression balance tuning remains open |
| Game-state UI and movement cues | Planning/open state, queue edit state, stall queue panel, expansion action, customer pose/status cues, carried food, and table meals are connected to the current simulation snapshot | Starter, live-service, custom-queue, queue-editing, and expansion captures; lifecycle/core invariant tests | **Pass targeted review;** exact-production responsive/accessibility review remains open |
| Guest-route overlay | Renderer derives a dashed entrance-to-live-exit route from the current blocked map; no original-plot seam is drawn after expansion | Final source review plus pathfinding/expansion regressions | **Implemented;** fresh exact-production capture remains open |

## Screenshot evidence

All captures are stored outside the shipped repository under:

`C:/Users/Adison/.codex/visualizations/2026/07/12/019f543a-9ffd-7473-bb6e-226bbeb5d355/`

| Capture | Evidence focus |
|---|---|
| `hawker-starter.png` | Planning state, starter hall, two distinct stall identities, varied furniture/catalogue previews, queue overlay legend |
| `hawker-live-service.png` | Open-centre state, 24 active visitors, both stall queues, mixed customer poses, occupied seating, meal/service graphics |
| `hawker-queue-routing.png` | Automatic queue-cell routing and live movement around the furnished hall |
| `hawker-queue-editing.png` | In-world queue edit mode and connected editable cells |
| `hawker-custom-queue.png` | Per-stall queue counts, cardinal controls, custom-path status, and bend controls |
| `hawker-expanded.png` | First expansion with updated floor/perimeter composition |
| `hawker-expanded-wide.png` | Enlarged hall framing and projected boundary after further expansion |
| `hawker-expanded-twice.png` | Repeated expansion state, live customers, and expansion control/insight context |

## Exact-production checks still required

1. Repeat the visual smoke on the frozen artifact at 1280 x 720 and 1024 x 640, plus required zoom/text-scaling levels.
2. Record browser/OS/GPU, DPR, console errors/warnings, unexpected network activity, resize/suspension/WebGL recovery, and save/reload results.
3. Exercise all eight stalls and a representative item from every placeable category in-world, then inspect all 30 meals and reduced-motion animation in motion.
4. Run repeated expansion plus queue edits through save/reload and a long crowd soak; verify customers leave only at the live exit and never traverse furniture.
5. Complete the human visual, accessibility, and Singapore cultural reviews before production approval.
