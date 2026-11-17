# Requirements: Ghost renderer

## Introduction

`src/events` defines the `SoundEvent`. `src/haptics` already decides, with `sideOf`, whether the side of a sound is known. This feature draws each sound as a ghost on a canvas in `src/ghosts/`. **Shape = sound class, position = bearing, glow = urgency. Nothing else carries meaning.**

The feature delivers three things: the module (shapes, pure layout, canvas field), a showcase on `/styleguide.html` and the tests. The listening station screen is a later feature. It will mount the field, put the live region and the alert card around it, and feed it events. This feature does not build that screen and does not read a microphone, a clip or the log.

The ghost field is an aid and not a safety device. It is one of three forms of an alert (ghost, haptic pattern, text) and no form is the only one (see `.kiro/steering/accessibility.md`).

Terms:

- **Input**: `{ event: SoundEvent, bearingConfidence: number }`, the shape the haptic engine takes (Requirement 1.3).
- **Uncertain**: a ghost is uncertain exactly when `sideOf(event, bearingConfidence) === 'unknown'` (Requirement 1.4).
- **Field**: the drawing area. `FieldSize` is `{ width, height }` in CSS pixels.
- **Layout**: the plain-data result of `layoutGhost` (Requirement 3.2).
- **Row**: a horizontal band of the field that holds one ghost and its label (Requirement 5).
- **Block**: the vertical extent of one ghost, its glow gap and its label (Requirement 5.2).
- **Glyph**: a ghost silhouette drawn as inline SVG at list size (Requirement 12.3).
- **Silhouette**: the SVG path string of one sound class in a 24 x 24 unit box (Requirement 2).
- **Live ghost**: a ghost that `show` added and that has not yet expired or been cleared.
- **Reduced motion**: `prefers-reduced-motion: reduce`, read through `matchMedia`.
- **Showcase**: the Ghosts section of `/styleguide.html` (Requirement 12).

## Requirements

### Requirement 1: Module boundaries and the input contract

**User story:** As a developer, I want the ghost module to depend on the event contract and on the one haptics rule it reuses, and on nothing else, so that it can be tested without a browser where possible and mounted by any later screen.

#### Acceptance criteria

1. THE files in `src/ghosts/` SHALL import only from `src/events` (types and `validateSoundEvent`), from `src/haptics` (the single named import `sideOf`, and the `Side` type), from files in `src/ghosts/`, and from CSS files. They SHALL NOT import from `band`, `ui`, `audio`, `classify`, `bearing` or `mcp`.
2. THE module SHALL NOT use `fetch`, `XMLHttpRequest`, `WebSocket`, `navigator.bluetooth`, `console`, `Math.random` or `Date` in `src/ghosts/` code. It reads time only through `performance.now()` and the timers of the page.
3. THE module SHALL export the type `GhostInput = { event: SoundEvent; bearingConfidence: number }`. This is the same shape that the haptic engine takes, so a later screen passes one value to both.
4. A ghost SHALL be uncertain exactly when `sideOf(input.event, input.bearingConfidence) === 'unknown'`. This covers a bearing source other than `gcc-phat`, a bearing confidence below 0.8, a bearing out of range, and no bearing. The rule SHALL be reused from `sideOf` and SHALL NOT be copied: no file of `src/ghosts/` SHALL contain the text `gcc-phat`, read `bearingSource`, or compare a confidence with a number.
5. WHEN `show` receives an input whose `event` fails `validateSoundEvent`, or a value that is not an object with an `event`, THE field SHALL return `false`, SHALL NOT throw, SHALL NOT draw, and SHALL NOT change the list or the canvas label. A `bearingConfidence` that is not a finite number in [0, 1] is not a validator failure: `sideOf` returns `'unknown'` for it, and the ghost is drawn as uncertain.
6. THE module SHALL use the event that `validateSoundEvent` returns, and SHALL NOT modify the input object or its event.
7. EVERY exported function, constant and type of `src/ghosts/` SHALL have a short doc comment. The comment in `src/ghosts/index.ts` SHALL state the mapping (shape = class, position = bearing, glow = urgency, nothing else carries meaning) and that the field is an aid and not a safety device.
8. A test SHALL scan `src/ghosts/*.ts` (comments removed) and fail on any import other than the allowed ones, on any named import from `src/haptics` other than `sideOf` and `Side`, on the forbidden identifiers of criterion 2, and on the forbidden texts of criterion 4.
9. THE module SHALL export its public API from `src/ghosts/index.ts`: `mountGhostField`, `layoutGhost`, `layoutGhosts`, `ghostBasePx`, `SHAPES`, `createGlyph`, `glyphSpec` and their types. It SHALL export no name that the haptics or events modules already export.

### Requirement 2: Silhouettes

**User story:** As a Deaf or hard-of-hearing user, I want every sound class to have its own ghost shape that I can tell apart without colour, so that I know what kind of sound it is at a glance.

#### Acceptance criteria

1. THE module SHALL export from `src/ghosts/shapes.ts` the constant `SHAPES: Readonly<Record<SoundClass, string>>` with one SVG path string for each of the seven classes (knock, doorbell, alarm, baby, vehicle, voice, other), and the constant `SHAPE_BOX = 24`. Each path is drawn in a `SHAPE_BOX` x `SHAPE_BOX` unit box.
2. EVERY path SHALL use only the absolute commands `M`, `L`, `H`, `V`, `C`, `Q` and `Z`, and SHALL be filled with the even-odd rule. A path MAY have several subpaths so that a feature (an eye, an open mouth) is a hole. EVERY point of every path, including control points, SHALL lie inside [2, 22] on both axes, so that the widest outline (3.5 units) stays inside the box.
3. THE silhouettes of Knock, Alarm, Voice, Vehicle and Baby SHALL follow the Ghosts table of `design/DESIGN.md`: Knock is a tall ghost with a square-shouldered top and a flat hem; Alarm is bell-shaped with a wide flared hem; Voice is round with an open, wavy mouth; Vehicle is wide and low with a long trailing hem; Baby is small and round with a single curl on top.
4. THE Doorbell silhouette SHALL be a narrow ghost with a small round chime knob on top. THE Other silhouette SHALL be a plain round-topped ghost with a wavy hem and no detail beyond the eyes. EVERY ghost SHALL have two oval eyes, cut as holes in the silhouette: they are the last two subpaths of each path. THE Voice path SHALL also have one mouth detail, a subpath between the outer outline and the eyes.
5. EVERY silhouette SHALL be recognisable without colour: it differs from every other silhouette by its outline, and not by a fill, a glow or a hue. The seven path strings SHALL be pairwise different.
6. WHEN every path is rasterised at 48 x 48 pixels over the 24-unit box with the even-odd rule, THE filled area of each silhouette SHALL differ from the filled area of every other silhouette in at least 8% of the 2304 pixels (the pixels that are filled in one and not filled in the other). THE filled area of each silhouette SHALL be between 10% and 80% of the box.
7. THE canvas (`new Path2D(path)`, filled and stroked with the even-odd rule) and the glyph (inline SVG with `fill-rule="evenodd"`) SHALL both take their shapes from `SHAPES`. NO other file SHALL contain a copy of a path.
8. `shapes.ts` SHALL be data only. It SHALL NOT touch the DOM or the canvas, so a test can import it without a browser.

### Requirement 3: Layout, bearing and position

**User story:** As a user, I want a ghost on the side the sound came from, and a ghost whose side is not known to look unsure and not point anywhere, so that the picture never promises more than the bearing estimate supports.

#### Acceptance criteria

1. THE module SHALL export `layoutGhost(input, field, slot?)` from `src/ghosts/layout.ts`. It SHALL be a pure function with no DOM, no canvas, no clock and no random value, and SHALL NOT modify its arguments. `field` is `{ width, height }` in CSS pixels. `slot` is `{ row, rows }` and defaults to `{ row: 0, rows: 1 }` (Requirement 5).
2. THE result SHALL be a plain object `{ x, y, boxPx, scale, outlineWidth, glowBlur, glowToken, shape, uncertain, side, sideText, urgencyWord, labelText }`. `x` and `y` are the centre of the ghost in CSS pixels. `boxPx` is the edge of the drawn ghost box in CSS pixels (Requirement 4.3). `shape` is the path of `SHAPES[event.class]`. `side` is the result of `sideOf`.
3. THE bearing convention SHALL be: negative bearing = left. `x` SHALL map the bearing from -90 to +90 degrees linearly across the field inside a horizontal padding of `FIELD_PADDING_X` (72 px): `x = width / 2 + (clamp(bearingDeg, -90, 90) / 90) * (width / 2 - 72)`. A bearing of -90 gives `x = 72`, 0 gives `width / 2`, +90 gives `width - 72`. The padding is 72 because the largest ghost box is `GHOST_BOX_MAX_PX * 1.5 = 108` px, so half of it is 54 px, and the largest glow blur is 12 px: 54 + 12 = 66 px, which fits inside 72 px with 6 px to spare. The earlier 48 px would clip the glow of a large urgent ghost at the edge (66 > 48). `FIELD_PADDING_X` SHALL be at least `GHOST_BOX_MAX_PX * 1.5 / 2 + 12`, and a test SHALL check this.
4. A bearing beyond -90 or +90 degrees (a sound behind the listener, which stereo cannot tell from the front) SHALL clamp to the nearer edge, -90 or +90. A bearing of 180 and a bearing of 91 SHALL both give `x = width - 72`.
5. FOR every finite bearing in [-180, 180] and every field width of 200 or more, `x` SHALL lie in [72, width - 72]. The ghost never leaves the field.
6. WHEN the ghost is uncertain, `x` SHALL be `width / 2` whatever `bearingDeg` says, `side` SHALL be `'unknown'`, and `sideText` SHALL be "Side unknown".
7. WHEN the ghost is not uncertain, `sideText` SHALL be "Left", "Centre" or "Right" for the `side` `'left'`, `'centre'` or `'right'`. `x` SHALL follow the bearing linearly as in criterion 3, also inside the centre zone of `sideOf`. A ghost at -10 degrees is therefore "Centre" and sits slightly left of the middle.
8. THE same input and field SHALL give an equal result on every call.

### Requirement 4: Layout, urgency and text

**User story:** As a user, I want urgency to show as size, outline weight, glow and a word, so that glow is never the only cue.

#### Acceptance criteria

1. THE urgency SHALL map as follows, and the values SHALL be named constants in `src/ghosts/constants.ts`:

   | Urgency | `urgencyWord` | `scale` | `outlineWidth` (per 24 units) | `glowBlur` (px) | `glowToken` |
   |---|---|---|---|---|---|
   | low | Low | 1 | 1.5 | 4 | `--bb-ghost-glow-1` |
   | medium | Medium | 1.25 | 2.5 | 8 | `--bb-ghost-glow-2` |
   | high | Urgent | 1.5 | 3.5 | 12 | `--bb-ghost-glow-3` |

2. THE `scale`, `outlineWidth` and `glowBlur` SHALL be strictly larger for each higher urgency.
3. THE ghost SHALL be drawn in a box of `boxPx = basePx * scale` pixels, and the outline SHALL be `outlineWidth` units of the 24-unit box, that is `outlineWidth * boxPx / 24` pixels. `basePx` is computed once for each layout from the row slot (Requirement 5.2), is the same for every ghost of that layout, and is not a constant. `GHOST_BOX_MIN_PX` (32) and `GHOST_BOX_MAX_PX` (72) are the bounds of `basePx`. The urgency ratios 1 / 1.25 / 1.5 hold inside one layout. Examples: one urgent ghost in a 480 px high desktop field has `basePx` 72 and `boxPx` 108; four ghosts in a 360 px high phone field have `basePx` 32 (the minimum), so `boxPx` is 32, 40 or 48.
4. `labelText` SHALL be `<event.label> · <sideText> · <urgencyWord>` with a middle dot (U+00B7) between spaces, for example "Knock · Left · Urgent" and "Baby crying · Side unknown · Urgent".
5. THE layout SHALL carry the meaning in these fields only: the shape (class), `x` (bearing, or centre when uncertain), and the urgency fields (`boxPx` is one of them, through `scale`). No field of the layout SHALL depend on `event.confidence`, `event.loudnessDb`, `event.id` or `event.t`.

### Requirement 5: Rows

**User story:** As a user, I want several sounds at once to appear in separate rows, so that no label hides another.

#### Acceptance criteria

1. THE module SHALL export `layoutGhosts(inputs, field)` from `src/ghosts/layout.ts`. `inputs` is ordered newest first. It SHALL lay out at most `MAX_GHOSTS` (4) ghosts, in the same order, and SHALL drop the extra (the oldest, which are the last in the array) first. It SHALL return a new array and SHALL NOT modify `inputs`.
2. THE field SHALL be divided into `rows` equal slots between a top margin of `FIELD_TOP_PX` (8) and a bottom margin of `FIELD_BOTTOM_PX` (40, the zone of the listener mark). The newest ghost has row 0, at the top. THE box of every ghost of a layout has the base size `basePx = clamp(GHOST_BOX_MIN_PX, floor((slotH - LABEL_BLOCK_PX) / 1.5), GHOST_BOX_MAX_PX)`, with `GHOST_BOX_MIN_PX` 32, `GHOST_BOX_MAX_PX` 72, `slotH = usable / rows` and `usable = height - FIELD_TOP_PX - FIELD_BOTTOM_PX`. `LABEL_BLOCK_PX` is the largest glow blur plus the glow gap plus the label height: 12 + 2 + 16 = 30. A ghost's block has the height `boxPx + glowBlur + GLOW_GAP_PX + LABEL_HEIGHT_PX`, with `boxPx = basePx * scale`, `GLOW_GAP_PX` 2 and `LABEL_HEIGHT_PX` 16, and is centred in its slot. `y` is the centre of the ghost body. The label sits below the body, after the glow gap, so the label is never drawn inside the glow. The module SHALL export `ghostBasePx(height, rows)` from `src/ghosts/layout.ts`, so that `layoutGhost` and the tests use one definition.
3. FOR any field of 200 px or more in width and `FIELD_MIN_HEIGHT_PX` (360) or more in height, any `rows` from 1 to `MAX_GHOSTS`, and any urgency, THE block of a ghost SHALL fit its slot, so the blocks of two ghosts SHALL NOT overlap, and every block SHALL lie between the top margin and the bottom margin. This holds by construction: the tallest block is `1.5 * basePx + LABEL_BLOCK_PX`, which is at most `slotH` whenever `basePx` is not raised by the minimum. The minimum is safe because the constants SHALL satisfy `GHOST_BOX_MIN_PX * 1.5 + LABEL_BLOCK_PX <= (FIELD_MIN_HEIGHT_PX - FIELD_TOP_PX - FIELD_BOTTOM_PX) / MAX_GHOSTS`, that is 48 + 30 = 78 <= 312 / 4 = 78 (no slack), and a test SHALL check this. A change of any of these constants must keep the inequality true.
4. THE module SHALL export a function that returns the block of a layout (`ghostBlock(layout)`, `{ top, bottom }`), so tests and the drawing code use one definition.
5. THE row of a ghost SHALL NOT change its `x`.
6. THE ghost sizes change when the set of live ghosts changes, together with the rows (a ghost that arrives or expires changes `rows`, and so `slotH` and `basePx`). This is the row movement already accepted in the design (Risks), and it applies to the size as well as the position. Within one layout the ratios of Requirement 4.1 hold.

### Requirement 6: Uncertain is drawn as uncertain

**User story:** As a user, I want a sound with an unknown side to look different from a sound in the middle, by more than colour, so that I do not trust a direction the app does not have.

#### Acceptance criteria

1. AN uncertain ghost SHALL be drawn at the horizontal centre of the field, never at a precise angle, with a dashed outline. THE outline SHALL dash only the outer subpath, with the pattern `dashFor(outlineWidth, length of the outer subpath)`: 6 dash periods per outline width of length, and at least 3 dashes. THE details (the Voice mouth) SHALL be stroked solidly, and the eyes SHALL NOT be stroked. THE outline weight still follows the urgency (Requirement 4.1). A certain ghost SHALL have a solid outline.
2. AN uncertain ghost SHALL have, in addition, a wide, thin, double-headed arc that spans the field from the L side to the R side: from 24 px to `width - 24` px, a shallow curve with a small arrowhead at each end, in the colour `--bb-color-border`, 2 px wide. The arc is centred on the ghost's `y` and is drawn under the ghost (the ghost covers its middle). A certain ghost SHALL have no arc.
3. THE text "Side unknown" SHALL appear in the canvas label of the ghost (in `labelText`), in the DOM list item, and in the canvas `aria-label`.
4. THE dashed outline, the arc and the words are three cues. The state SHALL NOT depend on colour alone.
5. THE dashed outline SHALL use the same dashed language as the unknown state of the band simulator (a dashed outline, in the border colour for the arc), so the two features look related.

### Requirement 7: The field and its lifecycle

**User story:** As a developer of the listening station, I want one call that mounts the field and a small object to drive it, so that the screen only passes events in.

#### Acceptance criteria

1. THE module SHALL export `mountGhostField(container: HTMLElement, options?: { ttlMs?: number })` from `src/ghosts/field.ts`. It SHALL return `{ show(input): boolean, clear(): void, destroy(): void, ghosts(): GhostLayout[] }`. It SHALL create its elements inside `container` and nothing else in the document.
2. `ttlMs` SHALL default to 8000. A value that is not a positive number (`NaN`, zero, negative) SHALL give the default. `Number.POSITIVE_INFINITY` SHALL be allowed and means a ghost that never expires (the showcase uses it).
3. `show(input)` SHALL return `true` when it added a ghost and `false` when it ignored the input (Requirement 1.5) or the field was destroyed. A new event while others are shown SHALL add a row for it at the top (Requirement 5), and SHALL keep the others.
4. WHEN a fifth ghost is shown while four are live, THE oldest live ghost SHALL be dropped from the field and from the list at once. `show` still returns `true`.
5. A live ghost SHALL leave the field and the list `ttlMs` milliseconds after `show`, not before. At that moment the remaining ghosts SHALL be laid out again in fewer rows. THE field SHALL use one timer for the next expiry at a time and no timer when no ghost is live.
6. `ghosts()` SHALL return the layouts of the live ghosts, newest first, as new objects each call (a caller cannot change the field by changing them). It SHALL return `[]` for an empty field.
7. `clear()` SHALL remove every live ghost, cancel the expiry timer and redraw an empty field. It SHALL NOT remove the field's elements. It SHALL do nothing visible on an empty field and SHALL NOT throw.
8. `destroy()` SHALL stop every timer, every `requestAnimationFrame` frame, every `ResizeObserver`, `MutationObserver` and `matchMedia` listener that the field added, and SHALL remove everything the field added to `container`. After `destroy`, `show` SHALL return `false`, `clear` and `ghosts` SHALL NOT throw, and a second `destroy` SHALL NOT throw.
9. MOUNTING twice into two containers SHALL give two independent fields.
10. THE field SHALL lay out ghosts with `layoutGhosts` and the current canvas size. A change of the canvas size SHALL lay them out again.

### Requirement 8: Text equivalent and canvas label

**User story:** As a screen-reader user, I want the same information as the picture in text, so that I can read the field.

#### Acceptance criteria

1. THE canvas SHALL have `role="img"`. Its `aria-label` SHALL summarise the live ghosts, newest first, each as "<Class>, <side>, <urgency>" and separated by "; " (for example "Sound field. Now: Alarm, right, urgent; Knock, left, medium"), or SHALL be "No sounds yet" when no ghost is live. THE label SHALL be updated whenever the set of live ghosts changes, and at no other time.
2. UNDER the canvas THE field SHALL render a DOM text equivalent: an element with the text "Now:" followed by a list (`<ul>`) with one `<li>` for each live ghost, newest first. THE text of an item SHALL be "<Class>, <side>, <urgency>" in plain words, for example "Knock, left, urgent", "Voice, centre, low" and "Baby, side unknown, urgent". The class is the class name with a capital first letter (Knock, Doorbell, Alarm, Baby, Vehicle, Voice, Other). The urgency is `low`, `medium` or `urgent`.
3. EVERY list item SHALL carry `data-class` (the sound class), `data-side` (`left`, `centre`, `right` or `unknown`), `data-urgency` (`low`, `medium` or `high`) and `data-x`, the layout `x` divided by the field width, as a decimal number with at most four decimals. WHEN no ghost is live, the list SHALL hold one item "No sounds yet" without `data-*` attributes.
4. THE list and its heading SHALL NOT be focusable, SHALL NOT have `aria-live`, and SHALL NOT have `role="alert"` or `role="status"`. The alert card of the station owns the live region. THE canvas SHALL NOT be focusable.
5. THE list SHALL be visible text in `body` or `caption` type (the screen's choice), in `--bb-color-text`, and SHALL NOT be hidden from sighted users.
6. THE field SHALL NOT write the event `id`, `t`, `confidence` or `loudnessDb` into the DOM.

### Requirement 9: Drawing, furniture and colour

**User story:** As a user, I want a calm field that shows where each sound came from and what it is, with a label I can read.

#### Acceptance criteria

1. THE canvas SHALL be transparent, so the card surface behind it shows through, and SHALL be sized by a `ResizeObserver` on its container. Its backing store SHALL be scaled by `devicePixelRatio` (`canvas.width = round(cssWidth * dpr)`), with the drawing scaled back, so lines and text are crisp at 1x and 2x. The CSS height of the canvas SHALL be at least `FIELD_MIN_HEIGHT_PX` (360).
2. THE field SHALL draw faint "L" and "R" edge labels at the left and right edge, vertically in the middle of the field, in `--bb-color-text-muted`.
3. THE field SHALL draw a small listener mark at the bottom centre: a filled circle (4 px radius) in `--bb-color-text-muted`, with a semicircle bearing arc above it (24 px radius, 2 px, `--bb-color-border`). The mark and the arc lie in the bottom margin (Requirement 5.2).
4. EVERY live ghost SHALL have its `labelText` drawn on the canvas under it, always, and for every urgency, in `--bb-color-text` at 13 px in `--bb-font-family`, weight 500, centred under the ghost. A label that does not fit SHALL be shortened with an ellipsis at the end, and SHALL be moved sideways, never off the field, to stay inside 8 px from the field edge.
5. THE field SHALL draw, for each ghost, in this order: the arc (if uncertain), the glow and the fill, the outline, the label.
6. THE ghost fill SHALL use `--bb-ghost-fill`, the outline `--bb-ghost-outline`, and the glow (a canvas shadow of the fill) the `glowToken` of the urgency with `glowBlur` pixels of blur. The text and furniture SHALL use the text, muted and border tokens named above.
7. THE field SHALL read every colour, the font and the drift period from CSS custom properties with `getComputedStyle` on its canvas. It SHALL NOT hard-code a colour. It SHALL read them again, and redraw, when the `data-theme` attribute of `<html>` changes (a `MutationObserver`) and when the `prefers-color-scheme` media query changes.
8. THE field SHALL redraw when the set of live ghosts changes, when the size changes, when a colour source changes, and, while motion is allowed, on every animation frame as long as a ghost is live (Requirement 10).
9. A canvas of zero width or height SHALL be skipped and SHALL NOT throw. A canvas context that cannot be created SHALL NOT throw: the DOM list still works.
10. THE module SHALL add no token to `src/ui/tokens.css`.

### Requirement 10: Motion

**User story:** As a user who is sensitive to motion, I want the field to stay still when I ask for it, and to be gentle when I do not.

#### Acceptance criteria

1. WITH `prefers-reduced-motion: no-preference`, THE ghosts SHALL drift gently: a vertical movement of at most 4 px up and down (`DRIFT_PX`) around the row position, on a sine of the period `--bb-motion-ghost-drift` (6 s), each ghost with its own phase. A ghost SHALL NOT drift sideways, so its horizontal position keeps showing the bearing.
2. WITH motion allowed, A new ghost SHALL fade in over 400 ms (`--bb-motion-slow`), and a ghost SHALL fade out over its last 400 ms before it expires. A ghost with `ttlMs` of `Infinity` does not fade out. THE glow SHALL be steady: no pulse, no flicker, and no change of brightness faster than the fade. NOTHING in the field SHALL flash more than 3 times per second.
3. WITH `prefers-reduced-motion: reduce`, THE field SHALL NOT run a `requestAnimationFrame` loop at all, and SHALL NOT call `requestAnimationFrame`. Each ghost SHALL be drawn still at its bearing position and row, with full opacity, its steady glow, and its size and outline unchanged. THE field SHALL redraw only when the set of live ghosts changes, when it expires, when the size changes or when a colour source changes.
4. THE field SHALL check the preference with `matchMedia('(prefers-reduced-motion: reduce)')` at mount and SHALL follow its `change` event while mounted. WHEN the preference changes to reduce, THE field SHALL cancel its frame and draw one still frame. WHEN it changes to no-preference and a ghost is live, THE field SHALL start the loop.
5. WITH motion allowed, THE loop SHALL run only while at least one ghost is live. An empty field SHALL have no pending frame.
6. THE drift period SHALL be read from `--bb-motion-ghost-drift` (for example `6s`, in seconds or milliseconds). A value of `0s` or a value that cannot be read as a duration SHALL mean no drift.
7. THE expiry of a ghost SHALL NOT depend on the animation loop. A timer removes it at `ttlMs` under both preferences.

### Requirement 11: Accessibility and contrast

**User story:** As a Deaf or hard-of-hearing user, I want the field to meet the accessibility rules of the product, so that it is usable by everyone who needs it.

#### Acceptance criteria

1. THE field SHALL NOT convey information by colour alone. The class is the shape and the label, the side is the position and the word, the urgency is the size, the outline weight, the glow and the word, and the uncertain state is the dashed outline, the arc and the words.
2. THE field SHALL contain no focusable element, so it does not change the tab order of its page. THE field SHALL NOT use sound.
3. THE canvas content SHALL have the DOM text equivalent of Requirement 8.
4. THE colours SHALL meet WCAG AA against the surface they sit on, in Day and Night: `--bb-color-text` (the labels) and `--bb-color-text-muted` (the L and R labels) at 4.5:1 on `--bb-color-surface`; `--bb-ghost-fill`, `--bb-ghost-outline`, the three glow tokens and `--bb-color-border` (the arc and the listener arc) at 3:1 on `--bb-color-surface`. A test SHALL compute these ratios from `src/ui/tokens.css` and fail below the thresholds.
5. THE label text SHALL NOT be drawn inside the glow (Requirement 5.2), so its contrast is the contrast of the text token on the surface.
6. THE field SHALL work in Day and Night through the existing theme tokens.
7. THE module SHALL add e2e checks for the keyboard flow (no focusable element in the field, the tab order of the page unchanged) and for reduced motion (Requirement 14).

### Requirement 12: Showcase on the styleguide

**User story:** As the designer, I want to see the ghosts in the design system before the listening station exists, so that I can judge the drawing in both themes.

#### Acceptance criteria

1. `/styleguide.html` SHALL get a "Ghosts" section with its own `<h2>`, in the page's heading order, after the existing sections.
2. THE section SHALL contain a ghost field card, as in `design/DESIGN.md`: a surface card with `--bb-radius-card` and `--bb-shadow-soft`, a minimum height of 480 px on desktop (the canvas fills the space above the list and is at least 360 px high), and a canvas of about 360 px height on a phone (below 720 px). The card SHALL be mounted with `mountGhostField` and `ttlMs: Infinity`, and pre-filled with this fixed demo set, in this order of `show` so that the first listed is the top row: Baby crying (urgent, side unknown), Voice (low, centre), Knock (medium, left), then Alarm (urgent, right). THE demo events SHALL be valid `SoundEvent`s that the code builds from literals, and SHALL NOT read a microphone or a clip.
3. THE section SHALL contain a row of the seven class glyphs, as inline SVG made by `createGlyph` from `SHAPES`, at the three list-glyph sizes (24, 32 and 40 px for low, medium and urgent, with the outline weights of Requirement 4.1), each inside a 48 px circle of `--bb-color-surface-raised`. Each glyph SHALL have its class name as visible text, and each size row SHALL be labelled with its urgency word (Low, Medium, Urgent). The glyphs are `aria-hidden="true"`, and the text names are the content.
4. THE module SHALL export `glyphSpec(cls, urgency)` (pure: `{ path, viewBox, sizePx, strokeWidth }`) and `createGlyph(cls, urgency)` (DOM: an `<svg>` with `viewBox="0 0 24 24"`, `aria-hidden="true"`, the path, `fill-rule="evenodd"` and the stroke width of the urgency) from `src/ghosts/glyph.ts`. A glyph has no glow, and its colours come from `--bb-ghost-fill` and `--bb-ghost-outline` through CSS. The glyph sizes are 24, 32 and 40 px for low, medium and high.
5. THE section SHALL say in plain words that these are drawings of sounds, what shape, position and glow mean, and that nothing else carries meaning. It SHALL NOT claim that a sound was heard or that the app keeps the user safe.
6. THE section SHALL have no focusable element except the ones the page already has. THE existing e2e checks of the styleguide (clean console, no horizontal scroll) SHALL keep passing.

### Requirement 13: Design gate

**User story:** As the designer, I want the showcase to follow the design system and to look like an illustration and not like clip art.

#### Acceptance criteria

1. THE showcase SHALL meet `design/DESIGN.md`: a soft canvas, a floating white surface, the card radius of 20 px, one accent (violet) and no other hue, the Night theme through the existing tokens, and no hard-coded colour or size where a token exists.
2. THE ghosts SHALL read as a considered illustration at 1x and 2x: clean curves, consistent proportions across the seven classes, an outline weight that grows with urgency without clogging the shape, and a glow that is soft and does not hide the outline. THE builder SHALL judge this from the screenshots and redraw a path that looks like clip art, with the constraints of Requirement 2 kept.
3. A task SHALL have the builder take Playwright screenshots of the Ghosts section of `/styleguide.html` at 1440 px and 390 px, in Day and Night (four screenshots), with `reducedMotion: 'reduce'` so they are stable, look at each one, and fix what breaks the design (a ghost that touches the edge, a label that overlaps a ghost, low contrast, an unreadable shape at list size, overflow, a glow that clips).
4. THE Ghosts section of `design/DESIGN.md` SHALL be updated in the same change: the Doorbell and Other silhouettes in the class table, the uncertain drawing (dashed outline, arc, "Side unknown"), the field furniture (L and R labels, listener mark and bearing arc, a label under each ghost, rows, at most four ghosts), the 8 second life, the bearing convention (negative is left, clamp at 90 degrees) and the fact that ghosts are now drawn by `src/ghosts`. THE sentence "Ghosts are drawn in a later feature" SHALL be replaced. If `tests/ui/design-parse.test.ts` or another test of `tests/ui/` breaks on the new text, the test is fixed in the same change.
5. THE feature SHALL add no token. If a token or a contrast pair changes after all, `src/ui/tokens.css`, `tests/ui/tokens.test.ts` and the contrast table SHALL change in the same commit.

### Requirement 14: Tests

**User story:** As a developer, I want tests that fail when the shapes, the layout, the uncertain rule, the motion rule or the lifecycle break.

#### Acceptance criteria

1. UNIT and property tests SHALL live in `tests/ghosts/` and mirror the source paths. They SHALL use Vitest and `fast-check`, SHALL need no browser and no DOM, and SHALL use literal numbers and strings for every value that the requirements fix.
2. SHAPES tests SHALL cover: all seven classes exist; the paths are pairwise different; every path uses only the allowed commands; every point lies in [2, 22]; the rasterised area of each is between 10% and 80%; every pair of the 21 pairs differs in at least 8% of the 2304 pixels at 48 px. The rasteriser SHALL be a test helper (a path flattener for `M L H V C Q Z` with the even-odd point-in-polygon rule, sampled at pixel centres). If the builder finds that this helper cannot run under `bun run test`, the same check SHALL run in Playwright with `OffscreenCanvas`. One of the two SHALL exist.
3. LAYOUT unit tests SHALL cover: bearing -90, -45, 0, 45 and 90 give the literal `x` values for a width of 600; bearings of 91, 180, -91 and -180 clamp to the edges; the padding (`x` 72 at -90 and `width - 72` at +90, also for a width of 200); an uncertain ghost is at the centre for every bearing source other than `gcc-phat` (`loudness`, `none`) and for every bearing confidence below 0.8 (0, 0.5, 0.79), also with a bearing of -60; a confidence of 0.8 is certain; an out-of-range or non-finite confidence is uncertain; the urgency table (scale, outline, glow blur, glow token, word) for all three urgencies; the label text for a certain and an uncertain ghost; the side text for the four sides; the class decides the shape.
4. ROW tests SHALL cover: one to four ghosts get rows 0 to n-1 top down, newest first; the fifth input and later are dropped, the oldest first; for rows 1 to 4, at a height of 360 and at a taller height, every combination of urgencies fits its slot (blocks do not overlap and lie between the margins); the constants inequality of Requirement 5.3 (48 + 30 <= 78).
   BASEPX tests SHALL cover `ghostBasePx` with literals: height 360 with 4 rows gives 32 (the minimum, exactly at the formula), height 360 with 1 row gives 72 (clamped at the maximum), height 480 with 1 row gives 72, height 480 with 2 rows gives 72 ((216 - 30) / 1.5 = 124, clamped), height 360 with 3 rows gives 49 (floor((104 - 30) / 1.5)), and a height of 200 with 4 rows gives 32 (clamped at the minimum); and `boxPx` of one urgent ghost in a 480 px field is 108, and of four ghosts in a 360 px field 32, 40 or 48 by urgency.
5. PROPERTY tests (`fast-check`, fixed seed, at least 100 runs each) SHALL show: for any finite bearing in [-180, 180] and any width of 200 or more, `x` lies in [72, width - 72]; `FIELD_PADDING_X` is at least `GHOST_BOX_MAX_PX * 1.5 / 2 + 12`; for a certain ghost with a bearing outside the centre zone (absolute value above 15), the sign of `x - width / 2` equals the sign of the bearing; for any input, the same input gives the same layout; `scale`, `outlineWidth` and `glowBlur` strictly increase from low to medium to high, and `boxPx` is `basePx * scale` for each; an uncertain ghost always has `x = width / 2`, `side = 'unknown'` and `sideText = "Side unknown"`; for any list of up to 6 inputs, `layoutGhosts` returns `min(n, 4)` layouts with non-overlapping blocks; for any `rows` from 1 to 4 and any height of 360 or more, the block of every urgency fits its slot; `ghostBasePx` is always in [32, 72], is monotonic non-increasing in `rows` (for a fixed height) and non-decreasing in `height` (for fixed `rows`), and equals the clamp bounds at the two ends (some input gives 32, some gives 72).
6. LIFE tests SHALL cover the pure ghost set (Requirement 7): add, newest first, the cap of 4 with the oldest dropped, expiry at exactly `ttlMs` and not before, `Infinity`, an invalid `ttlMs`, the next expiry time, and clear.
7. TEXT tests SHALL cover the list item texts, the canvas label summary and the empty text, with literal strings.
8. GLYPH tests SHALL cover `glyphSpec` for the three urgencies (sizes 24, 32 and 40, stroke widths 1.5, 2.5 and 3.5) and for the path of each class.
9. INVALID-input tests SHALL cover the pure parts: the helper that decides whether an input is accepted returns `false` for `null`, `undefined`, a number, an object without `event`, an event that fails the validator (bad class, empty label, bearing out of range, `bearingSource` `none` with a bearing), and never throws. The same cases SHALL run through `show` in Playwright (`false`, no list change).
10. A BOUNDARY test SHALL enforce Requirement 1.8, and a CONTRAST test SHALL enforce Requirement 11.4.
11. PLAYWRIGHT tests in `e2e/ghosts.spec.ts`, on `/styleguide.html`, SHALL cover: a knock at -60 degrees with a bearing confidence of 0.95 gives a list item with `data-x` below 0.5, and the left third of the canvas has accent pixels (pixels close to `--bb-ghost-fill` or `--bb-ghost-outline`) while the right third has none; an uncertain ghost has `data-side="unknown"` and the text "Side unknown" in the list and in the canvas label; with `reducedMotion: 'reduce'`, two `canvas.toDataURL()` snapshots taken 500 ms apart are identical and no `requestAnimationFrame` callback ran (an init script counts the callbacks); with motion allowed, the counter does rise (so the counter is proved to work); with `page.clock`, a ghost is in the list at 7999 ms and gone at 8000 ms and the canvas label reads "No sounds yet"; a fifth `show` drops the oldest; invalid input returns `false` and changes nothing; the canvas has `role="img"` and an `aria-label` that names the ghosts; the field has no focusable element; clicking Night redraws the canvas with the Night ghost colours; the backing store is twice the CSS width at a device scale factor of 2; the showcase has the four demo ghosts with the expected `data-class`, `data-side` and `data-urgency`, and the 21 glyphs with their names; `destroy` removes the elements and stops the frames; no console errors and no page errors; no request to another origin; and the four screenshots of Requirement 13.3.
12. THE tests SHALL follow `.kiro/steering/accessibility.md`: this feature adds UI, so it ships the e2e checks for keyboard flow and reduced motion.

### Requirement 15: Privacy and wording

**User story:** As a user, I want a field that draws what the app decided and nothing more.

#### Acceptance criteria

1. THE module SHALL NOT store, log, send or display audio, spectra, loudness, confidence or the event `id`. It SHALL NOT use `localStorage` or any other storage. It draws the event `label` on the canvas (a label is not audio, and the user needs it to read the ghost), and nowhere else in the DOM except the class name in the list.
2. NO copy of the module or the showcase SHALL say that the field keeps the user safe, that it replaces a smoke alarm or another certified device, or that a sound was detected by a real microphone. THE aid sentence of `design/DESIGN.md` SHALL be used verbatim wherever the showcase states it.
3. THE module SHALL add no analytics, third-party script, font, image or API key, and SHALL make no network request.
4. THE UI copy SHALL use plain language. Spooky wording is allowed in titles of the showcase only.

### Requirement 16: Gates

**User story:** As a maintainer, I want the feature to leave the repository green and shippable.

#### Acceptance criteria

1. WHEN the feature is done, `bun run typecheck`, `bun run test` and `bun run e2e` SHALL pass.
2. WHEN the feature is done, `bun run build` SHALL succeed.
3. THE feature SHALL add no run-time dependency and no dev dependency.
4. THE feature SHALL leave `src/events/` and `src/haptics/` unchanged.
5. THE feature SHALL update `.kiro/steering/structure.md` so its `src/ghosts/` entry lists the new files (done in the tasks, see `tasks.md`), and SHALL remove `src/ghosts/.gitkeep` when the first file lands.
