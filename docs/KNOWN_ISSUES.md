# Known Issues

Status: Release-candidate verification list; not a customer-facing production issue list

## Remaining release blockers

1. **Real-browser critical-path QA is unavailable.** The current candidate has not been operated end to end in current stable Chrome, and Edge/Firefox smoke results are not recorded. This gate includes screenshots, console/network review, viewports/zoom, save/reload, resize/suspension/WebGL-loss behavior, and measured browser performance.
2. **Real offline/PWA behavior is unverified.** Static worker/output assertions pass, but first-load cache population, offline reload, browser restart, offline saving, waiting-worker update, mixed-version avoidance, and rollback must be exercised on the exact production artifact and origin.
3. **Human Singapore cultural review is pending.** Internal research and safeguards do not substitute for Singapore-informed review.
4. **Human accessibility and assistive-technology review is pending.** Engineering support is present, but keyboard, screen-reader, zoom/reflow, contrast, reduced-motion, focus, and audio-equivalence behavior needs human verification in the real browser build.
5. **Independent security and qualified legal/privacy review are pending.** Internal controls, tests, notices, and dependency-audit results are evidence inputs, not an approval or compliance claim.

## Implemented but awaiting browser evidence

- The full React/Phaser gameplay loop, 80-item catalogue rendering, input, focus, responsive layout, high-contrast/reduced-motion/text scaling, audio degradation, and production-only debug exclusion compile and have static/automated coverage where practical.
- IndexedDB uses checksummed active and backup envelopes, serialized writes, core migrations, candidate recovery, bounded import/export, and reset. Quota, denied storage, private mode, interruption, and real reload recovery still require browser fault injection.
- The service worker uses a deterministic content-derived cache ID, limits deletion to game-owned caches, warms observed runtime chunks with acknowledgement, leaves updates waiting, and activates only after the save/update flow. Real cache/update behavior remains unverified.
- The Node benchmark passes with 80 active agents in the final automated run, but it cannot establish Phaser FPS, TTI, memory stability, or a supported browser customer cap.
- Security headers pass rendered-output checks, but final-origin header and CSP behavior cannot be accepted before deployment/browser inspection.

## Previously listed concerns closed by implementation or automated evidence

- Exact launch counts and cross-references are validated: 8 stalls, 30 dishes, 80 placeables, 8 archetypes, and 252 English localization entries.
- Deterministic lifecycle, pathing, queue/seat reservation release, live target recovery, economy, progression, map expansion, and build undo have automated coverage.
- Save V1-to-V2 migration, removed-content recovery/refund, alias remapping, malformed catalogue rejection, and deterministic soak checks are automated.
- Install-time `skipWaiting` was removed; waiting updates use an explicit cache-warm and activation protocol.
- Starter-facing copy and loading-skeleton output are rejected by rendered-output tests; production debug UI is excluded.
- The final clean install plus all-dependencies and production-only audits reported 0 vulnerabilities after patched build-tool pins and narrow transitive overrides.

## Reporting rule

Do not remove a remaining blocker without a dated evidence record. When browser and human reviews complete, link the signed or accountable review record rather than replacing it with an internal checklist.
