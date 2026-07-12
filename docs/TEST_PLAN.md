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
- Exact 8 stalls, 30 dishes, 80 placeables, 8 archetypes.
- Every dish assigned, every required English key present, no unlock cycles.
- Footprint/interaction/depth anchors valid and every referenced visual/audio/animation known.
- Catalogue duplicate policy check.

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
4. Configure a menu and open the centre.
5. Observe one customer complete order, seat, eat, tray/clear, and exit.
6. Confirm cash/XP/reputation change and inspect the reason breakdown.
7. Move an active target and verify recovery.
8. Save, reload, and compare persistent map/progression/economy state.
9. Change text scale, reduced motion, audio, and quality mode; reload.
10. Install/cache once, go offline, reload, continue, save, and reload again.
11. Trigger update flow with a second build; preserve save.
12. Reset with cancel first, then confirm; verify only game-owned data is cleared.

Run at 1280 × 720 and 1024 × 640, plus zoom levels in ACCESSIBILITY.md.

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
