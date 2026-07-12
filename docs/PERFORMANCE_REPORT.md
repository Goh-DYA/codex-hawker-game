# Performance Report

Report date: 2026-07-12
Build/commit: Validated implementation commit `648efa1ad44c4ad078d6e626a63e3a3c30e5d2ac`; privately published through Sites
Verdict: **Current-source Node simulation budget and replacement bundle evidence passed; browser performance and supported customer caps are not established**

## Automated simulation evidence

The Vitest benchmark starts 80 active customers and advances 1,200 deterministic fixed steps with periodic invariant checks. The current run includes the new queue-reservation and obstacle-safe route behavior. It is useful for regression detection in the pure simulation core; it does not include Phaser rendering, browser scheduling, audio, IndexedDB, service workers, or DOM work.

Latest current-source result from the passing 61-test Vitest run:

| Metric | Recorded value |
|---|---:|
| Seed | `benchmark-80-agents` |
| Fixed steps | 1,200 |
| Peak active customers | 80 |
| Mean simulation step | 0.01720 ms |
| p95 simulation step | 0.01970 ms |
| Maximum simulation step | 3.8660 ms |
| Total measured duration | 21.4711 ms |
| Heap delta during sample | 2,459,472 bytes |
| Final active customers | 0 |
| Completed visits | 5 |
| Test budget | mean < 4 ms; p95 < 10 ms |
| Result | Pass in latest current-source automated run |

Sub-millisecond timing is noisy and machine-dependent; do not compare a single Node run to a browser frame budget.

## Replacement production bundle evidence

The final current-source `npm run test:release` build produced this payload snapshot. Gzip values are per-file gzip sums for transport comparison, not browser TTI evidence:

| Payload group | Raw | Gzip |
|---|---:|---:|
| Initial client JS/CSS, excluding dynamically loaded Phaser/runtime/visual recipes | 358,302 B | 107,914 B |
| Deferred Phaser/runtime/visual recipes | 1,627,126 B | 425,765 B |
| Total client JS/CSS | 1,985,428 B | 533,679 B |

Replacement `dist/`: 13,772,093 bytes across 35 files, including the 2,897,161-byte social-share PNG. Service-worker build ID: `3e25823ed59c`. Deterministic SHA-256 of the sorted `relative-path<TAB>file-sha256` manifest: `3fbd941195ed69d51198940b64ce8007aa5d8133d8f9777fa4174c24d067d2db`. The largest client asset remains Phaser; the build retains a non-fatal >500 kB chunk advisory. These are artifact/transport measurements only; time to interactive was not measured.

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

## Required production measurement

Use the frozen production artifact and record:

- commit, service-worker build ID, artifact hash, raw/gzip payloads;
- exact browser/OS version, CPU/RAM/GPU, power mode, viewport, DPR, and quality setting;
- benchmark seed/snapshot, warm-up, sample length, and run count;
- FPS distribution, simulation/render p95, path work, save duration, audio voices, and memory trend;
- customer count sweep, completed visits, failures/throttling, and the final supported cap;
- retained trace, JSON, and screenshot paths.

Development-server impressions and the Node benchmark are not substitutes for this browser evidence.
