# Design: Listening station (round 1)

Requirement numbers refer to `requirements.md`.

## Overview

One click on a sound chip drives the real modules in order. Nothing is faked except the input: the clip is mono, so the stereo pair is built from it (Requirement 7), and the side is a choice of the user.

```
chip click (clip id, chosen side)
   |
   |  [model loaded on first click: createClassifier()]        station.ts
   v
runSound(deps, clipId, side)                                    runner.ts   no DOM, clock and I/O injected
   1 waveform  loadClip -> decodePcm16kWav -> waveformPeaks     wav.ts, waveform.ts
   2 label     createFramer -> classify each frame -> summariseClassifications   summary.ts
   3 bearing   buildStereo -> toStereoFrames -> createBearingWindow().result()   stereo.ts, src/bearing
   4 pattern   loudestRmsDb -> processEvent -> engine.decide     pipeline.ts, src/haptics
   5 band      outputs.play(command)                            src/band
   v
RunResult (plain data: peaks, summary, bearing, event, bearingConfidence, decision, times)
   |
   v  station.ts applies it to the DOM
ghostField.show({ event, bearingConfidence })     src/ghosts
event list row + Latest alert text                list.ts, format.ts
pipeline view (five stages, five times)           pipeline-view.ts
```

`src/station` is at the level of `src/ui` in the dependency chain (`audio -> classify and bearing -> haptics -> band and ghosts -> ui`). Only `src/main.ts` imports it.

## Files

```
index.html                  station page shell (edit)
src/main.ts                 mounts the station (edit: drops the unused capture export)
src/audio/index.ts          + loadManifest, fetchClip, createFramer re-exports (edit)
src/station/
  constants.ts       PEAK_BUCKETS 64, MAX_ROWS 10, STAGES, WINDOW constants reused from src/audio
  types.ts           TrySide, StageName, StageTimes, RunResult, RunFailure, RunnerDeps
  wav.ts             decodePcm16kWav                       pure
  stereo.ts          SIDE_DELAY_SAMPLES, DITHER_AMPLITUDE, buildStereo, toStereoFrames   pure
  summary.ts         summariseClassifications, rmsDb, loudestRmsDb                       pure
  waveform.ts        waveformPeaks                         pure
  format.ts          formatMs, formatClock, alertText, sideWord, dropText, failureText   pure (Date for the clock only)
  pipeline.ts        URGENCY_BY_CLASS, buildEvent, processEvent                          pure, engine injected
  runner.ts          runSound                              no DOM, deps injected
  status.ts          mountStatusPill(container, vibrates)  DOM
  try-sound.ts       mountTrySound: chips, side control, busy and message region          DOM
  list.ts            mountEventList: Latest alert block and Recent sounds list            DOM
  pipeline-view.ts   mountPipelineView: five stages, waveform SVG, bearing dial SVG       DOM
  station.ts         mountStation(root): composition, model loading, run wiring           DOM
  station.css        layout and component styles, design tokens only
  index.ts           public exports and the module comment
src/ghosts/outline.ts  shapeParts, pathLength, dashFor (new, pure)
src/ghosts/{shapes,constants,draw,glyph}.ts  eyes and dashes (edit)
design/DESIGN.md       Ghosts and Listening station sections (edit)
.kiro/steering/structure.md  (edit)
.kiro/specs/ghost-renderer/  stale "no eyes", "no feature", DASH_UNITS lines (edit)
tests/station/
  boundaries.test.ts  constants.test.ts  wav.test.ts  stereo.test.ts  summary.test.ts
  waveform.test.ts  format.test.ts  pipeline.test.ts  pipeline.property.test.ts
  runner.test.ts  clips.test.ts  helpers/wav.ts  helpers/clock.ts
tests/ghosts/outline.test.ts  eyes.test.ts  (new); constants.test.ts  glyph.test.ts  (edit)
e2e/station.spec.ts
e2e/screenshots/station-1440-day.png  station-390-night.png
```

`vite.config.ts` needs no change (`index.html` is already an input). `src/classify` is imported statically for `createClassifier`; its TF.js import is dynamic, so the page loads without the model.

## Types

```ts
export type TrySide = 'left' | 'centre' | 'right';
export type StageName = 'waveform' | 'label' | 'bearing' | 'pattern' | 'band';
export type StageTimes = Record<StageName, number>;           // ms, each finite and >= 0

export interface RunnerDeps {
  loadClip(id: string): Promise<ArrayBuffer>;                 // station: fetchClip from src/audio
  classifier: Pick<Classifier, 'classify'>;                   // already loaded
  engine: HapticEngine;                                       // createHapticEngine({ rateLimitMs: 0 })
  outputs: readonly HapticOutput[];                           // simulator, plus phone when available()
  now(): number;                                              // station: performance.now()
  epoch(): number;                                            // station: Date.now()
}

export type RunFailure = 'clip-load-failed' | 'clip-unreadable' | 'classify-failed' | 'event-invalid';

export type RunResult =
  | { ok: false; code: RunFailure }
  | {
      ok: true;
      clipId: string; chosen: TrySide;
      peaks: number[]; seconds: number;                       // waveform stage
      classification: Classification; frames: number;         // label stage
      bearing: BearingResult;                                 // bearing stage
      event: SoundEvent; bearingConfidence: number;           // pattern stage
      decision: Decision;
      played: HapticOutput['kind'][];                         // band stage: kinds that were called
      times: StageTimes; at: number;                          // epoch ms of the run, for the list time
    };
```

An `event-invalid` run has no `RunResult` fields beyond the code; the station shows the message and changes nothing else. The pipeline view keeps the previous result in that case.

## Stage timing (R10.2, R13)

Each stage is written as `const t0 = now(); ...work...; times[stage] = now() - t0;`. A test supplies a scripted clock `[0, 1.5, 10, 14, 20, 20.25, 30, 33, 40, 40.5]` and expects `{ waveform: 1.5, label: 4, bearing: 0.25, pattern: 3, band: 0.5 }`, and `event.t === 30`. The ghost, the row and the DOM updates are outside the five stages. Model loading is also outside: the station awaits the classifier before calling `runSound`, so the `label` time is analysis only, never a 14 MB download.

## Stereo build (R7)

```ts
export const SIDE_DELAY_SAMPLES = 3;      // max lag at 16 kHz with 8 cm spacing: floor(0.08 / 343 * 16000) = 3
export const DITHER_AMPLITUDE = 1e-4;     // -80 dBFS peak, see below
```

- `left`: `L = [mono, 0, 0, 0]`, `R = [0, 0, 0, mono]`. Sound reaches L first, R lags, so the lag of L relative to R is negative and the estimator's bearing is negative (left). Check the sign in the test against the real estimator on a seeded white-noise signal, not only on array contents.
- `right`: swapped.
- `centre`: `L = mono + ditherL`, `R = mono + ditherR`. Dither: `s = (Math.imul(s, 1664525) + 1013904223) >>> 0` per sample, value `(s / 4294967296 * 2 - 1) * DITHER_AMPLITUDE`, seeds `0x9e3779b9` (left) and `0x85ebca6b` (right). It exists only because `src/bearing/estimate.ts` returns source `'loudness'`, confidence 0 when `maxDiff <= 1e-6 * min(rms)` (identical channels), and then `sideOf` says `'unknown'`. A centre sound with a tiny independent noise per microphone is also what two real microphones give.
- Test values: `buildStereo([1, 2, 3, 4], 'left')` gives `left [1, 2, 3, 4, 0, 0, 0]`, `right [0, 0, 0, 1, 2, 3, 4]`; `'right'` the reverse; `'centre'` gives length 4 with `|left[i] - mono[i]| <= 1e-4`, the arrays not equal, and the same output on a second call.
- Seeded white noise test (1 s, 16 kHz): left gives bearing between -60 and -47 with source `gcc-phat` and confidence at least 0.8; right between 47 and 60; centre between -15 and 15.

`toStereoFrames` uses `STEREO_BLOCK` from `src/audio`; frames get `sampleRate: 16000`, `startSample`, `startSec`. The bearing window gets the whole clip, so the estimate uses every chunk, not only the loud part. A clip with long silence (the knock clip is 6.28 s) is handled by the estimator, which skips silent chunks.

## Pipeline module (R9)

```ts
export const URGENCY_BY_CLASS: Readonly<Record<SoundClass, Urgency>> = Object.freeze({
  alarm: 'high', baby: 'high', doorbell: 'medium', knock: 'medium', vehicle: 'medium', voice: 'low', other: 'low',
});

export interface EventInput { classification: Classification; bearing: BearingResult; loudnessDb: number; nowMs: number; id: string }
export type BuiltEvent = { ok: true; event: SoundEvent; bearingConfidence: number } | { ok: false; errors: string[] };
export type Processed = (BuiltEvent & { ok: true; decision: Decision }) | { ok: false; errors: string[] };

export function buildEvent(input: EventInput): BuiltEvent
export function processEvent(input: EventInput, engine: Pick<HapticEngine, 'decide'>): Processed
```

`buildEvent` reads each field once inside one `try/catch` (a getter may throw), builds the plain object and returns `validateSoundEvent`'s event or errors. It never repairs a value. `processEvent` calls `decide({ event, bearingConfidence }, nowMs)` only on `ok: true`. `decide` throws a `RangeError` for a non-finite `nowMs`; `buildEvent` rejects that case first because `t` must be finite and at least 0, so `decide` is never reached with it.

Implementation choices (task 1):

- `processEvent` passes `event.t` as `nowMs` to `decide`.
- `buildEvent` returns the error "input could not be read" for undefined input or a throwing getter.
- The run id counter is per deps object and counts every `runSound` call, failed ones included.
- The runner calls `play` only on outputs whose `available()` is true.
- `decodePcm16kWav` returns null when the data chunk comes before fmt.
- `constants.ts` also exports `STAGES`.

Literal example for the unit test: `classification { class: 'knock', label: 'Knock', confidence: 0.67 }`, `bearing { bearingDeg: -53.5, source: 'gcc-phat', confidence: 0.93, lagSec: -0.0001875, ildDb: 0, usedFrames: 7, skippedFrames: 0 }`, `loudnessDb: -20`, `nowMs: 1234.5`, `id: 'station-1'` gives `event { id: 'station-1', t: 1234.5, class: 'knock', label: 'Knock', confidence: 0.67, bearingDeg: -53.5, bearingSource: 'gcc-phat', loudnessDb: -20, urgency: 'medium' }` and `bearingConfidence: 0.93`.

Property arbitraries: class from `SOUND_CLASSES`; label `fc.string({ minLength: 1 })` with a non-blank filter; confidence `fc.double({ min: 0, max: 1, noNaN: true })`; bearing as a pair that is consistent (`gcc-phat` or `loudness` with a degree in [-90, 90], or `none` with null); loudness in [-120, 0]; plus a junk arbitrary (`fc.anything()` per field, `NaN`, `Infinity`, `undefined`) for the "never throws, `ok` equals the validator" property.

## Summary and loudness (R6)

```ts
summariseClassifications(results): Classification | null   // mode of class, tie -> 'other'; label = mode of winner labels; confidence = mean of winners
rmsDb(samples): number                                     // 20 log10(rms), floor -120, cap 0, NaN stays NaN
loudestRmsDb(samples): number                              // windows 15600, step 7800, ends inside the clip; shorter clip: one window
```

Literals: frames `[{ knock, 'Knock', 0.5 }, { knock, 'Knock', 0.7 }, { other, 'Silence', 0.9 }]` give `{ class: 'knock', label: 'Knock', confidence: 0.6 }`; `[knock, other]` (one each) gives `other`; `[alarm x5, voice x4, other x2]` gives `alarm`. `rmsDb` of 15600 zeros is -120, of a constant 0.1 is -20 (4 digits), of a constant 2 is 0. For 31200 samples that are 0 up to index 15600 and 0.1 after, the windows start at 0, 7800 and 15600 and `loudestRmsDb` is -20 (the middle window is about -23.01).

This is the rule of `tests/classify/clip-run.ts` and the committed `tests/classify/clip-results.json` is the node CPU reference: doorbell 6 of 6, knock 6 of 11 (5 other), alarm 5 of 11 (4 voice, 2 other), baby 18 of 18, vehicle 4 of 6, voice 18 of 18. The alarm clip wins by one frame, so a different TF.js backend in the browser could change it. See Risks.

## Format helpers (R10.5, R11.7, R13.7)

| Function | Literal cases |
|---|---|
| `formatMs` | 0.04 "0.0 ms", 3.456 "3.5 ms", 9.96 "10 ms" (rounds to 10.0, so whole), 12.5 "13 ms", 124.4 "124 ms", 1234.5 "1235 ms", NaN "—", -1 "—", Infinity "—" |
| `formatClock` | local 09:05 "09:05", 13:36 "13:36", 00:00 "00:00" (the test builds the date with `new Date(2026, 10, 17, h, m)` so the time zone does not matter) |
| `alertText` | ('knock','left','high') "Knock, left side, urgent"; ('voice','centre','low') "Voice, centre, low"; ('baby','unknown','high') "Baby, side unknown, urgent"; ('doorbell','right','medium') "Doorbell, right side, medium" |
| `sideWord` | left "Left side", right "Right side", centre "Centre", unknown "Side unknown" |
| `dropText` | the five reasons of Requirement 10.5 |
| `failureText` | the four messages of Requirement 4.7 |

`formatMs(9.96)`: round to one decimal gives 10.0, and a value of 10 or more is shown whole, so "10 ms". Write the function as: if not finite or negative, "—"; `r = Math.round(ms * 10) / 10`; if `r >= 10`, `${Math.round(r)} ms`, else `${r.toFixed(1)} ms`.

## Page and layout (R2)

Markup in `index.html` is a shell (header, `<main id="station">`, footer) in the style of `band.html`: the same header with the brand mark (which already has two eyes), theme control, `styleguide.css`, `tokens.css`, plus `station.css`. `mountStation` builds the cards inside `<main>`. It reuses the band page's chip and side-control look through its own `bb-station-*` classes in `station.css` (tokens only); the band page's CSS is not touched.

Desktop grid (`@media (min-width: 720px)`, written as `min-width: 720px` literal):

```
header   brand ............ [Band simulator] [status pill] [Day | Night]
title    Listening station / lede (sample clips, no microphone, band shown on screen)
+--------------------------------------------------------------------------+
| Try a sound   [g Knock] [g Doorbell] [g Alarm] [g Baby] [g Vehicle] [g Voice]   Side ( Left | Centre | Right ) |
+--------------------------------------------------------------------------+
+--------------------------------------+  +--------------------------------+
| Ghost field (canvas, "Recent:" list)  |  | Latest alert  (aria-live)      |
| 7 of 12 columns, min height 480      |  |   Knock                        |
|                                      |  |   Left side · Urgent           |
|                                      |  | Recent sounds  [g] Knock Urgent 13:36 |
|                                      |  +--------------------------------+
|                                      |  | Left motor | Right motor        |
|                                      |  | Pattern timeline                |
+--------------------------------------+  +--------------------------------+
+--------------------------------------------------------------------------+
| Pipeline  [1 Waveform] [2 Label] [3 Bearing] [4 Pattern] [5 Band]  (each with ms) |
+--------------------------------------------------------------------------+
footer: aid sentence, styleguide link
```

- The grid is `repeat(12, minmax(0, 1fr))` with `--bb-space-5` (24 px) gaps. Try card `grid-column: 1 / -1`; ghost card `span 7`; side column `span 5` (a flex column with `--bb-space-5` gap); pipeline `1 / -1`. `align-items: stretch` makes the ghost card as tall as the side column (the side column is the taller one, so the canvas grows with `flex: 1 1 auto` as `field.css` already allows; its minimum is 360 px).
- Phone: `grid-template-columns: 1fr`. The title block is visually hidden below 720 px (the usual clip rule: `position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap`), so it stays in the DOM and the accessibility tree and takes no space; the brand in the header names the app. With it gone, the whole ghost field canvas sits above the fixed bar at 390 x 844 at scroll 0 (an e2e check compares the canvas bottom with the bar top). DOM order has the Try card second, so on the phone the Try card is moved out of the flow: `position: fixed; inset-inline: 0; bottom: 0`, `surface` fill, `--bb-shadow-soft`, `padding: var(--bb-space-4)`, `z-index` above the content, and `<main>` gets `padding-bottom` equal to the bar height (set from the bar's measured height by one `ResizeObserver` in `station.ts`, as a CSS custom property `--bb-station-bar`). Chips wrap three per row; the side control is a full-width three-option control above them. The bar height is about 190 px, so the chips lie below 844 - 190 = 654 px, inside the lower 45% (from 464 px).
- The Try card keeps its place in the DOM near the top for keyboard users (the control comes before its result, as on the band page). `design/DESIGN.md` says the phone bar comes last in the DOM; the station departs from that on purpose and the DESIGN.md update says so.
- Theme: `index.html` ships `<html data-theme="night">`, so the station opens in Night (also without JavaScript, whatever the OS setting). `initThemeControl` applies a theme saved under `banshee-band.theme.v1` on load and saves each press (`design-system` Requirements 5.7a and 5.7b).
- Ghost field: `mountStation` calls `mountGhostField(container, { ttlMs: 30000, trail: true })`. The list heading reads "Recent:".
- Side-unknown caption: one muted `caption` paragraph under the urgency key, with the text of Requirement 12.5, in `station.css` tokens only.
- Header on phone: the brand on the first row, then the "Band simulator" link, the status pill and the theme control wrap onto a second row. There is one "Band simulator" link in the DOM, in the header, at every width.

## Status pill (R3)

`mountStatusPill(container, vibrates)` creates the element used on the band page (`bb-status`, a 12 px glyph, `aria-hidden`) with `role="status"`. States and glyphs: `fallback` triangle neutral "Phone vibration fallback", `band-off` open circle neutral "Band not connected", `problem` cross strong "Problem". The cross glyph is a new inline SVG path (two lines) in the same 12 px box. `setProblem()` swaps it once.

## Try a sound card (R4)

`mountTrySound(container, { clips, onPick })` builds the chip row (`<div role="group" aria-label="Sound">`) and the side `<fieldset>`; the chip click handler calls `onPick(clip, side)` and does nothing while `busy` is set. `setBusy(text | null)` sets `aria-disabled` on every chip and writes the live message. `setMessage(text)` writes error text. The live region is `aria-live="polite"` and is always in the DOM (empty when idle), like `.bb-feel__message` on the band page.

`mountStation` flow on a pick:

1. If a run is busy, return.
2. `setBusy('Loading the sound model')` if the classifier is not loaded, else `setBusy('Listening to the clip')`.
3. `classifier ??= await createClassifier()`. On a `ClassifyError`: status pill `problem`, the message of Requirement 3.4, `setBusy(null)`, stop. Chips stay usable; the next pick tries to load again, and a success sets the pill back and clears the message.
4. `setBusy('Listening to the clip')`; `runSound(deps, clip.id, side)`.
5. On `ok: false`: `setMessage(failureText(code))`, `setBusy(null)`, stop.
6. On `ok: true`: apply the result (ghost, list, latest alert, pipeline view), `setBusy(null)`.

A failing `fetchClip` throws a `CaptureFailure` (`clip-load-failed` or `clip-not-found`); `loadClip` in the runner catches any throw and maps it to `clip-load-failed`.

## Event list and latest alert (R11, R12)

`mountEventList(container)` returns `{ add(row), clear(), destroy() }`. A row is `{ cls, side, urgency, at }`. The DOM per row:

```html
<li class="bb-row" data-class="knock" data-side="left" data-urgency="high">
  <span class="bb-row__tile"><svg class="bb-ghost-glyph" aria-hidden="true">...</svg></span>
  <span class="bb-row__text"><span class="bb-row__name">Knock</span><span class="bb-row__side">Left side</span></span>
  <span class="bb-row__end"><span class="bb-status bb-status--strong">Urgent</span><time class="bb-row__time">13:36</time></span>
</li>
```

The tile is a 48 px `surface-raised` circle (the glyph is 24, 32 or 40 px and fits). The urgency pill maps low to `bb-status--neutral`, medium to `bb-status--accent`, high to `bb-status--strong`. The Latest alert block (`<div class="bb-alert" aria-live="polite" aria-atomic="true">`) is above the list in the same card, with the class name in `bb-display` size and the second line in `caption`. Its text is replaced once per run. The ghost field's "Recent:" list (headed "Now:" without trail mode) stays inside the ghost card as the canvas's text equivalent. The two lists differ in purpose: "Now:" shows live ghosts (at most 4, gone after 8 s), "Recent sounds" is the history (at most 10).

The simulator keeps its own polite live region ("Knock, left stronger"). A screen reader therefore hears two short announcements per run, one for the alert and one for the pattern. They say different things, so this is accepted for round 1 (see Risks).

## Pipeline view (R13)

`mountPipelineView(container)` returns `{ show(result), failed(), clear() }`. Five `<section data-stage>` tiles inside one card:

| Stage | Content | Visual (aria-hidden) |
|---|---|---|
| 1 Waveform | "3.5 s, 16 kHz" | SVG 64 bars, `viewBox="0 0 64 24"`, bar `i` at `x = i`, width 0.7, height `peak * 24` centred, fill `--bb-color-accent` on the tile |
| 2 Label | "Knock, 67%" and "Class: Knock" | none |
| 3 Bearing | "Left" or "Side unknown", "Confidence 93%" | SVG dial: half circle (stroke `--bb-color-border`), "L" and "R" end labels, needle from the centre to the arc at `angle = bearingDeg` (0 straight up, -90 left); when unknown, a dashed arc and no needle |
| 4 Pattern | "Knock, left stronger" and "2 pulses", or "No buzz: Too quiet to buzz" | none (the simulator draws the timeline) |
| 5 Band | "Band simulator" and "Phone vibration", or "No buzz" | none |

Each tile has `<h3>` "1 Waveform" etc. and `<p class="bb-stage__time" data-ms="1.5">1.5 ms</p>`. The needle uses the bearing only when `sideOf` gave a known side (then `bearingDeg` is not null); for `centre` it points up. At 720 px and wider the row is `grid-template-columns: repeat(5, minmax(0, 1fr))`; below it, one column. Contrast: tile `surface-raised`, text `text` and `text-muted` on tile, accent on tile (6.17 Day, 6.97 Night in the table); no new pair.

## Ghost polish (R14, R15)

### Eyes

`SHAPES[class]` keeps one string per class, now `M outer ... Z [M detail ... Z] M eyeL ... Z M eyeR ... Z`. Eyes are ovals built from four `C` curves (kappa 0.5523): about 2.2 wide and 3.0 high, centred in the head, about 3.4 units apart (centre to centre). Per-class placement, in the 24-unit box (builder fixes exact numbers by the clearance test):

| Class | Eye centres (x, y) | Note |
|---|---|---|
| knock | (9.6, 8.6), (14.4, 8.6) | head of the tall body |
| doorbell | (10.2, 12.4), (13.8, 12.4) | below the knob |
| alarm | (10.6, 9.6), (13.4, 9.6) | bell body is narrow near the top, so the eyes sit close |
| baby | (10.2, 14.6), (13.8, 14.6) | small head under the curl |
| vehicle | (13.2, 11.2), (17.6, 11.2) | head on the right, trailing hem on the left |
| voice | (9.4, 7.6), (14.6, 7.6) | above the mouth (mouth top is y 11.2), so eyes are about 2.6 high |
| other | (10.2, 9.0), (13.8, 9.0) | plain ghost |

These are starting points. The tests decide: each eye 12 to 48 raster pixels, 2 units clear of the outline and the mouth, 2.5 units apart, and the 8% pair rule. Adjust the numbers, not the tests. A tight head (Baby, Voice, Alarm) may need smaller eyes (still at least 12 pixels) or a smaller gap (still at least 2.5 units apart).

`outline.ts`:

```ts
export function shapeParts(path: string): { outer: string; details: string[]; eyes: string[] }
export function pathLength(path: string): number            // units; flatten curves in 16+ steps; closing segment included
export function dashFor(outlineWidth: number, lengthUnits: number): [number, number]
```

`shapeParts` splits on `/(?=M)/` after trimming. Three or more subpaths: `outer = parts[0]`, `eyes = last two`, `details = middle`. Fewer: `{ outer: path, details: [], eyes: [] }` (never throws).

`draw.ts` change in `ghost()`: `const parts = shapeParts(l.shape)`; cache three `Path2D`s per shape in the existing `paths` Map (keys `shape`, `shape|stroke`, `shape|outer`). Fill, clip and shading use the whole path (holes show the surface). The stroke uses `stroke` (outer + details). When uncertain: the faint solid trace strokes `stroke`; then `setLineDash(dashFor(l.outlineWidth, lengthOf(outer)))` and `stroke(outerPath)`; then `setLineDash([])` and, if there are details, `stroke(detailsPath)` solid. `lineCap` stays `butt`.

`glyph.ts`: `GlyphSpec` gains `strokePath: string`. `createGlyph` appends two `<path>`: the fill path (`fill-rule="evenodd"`, `stroke="none"`) and the stroke path (`fill="none"`, `stroke-width`). `field.css` rules for `.bb-ghost-glyph` set `fill` and `stroke` on the SVG today; change them to target `path[data-part="fill"]` and `path[data-part="stroke"]` so the fill path has no stroke and the stroke path has no fill. The existing glyph test (`path` equals `SHAPES[class]`) still holds.

### Dashes

Old: `DASH_UNITS = [3, 2]` with butt caps, gap 2 units against an outline of up to 3.5 units, which reads as stripes. New: the dash pattern is derived from the outline width and the outer length (Requirement 15.2). Lengths are cached per shape (a `Map` in `draw.ts` or a memo in `outline.ts`). Expected counts for a 70 unit outline: low 8 (period 8.75), medium 5 (14), urgent 3 (23.3), gap about 2 times the width in every case. Check by eye in task 4.

## Decisions and risks

1. **No near-black primary pill (R2.7).** The brief says "the one primary action". The Listen action is out of scope, and the chips fire on one click, so they are the action. `design/DESIGN.md` says a screen without a primary action does not use the near-black pill (the band page does the same). If you want a near-black pill now, the natural one is a "Play again" pill that repeats the last run; it is not in this spec.
2. **Centre needs dither (R7.3).** A mono clip copied to both channels is reported by the estimator as "no direction" (confidence 0), and `sideOf` maps that to "Side unknown". Zero delay is kept; a -80 dBFS independent noise per channel makes the channels non-identical so GCC-PHAT can report a centre peak. This is measured in task 1. If it fails at 1e-2, Centre would show "Side unknown" and the spec's Centre case must be revisited with you.
3. **Left and Right may read "Side unknown" for tonal clips.** `docs/bearing.md` says narrowband sounds (beeps, chimes) often fall back to the loudness estimate with confidence under 0.8. A delayed copy of a clean clip is easier than the noisy test signals, but the doorbell, alarm and horn clips are tonal. The hard gate is Knock (R8.3a). For the rest the gate is "never the wrong side". The station shows "Side unknown" honestly, and the ghost then sits in the centre with its dashed outline. The measured table below records what happens.
4. **Browser classification may differ from the node reference.** The reference results come from TF.js on the CPU backend in Node. The browser picks WebGL (or CPU in headless). Scores can differ in the last digits. Alarm wins its clip by one frame (5 alarm, 4 voice). If the browser test fails for one clip, report the frame counts and stop; do not lower the threshold or add a rule to make it pass.
5. **Rate limit 0 (R10.4).** The engine's 3000 ms limit would drop a repeated click on the same chip and side, and the page would look broken. The demo uses 0. Real listening (later spec) uses the default.
6. **No sound plays.** "Plays the clip" means the clip runs through the pipeline. The station makes no audio, in line with `.kiro/steering/accessibility.md` (never rely on sound).
7. **Time of a row.** `SoundEvent.t` is a monotonic `performance.now()` value; the list time is wall-clock from `epoch()`. The two are different on purpose.
8. **Two live announcements.** The simulator announces the pattern, the station announces the alert. Accepted. A later spec can merge them.
9. **TF.js console output.** If TF.js logs a warning in headless Chromium that cannot be avoided, the e2e test allows that exact string (R16.4).
10. **Phone bar and DOM order (R2).** The bar is early in the DOM and visually last. This follows the band page ("control before result") and not the DESIGN.md line that puts the bar last. DESIGN.md is updated to say so.
11. **Ghost field "Recent:" list and the Recent sounds list both exist.** The first is the canvas's text equivalent and cannot be removed without changing `src/ghosts`.

### Measured side results (filled in task 1.7)

| Clip | Chosen | Side | Bearing (deg) | Confidence | Source |
|---|---|---|---|---|---|
| doorbell | left | left | -53.5 | 0.965 | gcc-phat |
| doorbell | right | right | 53.5 | 0.965 | gcc-phat |
| knock | left | left | -53.5 | 1.000 | gcc-phat |
| knock | right | right | 53.5 | 1.000 | gcc-phat |
| knock | centre | centre | 0.0 | 1.000 | gcc-phat |
| alarm | left | unknown | 0.0 | 0.000 | loudness |
| alarm | right | unknown | 0.0 | 0.000 | loudness |
| baby | left | left | -53.5 | 1.000 | gcc-phat |
| baby | right | right | 53.5 | 1.000 | gcc-phat |
| vehicle | left | unknown | -53.5 | 0.448 | gcc-phat |
| vehicle | right | unknown | 53.5 | 0.448 | gcc-phat |
| voice | left | left | -53.5 | 1.000 | gcc-phat |
| voice | right | right | 53.5 | 1.000 | gcc-phat |

Knock meets requirement 8.3 (a); no clip ever reads the opposite side (b); every clip is at least -50 dBFS (c); DITHER_AMPLITUDE stays 1e-4. Alarm (tonal, the bearing falls back to loudness) and Vehicle (confidence 0.448, under 0.8) show "Side unknown" for Left and Right in the station, as the tonal-clip risk in this design expected; this is honest behaviour, not a bug.

## Testing strategy

- Pure modules: Vitest with the literals above and `fast-check` for the pipeline module. Tests build WAV bytes with `tests/station/helpers/wav.ts` (the same RIFF layout as `tests/clips/wav.test.ts`, with an optional odd `LIST` chunk).
- Runner: `tests/station/runner.test.ts` with fakes: `loadClip` returns bytes of a generated 40000-sample WAV, `classifier.classify` returns scripted classifications by call count, `engine` is a spy or the real `createHapticEngine`, outputs are recording fakes, `now` is the scripted clock. Cases: five stage times; order of calls; `clip-load-failed` (loader rejects), `clip-unreadable` (not a WAV, and a WAV under 15600 samples), `classify-failed` (classifier rejects), `event-invalid` (a classifier returning confidence `NaN`) with `decide` never called; drop reasons carried through; outputs called only on `play`; the phone output called only when in the list.
- Real clips: `tests/station/clips.test.ts` reads `public/clips/*.wav` from disk with `fs`, decodes them with `decodePcm16kWav`, and runs the real stereo build and estimator (Requirement 8.3). It does not load TF.js (the classification of the real clips is already covered by `tests/classify/classifier.integration.test.ts`).
- E2E: `e2e/station.spec.ts` reuses the `watch` helper style of `e2e/ghosts.spec.ts` (console errors and warnings, page errors, failed requests, off-origin requests). A helper records `data-level` of both motor cards with a `MutationObserver` added through `addInitScript` before load, so the 240 ms Knock pattern cannot be missed. Classification tests set a timeout of 120 s and load the model once per page.
- Boundaries: `tests/station/boundaries.test.ts` follows `tests/ghosts/boundaries.test.ts` for the pure files (Requirement 1.2).
