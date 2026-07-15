# Performance Report

Report date: 2026-07-16
Build/commit: Expanded working source validated with bundled Node.js `v24.14.0`; commit/publication record pending
Verdict: **Current Node simulation budget and both production builds passed; browser rendering performance and supported customer caps are not established**

## Automated simulation evidence

The Vitest benchmark starts 80 active customers and advances 1,200 deterministic fixed steps with periodic invariant checks. The current run includes queue-reservation and obstacle-safe route behavior. It is useful for regression detection in the pure simulation core; it does not include Phaser rendering, browser scheduling, expanded stall/food drawing, audio, IndexedDB, service workers, or DOM work.

Current result from the passing 24-file / 131-test Vitest run on bundled Node.js `v24.14.0`:

| Metric | Recorded value |
|---|---:|
| Seed | `benchmark-80-agents` |
| Fixed steps | 1,200 |
| Peak active customers | 80 |
| Mean simulation step | 0.07882491666666842 ms |
| p95 simulation step | 0.12440000000003693 ms |
| Maximum simulation step | 10.32120000000009 ms |
| Total measured duration | 98.13689999999997 ms |
| Heap delta during sample | 6,044,872 bytes |
| Test budget | mean < 4 ms; p95 < 10 ms |
| Result | Pass in current supported-runtime automated run |

Sub-millisecond timing is noisy and machine-dependent; do not compare a single Node run to a browser frame budget.

## Production-build evidence

The current release-equivalent gate completed the five-environment Sites/Vinext build and generated service-worker build ID `c5ed3679ba56`. The native Next.js Vercel build also passed. Current raw/gzip payload totals, file count, and deterministic manifest hash were not retained in the supplied validation output.

The following payload snapshot is retained only as a pre-expansion transport baseline. Gzip values are per-file gzip sums, not current payload or browser TTI evidence:

| Payload group | Raw | Gzip |
|---|---:|---:|
| Initial client JS/CSS, excluding dynamically loaded Phaser/runtime/visual recipes | 358,302 B | 107,914 B |
| Deferred Phaser/runtime/visual recipes | 1,627,126 B | 425,765 B |
| Total client JS/CSS | 1,985,428 B | 533,679 B |

Pre-expansion `dist/`: 13,772,093 bytes across 35 files, including the 2,897,161-byte social-share PNG. Historical service-worker build ID: `3e25823ed59c`. Historical deterministic SHA-256 of the sorted `relative-path<TAB>file-sha256` manifest: `3fbd941195ed69d51198940b64ce8007aa5d8133d8f9777fa4174c24d067d2db`. These are historical artifact/transport measurements only; time to interactive was not measured.

## Browser metrics still required

| Metric | Standard | Lower-end | Status |
|---|---:|---:|---|
| Time to interactive | Budget in `PERFORMANCE_BUDGET.md` | Budget in `PERFORMANCE_BUDGET.md` | Not measured |
| FPS and frame-time distribution | 60 FPS target | 30 FPS target | Not measured |
| Simulation/render p95 | Budgeted | Budgeted | Node simulation only; render unmeasured |
| Draw calls / active sprites | Budgeted | Budgeted | Not measured |
| Path requests | Budgeted | Budgeted | Not measured in browser |
| Texture / total memory | Budgeted | Budgeted | Not measured |
| Save duration | Budgeted | Budgeted | Not measured in browser |
| Audio voices | Budgeted | Budgeted | Not measured |
| Two-hour soak trend | Required | Required | Not run |
| Supported active customers | Unknown | Unknown | Must not be claimed before browser sweep |

The 120 standard / 60 lower-end figures in `PERFORMANCE_BUDGET.md` remain provisional sweep values, not support claims. The runtime currently applies separate quality/FPS limits, but that implementation fact is not proof of delivered frame rate.

The current renderer still performs a full-frame redraw and recreates text objects during frame rendering. The Node benchmark does not exercise that path. Browser profiling must measure its CPU, allocation, frame-time, and memory impact before any supported FPS or customer-cap claim; optimization remains required if the documented budgets are missed.

## Required production measurement

Use the frozen production artifact and record:

- commit, service-worker build ID, artifact hash, raw/gzip payloads;
- exact browser/OS version, CPU/RAM/GPU, power mode, viewport, DPR, and quality setting;
- benchmark seed/snapshot, warm-up, sample length, and run count;
- late-game unlocked layout with all 12 stalls plus representative placeable and 46-dish renderer coverage;
- FPS distribution, simulation/render p95, path work, save duration, audio voices, and memory trend;
- customer count sweep, completed visits, failures/throttling, and the final supported cap;
- retained trace, JSON, and screenshot paths.

Development-server impressions and the Node benchmark are not substitutes for this browser evidence.
