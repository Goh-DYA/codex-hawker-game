# Release Notes

## Unreleased — release candidate

Hawker Simulator is a complete, free, local-first browser management game candidate. It is not yet production-approved because exact-artifact real-browser/offline QA and required human reviews remain open.

### Playable launch scope

- Build and operate an original Singapore-inspired Community Courtyard using a top-down grid.
- Place, move, rotate, remove/sell, undo, and unlock 80 meaningfully distinct stalls, seating, facilities, signs, greenery, lighting, cooling, tray/waste, floor, and utility definitions.
- Operate 8 fictional stalls and configure 30 dishes through per-stall menu slots.
- Serve 8 customer archetypes through arrival, stall choice, queue, ordering, collection, reserved seating, dining, tray return, exit, and despawn.
- Read live queue, cleanliness, seating, ambience, cash, reputation, level, objective, and diagnostic feedback.
- Expand the hall and progress through deterministic economy, XP, reputation, and unlock rules.

### Interface and accessibility engineering

- Semantic React controls surround the Phaser world for the catalogue, menus, settings, save tools, objectives, tutorial, and status.
- Pointer and keyboard camera/build controls, focus-managed dialogs, visible focus, Escape behavior, high contrast, reduced motion, text scaling, and separate audio controls are implemented.
- Important audio events have visual equivalents; unavailable audio/storage degrades with an explicit message.
- Standard and lower-end quality modes apply separate crowd/fixed-step/frame-rate limits.

### Saves and offline shell

- IndexedDB active/backup saves use versioned checksummed envelopes and serialized writes.
- V1-to-V2 migration, newest-save backup recovery, content alias/refund recovery, export/import, and reset are implemented.
- The PWA includes a manifest, offline fallback, deterministic content-derived cache ID, acknowledged runtime warming, and an explicit save-before-update activation flow.

### Automated evidence

- Content validation proves 8 stalls, 30 dishes, 80 placeables, 8 archetypes, and 252 English localization entries.
- Deterministic simulation, grid/pathfinding, build/economy/progression, persistence/migration/recovery, target reconciliation, soak, and an 80-agent Node benchmark have automated tests.
- Production-render checks assert the release shell, security headers, PWA update protocol, and absence of starter-facing copy.
- See `TEST_REPORT.md` and `PERFORMANCE_REPORT.md` for the final automated results, artifact hash, and remaining browser-only measurements.

### Not yet approved

- Current stable Chrome critical path, Edge/Firefox smoke, viewport/zoom/console/network checks, browser FPS/memory/TTI, and the long browser soak.
- First-load/offline reload, offline restart/save, waiting-worker update, and rollback behavior on the exact production artifact and origin.
- Human Singapore cultural and accessibility/assistive-technology review.
- Independent security review and qualified legal/privacy review.

The package/cache may use `1.0.0` as an artifact identifier. It does not indicate release acceptance, certification, or compliance.
