# Art Bible

Status: Release-candidate direction implemented; human visual and cultural review pending
Selected direction: shape-led, vector-like illustrated 2D; orthographic top-down square grid

## Decision comparison

Scores are 1 (poor) to 5 (strong) for a solo-developed browser game.

| Style | Clarity | 80-item effort | Animation effort | Performance | Consistency | Distinctiveness | Total / 30 |
|---|---:|---:|---:|---:|---:|---:|---:|
| Shape-led vector-like 2D | 5 | 5 | 4 | 5 | 5 | 4 | 28 |
| High-resolution painted sprites | 4 | 2 | 2 | 3 | 2 | 5 | 18 |
| Isometric pixel art | 3 | 2 | 2 | 4 | 3 | 4 | 18 |

| Perspective | Placement | Seat visibility | Occlusion | Depth complexity | Animation workload | Accessibility | Total / 30 |
|---|---:|---:|---:|---:|---:|---:|---:|
| Orthographic top-down | 5 | 5 | 5 | 5 | 5 | 5 | 30 |
| Isometric | 3 | 3 | 2 | 2 | 3 | 3 | 16 |
| Three-quarter/dimetric | 3 | 3 | 3 | 3 | 2 | 3 | 17 |

The selected pairing gives unambiguous footprints and interaction cells, minimal occlusion, reusable procedural geometry, and consistent production without third-party art. Distinctiveness comes from color, silhouette, local architectural cues, signage rhythm, food vessels, and animated activity rather than perspective tricks.

## Visual principles

- Read the function before the detail: tables, seats, stalls, bins, tray returns, and paths have distinct silhouettes.
- Use shape plus color for selection, validity, cleanliness, and state.
- Keep floors low-contrast; interactive objects have stronger edge/value separation.
- Avoid faux-Chinese type, generic “Asian” motifs, caricature, flags as cuisine shorthand, and borrowed brand trade dress.
- Depict a contemporary, cared-for communal space with practical infrastructure.
- Procedural/code-native graphics are an intentional final medium when they meet consistency and review gates; debug boxes and text labels are not final art.

## Canvas and grid rules

- Logical tile: 48 × 48 pixels at 100% camera scale.
- Character standing footprint: one tile; visible body stays inside roughly 28 × 40 pixels.
- Geometry aligns to whole or half pixels at the reference scale.
- Pivot: footprint bottom-center for objects; feet center for people.
- Depth order: floor → markings → low furniture → agents/props → tall fixtures → effects → selection overlays.
- Orthographic objects may show a restrained upper surface using inner shapes, but never imply an isometric footprint.
- Interaction cells use external overlays, not permanent markings baked into art.

## Palette and contrast

Core environment:

| Role | Hex |
|---|---|
| Warm plaster | #F4E7D3 |
| Cool tile | #D8E4DF |
| Ink | #263238 |
| Teal | #167D7F |
| Vermilion accent | #D95D39 |
| Mustard accent | #D5A021 |
| Leaf | #4F7D4A |
| Deep shadow | #18323B |

State colors are provisional and must pass contrast checks:

- Valid: teal plus check/solid outline.
- Invalid: vermilion plus cross/hatched footprint.
- Warning: mustard plus triangle/dashed outline.
- Selected: high-luminance cream plus double outline.

Never encode cuisine, customer identity, satisfaction, or accessibility need through skin tone or a single color.

## Shape language

- Stalls: strong rectangular canopy/lightbox silhouette, open service edge, unique two-shape emblem, no real logos.
- Tables: broad horizontal top with leg cues; seats remain visually detached.
- Facilities: industrial rounded rectangles, explicit opening/handle symbols.
- Plants/decor: organic clusters and asymmetry, secondary to navigation.
- UI icons: 2-pixel-equivalent rounded stroke, solid state fill, 24-pixel minimum source box.
- Food: vessel first, then two or three ingredient/color shapes and steam/highlight; no photorealism.

## Character system

Characters are modular: body/base, skin-tone palette, hair/head covering, top, bottom, optional accessory, carried tray/food, and reaction mark. Variation rules deliberately mix components without tying clothing, age, spending, patience, or food preference to ethnicity.

Use four cardinal facings. Walking may mirror east/west only if asymmetric accessories remain correct. Seat alignment uses the authored seat point and facing. Carry props attach at a shared chest/hand anchor; trays stay level. Walking aids are optional visual components and must not reduce service logic to a stereotype.

## Animation contract

| Animation | Frames | FPS | Loop | Interrupt rule |
|---|---:|---:|---|---|
| idle / queue idle / seated idle | 2 | 2 | yes | any safe state transition |
| walk | 4 | 8 | yes | on tile arrival or replan |
| order / wait | 3 / 2 | 6 / 2 | order no, wait yes | after transaction / target loss |
| carry food | 4 | 8 | yes | preserve tray attachment |
| sit down / stand up | 3 / 3 | 6 | no | atomic except target invalidation |
| eat / drink | 4 / 3 | 6 / 5 | bounded loop | on meal timer completion |
| positive / negative reaction | 3 | 6 | no | may skip in reduced motion |
| return tray / leave | 3 / walk set | 6 / 8 | no / yes | release prop then path |
| stall idle / prepare / cook / serve | 2 / 4 / 4 / 3 | 2 / 6 / 6 / 6 | yes / bounded / bounded / no | service state boundary |

All runtime animation definitions must additionally specify facing, pivot, prop anchor, transition, and asset reference. Reduced-motion mode substitutes static state poses and removes bobbing, flashes, and large reaction movement while preserving timing.

## Environment theme: Community Courtyard

A fictional sheltered neighbourhood centre uses pale terrazzo-like floor shapes, teal structural bands, warm stall fronts, communal tables, ceiling fans, practical lighting, tray-return stations, hand-wash points, plants, and expansion bays suggested by shuttered perimeter panels. It references functions and spatial patterns, not a specific real centre.

Starting, early, mid, and late layouts reuse the same kit. The tutorial starts with two stalls, a small communal seating cluster, clear entrance spine, tray return, bin, and hand-wash cue. Early layouts add one bay and a second seating pattern; midgame introduces cross-aisles, queue shaping, and ambience zones; late layouts use the full perimeter while retaining multiple exits and readable service lanes. Expansion changes boundary treatment rather than introducing another theme.

## Audio direction

Audio is warm, useful, and low-fatigue: a restrained room-tone bed, occasional crockery and fan texture, short original stall loops keyed to prepare/cook/serve, soft footsteps, distinct build/invalid/undo/save cues, and sparse customer reactions. Do not use stereotyped musical shorthand or source recordings copied from real centres.

Mix buses are Master, Music, Ambience, Effects, and UI. Music is optional and never required for rhythm or progression. Spatial panning is gentle; critical cues also have visual/text equivalents. Standard mode allows up to 16 voices and lower-end mode 8. Reduced-motion does not alter timing; mute never blocks feedback. Every file or synthesized recipe needs a provenance row, loop-point check, peak/normalization check, and license review.

## Asset delivery and review

Each asset needs a stable source recipe, runtime reference, footprint, pivot/depth anchor, license/provenance row, contrast inspection, and screenshot at reference and minimum viewport. Before release, remove debug geometry, broken references, accidental brand resemblance, illegible text, and mixed visual conventions. Final approval requires human visual and cultural review; neither is complete.
