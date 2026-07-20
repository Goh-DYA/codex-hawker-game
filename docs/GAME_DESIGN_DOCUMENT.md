# Game Design Document

Status: Release-candidate design baseline; values remain subject to browser playtesting and human review
Related: PRODUCT_BRIEF.md, CONTENT_CATALOGUE.md, ECONOMY_AND_PROGRESSION.md

## Player fantasy and core loop

The player grows a compact community dining room into a busy, distinctive hawker centre:

1. Inspect demand, queues, seating, cleanliness, nutrition requests, and route overlays.
2. Build or rearrange stalls, tables, facilities, and decorations on a square grid.
3. Configure each stall’s active menu and reviewed recipe variant within its unlocks.
4. Open the centre and watch customers complete visits.
5. Read service reactions, nutrition trade-offs, and diagnostics; earn cash, experience, and reputation.
6. Buy upgrades, unlock content, expand the floor, and iterate.

A normal session supports five-minute check-ins and longer optimization sessions. Pausing and build mode stop consequential simulation changes.

## Modes and controls

Play mode runs the centre. Build mode pauses arrivals, exposes footprints and interaction cells, and supports place, rotate, move, store, sell, cancel, and undo. The Route editor pauses play and lets the player toggle preferred walking-lane tiles with the pointer or keyboard. Inspect mode opens a stall, customer, seat, or facility card. Overlay controls show walkability, congestion, queues, reservations, cleanliness, and customer intent.

Required controls:

- Primary pointer: select/place; secondary pointer or Escape: cancel.
- Wheel or explicit controls: zoom; middle drag, space-drag, or arrow keys: pan.
- R: rotate; B: build mode; Z or Ctrl/Cmd+Z: undo; Space: pause.
- Tab/Shift+Tab, arrows, Enter/Space, and Escape provide complete DOM UI navigation.
- Every drag operation has select-then-move controls.

## World and placement

The map uses an orthographic top-down square grid. A placeable is valid only when its rotated footprint is in the unlocked area, does not overlap blocking cells, preserves at least one entrance-to-stall and entrance-to-exit path, and leaves required interaction points reachable. Placement previews communicate valid, occupied, locked, and unreachable states with shape plus color.

Build commands are atomic and reversible. Moving a live target releases or redirects reservations before committing. Preferred route guides bias path cost rather than becoming mandatory waypoints, so guests can still reach a valid target when a painted lane is incomplete. Guides reserve their floor tiles from blocking furniture and queues, invalidate cached paths safely, persist with the layout, and support multi-step undo.

## Customer lifecycle

State transitions are explicit:

Arrive → Browse → Choose stall → Walk to queue → Queue → Order → Wait/collect → Choose and reserve seat → Walk to seat → Sit/eat → React → Return tray or clear → Exit.

At every state, a missing or invalid target triggers bounded recovery: replan, choose an alternative, or leave with a clear reason. Reservations have owners and release on completion, cancellation, target movement, timeout, or despawn. Stuck detection retries a limited number of paths before a safe exit fallback.

Stall score combines preference match, price, expected wait, Star-rated taste/popularity, stall quality/popularity, novelty, walking distance, and bounded fits for an optional nutrition intent and visit-specific health condition. Nutrition intents and conditions are assigned independently of persona, appearance, and demographics. An intent affects food choice and request reporting but not satisfaction; a condition uses its own Health rating when choosing a stall and dish, then applies a small frozen satisfaction change from the ordered meal. Neither system rewrites price, Star rating, preparation time, cash, experience, or reputation. Seat score combines path distance, group capacity, comfort preference, cleanliness, and congestion. Player-facing reason chips expose the strongest positive and negative terms; exact hidden arithmetic is not required for casual play.

## Queues, service, and seating

- Queue slots are authored from a queue anchor and direction and cannot block the service point.
- Reservations prevent overtaking and duplicate seat claims.
- Preparation is abstracted as capacity-limited service timers rather than ingredient micromanagement.
- Group members share a visit decision and require a compatible seat cluster; split seating is allowed only as a documented fallback.
- Tray return is a probabilistic customer action influenced by accessible return capacity and walking distance, never framed as an ethnic or age trait.

## Satisfaction and diagnostics

Satisfaction is a bounded weighted score from value, wait, food quality, walking burden, comfort, cleanliness, ambience, and, only for a customer with a health condition, a -0.2 to +0.2 meal-fit adjustment. A departure records a primary reason such as served, queue too long, unaffordable, no reachable seat, stall unavailable, path blocked, or centre closed. The HUD summarizes these reasons and offers corrective hints.

Nutrition is reported in a parallel daily Pulse. It tracks profiled servings, fictional request outcomes, and nutrient averages with separate known-value denominators. Each reviewed serving displays a general 1-to-5 Health rating, condition-specific 1-to-5 ratings, and the dish family's separate 1-to-5 Star rating. Health ratings are comparative game scores within the available meal or drink profiles, not a universal judgement or medical recommendation. Daily guidance is contextual only; matching uses relative comparisons among reviewed in-game servings.

At most one of high cholesterol, obesity, diabetes, or hypertension is assigned to an eligible visit. High-cholesterol fit emphasizes saturated, trans, and total fat with fibre and energy signals; obesity fit emphasizes energy, total and saturated fat, total sugar, fibre, and protein; diabetes fit emphasizes carbohydrate, total sugar, fibre, energy, and protein; and hypertension fit emphasizes sodium with supporting energy, saturated-fat, fibre, and protein signals. The customer inspector explains the nutrients considered and states that the trait is not a diagnosis.

Critical information always has text or icon/shape feedback. Customer bubbles are persistent status summaries, and the Settings icon guide provides a text equivalent.

## Progression and failure policy

Cash buys placeables, stalls, upgrades, and expansions. Experience unlocks levels through ordinary play. Reputation reflects recent service and gates prestige content. There is no premium currency and no real-time waiting.

The player cannot enter a hard fail state: starter essentials are protected from accidental sale or can be reclaimed; a recovery grant is available after an affordability check; operating costs cannot silently drive cash below zero; and objectives never require a single irreversible layout.

## Tutorial

The first-session tutorial teaches camera, place a table and seats, place a stall, inspect reachability, open, follow one customer, read one bottleneck, save, and reopen build mode. A separately persisted nutrition tour teaches Menu Planning and customer inspection without replaying the legacy tutorial. Each tour has Skip and Replay.

## Difficulty and quality modes

Difficulty comes from denser arrival patterns, varied preferences, and competing spatial goals—not punitive timers. Standard quality targets 60 FPS with normal effects and crowd animation. Lower-end quality targets 30 FPS with reduced particles, decorative motion, audio concurrency, and off-screen update frequency; game rules and rewards remain identical.

## Launch acceptance

The roster is defined in CONTENT_CATALOGUE.md. Exact balance is provisional until seeded simulation tests and human playtests demonstrate a viable opening, midgame, and end-state. No design section should be marked final based on data presence alone.
