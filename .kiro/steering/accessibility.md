---
inclusion: always
---

# Accessibility

The users are Deaf and hard-of-hearing. Accessibility is the product, not a polish step.

- Never convey information by colour alone. Pair colour with shape, position, label or pattern.
- Every alert has three forms: visual (ghost), haptic (pattern) and text (readable label with class, side and urgency, exposed to screen readers through an `aria-live` region). No form may be the only one.
- Never rely on sound for feedback in the UI.
- Respect `prefers-reduced-motion`: stop drifting, flicker and pulsing animation. Show state through static changes such as size, outline and text.
- Meet WCAG AA contrast: 4.5:1 for text, 3:1 for large text and UI components, including ghosts, glows and focus rings, against their actual backgrounds.
- Everything is reachable and operable by keyboard, with visible focus and a logical tab order. Canvas content needs a DOM text equivalent.
- Settings (class on/off, loudness threshold) must be usable without a pointer and without the band.
- Use plain language in UI copy. State clearly when the band is not connected and which fallback is active.
- Add e2e checks for keyboard flow and reduced motion when touching the UI.
