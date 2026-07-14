# Long-Term Progression Roadmap

Status: Tracked future work. The daily focus, centre milestones, stall mastery, adaptive demand, and procedural soundtrack are the progression foundation.

This roadmap deliberately avoids premium currency, real-time waits, timed exclusivity, forced resets, accounts, analytics, and social pressure. Each phase should ship independently and preserve existing local saves.

## Phase 1 — Neighbourhood demand events and peak periods

- [ ] Add seeded breakfast, lunch, tea, and evening demand profiles with readable advance notice.
- [ ] Add local, fictional events such as community-club meetings and school activity days.
- [ ] Let events change preference mix and group size, never customer identity stereotypes.
- [ ] Add a calendar preview and post-event explanation of demand, throughput, and satisfaction.

Dependencies: adaptive arrival model, objective eligibility, multi-entrance routing.

Acceptance: the same seed produces the same event sequence; every event has at least two viable responses; ignoring an event slows rewards but cannot create a hard fail state.

## Phase 2 — Seeded scenarios and constrained layouts

- [ ] Author scenario definitions with map, starting inventory, operating constraints, and optional medals.
- [ ] Add scenarios for narrow aisles, split halls, limited cash, menu variety, and peak throughput.
- [ ] Keep timers simulation-based and pause-aware; do not use real-world countdowns.
- [ ] Store best local results and allow replay without affecting the main centre.

Dependencies: Phase 1 demand profiles, access-point validation, deterministic objective metrics.

Acceptance: scenarios are reproducible, completable without one exact layout, and fully usable offline.

## Phase 3 — Dish discovery, collections, and centre identity

- [ ] Add dish mastery based on service quality and customer preference matches.
- [ ] Unlock recipe presentation variants and centre decorations through play, not random drops.
- [ ] Add locally stored collection pages with clear gameplay sources for every item.
- [ ] Add centre colour and signage themes that preserve contrast and cultural-review requirements.

Dependencies: stall mastery, content validation, save-schema extension policy.

Acceptance: collection completion has no missable entries or timed exclusivity; cosmetic choices never become dominant economic bonuses.

## Phase 4 — Customer groups and community stories

- [ ] Add deterministic group arrivals, shared seating needs, and readable group satisfaction.
- [ ] Add short fictional neighbourhood story arcs driven by centre milestones.
- [ ] Keep behavioural traits independent of ethnicity, age, or other protected characteristics.
- [ ] Provide a story log and replayable summaries without voice or external content.

Dependencies: group reservation model, Phase 1 events, accessibility and cultural review.

Acceptance: group routing cannot orphan reservations; stories remain optional and never block core progression.

## Phase 5 — Endgame mastery contracts

- [ ] Add rotating mastery contracts for high-level layout, service, menu, and hospitality play.
- [ ] Scale targets from demonstrated throughput rather than fixed endgame crowd counts.
- [ ] Reward centre titles, visual flourishes, and optional challenge modifiers.
- [ ] Continue stall mastery ranks without requiring a progression reset.

Dependencies: all earlier progression metrics and scenario validation.

Acceptance: contracts remain achievable after arbitrary layout changes, rewards are granted once, and no reset or endless grind is required to retain earned content.

## Implementation checklist for every phase

- [ ] Add typed content/schema definitions and migration coverage.
- [ ] Add deterministic unit fixtures and long-soak invariant tests.
- [ ] Add accessible UI text and non-audio/non-colour feedback.
- [ ] Update economy, design, provenance, risk, and release documentation.
- [ ] Complete browser performance, cultural, accessibility, and save-compatibility review.
