# Test Plan

Status: Release-candidate test matrix; execution evidence belongs in `TEST_REPORT.md`
Primary browser: current stable desktop Google Chrome, exact version recorded at execution

## Quality gates

A release candidate requires a clean install, lint/type checks, production build, unit/integration/content suites, browser critical path, offline and save recovery, accessibility checks, performance benchmark, and a regression pass with no open critical/high defects.

Commands are expected to converge on:

    npm ci
    npm run lint
    npm run typecheck
    npm test
    npm run build
    npm run dev

Only scripts present in package.json may be reported as run. Missing scripts are implementation tasks, not implicit passes.

## Automated test inventory

### World and build

- Grid/world conversion round trips at edges and zoom-independent coordinates.
- Rotated footprints and collision cells for every allowed rotation.
- Bounds, overlap, locked-area, entrance, exit, and interaction-point validation.
- Place, move, rotate, store, sell, expansion, cancel, and multi-step undo.
- Atomic rejection leaves cash, map revision, reservations, and selection unchanged.
- Entrance and every active stall/service/seat/return interaction remain reachable.

### Navigation and reservations

- Four-way A-star shortest/valid path, deterministic tie-breaking, no-path result.
- Preferred-route weighting changes a practical path deterministically without creating a hard waypoint; distant/incomplete guides retain safe fallback routing.
- Route-guide validation, canonicalization, live-path invalidation, placement/queue reservation, persistence, clearing, and multi-step undo.
- Map revision invalidates cache and active affected paths.
- Queue slot reservation/order/advance/release; no duplicate owners.
- Seat selection, group capacity, reservation release, and abandoned visit cleanup.
- Stuck detection bounded retries and safe departure.
- Stall closure/move, seat move/removal, destination deletion, and map edit during walking.

### Customer simulation

- Every legal lifecycle transition and every illegal transition rejection.
- Stall choice term sensitivity: preference, price, queue, quality, novelty, distance.
- Seat choice term sensitivity: path, group, comfort, cleanliness, congestion.
- No available stall, unaffordable dish, no seat, all exits stressed, and centre close.
- Deterministic seeded results and agent despawn.

### Economy and progression

- Sale/cost/upkeep rounding, satisfaction bounds, XP/reputation, upgrade effects.
- Unlock graph, exact prerequisites, objective completion idempotency.
- Resale/undo accounting and recovery grant eligibility.
- No negative cash from passive upkeep and no infinite reward loop.

### Content

- Zod parse and safe error for malformed definitions.
- Unique IDs/keys and valid cross-references.
- Exact 12 stalls, 46 dishes, 80 placeables, 12 archetypes, and 300 English localization entries.
- Every dish assigned, every stall has a menu item available at its unlock, every required English key present, no unlock cycles.
- Footprint/interaction/depth anchors valid, every referenced visual/audio/animation known, and every stall/dish primary visual reference unique.
- Catalogue duplicate policy check.

### Stall graphics and animation

- All 12 stall visual recipes are deterministic and materially distinct in facade layers, equipment, counter treatment, food/drink display, and vendor treatment rather than palette alone.
- Every displayed food or drink prop resolves to a dish in that stall's active menu; enabling or disabling a dish updates the display deterministically and never leaks another stall's menu item.
- Vendor animation recipes consume each stall's authored idle, preparation/cooking, and serving references; full-motion poses vary by tick while reduced-motion poses have zero body, arm, utensil, prop, and steam offsets and remain tick-invariant.
- Closed stalls render an opaque shutter state that hides the vendor and service props; open/closed changes do not alter simulation state beyond the existing operational command.
- Stall drawing geometry remains inside both compact and large rotated footprints and preserves the vendor-behind-counter, props-in-front, shutter-on-top layer order.

### Persistence

- Serialize/deserialize round trip and checksum rejection.
- Atomic current/backup promotion and failed-write recovery.
- Version fixtures migrate one step and end-to-end.
- Renamed/removed objects and dishes, added required fields, changed map size/upgrades.
- Unsafe runtime customers normalize without losing map/economy/progression.
- Quota error, denied/private storage, refresh during save, reset isolation.

### Offline shell and UI

- Manifest and required service-worker assets are build outputs.
- Precache manifest has no development paths, secrets, or cross-origin core assets.
- Offline navigation shell responds after first successful load.
- Waiting-worker update does not activate before a safe reload.
- React error/loading states, modal focus, settings persistence, and reset confirmation.

## Browser end-to-end scenarios

1. Clear site data; load the production build and start a new game.
2. Complete or deliberately skip/replay the tutorial.
3. Keyboard-place a table, seats, tray return, and stall; verify invalid placement feedback.
4. Paint a preferred guest lane with pointer and keyboard controls; verify predicted-path shift, clear, undo, save/reload, and Escape speed restoration.
5. Configure a menu and open the centre.
6. Observe one customer complete order, seat, eat, tray/clear, and exit.
7. Confirm cash/XP/reputation change and inspect the reason breakdown.
8. Move an active target and verify recovery.
9. Save, reload, and compare persistent map/progression/economy state.
10. Change text scale, reduced motion, audio, and quality mode; reload.
11. Install/cache once, go offline, reload, continue, save, and reload again.
12. Trigger update flow with a second build; preserve save.
13. Reset with cancel first, then confirm; verify only game-owned data is cleared.

Run at 1280 × 720 and 1024 × 640, plus zoom levels in ACCESSIBILITY.md.

### Stall graphics browser matrix

1. Place all 12 stall identities in a deterministic gallery and capture each open facade at useful game zoom. Verify roof, fascia, sign, wall, window, counter, equipment, trim, props, and vendor form a readable layered scene and no two stalls are distinguishable by palette alone.
2. For every stall, compare the visible display with its active menu, disable at least one displayed dish, enable another valid dish, and verify the food/drink props update without showing an unavailable or cross-stall item.
3. Close and reopen the centre. Verify every closed shutter completely masks the vendor and work props, every reopened scene returns, and labels/queue overlays remain readable in both states.
4. Cover compact 3 x 2 and large 5 x 3 stalls, including representative 0-, 90-, 180-, and 270-degree placements. Check clipping, counter-facing placement, service-point clarity, vendor containment, and prop overlap.
5. At full motion, observe deterministic idle, preparation/cooking, and serving actions long enough to see each cycle. Pause and resume without a phase jump that clips the vendor through the counter or equipment.
6. Enable reduced motion through both the OS preference and in-game setting while open and while paused. Verify vendor body, arm, utensil, prop, and steam offsets freeze immediately in a stable pose, with no gameplay timing or textual state change.
7. Compare normal and high contrast at 100% and 200% zoom. Verify stall silhouettes, food vessels, vendors, counters, shutters, names, and open/closed state remain distinguishable without colour alone.
8. Repeat the all-stall scene in lower quality at 1024 x 640 and standard quality at 1280 x 720, then run it with a representative 80-guest crowd. Record console output, frame-time, allocation, memory trend, clipping, flicker, and any missing vendor or menu prop; do not infer renderer performance from the headless simulation benchmark.

## Soak and adversarial simulations

Use seeded headless/fixed-step runs for 30 simulated in-game days and at least one two-hour real browser soak. Sweep customer caps and layout density. Assert bounded agents, queues, reservations, path requests, event history, memory trend, cash, and objective progress.

Required edge cases:

- all entrances blocked (placement must reject);
- all seats/stalls removed or closed;
- stall moved during queue and seat moved while reserved;
- hundreds attempt to leave;
- WebGL context loss and restoration;
- tab hidden/suspended and long wall-clock gap;
- resize/zoom during placement;
- service-worker update during active play;
- old save with missing content;
- storage quota exceeded.

## Manual QA areas

Build/camera, stalls/menus, customer lifecycle, queues/seating, diagnostics, economy/progression, tutorial, audio, keyboard/focus, reduced motion, zoom/reflow, save/recovery, offline/update, Chrome/Edge/Firefox, performance tiers, and long play.

Defects record ID, build, browser/OS, severity, preconditions, exact steps, expected, actual, evidence path, owner, fix, and regression status.

Severity:

- Critical: data loss, security/privacy exposure, app cannot launch, unrecoverable core progression.
- High: core loop blocked, common save/offline failure, essential accessibility failure.
- Medium: incorrect recoverable behavior or major presentation issue.
- Low: polish, rare cosmetic defect, documentation mismatch.

## Evidence policy

Retain command output, exact browser versions, screenshots, benchmark JSON, test seed, build identifier, and pass/fail totals. A planned test is not a passed test. Human cultural, legal, security, and accessibility review are tracked separately from automated QA.
