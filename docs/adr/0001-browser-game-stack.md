# ADR 0001: Browser Game Stack

Date: 2026-07-12
Status: Accepted

## Context

The game needs tile construction, animated crowds, camera controls, offline caching, accessible web UI, deterministic tests, and a maintainable solo-developer workflow inside an existing React/Vinext/Vite/Sites repository.

## Options

Scores are 1–5.

| Option | Game features | Web/PWA fit | Testing/debug | Bundle/deploy | Solo speed | Maintenance | Total / 30 |
|---|---:|---:|---:|---:|---:|---:|---:|
| TypeScript + Phaser | 5 | 5 | 5 | 4 | 5 | 4 | 28 |
| TypeScript + PixiJS + custom simulation shell | 3 | 5 | 5 | 5 | 3 | 3 | 24 |
| Godot web export | 5 | 3 | 3 | 2 | 4 | 4 | 21 |

PixiJS is an excellent renderer but would require more custom camera/input/scene integration. Godot offers strong editor tooling but adds a separate export/runtime workflow, larger browser integration surface, and less direct DOM/PWA testing. Phaser fits the existing TypeScript toolchain and provides the needed game primitives without forcing an engine/editor pipeline.

## Decision

Use TypeScript with Phaser 4.2.1 for the game canvas, embedded client-side in React 19. Keep Vinext/Vite and Sites hosting. Use React for semantic/accessibility UI, Zod for runtime validation, IndexedDB through idb, Vitest for logic/content/save tests, and real browser QA for target behavior.

## Consequences

- Phaser lifecycle must be explicitly mounted/destroyed by React.
- Pure simulation/domain modules cannot import Phaser, React, or browser storage.
- The bundle/performance budget must include Phaser and be measured.
- Phaser 4 APIs and browser support require integration verification; version pinning is not proof.
- Essential actions and diagnostics must remain available outside the canvas.
