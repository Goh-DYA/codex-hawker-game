# Hawker Balance — Product Brief

Status: Release-candidate product baseline
Last updated: 2026-07-12
Release readiness: NO-GO pending real-browser/offline QA and required human reviews

## Product statement

Hawker Balance is an original, welcoming, single-player management and nutrition-education game about arranging and operating a fictional Singapore-inspired hawker centre. Players build on a square grid, choose stalls, menus, and reviewed recipe variants, observe customers move through a readable queue–order–seat–eat–return-tray lifecycle, and improve service while learning to compare nutrient trade-offs.

The game is for casual and simulation players aged 13+, launches free, requires no account, and keeps its core loop playable offline after the first successful load. There are no purchases, advertisements, loot boxes, energy systems, real-time waits, or pay-to-win systems in the launch scope.

## Experience goals

1. Creative ownership: layout and decoration create visible and systemic differences.
2. Readable simulation: every failed visit has a visible cause and useful remedy.
3. Meaningful optimization: distance, congestion, capacity, cleanliness, service, price, and ambience interact without enforcing one perfect layout.
4. Low-friction play: undo, recoverable economy, short feedback loops, and no irreversible traps.
5. Living atmosphere: purposeful movement, queues, eating, reactions, light motion, and restrained audio.
6. Respectful specificity: recognizable communal dining and food practices without copying real businesses or flattening cultures.
7. Practical nutrition literacy: compare listed servings and respond to fictional visit intents without health grades, demographic assumptions, or medical advice.

## Launch scope

- Desktop Chrome is the reference browser; Edge and Firefox are secondary targets.
- Mouse, trackpad, and keyboard are required. Touch is optional.
- One coherent map theme, orthographic top-down square-grid construction, pan, and zoom.
- Place, move, rotate, store, sell, remove, and undo placeable objects and stalls.
- Twelve fictional stalls, 46 playable dishes, 80 meaningfully distinct placeables, and twelve behavior archetypes.
- Explicit nutrition-data status for all 46 dishes, 28 reviewed base profiles, and ten reviewed recipe-variant families.
- Customer spawning, choice, pathfinding, queueing, ordering, preparation abstraction, seat reservation, eating, reactions, tray return where applicable, and departure.
- Cash, experience, reputation, unlocks, upgrades, objectives, and map expansion.
- Tutorial, settings, accessibility options, audio controls, local saves, and offline application shell.
- English localization. Multilingual environmental text is used only after translation review.

Content-counting rule: a catalogue entry counts only when it has a unique ID and a meaningful gameplay, footprint, interaction, unlock, or visual-construction difference. A palette-only recolour does not count.

## Explicit non-goals for 1.0

Accounts, cloud saves, multiplayer, chat, leaderboards, social visits, user-generated content, live events, analytics, payments, advertising, multiple themes, narrative campaign, medical or personalized dietary advice, ingredient-safety certification, staff scheduling, supply chains, and voice acting.

## Success and release gates

The release must pass the acceptance checklist in RELEASE_CHECKLIST.md. In particular:

- The complete customer lifecycle and build-mode recovery cases pass automated and browser tests.
- Content validators prove 12 / 46 / 80 / 12 counts and no missing runtime references.
- IndexedDB recovery, save migrations, cache updates, and offline reload are verified.
- Measured performance meets an approved supported-customer cap in both quality tiers.
- Essential UI actions work by keyboard and do not rely on color or audio alone.
- Current stable desktop Chrome is tested and its exact version recorded.
- Human Singapore cultural review, qualified legal/privacy review, and independent security review are complete or explicitly waived by the accountable human owner.

None of those external review gates is complete as of this document date.

## Product assumptions

- Solo-development sustainability takes priority over content excess.
- Art is code-native/procedural, shape-led illustrated 2D; it is not dependent on licensed sprite packs.
- Static/local-first operation is sufficient; no gameplay backend is required.
- Save format and content IDs become compatibility contracts once a public build ships.
- “Production-ready” is a measured release state, not a planning milestone.
