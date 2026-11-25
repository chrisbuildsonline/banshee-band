# Design: Ghost renderer

Requirement numbers refer to `requirements.md`.

## Overview

`src/ghosts` turns a sound into a picture. The mapping is fixed: shape = sound class, position = bearing, glow = urgency. Nothing else carries meaning.

```
GhostInput { event, bearingConfidence }
   |  accept (validateSoundEvent)            input.ts      pure
   v
layoutGhosts(inputs newest first, field)    layout.ts     pure, uses sideOf from haptics
   |  GhostLayout[]  (x, y, scale, outline, glow, shape, uncertain, side, texts)
   v
life set (ttl, cap 4, expiry)               life.ts       pure, time passed in
   |
   v
mountGhostField(container)                  field.ts      DOM: canvas + "Now:" list, timers, observers
   |  draw(ctx, layouts, colours, time)     draw.ts       canvas only, no state
   v
canvas (role="img") + text list             the station's alert card owns the live region
```

`src/ghosts` is at the same level as `src/band` in the chain (`... -> haptics -> band and ghosts -> ui`). It imports `events` and one function of `haptics`. The station screen and the styleguide (both in `ui`) mount it. It never imports `band` or `ui`.

## Files

```
src/ghosts/
  constants.ts   GHOST_BOX_MIN_PX, GHOST_BOX_MAX_PX, LABEL_BLOCK_PX, MAX_GHOSTS, DEFAULT_TTL_MS, FADE_MS, DRIFT_PX, margins, URGENCY_STYLE, CLASS_NAMES
  types.ts       GhostInput, GhostLayout, FieldSize, Slot, GhostField, GhostFieldOptions, Block
  shapes.ts      SHAPES, SHAPE_BOX (data only)
  outline.ts     shapeParts, pathLength, dashFor (pure; outer/details/eyes split, path length, uncertain dash pattern)
  input.ts       acceptInput(value): GhostInput | null   (validator + shape check, never throws)
  layout.ts      layoutGhost, layoutGhosts, ghostBasePx, ghostBlock
  life.ts        createGhostSet(ttlMs, trail?): add, prune, items, nextExpiry, clear
  trail.ts       trailAlpha(rank, ageMs, ttlMs) (pure; TRAIL_ALPHA lookup and the 0.55 for an old latest ghost)
  text.ts        listItemText, canvasSummary, EMPTY_TEXT, dataX
  glyph.ts       glyphSpec (pure; `path` is the whole shape, `strokePath` is outer + details without the eyes), createGlyph (DOM)
  draw.ts        drawField(ctx, state): furniture, arcs, ghosts, labels (canvas only)
  field.ts       mountGhostField
  field.css      field, list and glyph styles, tokens only
  index.ts       public exports and the module comment
src/ui/
  styleguide.ts  mounts the showcase field and the glyph grid (edit)
  styleguide.css styles of the showcase grid (edit)
styleguide.html  Ghosts section (edit)
design/DESIGN.md  Ghosts section (edit)
tests/ghosts/
  boundaries.test.ts  constants.test.ts  shapes.test.ts  layout.test.ts  input.test.ts
  life.test.ts  trail.test.ts  text.test.ts  glyph.test.ts  contrast.test.ts  properties.test.ts
  helpers/raster.ts  helpers/inputs.ts
e2e/
  ghosts.spec.ts
```

`src/ghosts/.gitkeep` is removed when the first file lands. Tests mirror the source paths. `tests/ghosts/helpers/inputs.ts` builds valid `SoundEvent`s and may reuse `tests/haptics/helpers/events.ts`. `vite.config.ts` needs no change because `styleguide.html` is already a build input.

## Constants (R3, R4, R5, R7, R10)

All in `constants.ts`, with doc comments:

| Name | Value | Used for |
|---|---|---|
| `GHOST_BOX_MIN_PX` | 32 | Smallest base box edge (`basePx` at scale 1; box at urgent: 48 px) |
| `GHOST_BOX_MAX_PX` | 72 | Largest base box edge (box at urgent: 108 px) |
| `LABEL_BLOCK_PX` | 30 | Largest glow blur (12) + `GLOW_GAP_PX` + `LABEL_HEIGHT_PX`; derived in the file from those three, not typed |
| `MAX_GHOSTS` | 4 | Cap on live ghosts and rows |
| `DEFAULT_TTL_MS` | 8000 | Life of a ghost |
| `TRAIL_ALPHA` | [1, 0.8, 0.65, 0.55] | Trail mode: alpha of body, glow and outline by rank, newest first; also a latest ghost older than `ttlMs` (0.55) |
| `FADE_MS` | 400 | Fade in and out (the value of `--bb-motion-slow`) |
| `DRIFT_PX` | 4 | Vertical drift amplitude |
| `FIELD_PADDING_X` | 72 | Horizontal padding for the bearing map: half the largest box (108 / 2 = 54) plus the largest glow blur (12) is 66, which fits in 72 |
| `FIELD_TOP_PX` / `FIELD_BOTTOM_PX` | 8 / 40 | Margins; the bottom one holds the listener mark |
| `FIELD_MIN_WIDTH_PX` / `FIELD_MIN_HEIGHT_PX` | 200 / 360 | Smallest field the layout promises to handle |
| `GLOW_GAP_PX` | 2 | Space between the glow edge and the label |
| `LABEL_HEIGHT_PX` | 16 | Height of the label line (13 px text) |
| `BEARING_RANGE_DEG` | 90 | Bearing mapped to the edge; beyond it clamps |
| `ARC_INSET_PX` | 24 | Where the uncertain arc starts and ends, from each edge |
| `DASH_PERIODS_PER_WIDTH` | 6 | Uncertain outline: one dash period per this many outline widths of outer length |
| `DASH_MIN_COUNT` | 3 | Uncertain outline: fewest dashes around the outer outline |
| `URGENCY_STYLE` | table of R4.1 | Word, scale, outline, glow blur, glow token per urgency |
| `CLASS_NAMES` | Knock, Doorbell, Alarm, Baby, Vehicle, Voice, Other | List and aria text |

The box size is computed per layout from the row slot (R4.3, R5.2), not fixed:

```
basePx = clamp(GHOST_BOX_MIN_PX, floor((slotH - LABEL_BLOCK_PX) / 1.5), GHOST_BOX_MAX_PX)
boxPx  = basePx * scale            (scale 1 / 1.25 / 1.5)
```

The tallest block in a slot is an urgent ghost: `1.5 * basePx + 12 + GLOW_GAP_PX + LABEL_HEIGHT_PX = 1.5 * basePx + LABEL_BLOCK_PX`. The formula picks the largest `basePx` for which this is at most `slotH`, so every block fits its slot by construction, for any rows and any height. Only the lower clamp can break that, and it is safe because of the one constants check (R5.3): `GHOST_BOX_MIN_PX * 1.5 + LABEL_BLOCK_PX = 48 + 30 = 78 <= (360 - 8 - 40) / 4 = 78`. It holds with no slack at 360 px with four rows, where `basePx` is exactly 32.

Worked values:

| Field | Rows | `slotH` | `basePx` | Box low / medium / urgent |
|---|---|---|---|---|
| 480 px desktop | 1 | 432 | 72 (clamped, formula gives 268) | 72 / 90 / 108 |
| 480 px desktop | 2 | 216 | 72 (clamped, formula gives 124) | 72 / 90 / 108 |
| 360 px phone | 1 | 312 | 72 (clamped) | 72 / 90 / 108 |
| 360 px phone | 3 | 104 | 49 | 49 / 61.25 / 73.5 |
| 360 px phone | 4 | 78 | 32 (formula gives exactly 32) | 32 / 40 / 48 |

`tests/ghosts/constants.test.ts` checks the constants inequality. The layout tests and properties check that, for rows 1..4 and any height of 360 or more, the block fits its slot. A change to the label height, a margin or the bounds that breaks either fails a test.

`GHOST_BOX_MIN_PX` of 32 is the floor for a full phone field of four ghosts. The ghost drawing gets its quality from the shape, the outline and the glow, and the size grows when there is room: one or two ghosts in a 480 px desktop field are no longer tiny. A glyph in the list is 24, 32 and 40 px, so a field ghost of 32 to 108 px is at or above that range. The builder may change the bounds only together with `FIELD_MIN_HEIGHT_PX`, if the constants inequality still holds and the phone canvas is still about 360 px high.

## Input (R1)

```ts
export interface GhostInput { event: SoundEvent; bearingConfidence: number }

// input.ts
export function acceptInput(value: unknown): GhostInput | null
```

`acceptInput` returns `null` unless `value` is a non-null object that has an `event` and for which `validateSoundEvent(value.event).ok` is true. It returns a new `{ event: result.event, bearingConfidence: value.bearingConfidence }`. A `bearingConfidence` that is not a number is kept as `NaN` for `sideOf`, which maps it to `'unknown'` (R1.5). Reading properties of an arbitrary object can throw (a getter that throws, a revoked proxy), so `acceptInput` wraps the whole check in one `try/catch` and returns `null` on any error. The test of R14.9 includes a throwing getter. This is the only `try/catch` in the module that guards input.

## Shapes (R2)

`shapes.ts` exports the table and the box:

```ts
export const SHAPE_BOX = 24;
export const SHAPES: Readonly<Record<SoundClass, string>> = Object.freeze({ knock: '...', doorbell: '...', ... });
```

The builder draws the paths. The silhouettes, in unit-box proportions (24 wide, 24 high, content inside [2, 22]):

| Class | Silhouette | Distinguishing outline feature |
|---|---|---|
| Knock | Tall (about 14 wide, 20 high), square shoulders, flat hem | Corners at the top, straight hem |
| Doorbell | Narrow (about 10 wide, 17 high ghost body) with a small round chime knob (about 4 across) on top, centred | The knob above the head, narrow body |
| Alarm | Bell: round top, sides flaring to a wide hem (about 18 wide) with a small gap at the hem | Flared hem wider than the head |
| Baby | Small (about 12 wide, 13 high) round ghost low in the box, one curl rising from the top | The curl |
| Vehicle | Wide and low (about 20 wide, 11 high), a long trailing hem to one side | Horizontal, with a tail |
| Voice | Round (about 15 wide, 18 high), open wavy mouth cut as a hole | Mouth hole, wavy bottom of the mouth |
| Other | Plain round-topped ghost (about 12 wide, 19 high), wavy hem of three dips, eyes only | No detail beyond the eyes |

Rules the builder keeps:

- The outline alone makes the class readable. A hole (the Voice mouth) helps but must not be the only difference, because a hole is lost in a 24 px glyph. Voice therefore also differs by the round, wider head and wavy hem.
- Every ghost has two oval eyes, cut as holes: the last two subpaths of each path. Voice also has one mouth detail, the subpath before the eyes. The eyes are the same kind on every shape, so the outline alone still tells the classes apart. `shapeParts` in `src/ghosts/outline.ts` splits a path into `outer` (first subpath), `details` (between) and `eyes` (last two). The eyes are never stroked, so a heavy outline cannot close an eye.
- Each path is one string of absolute commands `M L H V C Q Z`. Holes are extra subpaths filled with the even-odd rule, so the fill rule is a fixed property of the data: `fill-rule="evenodd"` in SVG and `ctx.fill(path, 'evenodd')` on the canvas. Strokes follow the same path with `lineJoin = 'round'`.
- Every point, control points included, is in [2, 22]. The stroke is centred on the path, so the widest outline (3.5 units, half 1.75) stays inside the 24-unit box.
- The 8% distinctness is a floor and not a goal. Aim for well above it: the pairs at risk are Knock vs Other (both tall), Alarm vs Other (both have a flared lower part) and Baby vs Doorbell (both have a top feature). Sizes in the table are chosen so that these pairs differ by their proportions as well as their features.

The test rasteriser (`tests/ghosts/helpers/raster.ts`):

1. Tokenise the path into commands and numbers (the allowed commands only; anything else throws, which also enforces R2.2).
2. Flatten: `L H V` are single edges, `Q` and `C` are sampled at 16 steps per curve, `Z` closes the subpath.
3. For a 48 x 48 grid, take the pixel centre `((i + 0.5) / 2, (j + 0.5) / 2)` in units, and count the crossings of a horizontal ray over all subpaths (even-odd).
4. Return a `Uint8Array(2304)`. `differenceRatio(a, b)` is the count of pixels that differ over 2304.

The helper has its own tests: a square of known area, a square with a square hole, a circle approximated by `C` curves (area within 1% of pi r^2), and a path with a command that is not allowed.

## Layout (R3 to R5)

```ts
export interface FieldSize { width: number; height: number }
export interface Slot { row: number; rows: number }
export interface GhostLayout {
  x: number; y: number; boxPx: number; scale: number; outlineWidth: number; glowBlur: number; glowToken: string;
  shape: string; uncertain: boolean; side: Side; sideText: string; urgencyWord: string; labelText: string;
}
export interface Block { top: number; bottom: number }

export function layoutGhost(input: GhostInput, field: FieldSize, slot?: Slot): GhostLayout
export function layoutGhosts(inputs: readonly GhostInput[], field: FieldSize): GhostLayout[]
export function ghostBasePx(height: number, rows: number): number
export function ghostBlock(l: GhostLayout): Block
```

Formulas, with `W = field.width`, `H = field.height`:

```
side       = sideOf(event, bearingConfidence)
uncertain  = side === 'unknown'
half       = W / 2 - FIELD_PADDING_X                       (72)
x          = uncertain ? W / 2
                       : W / 2 + clamp(event.bearingDeg, -90, 90) / 90 * half
u          = URGENCY_STYLE[event.urgency]
usable     = H - FIELD_TOP_PX - FIELD_BOTTOM_PX
slotH      = usable / slot.rows
basePx     = clamp(GHOST_BOX_MIN_PX, floor((slotH - LABEL_BLOCK_PX) / 1.5), GHOST_BOX_MAX_PX)   (ghostBasePx(H, slot.rows))
boxPx      = basePx * u.scale
blockH     = boxPx + u.glowBlur + GLOW_GAP_PX + LABEL_HEIGHT_PX
blockTop   = FIELD_TOP_PX + slot.row * slotH + (slotH - blockH) / 2
y          = blockTop + boxPx / 2
ghostBlock = { top: y - boxPx / 2, bottom: y - boxPx / 2 + blockH }
```

Notes:

- A certain ghost has a finite `bearingDeg` by the `sideOf` contract (a non-finite or null bearing gives `'unknown'`), so `clamp` never sees `null` or `NaN`. The code asserts this by the order of its checks and not by a copy of the rule.
- `bearingDeg` is in [-180, 180] after validation. The clamp handles the whole range, and the property test also feeds finite values outside it to prove `x` stays in the padded range.
- The `x` map is linear over the whole bearing range, also inside the haptics centre zone (15 degrees). The `Centre` word comes from `sideOf`. This means a ghost at -10 degrees says "Centre" and sits 11% of `half` left of the middle. That is what the data says, and a jump at the zone edge would invent precision.
- `y` is the body centre. The label top is `y + boxPx / 2 + glowBlur + GLOW_GAP_PX`, computed by `draw.ts` from the layout fields. `ghostBlock` and `draw.ts` share one small helper (`labelTop`), and both read `boxPx` from the layout, so the geometry has one definition.
- `layoutGhosts` takes `inputs.slice(0, MAX_GHOSTS)` and calls `layoutGhost(input, field, { row: i, rows: n })` for each. `basePx` depends on `rows` and `H` only, so every ghost of one call has the same `basePx`, and the urgency ratios hold inside the layout. `layoutGhost` with the default slot `{ row: 0, rows: 1 }` gives the one-ghost size.
- With one ghost, its block is centred in the whole usable height and the ghost is large (up to 72 px base). With two, each has half and the base may drop. The rows and the sizes move when a ghost expires or arrives. This is accepted: a movement of a row, and a change of size, when the set changes is the price of never overlapping, and under motion allowed the 400 ms fade covers the change of a leaving ghost. See Risks.

## Life of a ghost (R7)

`life.ts` is a pure set. Time is an argument, so it is tested with literals.

```ts
export interface LiveGhost { input: GhostInput; shownAt: number; expiresAt: number; seq: number }
export interface GhostSet {
  add(input: GhostInput, now: number): void;  // newest first; drops the oldest beyond MAX_GHOSTS
  prune(now: number): boolean;                // removes expiresAt <= now; true if anything was removed
  items(): readonly LiveGhost[];              // newest first
  nextExpiry(): number | null;                // the smallest expiresAt, or null when empty or all Infinity
  clear(): void;
}
export function createGhostSet(ttlMs: number): GhostSet
```

`expiresAt = shownAt + ttl`, and `Infinity` stays `Infinity`. `seq` is an increasing counter that gives each ghost its drift phase (`seq * 0.37` of a period), so two ghosts never drift in step and nothing uses a random value. `ttl` is validated once in `createGhostSet` (R7.2).

## Text (R8)

`text.ts`, pure:

```ts
listItemText(cls, side, urgency): string   // 'Knock, left, urgent'  'Baby, side unknown, urgent'  'Voice, centre, low'
canvasSummary(items): string               // 'Sound field. Now: Alarm, right, urgent; Knock, left, medium'  or  'No sounds yet'
dataX(x, width): string                    // (x / width) as a decimal with at most 4 decimals, no trailing noise
EMPTY_TEXT = 'No sounds yet'
```

The side word in the list is lower case (`left`, `centre`, `right`) and `side unknown` for an unknown side. The urgency word is `low`, `medium` or `urgent` (`high` is the data value in `data-urgency`, and the word is "urgent", the word of the design). The canvas label of the field (`aria-label`) is `canvasSummary`. The canvas label for the empty field is exactly "No sounds yet", as the decision says. The list and the canvas label use `CLASS_NAMES` and not `event.label`: the class is what the ghost shape shows, and the event label is what a ghost's canvas label shows.

## Field (R7, R8, R9, R10)

### DOM

```
<div class="bb-ghost-field">                       created inside the container
  <canvas class="bb-ghost-field__canvas" role="img" aria-label="No sounds yet"></canvas>
  <div class="bb-ghost-field__list">
    <p class="bb-ghost-field__now" id="...">Now:</p>
    <ul aria-labelledby="...">
      <li data-class="alarm" data-side="right" data-urgency="high" data-x="0.8000">Alarm, right, urgent</li>
      ...
    </ul>
  </div>
</div>
```

Built with `createElement` and `textContent`. The `id` for `aria-labelledby` comes from a module counter, so two fields do not share an id. `field.css`: the root is a flex column, the canvas is `display: block; width: 100%; height: 360px; min-height: 360px`, and a card that wants more height (the 480 px desktop card) lets the canvas grow with `flex: 1 1 auto` inside a flex parent. The list text uses `caption` type, the heading `label` type, the colour is `--bb-color-text`. No focusable element, no `tabindex`.

### Flow

```
mount:   read colours -> create DOM -> ResizeObserver(canvas parent) -> MutationObserver(html data-theme)
         -> matchMedia(colour scheme), matchMedia(reduced motion) -> draw once
show:    acceptInput -> set.add(input, performance.now()) -> relayout -> update list + aria-label
         -> schedule expiry -> redraw (reduced) or ensure the frame loop (motion)
expiry:  timer fires -> set.prune(now) -> relayout -> update list + aria-label -> schedule next -> redraw
frame:   (motion only, while items exist) draw(ctx, state, now) -> requestAnimationFrame(frame)
destroy: clearTimeout, cancelAnimationFrame, disconnect observers, remove listeners, remove DOM
```

- **One expiry timer.** `scheduleExpiry()` clears the old timer and sets `setTimeout(onExpiry, max(0, nextExpiry - performance.now()))` when `nextExpiry()` is finite. The timer runs under both preferences, so expiry never depends on a frame (R10.7). `onExpiry` calls `prune(performance.now())`. Under a fake clock `performance.now()` and `setTimeout` advance together, so an expiry at exactly `ttlMs` is removed at the `runFor(8000)` step.
- **Layout state.** `layouts = layoutGhosts(items.map(i => i.input), size)` is computed when the set or the size changes, not each frame. `ghosts()` returns copies of it.
- **Size.** The `ResizeObserver` callback reads `contentRect.width` and the canvas CSS height (`canvas.clientHeight`), sets `canvas.width = round(w * dpr)` and `canvas.height = round(h * dpr)`, calls `ctx.setTransform(dpr, 0, 0, dpr, 0, 0)`, relayouts and redraws. `dpr` is read at each resize. A change of `devicePixelRatio` without a resize (a window moved to another screen) is picked up at the next resize or redraw: the field also re-reads `devicePixelRatio` in `draw` and resizes the backing store when it differs. This is a small check and keeps 1x and 2x crisp.
- **No context.** `getContext('2d')` can return `null` in odd environments. Then `draw` is skipped, and the list and the label still update (R9.9).
- **Colours.** `readColours(canvas)` returns `{ fill, outline, glow: [g1, g2, g3], text, muted, border, font, driftMs }` from `getComputedStyle(canvas).getPropertyValue(...)`. It runs at mount, on a theme change, on a colour-scheme change and on a resize, and not on each frame. A custom property that is empty falls back to a plain `#000` inside `readColours` only, so the field never throws on a missing token. The e2e tests read the real values, so a missing token fails a test.
- **Reduced motion.** `const rm = matchMedia('(prefers-reduced-motion: reduce)')`. `motionAllowed()` is `!rm.matches`, read at the point of use. The `change` listener calls `onMotionChange`: it cancels the frame if reduced, draws once, and starts the loop if allowed and items exist.

### Drawing (draw.ts)

`drawField(ctx, state)` with `state = { size, dpr, colours, layouts, items, now, motion }` is a function of its arguments and has no module state. Order:

1. `ctx.clearRect(0, 0, W, H)`.
2. Furniture: "L" at `(14, H / 2)` and "R" at `(W - 14, H / 2)`, 12 px, weight 600, `muted`, centre/middle alignment. The listener mark: filled circle radius 4 at `(W / 2, H - 10)` in `muted`. The bearing arc: `ctx.arc(W / 2, H - 10, 24, Math.PI, 2 * Math.PI)` stroked 2 px in `border`.
3. For each ghost, from the bottom row to the top (the order does not matter, rows do not overlap):
   - `alpha` is the fade value, and the body alpha is separate. Under reduce the fade is 1. With motion the fade is `min(1, age / FADE_MS, remaining / FADE_MS)`, with `remaining = Infinity` for an infinite ttl (a latest ghost in trail mode has no expiry, so no fade out). In trail mode the body, glow and outline use `fade * bodyAlpha` (`TRAIL_ALPHA` by rank, see Trail mode); the label uses `fade` only. Without trail `bodyAlpha` is 1.
   - `dy` is `DRIFT_PX * sin(2 * PI * (now / driftMs + seq * 0.37))` with motion and `driftMs > 0`, else 0. The ghost centre is `(x, y + dy)`. The label and the arc do not drift (only the body moves), so the text stays still and readable.
   - If uncertain: the arc. A quadratic curve from `(24, y)` to `(W - 24, y)` with the control point `(W / 2, y + 12)` (a sag of 6 px), stroked 2 px in `border`, with a filled triangular head (5 px long, 6 px wide) at each end pointing outwards. Drawn first, so the ghost covers the middle.
   - Ghost: `ctx.save(); ctx.globalAlpha = alpha; ctx.translate(x, y + dy); const k = layout.boxPx / 24; ctx.scale(k, k); ctx.translate(-12, -12);` then take `shapeParts(shape)` and the cached `Path2D` objects (a `Map<string, Path2D>` per field): the whole path, the stroke path (outer + details) and the outer and eyes parts.
     1. Fill: `shadowColor = glow[token]`, `shadowBlur = glowBlur * dpr`, fill the whole path with `fill` and the even-odd rule. Then `shadowBlur = 0`.
     2. Eyes: the glow spills into the eye holes, so clear them with `globalCompositeOperation = 'destination-out'` and fill the eyes part, then restore `source-over`. This runs after the glow fill so the card surface shows through the eyes.
     3. Shade: clip to the whole path (even-odd), fill it with `outline` at low alpha, then fill the stroke path shifted by a small offset in `fill`, which leaves a thin crescent of `outline` along the lower edge.
     4. Stroke: `lineWidth = outlineWidth`, `lineJoin = 'round'`, `lineCap = 'butt'`, stroke the outer outline and the details only, never the eyes. A certain ghost strokes the stroke path solid. An uncertain ghost strokes the stroke path as a faint solid trace, then dashes only the outer subpath with `setLineDash(dashFor(outlineWidth, pathLength(outer)))` and strokes the details solid. `dashFor` gives `max(DASH_MIN_COUNT, round(length / (DASH_PERIODS_PER_WIDTH * outlineWidth)))` whole periods, a dash of two thirds of a period and a gap of one third; a non-positive or non-finite width or length gives a solid line.
     `shadowBlur` is in device pixels, so it is scaled by `dpr`, and the shadow offset is 0.
   - Label: `ctx.restore()` first (no transform), font `500 13px <font>`, `text` colour, centre alignment, top baseline at `labelTop`. The text is measured with `measureText`. If wider than `W - 16`, it is cut with an ellipsis until it fits (a binary search on the length). The centre `lx = clamp(x, 8 + w / 2, W - 8 - w / 2)`, so a ghost near an edge keeps its label inside. The label is drawn at the fade alpha only (full strength in trail mode, whatever the rank).

The glow is the canvas shadow of the fill. Its visible reach is about `glowBlur` px, which is why the label starts `glowBlur + GLOW_GAP_PX` below the body. The arc of an uncertain ghost is drawn at the body's mid-height, so it never sits in the label area.

`draw.ts` has no DOM access other than the `CanvasRenderingContext2D` it receives. A thin file, but it is where the visual quality is made, so the design gate (task 9) reviews screenshots of it.

### Motion (R10)

```
motion allowed + ghosts live:  frame loop, draw each frame with now = performance.now() (or the rAF timestamp)
motion allowed + no ghosts:    no frame pending
reduced:                       no requestAnimationFrame call, ever; draw() on: show, expiry, clear, resize,
                               theme or colour-scheme change, motion-preference change
```

Drift is vertical only, so the horizontal position (the bearing) never moves. At most 4 px at a 6 s period is a speed under 5 px per second, far below any flash threshold. The only brightness change is the 400 ms fade, which is one transition and not a cycle, and the glow never pulses. So no part of the field flashes at all, which is below the limit of 3 per second.

The drift period is read from the token with a small parser: `"6s"` gives 6000, `"150ms"` gives 150, anything else gives 0. Under reduced motion the token resolves to `0s`, and the field would not drift even if the loop ran. The loop is still not started.

### Redraw on theme change

`MutationObserver` on `document.documentElement` with `attributeFilter: ['data-theme']`, plus `matchMedia('(prefers-color-scheme: dark)')`'s `change`. Both call `refreshColours(); draw()`. The field does not touch `data-theme` itself.

## Trail mode (R7.11 to R7.14, R8.7, R10.8 to R10.10)

`mountGhostField(container, { ttlMs?, trail? })`, `trail` default `false`. The station passes `{ ttlMs: 30000, trail: true }`; the styleguide showcase passes `{ ttlMs: Infinity }` and sees no change.

- **Life (`life.ts`).** `createGhostSet(ttlMs, trail = false)`. Without trail, an item expires at `shownAt + ttlMs`. With trail, only items that are not the newest expire at `shownAt + ttlMs`; the newest has no expiry. `add` first prunes with the new time, so an older item whose time has passed leaves at once, then pushes the new item and applies the cap of four. `nextExpiry()` ignores the newest item and returns `Infinity` when there is no other item, so the field sets no expiry timer for a lone latest ghost. The pure set carries the whole rule (tests: `tests/ghosts/life.test.ts`, trail cases).
- **Alpha by rank (`constants.ts`, `trail.ts`).** `TRAIL_ALPHA = [1, 0.8, 0.65, 0.55]` (first is the newest). A pure helper `trailAlpha(rank, ageMs, ttlMs)` returns `TRAIL_ALPHA[rank]` and, for rank 0, `TRAIL_ALPHA[3]` (0.55) when `ageMs > ttlMs`. Without trail the field does not call it and every ghost keeps alpha 1.
- **Drawing (`draw.ts`).** `state.trail` is an array of per-ghost `bodyAlpha` values (1 when not in trail mode). The body, glow and outline are drawn with `globalAlpha = fade * bodyAlpha`. The label is drawn with `globalAlpha = fade` only, so it stays at full strength; the fade in and out still apply. The glow dims with the body because it is the canvas shadow of the fill, drawn under the same `globalAlpha`.
- **Age timer (`field.ts`).** In trail mode the field sets one more timer, for `shownAt + ttlMs` of the latest ghost, and redraws when it fires (no layout change, only the alpha). It is cleared when a newer ghost arrives (the new latest restarts it), on `clear` and on `destroy`. It uses `setTimeout`, not a frame, so it runs under reduced motion too, and the 0.55 dimming is a still state that applies there (R10.9).
- **Reduced motion.** With reduce there is still no `requestAnimationFrame`. Draws happen on show, expiry, the age timer, resize, colour change and motion-preference change. The `alpha` of R10.3 is the rank alpha, not 1.
- **Heading and label.** `field.ts` and `text.ts` take the heading word from the option: "Recent:" with trail, "Now:" without. `canvasSummary(layouts, heading)` builds "Sound field. Recent: Alarm, right, urgent; ...". The empty text stays "No sounds yet".
- **Contrast.** The outline at 0.55 alpha is composited over `--bb-color-surface`; `tests/ghosts/trail.test.ts` computes `0.55 * outline + 0.45 * surface` from `src/ui/tokens.css` in Day and Night and fails below 3:1. If a token fails, the builder raises `TRAIL_ALPHA[3]` or the outline token, with the contrast table of `design/DESIGN.md` updated in the same change.

## Glyph (R12)

```ts
export interface GlyphSpec { path: string; viewBox: '0 0 24 24'; sizePx: number; strokeWidth: number }
export const GLYPH_SIZE_PX: Record<Urgency, number>   // low 24, medium 32, high 40
export function glyphSpec(cls: SoundClass, urgency: Urgency): GlyphSpec
export function createGlyph(cls: SoundClass, urgency: Urgency): SVGSVGElement
```

`createGlyph` builds an `<svg>` with `createElementNS`, `aria-hidden="true"`, `focusable="false"`, `width` and `height` of `sizePx`, one `<path>` with `d`, `fill-rule="evenodd"` and `stroke-width`. The class `bb-ghost-glyph` in `field.css` sets `fill: var(--bb-ghost-fill)`, `stroke: var(--bb-ghost-outline)` and `stroke-linejoin: round` (an SVG presentation attribute does not take `var()` reliably, so the colour goes through CSS). The later event-list row will use the same function. The glyph has no glow: at list size the size and outline weight carry the urgency, and the word is in the pill.

## Showcase (R12, R13)

`styleguide.html` gets a section after the existing ones, in the style of the others (`aria-labelledby`, `bb-card` blocks on the `bb-grid`). The builder reads `styleguide.html`, `src/ui/styleguide.ts` and `src/ui/styleguide.css` first and reuses the section and card classes.

```
Ghosts                                              h2 "Ghosts"
Each sound is a ghost. Its shape is the kind of sound, its place is the side it came from, and its glow is how urgent it is. Nothing else carries meaning.

+------------------------------------------------------------------+   ghost field card (surface, 20 px, min 480 desktop)
| Ghost field                                                      |
|  L          [Alarm · Right · Urgent above its ghost]           R |
|     ...                                                          |
|  Now: Alarm, right, urgent · Knock, left, medium · ...           |
+------------------------------------------------------------------+
+------------------------------------------------------------------+   glyph card
| Ghost glyphs            Knock Doorbell Alarm Baby Vehicle Voice Other
|  Low     (24)   ...                                              |
|  Medium  (32)   ...                                              |
|  Urgent  (40)   ...                                              |
+------------------------------------------------------------------+
```

Demo set, shown in this order with `ttlMs: Infinity` (the last shown is the top row):

| Order | Class | Label | Urgency | Bearing | Source | Confidence | Result |
|---|---|---|---|---|---|---|---|
| 1 | baby | Baby crying | high | null | none | 0.9 | Urgent, side unknown, centre, dashed |
| 2 | voice | Voice | low | 0 | gcc-phat | 0.9 | Low, centre |
| 3 | knock | Knock | medium | -55 | gcc-phat | 0.9 | Medium, left |
| 4 | alarm | Smoke alarm | high | 60 | gcc-phat | 0.9 | Urgent, right |

Each event has a literal `id` (`demo-baby`, ...), `t` 0, `confidence` 0.9 and `loudnessDb` -20. The demo reads nothing from a microphone or a clip. The demo builds the four events in `styleguide.ts` (a `ui` file), so the `src/ghosts` module does not hold demo data.

The glyph card is a CSS grid: 7 columns by 3 rows, each cell a 48 px `--bb-color-surface-raised` circle holding the glyph, with the class name as `caption` text under the first row's glyph and the urgency word as a row label. Below 720 px the grid becomes 4 columns and the cells wrap, so the page never scrolls sideways. Every cell has its class name as a `caption` text under the circle, which gives 21 names, and the e2e test counts 21 glyphs with names.

Contrast of the glyph on the tile uses the existing row "Ghost fill on tile" of the contrast table (3.48 Day, 12.41 Night).

The field is mounted in a container whose card has `min-height: 480px` on desktop and a flex column, so the canvas grows (at least 360 px). Below 720 px the canvas is 360 px high and the card is as tall as its content.

### DESIGN.md update (R13.4)

The builder rewrites the Ghosts section: the class table gets Doorbell and Other rows; a "Uncertain" paragraph (dashed outline, double-headed arc, "Side unknown"); a "Field" paragraph (L and R labels, listener mark and bearing arc, label under every ghost, rows newest on top, at most four, a life of 8 s, the bearing convention with the clamp at 90 degrees); the sentence "Ghosts are drawn in a later feature; this section fixes their vocabulary." becomes a sentence that `src/ghosts` draws them. The urgency table is unchanged. The builder runs `tests/ui` after the edit, because `design-parse.ts` reads tables from this file.

## Testing strategy (R14)

- **Pure unit tests** run under `bun run test` without a DOM: constants, shapes (with the rasteriser), input, layout, life, text, glyph spec, boundaries, contrast.
- **Properties** (`tests/ghosts/properties.test.ts`) use `fast-check` with a fixed seed and at least 100 runs. Arbitraries: valid `SoundEvent`s from `tests/events/arbitraries.ts` if it fits (the builder checks), otherwise from `tests/ghosts/helpers/inputs.ts`; bearing confidence in `fc.double({ min: -0.5, max: 1.5 })` plus the edge values 0, 0.79, 0.8, 1, `NaN`; widths `fc.integer({ min: 200, max: 3000 })`; heights from 360.
- **Contrast** (`contrast.test.ts`) reads `src/ui/tokens.css` for the Day and Night values and uses the ratio function of `tests/ui/contrast.ts`. The builder reads that file and `tests/ui/tokens.test.ts` for how they parse the tokens and reuses it.
- **Playwright** (`e2e/ghosts.spec.ts`) works on `/styleguide.html`. The tests for fresh fields mount their own field through the dev server's module graph:

  ```ts
  await page.evaluate(async () => {
    const { mountGhostField } = await import('/src/ghosts/index.ts');
    const host = document.createElement('div');
    host.id = 'test-field'; host.style.width = '600px';
    document.body.append(host);
    (window as any).__field = mountGhostField(host);
  });
  ```

  `bun run e2e` starts the Vite dev server (README), so `/src/...` is served. The module is the same one that the styleguide imports, so there is no second copy of state. If the builder finds that the import path breaks (for example a hashed URL), the fallback is a `?ghost-test` query on `styleguide.html` that mounts an extra empty field and exposes it as `window.__ghostTestField`, kept out of the production build with `import.meta.env.DEV`. Use the first approach first.
  - **Accent pixels.** `getImageData` of the canvas, a pixel counts as accent when its alpha is above 200 and its RGB is within 24 (per channel) of the computed `--bb-ghost-fill` or `--bb-ghost-outline`. The left third has some for the knock at -60; the right third has none. Label text and furniture are neutral grey and never count.
  - **Snapshots under reduce.** `page.emulateMedia({ reducedMotion: 'reduce' })` before the mount, `canvas.toDataURL()` twice, `waitForTimeout(500)` between (a real wait, no `page.clock`).
  - **rAF count.** `page.addInitScript` wraps `requestAnimationFrame` to increment `window.__rafRuns` when a callback runs. The test resets it right before `show` and reads it after the wait, so other scripts of the page do not matter. A control test with motion allowed shows it rises.
  - **Clock.** `page.clock.install()` before `goto`, then `show`, `runFor(7999)`: one list item; `runFor(1)`: the "No sounds yet" item. Under motion allowed the fake clock also runs the frame loop, which is fine.
  - **DPR.** `test.use({ deviceScaleFactor: 2 })` in one describe block, check `canvas.width === Math.round(canvas.clientWidth * 2)`.
  - **Screenshots.** The Ghosts section element, four files `e2e/screenshots/ghosts-{1440,390}-{day,night}.png`, with reduced motion and `document.fonts.ready`, as the existing styleguide spec does. Day or Night is set through the page's own theme control.

## Error handling

- Bad input to `show` returns `false`. No other function of the module throws for valid input, and the module logs nothing (R1.2).
- A missing 2D context or a zero-size canvas skips drawing (R9.9).
- A missing token falls back to a plain neutral inside `readColours` only. The e2e tests read the real values, so a missing token fails a test and does not hide.
- An `Infinity` ttl is valid. A bad `ttlMs` gives the default.

## Assumptions made where the decisions were silent

- **"Under it" for the arc** (decision 4) is read as z-order: the arc is drawn beneath the ghost, at the ghost's mid-height, with the ghost on top of its middle. This leaves the vertical space under the ghost to the label and keeps the four-row inequality. If "under" meant below the ghost, the field would need about 32 px more height for four uncertain urgent ghosts.
- **Drift is vertical only**, so the bearing stays readable.
- **`ttlMs: Infinity`** is allowed so the showcase does not expire.
- **The field is 360 px high at least** (desktop card 480 px min includes the list and the heading), and the phone canvas is 360 px. Decision 7 gives "about 360" for the phone field.
- **Ghost size** follows from the row slot (`basePx`, 32 to 72 px), so a lone ghost is large and a full phone field is at the minimum. It is not a drawing preference.
- **The list names the class, the canvas label shows the event label.** Decision 5 says the list names ghosts by class, side and urgency, and decision 3 builds `labelText` from `event.label`.
- **A duplicate event id is not special.** Two events with one id make two ghosts.

## Risks and open points

- **Sizes change with the set.** `basePx` depends on the number of rows, so when a ghost arrives or expires every remaining ghost changes size (for example from 72 to 49 px base when a third ghost arrives in a 360 px field), as well as moving to a new row. This is the same accepted behaviour as the row movement below, and R5.6 states it. At 360 px with four ghosts the base is 32 px, the floor, and the constants check keeps four urgent labelled ghosts inside their slots.
- **Rows move.** When a ghost expires, the others re-flow into taller slots at once, and a ghost jumps vertically and grows. Under motion allowed the leaving ghost has already faded, but the others still jump. A 400 ms ease of `y` and `boxPx` is a polish option; it adds state to the loop and is not in this feature. Under reduced motion the jump is the specified behaviour (a static change).
- **Glow clipping.** A 12 px glow of a ghost near the left or right padding edge fits: half of the largest box (108 / 2 = 54 px) plus the 12 px glow is 66 px, inside the 72 px padding. The top row's glow has the 8 px top margin plus the slot's own spare room, which is at least 0 when the slot equals the block (four rows at 360 px). A glow that clips at the top edge for four urgent ghosts is acceptable and is checked in the screenshots.
- **Label font.** The canvas uses the system font stack through `--bb-font-family`. `measureText` depends on the font, so label widths differ between systems, and the shortening of long labels is checked by the e2e test with an event label of 80 characters.
- **Desktop browsers and `matchMedia`.** Playwright's `emulateMedia` drives `prefers-reduced-motion` and `prefers-color-scheme`. The field listens to both.
- **Colour reads in the loop.** Reading computed styles is not done per frame. A theme change that does not touch `data-theme` or the colour-scheme media query (a class change on a parent that overrides the tokens) would not be seen until the next resize. The tokens are only set on `html`, so this does not happen today.
