# Banshee Band design system

The single source of truth for how Banshee Band looks. `src/ui/tokens.css` implements the Token reference table at the end of this file, and `tests/ui/tokens.test.ts` fails if the two disagree. Change a value here and in `tokens.css` in the same commit.

Visual direction comes from current product work rather than admin templates: floating white cards on a soft neutral canvas, one near-black pill for the main action, big numbers with muted units, and short tinted status pills. The Night theme is the same product after dark: aubergine-black canvas, lifted violet-black surfaces, and violet "moonlight" on the ghosts. Reference shots live in `design/refs/` (gitignored, never shipped).

## Principles

1. **Calm.** The screen is quiet until a sound arrives. Lots of space, few lines, no boxes inside boxes.
2. **Spooky but readable.** Readability beats atmosphere every time. Atmosphere lives in the ghosts, the Night canvas and the flavour titles. It never sits behind text.
3. **One accent.** Violet is the only hue. It marks links, selection, focus, charts and ghosts. Everything else is a neutral.
4. **First thing on a screen** is a title, a status, or the one primary action.
5. **Never colour alone.** Every state has a word and a glyph. Every ghost urgency has a size, an outline weight and a word.
6. **An aid, not a safety device.** Use this exact sentence wherever the UI states it:

   > Banshee Band is an aid, not a safety device. It can miss or misread sounds, so keep your smoke alarms and other certified alerting devices.

## Colour

All colour values are in the Token reference table. This table says what each colour is for and which hue family it belongs to. `neutral` means a grey with a channel spread (chroma) of at most 0.10, allowed to lean slightly towards the accent. `accent` means the token sits within 15 degrees of the accent hue. There is no third family.

| Token | Hue | Role |
|---|---|---|
| `--bb-color-canvas` | neutral | Page background. Day is a soft cool grey so white cards float on it; Night is aubergine-black. |
| `--bb-color-surface` | neutral | Cards. White in Day, lifted violet-black in Night. |
| `--bb-color-surface-raised` | neutral | Tiles inside a card, list rows on hover, the disabled pill fill. |
| `--bb-color-border` | neutral | Component boundaries that must be seen: secondary pill, inputs, disabled outline. Not used for decorative dividers; space separates sections. |
| `--bb-color-text` | neutral | Titles, numbers, body text. |
| `--bb-color-text-muted` | neutral | Units, captions, secondary lines. Still 4.5:1 on every surface. |
| `--bb-color-accent` | accent | Links, selection, chart strokes, the active segment indicator. |
| `--bb-color-accent-tint` | accent | Selected backgrounds, chart fills. |
| `--bb-color-accent-strong` | accent | Accent text on an accent tint. |
| `--bb-color-on-accent` | neutral | Text on a solid accent fill. |
| `--bb-color-focus` | accent | Focus ring on every interactive element. |
| `--bb-color-pill-bg` | neutral | The near-black primary pill. |
| `--bb-color-pill-text` | neutral | Text on the primary pill. |
| `--bb-color-pill-outline` | neutral | Night only: light outline that keeps the near-black pill visible on a near-black canvas. `transparent` in Day. |
| `--bb-color-status-neutral-bg` | neutral | Status pill tint: paused, band not connected, fallback active. |
| `--bb-color-status-neutral-text` | neutral | Text and glyph on the neutral status tint. |
| `--bb-color-status-accent-bg` | accent | Status pill tint: listening, band connected. |
| `--bb-color-status-accent-text` | accent | Text and glyph on the accent status tint. |
| `--bb-color-status-strong-bg` | neutral | Status pill for problems: the strongest contrast the theme has. Near-black in Day, near-white in Night. |
| `--bb-color-status-strong-text` | neutral | Text and glyph on the strong status pill. |
| `--bb-ghost-fill` | accent | Ghost body. |
| `--bb-ghost-outline` | accent | Ghost outline. Weight carries urgency (see Ghosts). |
| `--bb-ghost-glow-1` | accent | Glow colour, low urgency. |
| `--bb-ghost-glow-2` | accent | Glow colour, medium urgency. |
| `--bb-ghost-glow-3` | accent | Glow colour, urgent. |

Choices and where they come from:

- **Canvas `#EEF0F4` (Day).** A cool, soft grey that lets white cards float with only a shadow. Taken from the light grey stage under the white air-conditioner card in ref 01 (Telllasio) and the floating white sheet with grey tiles in ref 03 (Smart Home Manager), cooled slightly so the violet accent stays clean.
- **Accent violet `#6236E0` (Day) / `#B49CFF` (Night).** Ref 07 (Modern Analytics) uses a saturated purple for selection and the theme switch; ref 08 (ad-tech analytics) uses a soft periwinkle-violet for its third chart. Violet is also the "banshee" colour from the spec. The Night accent is lighter so accent text passes 4.5:1 on the dark canvas.
- **Night canvas `#0E0B14`, surface `#1A1622`.** Refs 01, 07 and 08 separate dark cards from a darker page by lightness alone, with no borders. Night leans the neutrals towards violet so the whole screen feels moonlit without adding a second hue.
- **Night atmosphere.** The only decoration in Night is one soft radial glow of `accent-tint` at the top of the page canvas (a moonrise behind the title). It is static, never over a card, and text on it is measured in the Contrast table. Ghosts carry the rest of the mood.
- **Near-black pill `#111318`.** The darkest neutral, the same ink as the text, so the one primary action reads as the heaviest thing on the screen (ref 03's dark title weight, ref 01's single bright control per card).

## Shape and elevation

- **Card radius** `--bb-radius-card`: 20px. Cards, the ghost field, sheets.
- **Control radius** `--bb-radius-control`: 12px. Tiles inside cards, inputs, swatches.
- **Pill radius** `--bb-radius-pill`: 999px. Buttons and status pills.
- **Soft shadow** `--bb-shadow-soft`: a hairline contact shadow plus a wide, faint ambient one. Cards float; they do not have borders. In Night the shadow is deeper and adds a faint top highlight, because a dark shadow on a dark canvas barely shows.
- **Spacing scale** `--bb-space-1` to `--bb-space-8`: 4, 8, 12, 16, 24, 32, 48, 64px. Inside a card use 16-24. Between cards use 16 (phone) or 24 (desktop). Between page sections use 48-64.
- **Targets**: every interactive element is at least `--bb-target-min` (44px) in both directions.
- **Content width**: `--bb-content-max` (1200px), centred, with 24px side padding on desktop and 16px on phone.
- **Breakpoint**: one breakpoint at 720px (CSS media queries cannot read custom properties, so it is written as a literal). Below it, every layout is one column.

## Typography

System font stack only: `ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`. No web fonts, local or remote, so the app works offline and has no licence note. Numbers use `font-variant-numeric: tabular-nums` so times and levels do not jitter.

| Step | Size | Line height | Weight | Use |
|---|---|---|---|---|
| `display` | `clamp(2.5rem, 1.75rem + 3vw, 4rem)` (40-64px) | 1.05 | 700 | Big numbers, the one hero title per screen |
| `title` | `clamp(1.75rem, 1.4rem + 1.5vw, 2.25rem)` (28-36px) | 1.15 | 700 | Screen titles |
| `heading` | 1.25rem (20px) | 1.3 | 600 | Card headings |
| `body` | 1rem (16px) | 1.5 | 400 | Body text, list rows |
| `label` | 0.875rem (14px) | 1.3 | 500 | Pills, buttons, field labels |
| `caption` | 0.8125rem (13px) | 1.4 | 400 | Units, timestamps, helper text (always `text-muted`) |

Large text for the 3:1 rule means `title` and `display` only. Everything smaller is held to 4.5:1.

## Components

### Pills

| Pill | Look | Rule |
|---|---|---|
| Primary | `pill-bg` fill, `pill-text` label, `pill-outline` 2px outline (transparent in Day) | At most one per screen. Never used where a screen has no primary action. On phones it sits in a sticky bottom bar within thumb reach. |
| Secondary | `surface` fill, 1px `border`, `text` label | Any number. Hover lifts to `surface-raised`. |
| Disabled | `surface-raised` fill, 1px dashed `border`, `text-muted` label, real `disabled` attribute | Not focusable. The dashed outline and muted text mark it inactive without relying on colour. |

All pills: `label` type, min height 44px, padding 12px 24px, `radius-pill`. Focus: 3px `focus` outline with 2px offset.

### Status pills

Short, tinted, `radius-pill`, `label` type, min height 32px (status pills are not interactive). The glyph is decorative (`aria-hidden`); the label carries the meaning. Each glyph differs in shape, not only in tint. Glyphs are drawn as 12px inline SVG in the shapes below (filled in `currentColor`), because text characters such as ❚❚ render differently, or not at all, across system fonts.

| State | Label | Glyph | Tint |
|---|---|---|---|
| Listening | Listening | ● filled circle | accent |
| Paused | Paused | ❚❚ pause bars | neutral |
| Band connected | Band connected | ◆ diamond | accent |
| Band not connected | Band not connected | ○ open circle | neutral |
| Fallback active | Phone vibration fallback | ▲ triangle | neutral |
| Error | Problem | ✕ cross | strong |

The listening dot may breathe slowly (one cycle every 6s) when motion is allowed. Under reduced motion it is a static filled circle.

### Card

`surface` fill, `radius-card`, `shadow-soft`, padding 24px (16px on phone). A card has a heading (`heading` step) and, if it shows a number, the number in `display` with its unit in `caption` muted beside it. Tiles inside a card use `surface-raised` and `radius-control`, never a border.

### Event list row

```
[ghost tile]  Knock                    [Urgent]   13:36
              Left side
```

One row per sound, newest first. Scannable in three hops: kind (bold `body`), where (muted `caption` under it), then urgency and time on the right. Reading text: "Knock, left side, urgent, 13:36". The ghost glyph sits in a 48px `surface-raised` circle; its size and outline weight follow the urgency (see Ghosts). Urgency is also a word in a status-style pill: Low = neutral tint, Medium = accent tint, Urgent = strong. Rows are separated by space and a `surface-raised` hover fill, not by lines.

### Theme control

A two-option segmented control, "Day" and "Night", each with a sun or moon glyph, inside a floating `surface` track with `shadow-soft` (the sun/moon switch in refs 01 and 07). Each option is a `<button aria-pressed>` at least 44px tall; the pressed one is a selection, so it takes `accent-tint` with an `accent-strong` label, and the other stays `text-muted`. It sets `data-theme` on `<html>`. With no choice made, the OS setting (`prefers-color-scheme`) decides. Without JavaScript the page shows the Day theme (or the OS dark theme) and stays fully readable.

## Ghosts

Mapping is fixed: **shape = sound class, position = bearing, glow = urgency.** Nothing else carries meaning. Ghosts are drawn in a later feature; this section fixes their vocabulary.

| Class | Silhouette (recognisable without colour) |
|---|---|
| Knock | Tall ghost with a square-shouldered top and a flat hem |
| Alarm | Bell-shaped ghost with a wide flared hem |
| Voice | Round ghost with an open, wavy mouth |
| Vehicle | Wide, low ghost with a long trailing hem |
| Baby | Small round ghost with a single curl on top |

Glow levels always pair with size and outline weight, and the text alert repeats the urgency word, so glow is never the only cue:

| Urgency | Word | Glow colour | Size (ghost field) | Size (list glyph) | Outline weight (24-unit glyph) |
|---|---|---|---|---|---|
| Low | Low | `--bb-ghost-glow-1` | 1x | 24px | 1.5 |
| Medium | Medium | `--bb-ghost-glow-2` | 1.25x | 32px | 2.5 |
| Urgent | Urgent | `--bb-ghost-glow-3` | 1.5x | 40px | 3.5 |

Fill, outline and every glow level keep at least 3:1 against the surface they sit on (see Contrast table). Glow blur radius grows with urgency (4, 8, 12px). Fog, flicker and drift are decoration: subtle, never over text, under 3 flashes per second, and off under reduced motion.

## Motion

| Token | Value | What uses it |
|---|---|---|
| `--bb-motion-fast` | 150ms | Hover and press feedback (a theme change is instant) |
| `--bb-motion-slow` | 400ms | New alert entering the list, card reveal |
| `--bb-motion-ghost-drift` | 6s | Ghost float loop, listening dot breathing (0.17 cycles per second) |

Components apply motion with `transition-duration: var(--bb-motion-fast)` and friends, so a zero token means no motion. Every `@keyframes` animation is declared inside `@media (prefers-reduced-motion: no-preference)`.

Under `prefers-reduced-motion: reduce` all three tokens resolve to `0s`, and:

| Stops | Replaced by |
|---|---|
| Ghost drift and float | Ghost drawn at its bearing position, still |
| Glow pulse and flicker | Steady glow at the urgency level; size and outline weight unchanged |
| Fog movement | Static fog, or none |
| Listening dot breathing | Static filled circle plus the word "Listening" |
| New alert slide-in | Row appears in place; the live region text is unchanged |

Nothing in the system flashes more than 3 times per second. No feedback depends on sound.

## Contrast table

Ratios are WCAG 2.x, computed from the hex values in `tokens.css` by `tests/ui/tokens.test.ts`, which fails if any ratio is under its threshold or differs from the stated value by more than 0.1. Thresholds: 4.5 for text, 3 for UI boundaries, focus rings and ghost marks.

| Pair | Foreground | Background | Theme | Ratio | Threshold |
|---|---|---|---|---|---|
| Body text on canvas | `--bb-color-text` | `--bb-color-canvas` | Day | 16.29 | 4.5 |
| Body text on card | `--bb-color-text` | `--bb-color-surface` | Day | 18.58 | 4.5 |
| Body text on tile | `--bb-color-text` | `--bb-color-surface-raised` | Day | 17.04 | 4.5 |
| Muted text on canvas | `--bb-color-text-muted` | `--bb-color-canvas` | Day | 5.54 | 4.5 |
| Muted text on card | `--bb-color-text-muted` | `--bb-color-surface` | Day | 6.32 | 4.5 |
| Muted text on tile | `--bb-color-text-muted` | `--bb-color-surface-raised` | Day | 5.79 | 4.5 |
| Link on canvas | `--bb-color-accent` | `--bb-color-canvas` | Day | 5.89 | 4.5 |
| Link on card | `--bb-color-accent` | `--bb-color-surface` | Day | 6.72 | 4.5 |
| Text on accent fill | `--bb-color-on-accent` | `--bb-color-accent` | Day | 6.72 | 4.5 |
| Accent text on tint | `--bb-color-accent-strong` | `--bb-color-accent-tint` | Day | 7.92 | 4.5 |
| Boundary on canvas | `--bb-color-border` | `--bb-color-canvas` | Day | 3.37 | 3 |
| Boundary on card | `--bb-color-border` | `--bb-color-surface` | Day | 3.85 | 3 |
| Focus ring on canvas | `--bb-color-focus` | `--bb-color-canvas` | Day | 5.89 | 3 |
| Focus ring on card | `--bb-color-focus` | `--bb-color-surface` | Day | 6.72 | 3 |
| Primary pill label | `--bb-color-pill-text` | `--bb-color-pill-bg` | Day | 18.58 | 4.5 |
| Primary pill on canvas | `--bb-color-pill-bg` | `--bb-color-canvas` | Day | 16.29 | 3 |
| Primary pill on card | `--bb-color-pill-bg` | `--bb-color-surface` | Day | 18.58 | 3 |
| Status neutral label | `--bb-color-status-neutral-text` | `--bb-color-status-neutral-bg` | Day | 8.60 | 4.5 |
| Status accent label | `--bb-color-status-accent-text` | `--bb-color-status-accent-bg` | Day | 7.92 | 4.5 |
| Status strong label | `--bb-color-status-strong-text` | `--bb-color-status-strong-bg` | Day | 18.58 | 4.5 |
| Ghost fill on card | `--bb-ghost-fill` | `--bb-color-surface` | Day | 3.80 | 3 |
| Ghost outline on card | `--bb-ghost-outline` | `--bb-color-surface` | Day | 9.60 | 3 |
| Ghost glow low on card | `--bb-ghost-glow-1` | `--bb-color-surface` | Day | 3.37 | 3 |
| Ghost glow medium on card | `--bb-ghost-glow-2` | `--bb-color-surface` | Day | 5.60 | 3 |
| Ghost glow urgent on card | `--bb-ghost-glow-3` | `--bb-color-surface` | Day | 9.60 | 3 |
| Ghost fill on tile | `--bb-ghost-fill` | `--bb-color-surface-raised` | Day | 3.48 | 3 |
| Body text on canvas | `--bb-color-text` | `--bb-color-canvas` | Night | 17.05 | 4.5 |
| Body text on card | `--bb-color-text` | `--bb-color-surface` | Night | 15.54 | 4.5 |
| Body text on tile | `--bb-color-text` | `--bb-color-surface-raised` | Night | 14.01 | 4.5 |
| Body text on moonrise glow | `--bb-color-text` | `--bb-color-accent-tint` | Night | 12.70 | 4.5 |
| Muted text on moonrise glow | `--bb-color-text-muted` | `--bb-color-accent-tint` | Night | 5.86 | 4.5 |
| Eyebrow (accent) on moonrise glow | `--bb-color-accent` | `--bb-color-accent-tint` | Night | 6.40 | 4.5 |
| Muted text on canvas | `--bb-color-text-muted` | `--bb-color-canvas` | Night | 7.87 | 4.5 |
| Muted text on card | `--bb-color-text-muted` | `--bb-color-surface` | Night | 7.17 | 4.5 |
| Muted text on tile | `--bb-color-text-muted` | `--bb-color-surface-raised` | Night | 6.47 | 4.5 |
| Link on canvas | `--bb-color-accent` | `--bb-color-canvas` | Night | 8.49 | 4.5 |
| Link on card | `--bb-color-accent` | `--bb-color-surface` | Night | 7.73 | 4.5 |
| Text on accent fill | `--bb-color-on-accent` | `--bb-color-accent` | Night | 8.30 | 4.5 |
| Accent text on tint | `--bb-color-accent-strong` | `--bb-color-accent-tint` | Night | 9.71 | 4.5 |
| Boundary on canvas | `--bb-color-border` | `--bb-color-canvas` | Night | 3.90 | 3 |
| Boundary on card | `--bb-color-border` | `--bb-color-surface` | Night | 3.55 | 3 |
| Focus ring on canvas | `--bb-color-focus` | `--bb-color-canvas` | Night | 8.49 | 3 |
| Focus ring on card | `--bb-color-focus` | `--bb-color-surface` | Night | 7.73 | 3 |
| Primary pill label | `--bb-color-pill-text` | `--bb-color-pill-bg` | Night | 17.66 | 4.5 |
| Primary pill outline on canvas | `--bb-color-pill-outline` | `--bb-color-canvas` | Night | 11.68 | 3 |
| Primary pill outline on card | `--bb-color-pill-outline` | `--bb-color-surface` | Night | 10.64 | 3 |
| Status neutral label | `--bb-color-status-neutral-text` | `--bb-color-status-neutral-bg` | Night | 10.60 | 4.5 |
| Status accent label | `--bb-color-status-accent-text` | `--bb-color-status-accent-bg` | Night | 9.71 | 4.5 |
| Status strong label | `--bb-color-status-strong-text` | `--bb-color-status-strong-bg` | Night | 16.27 | 4.5 |
| Ghost fill on card | `--bb-ghost-fill` | `--bb-color-surface` | Night | 13.76 | 3 |
| Ghost outline on card | `--bb-ghost-outline` | `--bb-color-surface` | Night | 7.73 | 3 |
| Ghost glow low on card | `--bb-ghost-glow-1` | `--bb-color-surface` | Night | 4.81 | 3 |
| Ghost glow medium on card | `--bb-ghost-glow-2` | `--bb-color-surface` | Night | 7.73 | 3 |
| Ghost glow urgent on card | `--bb-ghost-glow-3` | `--bb-color-surface` | Night | 12.89 | 3 |
| Ghost fill on tile | `--bb-ghost-fill` | `--bb-color-surface-raised` | Night | 12.41 | 3 |

The Night primary pill fill is near-black on a near-black canvas (about 1.1:1) by design; its boundary is the light `pill-outline`, which is the pair measured above. The Day `pill-outline` is `transparent` and is not measured.

## Screens

Common rules for every screen:

- One `<main>`, one `<h1>`, headings in order.
- A header with the brand, the status pills (listening state and band state) and a link to Settings. On phones the header shows the status pills only, and navigation moves to a bottom tab bar (Listen, Pipeline, Band, Settings).
- At most one primary pill. Screens without a primary action do not use the near-black pill.
- One `aria-live="polite"` region holds the latest text alert: "Knock, left side, urgent".
- Tab order follows reading order: header, then the regions in the order listed, then the footer. The sticky phone action bar comes last in the DOM order of `<main>` content so it is reached after the content it acts on, but is placed visually at the bottom within thumb reach.
- Canvas content always has a DOM text equivalent.
- Flavour titles are allowed in Night (for example the eyebrow "Listening in the dark"); alerts, settings and errors use plain words.

### Listening station

The home screen. Primary action: **Start listening** / **Stop listening** (same pill, label swaps).

Desktop (1440px):

```
+--------------------------------------------------------------------------------+
| Banshee Band          [● Listening] [○ Band not connected]        Settings     |
|                                                                                |
| Listening station                                         [ Stop listening ]  |
| 3 sounds in the last hour                                                      |
|                                                                                |
| +------------------------------------------------+  +-------------------------+|
| |  Ghost field (canvas)                           |  | Latest alert (live)     ||
| |                                                 |  | Knock                   ||
| |      L  ( ghost )            ( ghost )  R       |  | Left side · Urgent      ||
| |                                                 |  +-------------------------+|
| |  Now: Knock, left, urgent · Voice, right, low   |  | Recent sounds           ||
| +------------------------------------------------+  |  [g] Knock    Urgent 13:36||
|                                                      |  [g] Voice    Low   13:21||
|                                                      +-------------------------+|
| Banshee Band is an aid, not a safety device. ...                               |
+--------------------------------------------------------------------------------+
```

Regions in order:
1. Header: brand, status pills, Settings link.
2. Title block: `title` "Listening station", muted count line, primary pill on the right.
3. Ghost field card, left, about two-thirds width, `radius-card`, min height 480px. Its DOM text equivalent is a list under the canvas ("Now:") naming each current ghost by class, side and urgency.
4. Side column, one-third width: Latest alert card (the `aria-live` region, class in `display`, side and urgency below) and Recent sounds card (event list rows).
5. Footer: the aid sentence, muted.

Tab order: Settings link, primary pill, ghost list (not focusable, read by screen readers), recent sounds rows (only if they become interactive), footer links.

Phone (390px):

```
+------------------------------+
| [● Listening] [○ No band]    |
| Listening station            |
| 3 sounds in the last hour    |
| +--------------------------+ |
| |  Ghost field             | |
| |   L  (ghost)        R    | |
| +--------------------------+ |
| Knock · Left side · Urgent   |  <- live region
| Recent sounds                |
|  [g] Knock     Urgent  13:36 |
|  [g] Voice     Low     13:21 |
|                              |
| [    Stop listening    ]     |  <- sticky bottom bar
| Listen  Pipeline  Band  Set. |
+------------------------------+
```

One job: listen. The ghost field is full width and square-ish (about 360px tall). The primary pill is full width in a sticky bottom bar above the tab bar. Tab order: status pills are not focusable; title, live alert, recent rows, primary pill, tab bar.

### Pipeline view

Shows how a sound moves through the system. Read only. **No primary action.**

Desktop (1440px):

```
+--------------------------------------------------------------------------------+
| Banshee Band          [● Listening] [◆ Band connected]            Settings     |
| Pipeline                                                                        |
| What happens to each sound, step by step                                        |
|                                                                                |
| +-----------------+ +-----------------+ +-----------------+ +-----------------+ |
| | 1 Listen        | | 2 Classify      | | 3 Bearing       | | 4 Haptics       | |
| | Microphone on   | | Knock 92%       | | Left, 38 deg    | | Band: knock     | |
| | Stereo, 16 kHz  | | YAMNet, local   | | Confidence high | | pattern, left   | |
| | [level bars]    | | [top 3 labels]  | | [L ---o--- R]   | | [pulse timeline]| |
| +-----------------+ +-----------------+ +-----------------+ +-----------------+ |
+--------------------------------------------------------------------------------+
```

Regions: header; title block; a row of four equal step cards (Listen, Classify, Bearing, Haptics), each with a step number, a heading, its current state as text in `display` or `heading`, a muted detail line, and a small visual. Every visual has its value as text in the card. Tab order: Settings link only; the cards are not interactive.

Phone (390px): the same four cards stacked in order, full width, with a thin accent connector between them. Tab order unchanged.

### Settings

Changes apply at once. **No primary action** (no Save button).

Desktop (1440px):

```
+--------------------------------------------------------------------------------+
| Banshee Band          [● Listening] [○ Band not connected]                     |
| Settings                                                                       |
| Changes apply right away                                                       |
| +--------------------------------------+ +-----------------------------------+ |
| | Sounds                               | | Output                            | |
| | Knock        [on ]  Loudness [==o] 60| | Band       [Connect band]  ○ Not  | |
| | Alarm        [on ]  Loudness [=o=] 40| | Simulator  [on ]                  | |
| | Voice        [off]  Loudness [o==] 20| | Phone vibration fallback [on ]    | |
| | Vehicle      [on ]  ...              | | Theme      [Day | Night]          | |
| | Baby         [on ]  ...              | +-----------------------------------+ |
| +--------------------------------------+                                       |
+--------------------------------------------------------------------------------+
```

Regions: header; title block; Sounds card (left, wider): one row per class with an on/off switch, a loudness slider and a numeric field bound to it; Output card (right): band connection (Connect band is a secondary pill), simulator switch, vibration fallback switch, theme control. Each switch is a real checkbox or `role="switch"` with a visible label; the slider and number field share one label. Tab order: per class row, switch then slider then number; then the Output card top to bottom.

Phone (390px): one column, Sounds then Output, same order. Rows stack: class name and switch on one line, slider and number below.

### Onboarding

First run. Primary action: **Allow microphone**. The alternative **Use sample clips** is a secondary pill. The microphone permission is asked only after the click.

Desktop (1440px):

```
+--------------------------------------------------------------------------------+
|                                                                                |
|                  +----------------------------------------+                    |
|                  |  Welcome to Banshee Band               |                    |
|                  |  See and feel the sounds around you    |                    |
|                  |                                        |                    |
|                  |  1  We listen with your microphone     |                    |
|                  |  2  Sounds become ghosts and buzzes    |                    |
|                  |  3  Audio never leaves this device     |                    |
|                  |                                        |                    |
|                  |  Banshee Band is an aid, not a safety  |                    |
|                  |  device. ...                           |                    |
|                  |                                        |                    |
|                  |  [ Allow microphone ] [Use sample clips]|                   |
|                  +----------------------------------------+                    |
+--------------------------------------------------------------------------------+
```

Regions: one centred card, max 560px: `title` heading, muted lede, numbered step list (what the app does, that audio stays on the device), the aid sentence, then the two pills. Tab order: Allow microphone, Use sample clips.

Phone (390px): the card is full width; the two pills stack full width at the bottom, primary first, within thumb reach. Same tab order.

### Band simulator

Shows what the wristband would feel. **No primary action**; Connect band is a secondary pill.

Desktop (1440px):

```
+--------------------------------------------------------------------------------+
| Banshee Band          [● Listening] [▲ Phone vibration fallback]   Settings    |
| Band simulator                                         [Connect band]          |
| +-------------------------------------+ +------------------------------------+ |
| | Left motor                          | | Right motor                        | |
| | 80%                                 | | 20%                                | |
| | [=========          ]               | | [==                 ]              | |
| +-------------------------------------+ +------------------------------------+ |
| +----------------------------------------------------------------------------+ |
| | Pattern: Knock (short-short), left stronger                                | |
| | L ▮ ▮      ▮ ▮                                                              | |
| | R ▯ ▯      ▯ ▯                       0 ms ........................ 1500 ms | |
| +----------------------------------------------------------------------------+ |
+--------------------------------------------------------------------------------+
```

Regions: header; title block with the Connect band secondary pill; left and right motor cards, each with the level as a `display` number and a bar; the pattern timeline card beneath, with the pattern named in text. Bars are decorative; the number is the value. Tab order: Connect band, then nothing else (the cards are not interactive).

Phone (390px): the two motor cards stay side by side (two narrow columns), the timeline card full width beneath, Connect band below the title.

## Token reference

The machine-read table. Every token here is defined in `src/ui/tokens.css`, and nothing else is. `same` in the Night column marks a theme-independent token.

| Token | Day | Night | Purpose |
|---|---|---|---|
| `--bb-color-canvas` | `#EEF0F4` | `#0E0B14` | Page background |
| `--bb-color-surface` | `#FFFFFF` | `#1A1622` | Card surface |
| `--bb-color-surface-raised` | `#F4F5F8` | `#241F2E` | Tiles in cards, hover fill, disabled pill |
| `--bb-color-border` | `#7C8291` | `#736C82` | Component boundaries (3:1) |
| `--bb-color-text` | `#111318` | `#F2EEF8` | Primary text and numbers |
| `--bb-color-text-muted` | `#5A606C` | `#A9A1B8` | Secondary text, units, captions |
| `--bb-color-accent` | `#6236E0` | `#B49CFF` | The single accent: links, selection, charts |
| `--bb-color-accent-tint` | `#ECE6FF` | `#2D2348` | Accent background tint |
| `--bb-color-accent-strong` | `#4A22B5` | `#D9CCFF` | Accent text on the tint |
| `--bb-color-on-accent` | `#FFFFFF` | `#120E18` | Text on a solid accent fill |
| `--bb-color-focus` | `#6236E0` | `#B49CFF` | Focus ring |
| `--bb-color-pill-bg` | `#111318` | `#07060A` | Near-black primary pill fill |
| `--bb-color-pill-text` | `#FFFFFF` | `#F2EEF8` | Primary pill label |
| `--bb-color-pill-outline` | `transparent` | `#CCC5DB` | Primary pill outline (Night only) |
| `--bb-color-status-neutral-bg` | `#EBEDF2` | `#2A2533` | Neutral status pill tint |
| `--bb-color-status-neutral-text` | `#3D424D` | `#DDD7E8` | Neutral status pill label |
| `--bb-color-status-accent-bg` | `#ECE6FF` | `#2D2348` | Accent status pill tint |
| `--bb-color-status-accent-text` | `#4A22B5` | `#D9CCFF` | Accent status pill label |
| `--bb-color-status-strong-bg` | `#111318` | `#F2EEF8` | Problem status pill fill |
| `--bb-color-status-strong-text` | `#FFFFFF` | `#15111C` | Problem status pill label |
| `--bb-ghost-fill` | `#8B6CF2` | `#E6DEFF` | Ghost body |
| `--bb-ghost-outline` | `#4A22B5` | `#B49CFF` | Ghost outline |
| `--bb-ghost-glow-1` | `#9478F3` | `#8C74E0` | Glow, low urgency |
| `--bb-ghost-glow-2` | `#6E47EA` | `#B49CFF` | Glow, medium urgency |
| `--bb-ghost-glow-3` | `#4A22B5` | `#E0D6FF` | Glow, urgent |
| `--bb-radius-card` | `20px` | `same` | Card and surface radius |
| `--bb-radius-control` | `12px` | `same` | Tiles, inputs, swatches |
| `--bb-radius-pill` | `999px` | `same` | Pills |
| `--bb-shadow-soft` | `0 1px 2px rgba(17, 19, 24, 0.04), 0 12px 32px rgba(17, 19, 24, 0.07)` | `inset 0 1px 0 rgba(255, 255, 255, 0.04), 0 16px 40px rgba(0, 0, 0, 0.5)` | Soft card shadow |
| `--bb-space-1` | `4px` | `same` | Space step 1 |
| `--bb-space-2` | `8px` | `same` | Space step 2 |
| `--bb-space-3` | `12px` | `same` | Space step 3 |
| `--bb-space-4` | `16px` | `same` | Space step 4 |
| `--bb-space-5` | `24px` | `same` | Space step 5 |
| `--bb-space-6` | `32px` | `same` | Space step 6 |
| `--bb-space-7` | `48px` | `same` | Space step 7 |
| `--bb-space-8` | `64px` | `same` | Space step 8 |
| `--bb-font-family` | `ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif` | `same` | System font stack |
| `--bb-type-display-size` | `clamp(2.5rem, 1.75rem + 3vw, 4rem)` | `same` | Display size |
| `--bb-type-display-line` | `1.05` | `same` | Display line height |
| `--bb-type-display-weight` | `700` | `same` | Display weight |
| `--bb-type-title-size` | `clamp(1.75rem, 1.4rem + 1.5vw, 2.25rem)` | `same` | Title size |
| `--bb-type-title-line` | `1.15` | `same` | Title line height |
| `--bb-type-title-weight` | `700` | `same` | Title weight |
| `--bb-type-heading-size` | `1.25rem` | `same` | Heading size |
| `--bb-type-heading-line` | `1.3` | `same` | Heading line height |
| `--bb-type-heading-weight` | `600` | `same` | Heading weight |
| `--bb-type-body-size` | `1rem` | `same` | Body size |
| `--bb-type-body-line` | `1.5` | `same` | Body line height |
| `--bb-type-body-weight` | `400` | `same` | Body weight |
| `--bb-type-label-size` | `0.875rem` | `same` | Label size |
| `--bb-type-label-line` | `1.3` | `same` | Label line height |
| `--bb-type-label-weight` | `500` | `same` | Label weight |
| `--bb-type-caption-size` | `0.8125rem` | `same` | Caption size |
| `--bb-type-caption-line` | `1.4` | `same` | Caption line height |
| `--bb-type-caption-weight` | `400` | `same` | Caption weight |
| `--bb-target-min` | `44px` | `same` | Minimum interactive target |
| `--bb-content-max` | `1200px` | `same` | Maximum content width |
| `--bb-motion-fast` | `150ms` | `same` | Hover, press, focus, theme change |
| `--bb-motion-slow` | `400ms` | `same` | Alert entry, card reveal |
| `--bb-motion-ghost-drift` | `6s` | `same` | Ghost drift loop, listening dot |
