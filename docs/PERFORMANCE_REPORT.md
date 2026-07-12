# Performance Report

Report date: 2026-07-12
Build/commit: Final verified source tree; Git/Sites commit is recorded by the release handoff
Verdict: **Node simulation budget passed in the final run; browser performance and supported customer caps are not established**

## Automated simulation evidence

The Vitest benchmark starts 80 active customers and advances 1,200 deterministic fixed steps with periodic invariant checks. It is useful for regression detection in the pure simulation core; it does not include Phaser rendering, browser scheduling, audio, IndexedDB, service workers, or DOM work.

Final recorded result from `npm run test:release` at 2026-07-12 12:47 SGT:

| Metric | Recorded value |
|---|---:|
| Seed | `benchmark-80-agents` |
| Fixed steps | 1,200 |
| Peak active customers | 80 |
| Mean simulation step | 0.00999 ms |
| p95 simulation step | 0.00870 ms |
| Maximum simulation step | 1.7451 ms |
| Total measured duration | 12.5149 ms |
| Heap delta during sample | 1,214,952 bytes |
| Final active customers | 0 |
| Completed visits | 5 |
| Test budget | mean < 4 ms; p95 < 10 ms |
| Result | Pass in final automated run |

Sub-millisecond timing is noisy and machine-dependent; do not compare a single Node run to a browser frame budget.

## Final bundle evidence

The final successful build produced the following client payload snapshot:

| Payload group | Raw | Gzip |
|---|---:|---:|
| Initial client JS/CSS, excluding dynamically loaded Phaser/runtime | 500,935 B | 146,633 B |
| Deferred Phaser/runtime | 1,442,431 B | 376,555 B |
| Total client JS/CSS | 1,943,366 B | 523,188 B |

Final `dist/`: 13,637,680 bytes across 35 files, including the 2,897,161-byte social-share PNG. The content SHA-256 is `5d03915e18c96548430d44e3a0c7c4e9e6c0bc71601ec960841fe63e9c65ba93`. These byte counts are transport evidence only; time to interactive was not measured.

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
