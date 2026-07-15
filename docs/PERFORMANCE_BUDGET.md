# Performance Budget

Status: Provisional budgets; supported limits require measurement

## Reference conditions

- Desktop Chrome stable, 1280 × 720, device pixel ratio recorded.
- Mid-range reference hardware and one lower-end reference device must be described in PERFORMANCE_REPORT.md.
- Standard mode targets 60 FPS; lower-end mode targets 30 FPS.
- Benchmark scene: late-game unlocked map, mixed furniture, all 12 stalls, visible queues, normal audio, and seeded arrivals.

## Budgets

| Metric | Standard target | Lower-end target | Measurement |
|---|---:|---:|---|
| Initial compressed JS/CSS | ≤ 1.5 MB | same | build manifest / transfer |
| Initial art + fonts | ≤ 2 MB | ≤ 1.5 MB | cold transfer |
| Deferred runtime assets | ≤ 8 MB | ≤ 5 MB | manifest |
| Time to interactive | ≤ 4 s cold, ≤ 2 s warm | ≤ 6 s cold | browser trace |
| Texture memory | ≤ 128 MB | ≤ 64 MB | renderer estimate |
| Total tab memory | ≤ 350 MB | ≤ 220 MB | browser task manager/measure |
| Draw calls | ≤ 150/frame | ≤ 100/frame | renderer counter |
| Visible active sprites | ≤ 600 | ≤ 350 | debug counter |
| Simulation p95 | ≤ 4 ms/tick | ≤ 8 ms/tick | internal timer |
| Render p95 | ≤ 12 ms/frame | ≤ 25 ms/frame | frame instrumentation |
| Path requests | ≤ 20/tick burst, 5 average | ≤ 10/tick burst, 3 average | counter |
| Save snapshot + write p95 | ≤ 100 ms | ≤ 150 ms | performance marks |
| Simultaneous audio voices | ≤ 16 | ≤ 8 | mixer counter |
| Long-task count during normal minute | 0 over 100 ms | ≤ 1 over 100 ms | PerformanceObserver |

Initial customer design caps are 120 standard and 60 lower-end. These are test inputs, not supported claims. The supported active-customer maximum must be lowered to the largest count that passes frame, simulation, memory, queue/recovery, and two-hour soak gates on the reference devices.

## Quality-tier behavior

Lower-end mode reduces particles, decorative animation, off-screen animation updates, reaction frequency, audio voices, light/effect density, and high-DPI render scale. It staggers decisions more aggressively while preserving customer choices, economy, reservation correctness, and save results.

Automatic mode may recommend a tier after a short local sample but must not oscillate. The player can override it. Quality choice is persisted locally.

## Measurement protocol

1. Production build only; close unrelated high-load tabs.
2. Record build hash, browser/OS, CPU, RAM, GPU, viewport, DPR, power mode, and quality.
3. Use the same seed and benchmark snapshot for each run.
4. Warm up 60 seconds; record at least five minutes at 30, 60, 90, 120, and 150 attempted customers.
5. Capture FPS p50/p95 low, simulation/render p95, paths, draw calls, sprites, memory start/end, and stalls/queues completed.
6. Run a two-hour soak at the proposed supported cap and investigate trend, not just final memory.
7. Repeat three times; publish raw results and medians. Do not average away a failed recovery or data-integrity event.

## Optimization order

Measure first, then reduce unnecessary allocations and redraws; stagger AI; cache revision-safe paths; pool frequently churned objects; simplify off-screen animation; atlas stable images; defer noncritical assets. Web workers or texture compression require measured benefit that outweighs complexity and compatibility cost.

No benchmark has yet established that these budgets or customer caps are met.
