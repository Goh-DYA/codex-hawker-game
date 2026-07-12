# ADR 0002: Art Style and Perspective

Date: 2026-07-12
Status: Accepted

## Context

A solo developer must produce a coherent theme, 80 placeables, eight stalls, 30 dishes, modular customers, and required animations while preserving grid clarity, browser performance, cultural specificity, and accessibility.

## Decision

Use shape-led, vector-like illustrated 2D authored as code-native/procedural recipes on an orthographic top-down square grid. Use four cardinal facings and restrained frame counts.

## Rationale

Compared with high-resolution painted sprites and isometric pixel art, procedural illustrated shapes are easier to reproduce and license, cheaper to batch/render, and less vulnerable to mixed asset style. Orthographic top-down eliminates most occlusion and depth ambiguity, exposes seats and interaction cells, makes tile selection exact, and reduces furniture/animation workload.

Distinctiveness comes from silhouette families, original color and icon systems, Singapore-informed practical details, food vessels, stall activity, and a coherent Community Courtyard environment—not copied trade dress or an expensive perspective.

## Consequences

- Top surfaces are restrained; objects cannot imply an isometric footprint.
- Depth anchors and pivots follow ART_BIBLE.md.
- Procedural art may be final only after screenshot, consistency, accessibility, and human cultural/art review.
- Debug shapes, text-only stalls, mixed perspectives, and palette-only catalogue duplicates are not final assets.
