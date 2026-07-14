# Accessibility Plan

Status: Target specification; audit and assistive-technology verification pending

The target is WCAG 2.2 AA for applicable web UI and equivalent access to essential canvas actions. This is an engineering target, not a current conformance claim. Reference: [W3C WCAG 2.2](https://www.w3.org/TR/WCAG22/) and [W3C WCAG 2.2 techniques](https://www.w3.org/WAI/WCAG22/Techniques/).

## Input and focus

- All essential actions have mouse, trackpad, and keyboard paths.
- DOM controls use native elements, logical tab order, visible two-color focus, and no focus traps.
- Build objects can be selected and moved with buttons/keys; dragging is never the sole mechanism.
- Escape reliably cancels placement or closes the top dialog without losing a committed action.
- Focus returns to the invoking control after a dialog.
- Keyboard shortcuts are documented, remappable where practical, and disabled while typing.
- Targets are at least 24 × 24 CSS pixels, with 44 × 44 preferred for primary controls.

## Canvas equivalence

The canvas is not the only information source. React provides:

- a named game region and concise control instructions;
- an inspect panel for selected tile/object/customer;
- text reason summaries for queue, seat, path, and satisfaction problems;
- a live-region setting with Off / Important / Detailed verbosity;
- buttons for pan, zoom, rotate, place, cancel, undo, pause, and overlays;
- a grid cursor with row/column announcement for keyboard placement.

Rapid simulation events are aggregated; announcements must not flood screen readers.

## Vision and cognition

- Normal text target contrast is at least 4.5:1; large text and essential graphics at least 3:1.
- State uses icon, label/pattern, and color together.
- UI text scale supports 100%, 125%, 150%, and 200% without clipped essential controls.
- Reference viewport: 1280 × 720; minimum target: 1024 × 640. Browser zoom at 80%, 100%, 125%, 150%, and 200% is manually checked.
- Tooltips are duplicated by persistent help or accessible names.
- Plain language explains failures and next steps.
- Tutorial steps can be skipped, replayed, paused, and completed without time pressure.
- Number formatting and icons remain consistent; decorative motion never carries core meaning.

## Motion, flashing, and camera

- Reduced motion follows prefers-reduced-motion initially and has an in-game override.
- It disables camera easing, idle bobbing, particles, pulsing highlights, screen shake, and large reactions; state timing remains unchanged.
- Camera zoom is bounded and never automatically snaps during placement.
- No content flashes more than three times per second.

## Hearing

- Separate master mute, music, ambience, and effects controls; UI cues use the effects bus.
- Important sounds have visual/text equivalents.
- The game starts only after an explicit interaction and never relies on background audio.
- No voice acting is planned; captions are required if speech is added later.

## Motor and fatigue

- No rapid clicking, hold-to-confirm, or precision drag requirement.
- Repeat actions support keyboard repeat conservatively and have undo.
- Pausing is immediate. Build mode stops consequential arrivals and timers.
- Time limits, if any are later introduced for optional goals, have adjustable/disable options.

## Testing matrix

- Keyboard-only complete tutorial and build/customer loop.
- Windows Narrator with current stable Chrome and Edge; NVDA is recommended for independent review.
- 200% browser zoom and each in-game text scale.
- Reduced motion at OS and in-game levels.
- Contrast analyzer and forced-colors/high-contrast inspection.
- Color-vision simulation for placement, satisfaction, and overlays.
- Pointer target and drag-alternative review.

Human accessibility review and assistive-technology results remain pending and are release gates.
