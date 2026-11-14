---
inclusion: fileMatch
fileMatchPattern: "{src/ghosts/**,src/ui/**}"
---

# Halloween style

- Spooky but readable. Readability wins over atmosphere every time.
- `design/DESIGN.md` is the source of truth for the UI: palette, tokens, type, spacing, ghost shapes. Read it first. If code and DESIGN.md disagree, change one deliberately and update the other.
- Use design tokens, not hard-coded colours or sizes.
- Ghost mapping: shape = sound class, position = bearing, glow = urgency. Do not add other meanings. Each class keeps a distinct silhouette that is recognisable without colour.
- Ghost tokens must keep contrast (WCAG AA) on the dark background at every glow level. Glow adds emphasis and must not be the only urgency cue. Pair it with size, outline weight or a text label.
- Fog, flicker and drift are decoration. Keep them subtle, never over text, and turn them off under `prefers-reduced-motion`.
- Spooky wording is fine in titles and flavour text. Alerts and settings use plain, direct language.
- Avoid flashing faster than 3 times per second.
