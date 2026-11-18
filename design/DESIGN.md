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
| Band connected | Band connected | ● filled dot | accent |
| Band not connected | Band not connected | ○ open circle | neutral |
| Fallback active | Phone vibration fallback | ▲ triangle | neutral |
| Error | Problem | ✕ cross | strong |
| Microphone starting (Listen card) | Starting | ○ open circle | neutral |
| Microphone stopped (Listen card) | Stopped | ■ square | neutral |
| Microphone permission denied (Listen card) | Mic blocked | ✕ cross | strong |
| Phone can vibrate (band simulator page) | Phone vibration on | ▲ triangle | accent |
| Phone cannot vibrate (band simulator page) | No phone vibration here | ○ open circle | neutral |

The two band simulator rows say what the device can do (whether `navigator.vibrate` exists), not that a fallback is active or a band is missing, so they reuse the triangle and open-circle shapes with their own labels. The page reads this once at load.

The station header pill (`src/station/status.ts`) follows the output in use, not only the choice: **Band connected** (filled dot, accent tint) when Buzz on is Wristband and the band is connected; **Phone vibration fallback** when the phone is in use; otherwise **Band not connected**. A chosen Wristband that is not connected (never connected, or lost) is not in use, so the pill says Band not connected and the screen takes over at once. Problem wins until the page resets it. Band connected shares the filled dot with Listening, but the two never sit side by side (Listening is in the Listen card, Band connected in the header) and the word carries the meaning.

### Wristband connect control

`mountBandConnect` (`src/band/connect.ts`, `connect.css`): one row that links the wristband over Web Bluetooth. It sits in the Settings sheet under Buzz on and in the Feel a pattern card of the band simulator page.

```
[(band glyph)]  Wristband                              [ Connect band ]
                No band connected.
```

A `surface-raised` tile (`radius-control`, 16px padding): a 44px round `surface` disc with a small wristband glyph (strap, case and two motor dots, `aria-hidden`), the `label`-step heading "Wristband" in `text`, a muted `caption` status line (`role="status"`, `aria-live="polite"`), and one pill on the right. Under 720px the pill wraps to its own full-width line. The state is always in the words of the status line and the pill, never colour alone.

| State | Status line | Pill | Look |
|---|---|---|---|
| Unsupported (no Web Bluetooth) | "This browser has no Bluetooth link (Safari and Firefox do not have Web Bluetooth). Alerts use the phone or the screen. Chrome or Edge can connect the band." | none | No button at all, not a hidden or disabled one. Only on the band page; the Settings sheet shows no row (the Wristband caption says it). |
| Idle | "No band connected." | **Connect band**, primary | Muted line, `text-muted` glyph on `surface`. |
| Connecting | "Connecting…" | "Connecting…", disabled | The disabled pill look (dashed `border`, `text-muted`). |
| Connected | "Connected to ‹name›." (the device name, else "Banshee Band") | **Disconnect**, secondary | The glyph disc takes `accent-tint` with an `accent-strong` glyph, and the status line turns `accent-strong`. |
| Lost (the band dropped) | "The band disconnected. Alerts use the phone or the screen until it is back." | **Connect band**, primary | As Idle. |
| Cancelled (chooser closed) | "No band was chosen." | **Connect band**, primary | As Idle. |
| Failed | "Could not connect. Check the band is on and close, then try again." | **Connect band**, primary | As Idle. |

The press calls the link's `connect()` inside the click, because the browser's device chooser needs a user gesture; nothing asks for Bluetooth before the press. Disconnect writes nothing to the band (the band stops its own motors when the link drops). **Connect band is a primary pill**, an owner's decision that amends the one-primary rule for this control alone: on the band page it is the page's only primary pill, and in the Settings sheet the page behind the modal is inert, so Start listening is not reachable while it shows.

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

Mapping is fixed: **shape = sound class, position = bearing, glow = urgency.** Nothing else carries meaning. `src/ghosts` draws the ghosts: the silhouettes are SVG paths in a 24-unit box (`SHAPES`), shared by the canvas field and the list glyphs, and the Ghosts section of the styleguide shows them in Day and Night.

| Class | Silhouette (recognisable without colour) |
|---|---|
| Knock | Tall ghost with a square-shouldered top and a flat hem |
| Doorbell | Narrow ghost with a small round chime knob on top |
| Alarm | Bell-shaped ghost with a wide flared hem |
| Baby | Small round ghost with a single curl on top |
| Vehicle | Wide, low ghost with a long trailing hem |
| Voice | Round ghost with an open, wavy mouth |
| Other | Plain round-topped ghost with a wavy hem |

Every ghost has two small oval eyes cut as holes, so the card surface shows through them; the eyes are the same on every ghost, so every difference is still in the outline. Each pair of silhouettes differs in at least 8% of the box without the eyes (a test rasterises them). The outline is stroked around the body and the Voice mouth, never around the eyes, so a heavy urgent outline does not close an eye.

**Field.** The ghost field is a transparent canvas on the card surface with a "Now:" list under it that names each ghost by class, side and urgency (the text equivalent). Faint "L" and "R" labels sit at the left and right edges, and a small listener mark (a dot with a bearing arc above it) sits at the bottom centre. The bearing convention: negative is left, 0 is the middle, and the bearing maps linearly to the field width up to 90 degrees; a bearing beyond 90 degrees (behind the listener) clamps to the nearer edge. Ghosts stack in rows, newest on top, at most four at once; the oldest leaves first. Every ghost has its label drawn under it, always: the event label, the side and the urgency word ("Knock · Left · Urgent"). A ghost lives 8 seconds.

**Uncertain.** When the side is not known (a bearing that is not from the stereo estimate, or not confident enough), the ghost sits in the middle with a dashed outline (a few long dashes, about 3 to 8 around the outline and fewer as the outline gets heavier, a whole number of them so no stub is left where the outline starts; the Voice mouth stays solid), a thin double-headed arc in `--bb-color-border` runs behind it from the L side to the R side, and its label says "Side unknown". Three cues, none of them colour, the same dashed language as the unknown state of the band simulator.

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
| Bar and lane mark on track | `--bb-color-accent` | `--bb-color-surface-raised` | Day | 6.17 | 3 |
| Accent text on tile (stage number) | `--bb-color-accent` | `--bb-color-surface-raised` | Day | 6.17 | 4.5 |
| Dial arc on tile | `--bb-color-border` | `--bb-color-surface-raised` | Day | 3.53 | 3 |
| Body text on field ring | `--bb-color-text` | `--bb-color-accent-tint` | Day | 15.33 | 4.5 |
| Muted text on field ring | `--bb-color-text-muted` | `--bb-color-accent-tint` | Day | 5.21 | 4.5 |
| Ghost fill on field ring | `--bb-ghost-fill` | `--bb-color-accent-tint` | Day | 3.14 | 3 |
| Ghost outline on field ring | `--bb-ghost-outline` | `--bb-color-accent-tint` | Day | 7.92 | 3 |
| Accent text on tile (band connected) | `--bb-color-accent-strong` | `--bb-color-surface-raised` | Day | 8.81 | 4.5 |
| Primary pill on tile (Connect band) | `--bb-color-pill-bg` | `--bb-color-surface-raised` | Day | 17.04 | 3 |
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
| Bar and lane mark on track | `--bb-color-accent` | `--bb-color-surface-raised` | Night | 6.97 | 3 |
| Accent text on tile (stage number) | `--bb-color-accent` | `--bb-color-surface-raised` | Night | 6.97 | 4.5 |
| Dial arc on tile | `--bb-color-border` | `--bb-color-surface-raised` | Night | 3.20 | 3 |
| Body text on field ring | `--bb-color-text` | `--bb-color-accent-tint` | Night | 12.70 | 4.5 |
| Muted text on field ring | `--bb-color-text-muted` | `--bb-color-accent-tint` | Night | 5.86 | 4.5 |
| Ghost fill on field ring | `--bb-ghost-fill` | `--bb-color-accent-tint` | Night | 11.25 | 3 |
| Ghost outline on field ring | `--bb-ghost-outline` | `--bb-color-accent-tint` | Night | 6.32 | 3 |
| Accent text on tile (band connected) | `--bb-color-accent-strong` | `--bb-color-surface-raised` | Night | 10.71 | 4.5 |
| Primary pill outline on tile (Connect band) | `--bb-color-pill-outline` | `--bb-color-surface-raised` | Night | 9.60 | 3 |

The Night primary pill fill is near-black on a near-black canvas (about 1.1:1) by design; its boundary is the light `pill-outline`, which is the pair measured above. The Day `pill-outline` is `transparent` and is not measured.

The field rings are the listening station's thin (2px) `accent-tint` sonar rings behind the ghost field canvas; a ghost or its label can cross one, so those pairs are measured against `accent-tint`. The rings stay thin lines, never a filled glow, because the uncertain arc (`border`) is 2.90:1 on `accent-tint` in Night.

## Screens

Common rules for every screen:

- One `<main>`, one `<h1>`, headings in order.
- A header with the brand, the status pills (listening state and band state) and a link to Settings. On phones the header shows the status pills only, and navigation moves to a bottom tab bar (Listen, Pipeline, Band, Settings).
- At most one primary pill. Screens without a primary action do not use the near-black pill. The one exception is Connect band (see Wristband connect control): it is the band page's only primary pill, and in the Settings sheet the station behind the modal is inert.
- One `aria-live="polite"` region holds the latest text alert: "Knock, left side, urgent".
- Tab order follows reading order: header, then the regions in the order listed, then the footer. The sticky phone action bar comes last in the DOM order of `<main>` content so it is reached after the content it acts on, but is placed visually at the bottom within thumb reach.
- Canvas content always has a DOM text equivalent.
- Flavour titles are allowed in Night (for example the eyebrow "Listening in the dark"); alerts, settings and errors use plain words.

### Listening station

The home screen (`index.html`). It runs the whole chain live from the microphone or on recorded sample clips. The band simulator always shows each pattern; a wristband connected in Settings (Web Bluetooth, Chrome or Edge) buzzes it too. **Primary action: Start listening**, the one near-black pill of the screen, in the Listen card first in the main content. While listening it is replaced by a **Stop** secondary pill, and the Listen card's own status pill says Starting, Listening, Stopped, Mic blocked or Problem (see Status pills). The microphone is asked for only after the press, and the card says in one muted sentence that the sound is processed on the device and never recorded or sent. The Try a sound card (sound chips and a side control) stays as the second way in.

Desktop (1440px), a 12-column grid with 24px gaps:

```
+--------------------------------------------------------------------------------+
| Banshee Band   [Band simulator] [⚙ Settings] [▲ Phone vibration fallback] Day|Night |
|                                                                                |
| Try it with sample clips                                                       |
| Listening station                         Choose a sound and see it become a   |
|                                           ghost, a buzz and a line of text...  |
| +----------------------------------------------------------------------------+ |
| | Try a sound                                     [ Left | Centre | Right ]   | |
| | The side is simulated: ...                                                  | |
| | [Doorbell] [Knock] [Alarm] [Baby] [Vehicle] [Voice]                         | |
| +----------------------------------------------------------------------------+ |
| +------------------------------------------+ +-------------------------------+ |
| | Ghost field                              | | Latest alert                  | |
| |   L   ( ghost )  sonar rings        R    | | Knock                         | |
| |              listener mark               | | Left side, medium             | |
| | Now: Knock, left, medium                 | | Recent sounds                 | |
| | [ Low ] [ Medium ] [ Urgent ]  (key)     | |  [g] Knock   [Medium]  13:36  | |
| +------------------------------------------+ +-------------------------------+ |
|                                              | Left motor 75 % | Right 22 %  | |
|                                              | Pattern: Knock, left stronger | |
|                                              +-------------------------------+ |
| +----------------------------------------------------------------------------+ |
| | Pipeline  [1 Waveform] [2 Label] [3 Bearing] [4 Pattern] [5 Band]          | |
| +----------------------------------------------------------------------------+ |
| Banshee Band is an aid, not a safety device. ...                  Styleguide  |
+--------------------------------------------------------------------------------+
```

Regions in DOM order (the tab order follows it):
1. Header: brand link, "Band simulator" secondary pill link, the "Settings" secondary pill with a gear glyph (opens the Settings sheet, see Settings), the status pill (Band connected when Buzz on is Wristband and the band is connected; Phone vibration fallback when the phone can vibrate and Buzz on is Phone vibration; otherwise Band not connected; Problem when the sound model fails), the Day/Night control.
2. Title block: the eyebrow, `display` "Listening station" and the lede beside it on the right (under it near 720px). The lede says to start listening or choose a sample clip, that the microphone is used only after the press and the sound stays on the device, and that without a wristband the band is shown on screen.
3. Listen card, all 12 columns: `heading` "Listen" and the muted sentence on the left; the Start listening primary pill (or Stop) and the Listen status pill on the right; a polite message line under them (the model loading, or the plain reason the microphone could not start). Then the Try a sound card, all 12 columns: heading, the muted simulated-side sentence, the Left/Centre/Right segmented control (default Centre), one secondary pill chip per clip with a 24px low ghost glyph, and a polite message line.
4. Ghost field card, 7 columns, at least 480px: the canvas (448px on desktop) on thin `accent-tint` sonar rings around the listener mark, "All quiet" over an empty field, the "Now:" list as its DOM text equivalent, and an urgency key (the same ghost at Low, Medium and Urgent). It keeps its own height and sticks inside its grid row while the right column, which grows with every row, scrolls past.
5. Right column, 5 columns: the Latest alert and Recent sounds card (the `aria-live` region, class in `display`, side and urgency below; up to 10 rows), then the band simulator (two motor cards and the pattern card).
6. Pipeline card, all 12 columns: five `surface-raised` stage tiles in a row (stacked on the phone), Waveform (bars), Label, Bearing (a dial), Pattern and Band, each with an accent step number, its value as text and its time ("— ms" before the first run). The four-card Pipeline view below is the later live screen.
7. Footer: the aid sentence, muted, and the Styleguide link.

Phone (390px):

```
+------------------------------+
| Banshee Band       Day|Night |
| [Band sim..] [⚙ Settings] [▲]|
| Listening station            |
| Choose a sound and see ...   |
| +--------------------------+ |
| | Ghost field              | |
| |   L  (ghost)        R    | |
| +--------------------------+ |
| Latest alert, Recent sounds  |
| Band simulator               |
| Pipeline (tiles stacked)     |
| Footer                       |
|+----------------------------+|
|| Try a sound  The side ...  ||  <- bar fixed to the bottom
|| [ Left | Centre | Right ]  ||
|| [Doorbell] [Knock] [Ala..  ||  <- one row, scrolls sideways
|+----------------------------+|
+------------------------------+
```

One column in the visual order title, ghost field, Latest alert and Recent sounds, simulator, pipeline, footer. The lede is left out on the phone so the ghost field stays in the first view. The Listen and Try a sound cards stay second in the DOM (after the title block, so keyboard users reach the action first) but are placed together as one compact bar fixed to the bottom (about 230px). Its first row is the Start listening primary pill, in thumb reach, with the caption "Processed on this device. Never recorded or sent." beside it (the status pill takes the caption's place once there is a status). Then the Try a sound part: the heading and the simulated-side sentence as one caption paragraph, the side control, then one sideways-scrolling row of chips nearest the thumb. Its chips and side control lie in the lower 45% of an 844px viewport. The page keeps the bar's measured height (`--bb-station-bar`) free below the footer, so nothing hides behind it, and the ghost field with a run's ghost and its label is in the first view. The eyebrow is left out on the phone. No horizontal scrolling at 390px.

### Pipeline view

Shows how a sound moves through the system. Read only. **No primary action.**

Desktop (1440px):

```
+--------------------------------------------------------------------------------+
| Banshee Band          [● Listening] [● Band connected]            Settings     |
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

A sheet over the listening station, not a page of its own, so a change can be tried on the next sound (or the next live window) without leaving the station. The **Settings** secondary pill in the station header (a small gear glyph, `aria-haspopup="dialog"`) opens it as a native `<dialog>` with `showModal()`, labelled by its `h2` "Settings". Changes apply at once and are saved on this device (`localStorage`, key `banshee-band.settings.v1`); a missing, corrupt or blocked store gives the defaults (every class on at −50 dB, Phone vibration) and no error. **No primary action** (no Save button); the only near-black pill in the sheet is Connect band, while the wristband is not connected (see Wristband connect control). Done and Escape close it, and the focus goes back to the Settings pill.

Desktop (1440px): a side sheet floating at the right edge, 16px in from the viewport edges, up to 480px wide, `surface` fill, `radius-card`, `shadow-soft`. The page behind is covered by the canvas colour at 80% opacity, so the sheet is the only bright surface. The sheet scrolls inside.

```
+--------------------------------------------------------------------------------+
| Banshee Band   [Band simulator] [⚙ Settings] [▲ Ph+-------------------------------+ |
|                                                  | Settings                [Done]| |
| Listening station   (dimmed)                     | Changes apply right away and  | |
|                                                  | stay on this device.          | |
|                                                  | Sounds                        | |
|                                                  | A sound alerts you when ...   | |
|                                                  | +---------------------------+ | |
|                                                  | |(g) Knock        (o  ) Off | | |
|                                                  | | Alerts from [==o====] −50 | | |
|                                                  | +---------------------------+ | |
|                                                  | | (g) Doorbell    (  o) On  | | |
|                                                  | |  ... seven tiles ...      | | |
|                                                  | Buzz on                       | |
|                                                  | (✓) Phone vibration           | |
|                                                  | ( ) Screen only               | |
|                                                  | (✓) Wristband                 | |
|                                                  | +---------------------------+ | |
|                                                  | |(b) Wristband [Disconnect] | | |
|                                                  | | Connected to Banshee Band.| | |
|                                                  | +---------------------------+ | |
|                                                  | [Reset to defaults]           | |
|                                                  +-------------------------------+ |
+--------------------------------------------------------------------------------+
```

Regions, in DOM and tab order:

1. Head: `h2` "Settings", the muted caption "Changes apply right away and stay on this device.", and the **Done** secondary pill (focused when the sheet opens).
2. **Sounds** (`h3`, then the muted caption "A sound alerts you when it is on and at least as loud as its level. −80 dB is very quiet, −10 dB is very loud."): one `surface-raised` tile (`radius-control`) per class in the order Knock, Doorbell, Alarm, Baby, Vehicle, Voice, Other. Each tile has the class's 24px low ghost glyph in a round `surface` disc (decorative), the class name, and a **switch**: a real `<input type="checkbox" role="switch">` named by the class name, drawn as a pill track with a round thumb and the visible word "On" or "Off" (on: `accent` track, `on-accent` thumb moved right; off: `surface` track with a 2px `border` outline, `text-muted` thumb on the left). Under it, one line: the visible label "Alerts from", the **level slider** (a native `<input type="range" min="-80" max="-10" step="1">` in `accent`, named "‹Class› Alerts from", with `aria-valuetext` like "−50 dB") and the value as text with tabular figures. A class that is off gets a 1px dashed `border` outline, muted name and value, and a disabled slider, so off reads without colour.
3. **Buzz on**: a `<fieldset>` with that legend and three native radios drawn as option tiles (`surface-raised`, `radius-control`), each with a round check mark, a name and a muted caption: **Phone vibration** ("The phone buzzes the pattern. The screen shows it too."), **Screen only** ("The pattern plays on the band simulator on this screen.") and **Wristband** ("The band buzzes the pattern, stronger on the side it came from."). The selected tile takes `accent-tint`, `accent-strong` text and a filled check, so selection is more than colour; a disabled tile takes the disabled look of Pills (dashed `border`, `text-muted`). When the browser cannot vibrate, Phone vibration is disabled with the caption "This browser cannot vibrate.", and Screen only shows as selected. When the browser has no Web Bluetooth (Safari, Firefox), Wristband is disabled with the caption "This browser has no Bluetooth. Use Chrome or Edge to connect the band." and the sheet shows no connect row. Where Bluetooth exists, Wristband is enabled and a chosen Wristband stays shown as chosen while the band is not connected (the saved choice is never rewritten); the alerts then use the screen until the band connects. The band simulator on the station always mirrors the pattern; the choice decides whether the phone or the wristband buzzes as well. The header status pill follows the output in use (see Status pills).
4. **The Wristband connect control** (see Wristband connect control), under the radios inside the Buzz on fieldset, only where the browser has Web Bluetooth. A connect from here also sets Buzz on to Wristband. A lost band leaves Wristband chosen, says so in the status line, and the header pill falls back to Band not connected.
5. **Reset to defaults**, a secondary pill.

This replaces the earlier per-output switches (simulator, vibration fallback), the separate "Connect band" pill and the theme control in Settings: Buzz on is the only output choice, the connect control belongs to it, and the theme control stays in the header.

Tab order: Settings pill; in the sheet Done, then per class the switch and then the slider (a disabled slider is skipped), then the radios as one stop (arrow keys move the choice), then the Connect band (or Disconnect) pill, then Reset to defaults. Every control has the 3px focus ring (on the switch it rings the track) and is at least 44px tall.

What a setting does on the station: a class that is off, or a sound quieter than its level, raises no ghost, no Recent sounds row, no Latest alert and no buzz. The pipeline card still shows the run (its Pattern tile says "This sound is switched off" or "Too quiet to buzz"), and Try a sound says why in its message line: "Knock is switched off in Settings, so it raised no alert." or "Knock was quieter than its Settings level (−40 dB), so it raised no alert." A live window that is muted shows nothing extra.

The sheet's colour pairs are all rows of the Contrast table (text and muted text on card and tile, accent text and muted text on the accent tint, text on the accent fill, the accent mark and the border on the tile, the focus ring on the card). The connect control adds two: its connected status line (`accent-strong` on the tile) and the Connect band primary pill on the tile.

Phone (390px): a bottom sheet, full width, with rounded top corners, at most the viewport height minus 24px, scrolling inside; the same order. Each tile keeps the name and the switch on the first line and the label, slider and value on the second. No sideways scrolling.

```
+------------------------------+
| (dimmed station)             |
|+----------------------------+|
|| Settings            [Done] ||
|| Changes apply right away...||
|| Sounds                     ||
|| A sound alerts you when ...||
|| +------------------------+ ||
|| |(g) Knock    (  o) On   | ||
|| |Alerts from [==o==] −50 | ||
|| +------------------------+ ||
||  ... scrolls inside ...    ||
|+----------------------------+|
+------------------------------+
```

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

Shows what the wristband would feel, and lets a new wearer try each pattern before they need it. `band.html`. The only near-black pill is **Connect band** in the Feel a pattern card (see Wristband connect control), shown while no band is connected and Web Bluetooth exists. A connected band buzzes every pattern pressed here; without one the page is a simulator only.

Desktop (1440px):

```
+--------------------------------------------------------------------------------+
| Banshee Band                         [▲ Phone vibration on]   [☀ Day | ☾ Night] |
|                                                                                |
| Learn the patterns                                                             |
| Band simulator                                                                 |
| A simulator of the wrist band. Each pattern plays here on screen, ...          |
|                                                                                |
| +-------------------------------+ +----------------------+ +------------------+ |
| | Feel a pattern                | | Left motor        L  | | Right motor    R | |
| | Choose a sound to play ...    | | 75 %                 | | 22 %             | |
| | +---------------------------+ | | [=========      ]    | | [===          ]  | |
| | |(b) Wristband [Connect band]| | +----------------------+ +------------------+ |
| | | No band connected.        | |                                               |
| | +---------------------------+ |                                               |
| | Side                          |                                               |
| | ( ✓Left | Centre | Right |    |                                               |
| |   Unknown )                   | +---------------------------------------------+ |
| | Sound                         | | Pattern                    2 pulses, 240 ms | |
| | [Knock] [Doorbell] [Alarm]    | | (←) Knock, left stronger                    | |
| | [Baby]  [Vehicle]  [Voice]    | | L ▮▮▮▮▮               ▮▮▮▮▮                 | |
| | [Rhythm tile] [Stronger tile] | | R ▂▂▂▂▂               ▂▂▂▂▂                 | |
| +-------------------------------+ | 0 ms                                 240 ms | |
|                                   +---------------------------------------------+ |
| (i) Banshee Band is an aid, not a safety device. ...                           |
+--------------------------------------------------------------------------------+
```

Regions, in DOM and reading order:

1. Header: the brand (a link to `index.html`), the phone status pill (see Status pills: "Phone vibration on" with the triangle and accent tint, or "No phone vibration here" with the open circle and neutral tint), and the theme control.
2. Title block: a short eyebrow, `title` "Band simulator", and a muted lede: "A simulator of the wrist band. Each pattern plays here on screen, motor by motor, and on the wristband too when you connect one."
3. **Feel a pattern** card (left, 5 of 12 columns): `heading`, a muted sentence that a sound plays on the simulator, on the phone when it can vibrate, and on the wristband when it is connected; the **Wristband connect control** (Connect band primary pill when idle, Disconnect when connected; without Web Bluetooth only the full status line, no button); the **Side** segmented control (four native radios, Left, Centre, Right, Unknown, default Centre, in a `surface-raised` track; the selected option takes `accent-tint`, an `accent-strong` label and a check glyph, so it differs by more than colour; arrow keys move it, and changing it plays nothing); the **Sound** group of six chips (secondary pills Knock, Doorbell, Alarm, Baby, Vehicle, Voice, three per row, each with a small accent picture of its rhythm, decorative); a polite live region that only ever shows "This pattern could not be played"; and two `surface-raised` tiles that say how to read a pattern (rhythm is the sound, the stronger motor is the side). A chip builds the real command with the haptics engine and plays it on the simulator, on the phone when it can vibrate, and on the wristband when it is connected.
4. Simulator (right, 7 of 12 columns): the left and right motor cards side by side, each with a `heading`, a small L or R tag (accent tint on the stronger side), the level as a `display` number with tabular figures and a `caption` muted `%`, and a decorative accent bar on a `surface-raised` track. Beneath, the Pattern card: the pattern count and length as a muted caption, the side glyph in a round tile (left arrow, right arrow, centre mark, question mark) beside the pattern name and side text, two lanes L and R as `surface-raised` tiles with one accent mark per pulse (height follows the motor level), and the `0 ms` to total scale. Before the first press it says "No pattern yet". When the side is unknown both motor cards get a 2px dashed `border` outline inside their edge.
5. Footer: the aid sentence with an info glyph, muted.

The Feel card comes first in the DOM, so a keyboard or screen-reader user reaches the control before the result. On desktop the result sits beside the control, so both are in view at once. Bars, lanes and glyphs are `aria-hidden`; the numbers and the pattern name are the text. The simulator has one polite live region that reads the pattern name once per press.

Tab order: brand link, theme control (Day, Night), the Connect band (or Disconnect) pill when there is one, side control (one stop; arrows inside), the six chips. The motor cards and the timeline are not interactive.

Phone (390px):

```
+------------------------------+
| (g) Banshee Band [☀Day|☾Night]|
| [▲ Phone vibration on]       |
| Band simulator               |
| A simulator of the wrist ... |
| +--------------------------+ |
| | Feel a pattern           | |
| | (b) Wristband            | |
| | No band connected.       | |
| | [     Connect band     ] | |
| | (✓Left|Centre|Right|Unkn)| |
| | [Knock][Doorbell][Alarm] | |
| | [Baby][Vehicle][Voice]   | |
| +--------------------------+ |
| +-----------+ +------------+ |
| |Left motor | |Right motor | |
| | 75 %      | | 22 %       | |
| | [=====  ] | | [==     ]  | |
| +-----------+ +------------+ |
| +--------------------------+ |
| | Pattern  2 pulses, 240 ms| |
| | (←) Knock, left stronger | |
| | L ▮▮   ▮▮  /  R ▂▂   ▂▂  | |
| +--------------------------+ |
| (i) Banshee Band is an aid...|
+------------------------------+
```

One column, in the same order. The header puts the brand and the theme control on one row and the status pill below. The Feel card is full width; the connect pill takes its own full-width line under the status text, the side control spans the card, and the chips sit three per row, each at least 44px tall (the rhythm pictures and the two tips tiles are hidden to save height). The two motor cards stay side by side in two narrow columns, and their numbers are in view without scrolling after a chip press at 390 x 844, so the Feel card stays above them. The timeline card is full width beneath.

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
