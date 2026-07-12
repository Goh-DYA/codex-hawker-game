# ADR 0004: Simulation and UI Boundaries

Date: 2026-07-12
Status: Accepted with profiling checkpoint

## Decision

React owns semantic UI, settings, focus, modals, announcements, and the Phaser host. Phaser owns rendering, camera, world picking, and effects. Pure TypeScript modules own grid/build rules, navigation, customer state machines, reservations, economy, progression, content, and save DTOs.

Simulation advances at a provisional fixed 10 Hz with seeded randomness and typed commands/events. Rendering interpolates independently. React and Phaser exchange typed commands and read-only snapshots rather than shared mutable entity objects.

## Consequences

- Core logic can run under Vitest without WebGL or React.
- Quality tiers can reduce rendering/decision cadence without changing rewards.
- Snapshot frequency and 10 Hz cadence must be profiled; change them if measured latency or CPU cost is unacceptable.
- A single composition root owns services and teardown, preventing arbitrary cross-domain mutation.
