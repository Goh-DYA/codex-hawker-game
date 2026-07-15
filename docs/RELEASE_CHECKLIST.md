# Release Checklist

Status: Expanded source automated release gate passed; **NO-GO pending exact-production browser/offline QA and human reviews**
Rule: check an item only with evidence in `TEST_REPORT.md`, `PERFORMANCE_REPORT.md`, or the named review record. An implementation checkbox is not a browser or compliance claim.

## Product and content

- [x] Expanded launch-data contract requires exactly 12 operational stalls, 46 assigned dishes, 80 meaningful placeables, 12 customer archetypes, and 300 English localization entries.
- [x] Catalogue categories, reciprocal references, unique IDs, localization, unlock bounds/prerequisites, and non-placeholder copy have automated checks.
- [x] One coherent Community Courtyard theme uses original code-native illustrated visuals and fictional stall identities.
- [x] Automated visual-contract coverage accounts for 80 distinct placeables, unique primary references for 12 stall identities and 46 dishes, 46 dish/vessel recipes, 12 archetype appearances, and all 11 customer states, including reduced-motion signatures.
- [x] Player-facing build catalogue, stall/menu manager, objectives/insights, tutorial, progression, settings, and save tools are integrated.
- [x] Asset provenance and third-party dependency notices are present; no real brand or certification mark is intentionally used.
- [ ] Complete build/open/inspect/customer/progression loop is manually passed on the exact production artifact in a real browser.
- [ ] Final browser screenshot/visual review confirms no debug, broken, or unintended starter-facing presentation.

## Simulation and economy

- [x] Placement, rotation, movement, remove/refund, expansion, and undo pass automated command tests.
- [x] Invalid placement and required entrance/exit, service, queue, seat, and tray-return paths are protected by validation/recovery logic.
- [x] Queue/seat reservations and live stall/tray/seat target changes recover in deterministic lifecycle/soak tests.
- [x] Comparable-stall choice is balanced, preferences can outweigh modest entrance distance, and wayfinding utility reduces entrance bias in automated tests.
- [x] Per-stall queue counts, cardinal automatic directions, player-authored bends, obstacle-safe cells, path persistence, and admitted-customer walkability pass automated tests.
- [x] Expansion migrates perimeter tiles and entrance/exit endpoints; customers leaving after expansion do not despawn at the old exit in the regression test.
- [x] All signage/facility definitions apply at least one spatial or global simulation effect, with bounded falloff/satisfaction tests.
- [x] Purchases, refunds, sales, XP, levels, reputation, unlocks, and trusted expansion prices use deterministic formulas with automated coverage.
- [x] Standard/lower-end fixed-step and crowd limits are enforced by the pure simulation.
- [ ] Beginning-to-end progression and economy are manually played in the real browser build, including recovery from poor layouts and exploit checks.
- [ ] Two-hour browser soak confirms no unbounded customer, queue, reservation, or memory growth.

## Saves and offline

- [x] Versioned save round trip and representative V1-to-V2 migration pass automated core tests.
- [x] Checksummed active/backup slots, serialized writes, newest-save backup recovery, alias remapping, removed-content refund, and bounded import/export are implemented.
- [x] Confirmed reset removes the game-owned save/preferences/cache data path and has an export-first warning.
- [ ] IndexedDB active/backup writes, interruption, corruption, denied storage, quota, and private-mode behavior pass real-browser fault injection.
- [ ] Core game reloads and saves offline after first production load.
- [ ] Browser restart preserves progress offline.
- [ ] Waiting service-worker update preserves saves, warms the full runtime, avoids mixed versions, and activates only after confirmation.
- [ ] Rollback/save-forward compatibility is exercised on the deployed artifact.

## Browser and UI

- [x] Pre-expansion targeted development-browser screenshots cover starter, live service, queue routing/editing, and repeated expansion states; paths, post-capture changes, and limitations are recorded in `GRAPHICS_VERIFICATION.md`.
- [ ] Every one of the 12 stall identities and 46 dish presentations is inspected in the exact production artifact, with culturally informed findings recorded.
- [ ] Current stable desktop Chrome exact version and OS are recorded.
- [ ] Edge and Firefox exact versions and limitations are recorded.
- [ ] 1280 × 720 and 1024 × 640 layouts pass.
- [ ] Required browser zoom/text scaling levels pass without clipped essential controls.
- [ ] Keyboard and pointer build/camera flows, dialog focus restoration, and responsive mode pass.
- [ ] No critical console errors or unexpected network requests occur.
- [ ] WebGL loss, tab suspension, resize, service-worker update, and unsupported storage/audio conditions recover clearly.

## Accessibility and audio

- [x] Essential DOM actions use semantic controls and the game supplies keyboard build/camera shortcuts plus a visible focus treatment.
- [x] Dialog focus is trapped/restored, Escape closes/cancels, drag actions have button/key alternatives, and typing targets suppress game shortcuts.
- [x] High contrast, reduced motion, text scaling, separate audio controls/mute, and visual equivalents/degradation messages are implemented.
- [ ] Keyboard-only critical path passes in the exact browser build.
- [ ] Text scaling/reflow, contrast, reduced motion, focus visibility, and critical non-color/non-audio state pass human inspection.
- [ ] Screen-reader smoke and human accessibility review are complete.

## Performance

- [x] Repeatable Node benchmark exercises 80 active agents for 1,200 fixed steps and passed the final simulation budget.
- [x] Expanded-source `benchmark-80-agents` result is recorded in `PERFORMANCE_REPORT.md` from the supported Node.js `v24.14.0` run.
- [ ] Current production artifact raw/gzip sizes and deterministic content-manifest hash are recorded; service-worker build ID `c5ed3679ba56` is recorded.
- [ ] Production payload and time-to-interactive budgets are measured in a real browser.
- [ ] Standard 60 FPS and lower-end 30 FPS targets pass at documented supported caps.
- [ ] Browser simulation/render/path/save/audio/memory budgets pass.
- [ ] Full-frame redraw and per-frame text recreation are profiled and meet the browser frame-time/allocation budgets, or are optimized until they do.
- [ ] Two-hour browser soak shows no unbounded memory/agent/reservation growth.
- [ ] Hardware, browser, viewport, seed, and raw traces/results are retained.

## Security, privacy, culture, and legal

- [x] Local-first design excludes accounts, analytics, trackers, payments, advertising, chat, and cloud saves.
- [x] Save import/catalogue IDs are bounded/validated and player text is rendered without HTML evaluation.
- [x] CSP, permissions, referrer, content-type, and framing headers are applied by the worker and asserted in rendered-output tests.
- [x] Replacement candidate all-dependencies and production-only audits both report 0 vulnerabilities; lockfile, overrides, notices, and provenance files remain present.
- [x] Frozen-artifact scan found no key-like secrets, environment files, or source maps; source network APIs are limited to same-origin worker/asset requests.
- [ ] CSP and hosting headers are verified on the final origin.
- [ ] Privacy notice is compared against observed browser/network/storage behavior.
- [ ] Independent security review is complete or an accountable human waiver is recorded.
- [ ] Qualified legal/privacy review is complete.
- [ ] Human Singapore cultural review is complete with findings resolved.
- [ ] Human review confirms no unsupported halal/certification/safety claim, lookalike mark, or culturally harmful presentation.

## Build and operations

- [x] Expanded-source release checks pass on bundled Node.js `v24.14.0`: typecheck, lint, 24 Vitest files / 131 tests, five-environment Sites/Vinext build, native Vercel build, and 2/2 rendered-output/offline-shell assertions.
- [x] Previously recorded all-dependencies and production-only npm audits both report 0 vulnerabilities; they were not rerun in this validation update.
- [x] Expanded-source service-worker build ID `c5ed3679ba56` is recorded.
- [ ] Expanded validated-source commit, artifact path/hash/payload sizes, and publication URL are recorded; the existing private Sites record predates the expansion.
- [ ] Vercel project setup, first Preview, staged-production smoke, protected approval, promotion, and rollback rehearsal are recorded with exact deployment URLs.
- [ ] Browser critical path and offline/update tests pass on that exact artifact.
- [ ] Private deployment smoke, rollback, and save-forward compatibility are rehearsed.
- [x] Changelog, notices, release notes, privacy, support, known issues, project status, and release evidence documents are present and aligned to the candidate scope.
- [ ] Version/tag is approved and the accountable production owner records GO.

## Current decision

**NO-GO.** The expanded implementation and supported-runtime automated release gate pass, but production approval is withheld until the current commit/artifact record, exact-artifact browser/offline and performance gates, and required human cultural, accessibility, security, and qualified legal/privacy reviews are complete.
