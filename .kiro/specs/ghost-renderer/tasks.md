# Tasks: Ghost renderer

Each task is small and ends in a test gate. Write the test first, see it fail for the right reason (a stub that throws `not implemented`), then implement. Run `bun run typecheck` and `bun run test` at every gate, and `bun run e2e` at every gate that touches the styleguide. Requirement numbers refer to `requirements.md`. Do not add dependencies. Tests use literal numbers and strings for the values that the requirements fix (positions, scales, texts). Do not change `src/events/` or `src/haptics/`. Read `.kiro/steering/halloween-style.md` and `design/DESIGN.md` (Ghosts, Motion, Contrast) before task 2.

- [x] 1. Contract, constants and boundaries
  - [x] 1.1 Create `src/ghosts/types.ts` (`GhostInput`, `GhostLayout`, `FieldSize`, `Slot`, `Block`, `GhostField`, `GhostFieldOptions`), `src/ghosts/constants.ts` (every constant of the design table, `URGENCY_STYLE`, `CLASS_NAMES`) and `src/ghosts/index.ts` with the module comment of Requirement 1.7 (mapping, nothing else carries meaning, aid and not a safety device). Remove `src/ghosts/.gitkeep` once a real file exists. Export types and constants only for now.
    - _Requirements: 1.3, 1.7, 1.9, 4.1, 5.3_
  - [x] 1.2 Write `tests/ghosts/constants.test.ts`: the urgency table with literal values (words, scales 1/1.25/1.5, outlines 1.5/2.5/3.5, blur 4/8/12, tokens `--bb-ghost-glow-1` to `-3`), strict growth with urgency, `MAX_GHOSTS` 4, `DEFAULT_TTL_MS` 8000, and the constants inequality `GHOST_BOX_MIN_PX * 1.5 + LABEL_BLOCK_PX <= (FIELD_MIN_HEIGHT_PX - FIELD_TOP_PX - FIELD_BOTTOM_PX) / MAX_GHOSTS` (48 + 30 <= 78, no slack), `LABEL_BLOCK_PX` equal to 30 and equal to 12 + `GLOW_GAP_PX` + `LABEL_HEIGHT_PX`, `GHOST_BOX_MIN_PX` 32, `GHOST_BOX_MAX_PX` 72, `FIELD_PADDING_X` 72 and at least `GHOST_BOX_MAX_PX * 1.5 / 2 + 12` (the largest glow blur is the one of `URGENCY_STYLE.high`).
    - _Requirements: 3.3, 4.1, 4.2, 5.3, 14.4, 14.5_
  - [x] 1.3 Write `tests/ghosts/boundaries.test.ts`: scan `src/ghosts/*.ts` (comments removed) for imports other than `../events`, `../haptics`, `./*` and `.css` files; for any named import from `../haptics` other than `sideOf` and the `Side` type; for the forbidden identifiers (`fetch`, `XMLHttpRequest`, `WebSocket`, `bluetooth`, `console`, `Math.random`, `Date`); and for the texts `gcc-phat`, `bearingSource` and any comparison of a confidence with a number. Confirm the test passes on the files of 1.1.
    - _Requirements: 1.1, 1.2, 1.4, 1.8_
  - **Gate:** `constants.test.ts` and `boundaries.test.ts` pass; `typecheck` passes.

- [x] 2. Silhouettes
  - [x] 2.1 Write `tests/ghosts/helpers/raster.ts` and its own tests (`tests/ghosts/raster.test.ts`): tokenise `M L H V C Q Z` (throw on any other command), flatten curves at 16 steps, fill with the even-odd rule at 48 x 48 pixel centres, return a `Uint8Array(2304)` and `differenceRatio(a, b)`. Test it on a square of known area, a square with a square hole, a circle made of `C` curves (area within 1% of pi r^2) and a path with a forbidden command.
    - _Requirements: 2.2, 2.6, 14.2_
  - [x] 2.2 Write `tests/ghosts/shapes.test.ts` against a stub `SHAPES` that is empty, and confirm the failures. Cases: seven classes exist; the strings are pairwise different; only allowed commands; every point in [2, 22]; filled area between 10% and 80% of the box; all 21 pairs differ in at least 8% of 2304 pixels (print the lowest pair ratio in the failure message).
    - _Requirements: 2.1, 2.2, 2.5, 2.6, 14.2_
  - [x] 2.3 Implement `src/ghosts/shapes.ts` (`SHAPE_BOX`, `SHAPES`, data only, doc comments). Draw the seven silhouettes by the table of the design: Knock, Alarm, Voice, Vehicle and Baby by the DESIGN.md Ghosts table, Doorbell with the chime knob, Other plain with a wavy hem. Keep the rules of the design (no eyes, outline readable without colour, holes only as extra detail). If a pair is under 8%, change the proportions and not the test.
    - _Requirements: 2.1-2.8_
  - [x] 2.4 Look at the seven shapes once before moving on: render them with a throwaway Playwright script or a temporary page at 24, 32, 40 and 48 px in outline and fill, check that each is recognisable without colour and does not look like clip art, and fix the paths. Delete the throwaway file. (The final visual check is task 9.)
    - _Requirements: 2.3, 2.4, 2.5, 13.2_
  - **Gate:** `shapes.test.ts` and `raster.test.ts` pass; `typecheck` and `test` pass.

- [x] 3. Input and layout
  - [x] 3.1 Write `tests/ghosts/helpers/inputs.ts` (valid `SoundEvent` builder with overrides, reusing `tests/haptics/helpers/events.ts` where it fits) and `tests/ghosts/input.test.ts` with a stub `acceptInput` that throws, and confirm the failures. Cases: a valid input is accepted and returns a new object; `null`, `undefined`, a number, a string, an array, `{}` and `{ bearingConfidence: 1 }` return `null`; an event with a bad class, an empty label, a bearing of 200, a bearing source `none` with a bearing, a negative `t` returns `null`; a missing or non-numeric `bearingConfidence` is accepted (the ghost is uncertain); a getter that throws returns `null`; the input is not modified.
    - _Requirements: 1.5, 1.6, 14.9_
  - [x] 3.2 Implement `src/ghosts/input.ts`.
    - _Requirements: 1.5, 1.6_
  - [x] 3.3 Write `tests/ghosts/layout.test.ts` with a stub `layoutGhost` that throws, and confirm the failures. Cases, with a field of 600 x 400 unless stated: bearing -90, -45, 0, 45, 90 give `x` 72, 186, 300, 414, 528; bearings 91, 180, -91, -180 clamp to 528, 528, 72, 72; a width of 200 gives `x` 72 at -90 and 128 at +90; an uncertain ghost is at `x` 300 for source `loudness` with a bearing of -60, for source `none` with a null bearing, and for source `gcc-phat` with confidence 0, 0.5 and 0.79 and a bearing of -60; confidence 0.8 is certain; confidence `NaN`, -0.1 and 1.1 are uncertain; `sideText` "Left", "Centre", "Right" for -60, 0 and 60 and "Side unknown" for an uncertain ghost; a ghost at -10 degrees is "Centre" with `x` below 300; the urgency table for low, medium and high; `labelText` "Knock · Left · Urgent" and "Baby crying · Side unknown · Urgent"; `shape` equals `SHAPES[class]` for all seven classes; the same input twice gives equal results; the input is not modified; the layout does not change when `confidence`, `loudnessDb`, `id` and `t` change.
    - _Requirements: 3.1-3.8, 4.1-4.5, 14.3_
  - [x] 3.4 Implement `src/ghosts/layout.ts` (`layoutGhost`, `ghostBasePx`, with a `labelTop` helper; `boxPx` comes from the layout) using `sideOf` from `src/haptics` and the constants. Export from `index.ts`.
    - _Requirements: 3.1-3.8, 4.1-4.5_
  - [x] 3.5 Write `tests/ghosts/properties.test.ts` (fixed seed, at least 100 runs each) for the layout part of Requirement 14.5: `x` in [72, width - 72] for any finite bearing in [-180, 180] (and also for finite bearings outside that range, through a hand-built input) and any width from 200; for a certain ghost with a bearing whose absolute value is above 15, the sign of `x - width / 2` equals the sign of the bearing; the same input gives the same layout; `scale`, `outlineWidth` and `glowBlur` strictly increase from low to medium to high, and `boxPx` equals `ghostBasePx(height, 1) * scale`; an uncertain ghost always has `x = width / 2`, `side = 'unknown'` and `sideText = "Side unknown"`, for any bearing source, bearing and a confidence below 0.8 or invalid.
    - _Requirements: 3.3-3.6, 4.2, 14.5_
  - **Gate:** `input.test.ts`, `layout.test.ts` and `properties.test.ts` pass; `typecheck`, `test` and `boundaries.test.ts` pass.

- [x] 4. Rows, life and text
  - [x] 4.1 Add to `tests/ghosts/layout.test.ts` the row cases with a stub `layoutGhosts` and `ghostBlock` that throw, and confirm the failures: one to four inputs get rows 0 to n-1 from the top, newest first; five and six inputs return four layouts and drop the last (oldest); for rows 1 to 4 and a height of 360, and again at 480 and 720, every combination of urgencies fits its slot: blocks do not overlap and lie between 8 px and `height - 40` px; the slot arithmetic with literals (one low ghost at height 360: `basePx` 72, block 72 + 4 + 2 + 16 = 94, `y` is 8 + (312 - 94) / 2 + 72 / 2 = 153; four low ghosts at height 360: `basePx` 32, block 32 + 4 + 2 + 16 = 54 in a slot of 78, row 0 `y` is 8 + (78 - 54) / 2 + 16 = 36; four urgent ghosts at height 360: block 48 + 12 + 2 + 16 = 78 fills the slot, row 0 `y` is 8 + 24 = 32 and row 3 block bottom is 320); one urgent ghost at height 480: `boxPx` 108; the input array is not modified; `x` does not depend on the row.
    - _Requirements: 5.1-5.6, 14.4_
  - [x] 4.1a Add to `tests/ghosts/layout.test.ts` the `ghostBasePx` cases with a stub that throws, and confirm the failures. Literals: (360, 4) gives 32; (360, 3) gives 49; (360, 1) gives 72; (480, 1) gives 72; (480, 2) gives 72; (200, 4) gives 32 (clamped at the minimum); a height that gives the formula value 40 gives 40 (for example (408, 4): slot 90, floor(60 / 1.5) = 40).
    - _Requirements: 5.2, 14.4_
  - [x] 4.2 Implement `layoutGhosts`, `ghostBasePx` and `ghostBlock` in `src/ghosts/layout.ts`. Add to `properties.test.ts`: for any list of up to 6 inputs and any field from 200 x 360, `layoutGhosts` returns `min(n, 4)` layouts whose blocks do not overlap and lie inside the margins; for any `rows` from 1 to 4, any height of 360 or more and any urgency, the block fits its slot (`1.5 * basePx + 30 <= slotH` whenever the formula is not clamped at the minimum, and the constants inequality covers the minimum); `ghostBasePx` is always in [32, 72], monotonic non-increasing in `rows` for a fixed height and non-decreasing in `height` for fixed `rows`, and both clamp ends are reached (some input gives 32, some gives 72).
    - _Requirements: 5.1-5.6, 14.5_
  - [x] 4.3 Write `tests/ghosts/life.test.ts` with a stub `createGhostSet` that throws, and confirm the failures. Cases (literal times): add puts the newest first; the fifth add drops the oldest; a ghost added at 1000 with ttl 8000 is there at 8999 and removed at 9000 (`prune` returns true); `nextExpiry` is the smallest `expiresAt` and `null` when empty or when every ttl is `Infinity`; `Infinity` never prunes; `0`, `-5` and `NaN` ttl give 8000; `clear` empties; `seq` grows; `prune` of nothing returns false.
    - _Requirements: 7.2-7.7, 14.6_
  - [x] 4.4 Implement `src/ghosts/life.ts`.
    - _Requirements: 7.2-7.7_
  - [x] 4.5 Write `tests/ghosts/text.test.ts` with stubs that throw, and confirm the failures. Cases with literal strings: `listItemText` "Knock, left, urgent", "Voice, centre, low", "Baby, side unknown, urgent", "Doorbell, right, medium", "Other, centre, low"; `canvasSummary` for two ghosts "Sound field. Now: Alarm, right, urgent; Knock, left, medium" and for none "No sounds yet"; `dataX` for x 132 of width 600 gives "0.22", for x 300 of 600 "0.5", for x 48 of 200 "0.24", and never more than four decimals; `CLASS_NAMES` has the seven names.
    - _Requirements: 8.1-8.3, 14.7_
  - [x] 4.6 Implement `src/ghosts/text.ts`.
    - _Requirements: 8.1-8.3_
  - **Gate:** `layout.test.ts`, `life.test.ts`, `text.test.ts` and `properties.test.ts` pass; `typecheck` and `test` pass.

- [x] 5. Glyph
  - [x] 5.1 Write `tests/ghosts/glyph.test.ts` with a stub `glyphSpec` that throws, and confirm the failures: for low, medium and high the sizes are 24, 32 and 40 and the stroke widths 1.5, 2.5 and 3.5; the path equals `SHAPES[class]` for all seven classes; the view box is `0 0 24 24`.
    - _Requirements: 12.4, 14.8_
  - [x] 5.2 Implement `src/ghosts/glyph.ts` (`GLYPH_SIZE_PX`, `glyphSpec`, `createGlyph`) and the glyph class in `src/ghosts/field.css` (colours from `--bb-ghost-fill` and `--bb-ghost-outline`, `stroke-linejoin: round`). `createGlyph` has `aria-hidden="true"`, `focusable="false"`, `fill-rule="evenodd"`. Export from `index.ts`. The DOM function is covered in the e2e tests of task 8.
    - _Requirements: 2.7, 12.3, 12.4_
  - **Gate:** `glyph.test.ts` passes; `typecheck` and `test` pass.

- [x] 6. End-to-end tests first
  - [x] 6.1 Write `e2e/ghosts.spec.ts` against the styleguide as it is now (no Ghosts section, no field) and confirm the failures. Reuse the `watch` helper style of `e2e/styleguide.spec.ts` (console errors and warnings, page errors, failed requests, off-origin requests). Build a helper that mounts a fresh test field through `page.evaluate(() => import('/src/ghosts/index.ts'))` (design, Testing strategy) and a helper that counts accent pixels in a third of the canvas. Cases:
    - knock at -60 degrees, confidence 0.95, `gcc-phat`: one list item with `data-class="knock"`, `data-side="left"`, `data-x` below 0.5; accent pixels in the left third of the canvas and none in the right third;
    - an uncertain ghost (confidence 0.5): `data-side="unknown"`, the item text contains "side unknown", the canvas `aria-label` contains "side unknown", `ghosts()[0].sideText` is "Side unknown" and `x` is half the canvas width;
    - invalid inputs (`null`, `{}`, an event with a bad class) return `false` and leave the list and the label unchanged; `show` after `destroy` returns `false`;
    - five `show` calls leave four items and drop the oldest; the newest is the first item;
    - an event label of 80 characters is drawn (no throw) and the canvas label summary still lists the class;
    - reduced motion: `emulateMedia({ reducedMotion: 'reduce' })`, a counted `requestAnimationFrame` (init script), `show` of two ghosts, 500 ms real wait, two `toDataURL()` snapshots equal and the counter 0; with motion allowed the counter rises and a ghost's `ghosts()` position does not change;
    - the live preference switch: with a ghost live and motion allowed, `emulateMedia` to reduce stops the counter from rising;
    - `page.clock`: a ghost is in the list at 7999 ms, gone at 8000 ms, the canvas label reads "No sounds yet"; with `ttlMs: 1000` it leaves at 1000 ms; a second ghost shown at 3000 ms stays until 11000 ms;
    - keyboard and structure: the field has no focusable element and no `aria-live`, the canvas has `role="img"`, the list is not focusable;
    - theme: click Night, the canvas pixels of a ghost change to the Night fill colour (read from the computed token);
    - device scale factor 2: `canvas.width` equals `round(canvas.clientWidth * 2)`;
    - `destroy` removes the field elements, `clear` empties the list, and no frame runs after `destroy`;
    - the showcase: four demo ghosts with the expected `data-class`, `data-side` and `data-urgency` (baby unknown high, voice centre low, knock left medium, alarm right high), the first list item is the alarm, and 21 glyphs with class names and three row labels (Low, Medium, Urgent);
    - no console errors, no page errors, no request to another origin.
    - _Requirements: 1.5, 6.3, 7.3-7.8, 8.1-8.4, 9.1, 9.7, 10.3-10.5, 10.7, 11.2, 11.3, 12.2, 12.3, 14.11, 14.12_
  - **Gate:** the new e2e cases fail for the right reason (missing module, missing section), and the existing e2e specs still pass.

- [x] 7. Canvas field
  - [x] 7.1 Create `src/ghosts/draw.ts` (`drawField`, label shortening, the arc, furniture, path cache) and `src/ghosts/field.ts` (`mountGhostField`: DOM, observers, expiry timer, motion switch, redraw rules, `destroy`) and the field styles in `src/ghosts/field.css` (tokens only, no `@keyframes`). Follow the flow and the drawing order of the design. Export from `index.ts`. Keep `draw.ts` free of state and of DOM access other than the context.
    - _Requirements: 1.5-1.7, 3.1, 5.2, 6.1-6.5, 7.1-7.10, 8.1-8.6, 9.1-9.10, 10.1-10.7, 11.2, 11.5, 11.6_
  - [x] 7.2 Run the e2e cases of task 6 that do not need the showcase and fix the product code until they pass. Do not change a test to fit the code unless the test is wrong; if a requirement is wrong, change the requirement in this spec in the same change and say so in the commit.
    - _Requirements: 14.11_
  - [x] 7.3 Check by hand, with `bun run dev` and a temporary mount or the test helper, the cases the tests cannot judge: the fade, the drift (4 px, slow), a label near each edge, the dashed outline at every urgency, the arc and its arrowheads, a long label, four ghosts at 360 px high.
    - _Requirements: 6.1, 6.2, 9.4, 10.1, 10.2_
  - **Gate:** the non-showcase e2e cases pass; `typecheck`, `test` and `boundaries.test.ts` pass.

- [x] 8. Contrast
  - [x] 8.1 Read `tests/ui/contrast.ts`, `tests/ui/tokens.test.ts` and `tests/ui/design-parse.ts`, then write `tests/ghosts/contrast.test.ts`: from `src/ui/tokens.css`, for Day and Night, `--bb-color-text` and `--bb-color-text-muted` on `--bb-color-surface` at 4.5; `--bb-ghost-fill`, `--bb-ghost-outline`, `--bb-ghost-glow-1`, `-2`, `-3` and `--bb-color-border` on `--bb-color-surface` at 3; and `--bb-ghost-fill` on `--bb-color-surface-raised` at 3 (the glyph tile). Compare with the values of the contrast table in `design/DESIGN.md` within 0.1. If a pair is missing from the table, add the row and update the table test in the same change.
    - _Requirements: 11.4, 13.5, 14.10_
  - **Gate:** `contrast.test.ts` passes; `tests/ui` passes; `typecheck` and `test` pass.

- [x] 9. Showcase and design gate
  - [x] 9.1 Add the Ghosts section to `styleguide.html`, `src/ui/styleguide.ts` and `src/ui/styleguide.css`: the heading and the plain-words text, the ghost field card (mounted with `ttlMs: Infinity` and the four demo events of the design, shown in that order), the glyph grid (7 columns by 3 rows, 48 px `surface-raised` circles, class names and row labels). Read the existing section markup first and reuse its classes. No token is added.
    - _Requirements: 12.1-12.6, 13.1_
  - [x] 9.2 Run `bun run e2e`. The showcase cases of task 6 pass, and so do the existing styleguide cases.
    - _Requirements: 12.6, 14.11_
  - [x] 9.3 Add the four screenshots to `e2e/ghosts.spec.ts`: the Ghosts section at 1440 px and 390 px, Day and Night (through the page's theme control), `reducedMotion: 'reduce'`, saved as `e2e/screenshots/ghosts-1440-day.png`, `ghosts-1440-night.png`, `ghosts-390-day.png` and `ghosts-390-night.png`. Look at each one against `design/DESIGN.md` (soft canvas, floating white surface, 20 px radius, one accent, Night through tokens). Judge the ghosts as an illustration: clean curves, consistent proportions, an outline that grows with urgency without clogging the shape, a soft glow that does not hide the outline, a label that does not touch a ghost. Fix every mismatch: redraw a path that looks like clip art, a ghost or glow that clips at an edge, a label overlap, overflow at 390 px, a glyph that is unreadable at 24 px.
    - _Requirements: 13.1-13.3_
  - [x] 9.4 Update the Ghosts section of `design/DESIGN.md` as Requirement 13.4 says. Run `tests/ui` and fix what the new text breaks in the same change.
    - _Requirements: 13.4_
  - **Gate:** the four screenshots exist and were looked at; `tests/ui` passes; `bun run e2e`, `typecheck` and `test` pass.

- [x] 10. Review
  - [x] 10.1 Check the doc comment of every export of `src/ghosts/` and the module comment of `index.ts` (Requirement 1.7). Check that no copy says the field keeps the user safe, replaces a smoke alarm, or that a sound was heard by a microphone (Requirements 12.5, 15.2), and that the aid sentence, where used, is verbatim.
    - _Requirements: 1.7, 12.5, 15.2, 15.4_
  - [x] 10.2 Check with `git diff --stat` that `src/events/` and `src/haptics/` are unchanged, and that the only changes outside `src/ghosts/`, `tests/ghosts/`, `e2e/`, `.kiro/specs/ghost-renderer/` are `styleguide.html`, `src/ui/styleguide.ts`, `src/ui/styleguide.css`, `design/DESIGN.md`, `.kiro/steering/structure.md` (and `tests/ui/` or `src/ui/tokens.css` only if a contrast row was needed).
    - _Requirements: 13.5, 16.3, 16.4_
  - [x] 10.3 Check privacy and motion: no `fetch`, `console`, storage or network in `src/ghosts/`; the event `id`, `t`, `confidence` and `loudnessDb` appear nowhere in the DOM; no `@keyframes` in `field.css`; no `requestAnimationFrame` reference outside the motion branch of `field.ts`.
    - _Requirements: 8.6, 10.3, 15.1, 15.3_
  - [x] 10.4 Update `.kiro/steering/structure.md`: replace the `src/ghosts/` line with the module and its files (`constants.ts`, `types.ts`, `shapes.ts`, `input.ts`, `layout.ts`, `life.ts`, `text.ts`, `glyph.ts`, `draw.ts`, `field.ts`, `field.css`, `index.ts`) in the same style as the `src/band` block, and mention that the styleguide shows the Ghosts section. Keep the Rules section unchanged.
    - _Requirements: 16.5_

- [x] 11. Gate (last)
  - [x] 11.1 Run `bun run typecheck`, `bun run test`, `bun run e2e` and `bun run build`. All four must be green.
    - _Requirements: 16.1, 16.2, 16.3, 16.4_
  - **Gate:** `typecheck`, `test`, `e2e` and `build` exit 0, and `.gitkeep` is gone from `src/ghosts/`.
