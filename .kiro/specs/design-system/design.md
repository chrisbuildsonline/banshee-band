# Design: Project scaffold and design system

## Overview

Three deliverables, each with one job:

| Artifact | Job |
|---|---|
| `design/DESIGN.md` | Source of truth: values, rules, screen layouts |
| `src/ui/tokens.css` | The same values as CSS custom properties |
| `styleguide.html` | Shows the tokens in use, and is the target of the e2e tests |

A unit test links the first two. A Playwright test checks the third.

```
design/DESIGN.md --(parsed by)--> tests/ui/tokens.test.ts <--(parsed)-- src/ui/tokens.css
                                                                          |
                                src/ui/styleguide.css --uses--> tokens ---+
                                styleguide.html + src/ui/styleguide.ts
                                          |
                                e2e/styleguide.spec.ts --> e2e/screenshots/*.png
```

## Scaffold

### Files created at implementation

```
package.json            scripts, devDependencies
bun.lock
tsconfig.json           strict, noEmit, ES2022, DOM, moduleResolution bundler
vite.config.ts          multi-page build: index.html, styleguide.html
vitest.config.ts        node environment, include tests/**/*.test.ts
playwright.config.ts    webServer: bun run dev, baseURL http://localhost:5173
index.html              placeholder app shell that imports tokens.css
styleguide.html         at repo root so Vite serves it at /styleguide.html
src/ui/tokens.css
src/ui/styleguide.css
src/ui/styleguide.ts    theme toggle only
src/main.ts             placeholder entry
design/DESIGN.md
tests/ui/tokens.test.ts
tests/ui/contrast.ts    helper: parse colours, compute WCAG ratio (pure functions)
e2e/styleguide.spec.ts
e2e/screenshots/.gitkeep
```

Plus a `.gitkeep` in each empty folder from `structure.md`.

### Scripts

```json
{
  "dev": "vite",
  "build": "tsc --noEmit && vite build",
  "test": "vitest run",
  "e2e": "playwright test",
  "typecheck": "tsc --noEmit"
}
```

Run with `bun run <script>`. Dev dependencies: `vite`, `typescript`, `vitest`, `fast-check`, `@playwright/test`, `@types/node`. No runtime dependencies in this feature.

`fast-check` is installed now because `tech.md` makes it the project's property test library. This feature uses it for one property (see Testing).

### Decisions

- **Vite multi-page build.** `styleguide.html` sits at the repo root as a second `rollupOptions.input`. This gives the path `/styleguide.html` in dev and build with no router. Alternative: a hash route in the main app. Rejected because the styleguide must load without the app code.
- **Plain CSS, no framework.** Tokens are custom properties. No Tailwind, no CSS-in-JS. This keeps the token test a text parse, and keeps the bundle small.
- **System font stack.** `ui-sans-serif, system-ui, ...`. No remote or bundled web fonts, which satisfies the no-network rule and avoids a licence note.
- **Tests parse files as text.** The unit test reads `design/DESIGN.md` and `src/ui/tokens.css` with `node:fs`. No jsdom, no browser.
- **Playwright runs Chromium only** for now. Web Bluetooth tests later need it anyway.

## DESIGN.md structure

Fixed headings, so the test can find the table.

1. **Principles**: calm, spooky but readable, one accent, readability beats atmosphere, not a safety device.
2. **Colour**: canvas, surface, text, border, the single accent and its tint and shade steps, focus ring. Day and Night.
3. **Shape and elevation**: radius, soft shadow, spacing scale.
4. **Typography**: type scale table.
5. **Components**: primary pill, secondary pill, disabled pill, status pills, card, event list row.
6. **Ghosts**: shape per class (named only, drawn in a later feature), glow levels paired with size and outline weight.
7. **Motion**: tokens, what animates, reduced-motion replacements.
8. **Contrast table**: pair, theme, measured ratio, threshold.
9. **Screens**: layouts, desktop and phone.
10. **Token reference**: the machine-read table.

### Token reference table format

Pipe table, with exactly these columns. The test reads rows under the heading `## Token reference`.

```
| Token | Day | Night | Purpose |
|---|---|---|---|
| `--bb-color-canvas` | `#F4F1EC` | `#0E0B14` | Page background |
```

Rules the test relies on:

- Token name is in backticks and starts with `--bb-`.
- Day and Night cells hold a value in backticks. A theme-independent token writes the same value in both cells, or `same` in the Night cell. The `same` form marks it as theme-independent (requirement 6.4).
- Names appear outside this table only for explanation. The test reads only this table.

### Token set

Names below are the contract. Values are decided in DESIGN.md and must satisfy the contrast table. Suggested starting values are marked as a starting point, not a decision.

| Group | Tokens |
|---|---|
| Colour | `--bb-color-canvas`, `--bb-color-surface`, `--bb-color-surface-raised`, `--bb-color-border`, `--bb-color-text`, `--bb-color-text-muted`, `--bb-color-accent`, `--bb-color-accent-tint`, `--bb-color-accent-strong`, `--bb-color-on-accent`, `--bb-color-focus` |
| Primary pill | `--bb-color-pill-bg` (near-black), `--bb-color-pill-text`, `--bb-color-pill-outline` |
| Status pill | `--bb-color-status-neutral-bg`, `--bb-color-status-neutral-text`, `--bb-color-status-accent-bg`, `--bb-color-status-accent-text`, `--bb-color-status-strong-bg`, `--bb-color-status-strong-text` |
| Ghost | `--bb-ghost-fill`, `--bb-ghost-outline`, `--bb-ghost-glow-1`, `--bb-ghost-glow-2`, `--bb-ghost-glow-3` |
| Shape | `--bb-radius-card` (16-20px), `--bb-radius-pill` (999px), `--bb-radius-control`, `--bb-shadow-soft` |
| Space | `--bb-space-1` to `--bb-space-8` (4px base, 4, 8, 12, 16, 24, 32, 48, 64) |
| Type | `--bb-font-family`, and per step `--bb-type-<step>-size`, `-line`, `-weight` for steps `display`, `title`, `heading`, `body`, `label`, `caption` |
| Layout | `--bb-target-min` (44px), `--bb-content-max` |
| Motion | `--bb-motion-fast`, `--bb-motion-slow`, `--bb-motion-ghost-drift` (each a duration, `0s` under reduced motion) |

Starting-point direction: warm off-white Day canvas, near-black ink, a single violet accent (a "banshee" violet) for Day and a lighter violet for Night, so Night accent text passes 4.5:1 on the night canvas. The final values are fixed in DESIGN.md when the contrast table is computed.

### Single accent rule

"Exactly one accent" is enforced by naming. The only hue-bearing colour tokens are `--bb-color-accent*`, `--bb-color-status-accent-*`, `--bb-ghost-*` and `--bb-color-focus`, and all of them derive from the accent hue. Every other colour token is a neutral. The test checks that the accent family is the only family not marked neutral in a `Hue` note column of the colour section (see Testing, check 5).

### Near-black pill in Night

Near-black on a near-black canvas disappears. The Night pill keeps its near-black fill and adds `--bb-color-pill-outline` (light, 3:1 or more against the canvas) plus light text. Day uses no outline (the token is `transparent`).

### Status pills

Short, tinted, rounded with `--bb-radius-pill`. Each state has a glyph (text character or inline SVG) and a label.

| State | Label | Glyph | Tint |
|---|---|---|---|
| Listening | Listening | ● (filled circle) | accent |
| Paused | Paused | ❚❚ (pause bars) | neutral |
| Band connected | Band connected | ◆ (diamond) | accent |
| Band not connected | Band not connected | ○ (open circle) | neutral |
| Fallback active | Phone vibration fallback | ▲ (triangle) | neutral |
| Error | Problem | ✕ (cross) | strong (near-black bg, light text) |

Glyphs are final design choices to confirm when writing DESIGN.md. They are chosen so that each differs in shape, not only in tint.

### Screen layouts to specify

All ten layouts go in DESIGN.md Section 9 as region lists plus an ASCII wireframe each. Common rules: one `<main>`, a header with the status pills, one primary pill per screen, a live region `aria-live="polite"` for text alerts, and a logical tab order that follows reading order.

| Screen | Desktop (1440px) | Phone (390px) | Primary action |
|---|---|---|---|
| Listening station | Header, ghost field (large card, left, about 2/3 width), side column with live alert text and recent events list | Header, ghost field on top, alert text, recent events below, sticky bottom action | Start / Stop listening |
| Pipeline view | Four step cards in a row: Listen, Classify, Bearing, Haptics. Each shows its current state as text | Same four cards stacked | None (read only) |
| Settings | Two columns: sound classes (on/off, loudness) and output (band, simulator, vibrate). Each class has a toggle and a loudness slider with a numeric field | One column, same order | Save is not needed: changes apply at once. No primary action |
| Onboarding | Centred single card, step list, mic explanation | Full-width card | Allow microphone (asks only after click) or Use sample clips |
| Band simulator | Left and right motor cards with level meters as text and bars, pattern timeline beneath | Motors side by side, timeline beneath | Connect band is secondary. No primary action |

Notes:
- Text equivalents: the ghost field has a DOM list of current ghosts with class, side and urgency. The motor level bars have a text value.
- Onboarding says plainly that audio stays on the device, and that Banshee Band is an aid and not a safety device.
- Where a screen has no primary action, the near-black pill is not used. The rule "at most one" holds.

## Components

Styleguide markup uses semantic HTML and class names with the `bb-` prefix. No component code ships beyond CSS and the theme toggle.

| Component | Markup | Notes |
|---|---|---|
| Primary pill | `<button class="bb-pill bb-pill--primary">` | near-black, min 44px high, radius pill |
| Secondary pill | `<button class="bb-pill bb-pill--secondary">` | surface fill, border |
| Disabled pill | `<button class="bb-pill" disabled>` | uses `disabled`, not just a class. Text stays at 4.5:1 per the contrast rule for text, or is clearly marked as inactive by text and outline style (WCAG exempts disabled controls, but we meet it anyway) |
| Status pill | `<span class="bb-status bb-status--listening"><span aria-hidden="true">●</span> Listening</span>` | glyph is decorative, label carries meaning |
| Card | `<section class="bb-card">` with a heading | surface, radius card, soft shadow |
| Event list row | `<li class="bb-event">` inside `<ul>` | ghost glyph (inline SVG, `aria-hidden`), class label, side, urgency word, time in a `<time>` |
| Theme control | `<button aria-pressed>` or a two-option radio group | sets `document.documentElement.dataset.theme` |

### Event list row

```
[ghost glyph]  Knock        Left side   Urgent        13:36
```

Reading text: "Knock, left side, urgent, 13:36". Urgency is a word (Low, Medium, Urgent) and also changes outline weight on the glyph. Glow is extra.

## Theme and motion behaviour in tokens.css

```css
:root { /* Day values */ }
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="day"]) { /* Night values */ }
}
:root[data-theme="night"] { /* Night values */ }
@media (prefers-reduced-motion: reduce) {
  :root { --bb-motion-fast: 0s; --bb-motion-slow: 0s; --bb-motion-ghost-drift: 0s; }
}
```

The Night values are written twice (media query and attribute). The unit test parses both blocks and checks they define the same values, so they cannot drift. This is the cost of supporting both the OS setting and a manual choice without JavaScript.

Components apply motion with `transition-duration: var(--bb-motion-fast)`. Under reduced motion this gives a zero duration. Any `@keyframes` animation sits inside `@media (prefers-reduced-motion: no-preference)`. The styleguide has no flashing. Pulse and flicker are limited to the later ghost feature and stay under 3 Hz.

## Testing

### Unit: `tests/ui/tokens.test.ts` (Vitest, node)

| # | Check | Requirement |
|---|---|---|
| 1 | Table parse returns more than zero tokens | 6.5 |
| 2 | Every DESIGN.md token is defined in `:root` of tokens.css | 6.2, 3.1 |
| 3 | No token in tokens.css is missing from DESIGN.md | 6.3, 3.7 |
| 4 | Each token has a Night value or `same` | 6.4 |
| 5 | Accent family check and radius check (16-20px) | 6.6, 3.8 |
| 6 | Night block and media-query block have identical declarations | 3.2, 3.3 |
| 7 | Contrast pairs from the DESIGN.md table pass their thresholds and match the stated ratio within 0.1 | 6.7, 4.1 |
| 8 | No remote `@import` or `url(http...)` in tokens.css and styleguide.css | 3.6, 1.9 |
| 9 | Reduced-motion block zeroes every `--bb-motion-*` token | 3.5 |

Property test (fast-check, in `tests/ui/contrast.test.ts`): for any two sRGB colours, `contrast(a, b) === contrast(b, a)`, the ratio lies in [1, 21], and `contrast(a, a) === 1`. This protects the helper that check 7 depends on. A broken helper would make the AA claim worthless.

The parser is a small pure function (`parseTokenTable(markdown)`, `parseCssTokens(css)`) with its own tests on small inline strings, including a malformed table, which must throw with a clear message.

### E2E: `e2e/styleguide.spec.ts` (Playwright, Chromium)

For each viewport 1440x900 and 390x844, and each theme day and night (set through `data-theme` before screenshot):

1. Register listeners for `console` (error and warning), `pageerror` and `request`. Fail on any entry, and on any request whose origin is not the base URL.
2. Go to `/styleguide.html`, wait for `load`.
3. Assert `scrollWidth <= innerWidth`.
4. Save `fullPage` screenshot to `e2e/screenshots/styleguide-<width>-<theme>.png`.
5. Also save the day screenshot as `styleguide-<width>.png`, to match the file names in requirement 7.3.

Additional tests:

- **Keyboard:** press Tab repeatedly, and for each focused element assert a non-zero outline or box-shadow ring, and assert the focus order follows the DOM order. Press Enter or Space on the theme control and assert `data-theme` changes.
- **Reduced motion:** `page.emulateMedia({ reducedMotion: 'reduce' })`, then `document.getAnimations()` returns no running animations.
- **Structure:** one `h1`, one `main`, all five status pill labels visible, the type scale lists every step.

Screenshots are an output for review, not a baseline comparison. No pixel diffing in this feature (a later feature can add it).

## Error handling

- Token test failures print the missing and extra names as lists.
- A malformed Token reference table throws `Token reference table not found` or `Row N: expected 4 columns`.
- Playwright fails with the collected console and request logs in the message.

## Risks

- **Markdown table parsing is brittle.** Mitigation: fixed headings and format, a clear error on malformed input, and parser unit tests.
- **Night values duplicated in CSS.** Mitigation: check 6.
- **Colour values that look right but fail AA.** Mitigation: contrast table computed by test, not by eye.
- **Glyph rendering differs by OS font.** Mitigation: use inline SVG for glyphs if the text characters render inconsistently in Chromium screenshots. Label text carries the meaning either way.
