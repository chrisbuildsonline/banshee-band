# Design: Measured onset-to-output latency (F12)

Requirement numbers refer to `requirements.md`.

## Overview

One number per run: the time from an onset to the moment the pattern is handed to the outputs. The runner and the live loop already read an injected clock around every stage, so the feature reuses those reads. It adds one pure function, two fields on the run result, one text function and one figure in the pipeline card.

```
Try a sound (clip run)                              Listening (live run)
  runSound: first now() ......... onset               onMonoFrame listener: now() ....... onset (kept with the waiting window)
    load, decode, classify every frame,                 wait behind a running classify (if any)
    bearing, event, pattern                             classify, bearing, event, pattern
    last output play() returns,                         last output play() returns,
    last now() .................. output                last now() ................ output
        \                                                  /
         latencyMs(onset, output) -> number | null    (pure, latency.ts)
                         |
          RunResult { latencyMs, onset: 'clip' | 'live', ... }
                         |
          pipeline.show(result) -> figure "Onset to output: 41 ms" + note + data-latency-ms / data-latency-source
```

Not counted, and said so in the card and the README: the screen paint, the Bluetooth radio time and the motor spin-up (after the output read); the one-time model load (before the clip onset); microphone, operating system and `AudioContext` buffering, the worklet hop, and the time the sound sat in the window (before the live onset).

## Files

```
src/station/
  latency.ts        latencyMs(onsetMs, outputMs): number | null                                  pure (new)
  types.ts          RunResultOk gains latencyMs: number | null and onset: 'clip' | 'live' (edit)
  runner.ts         onset = first now() read, output = last read; latencyMs from the played list (edit)
  live.ts           arrival read in the onMonoFrame listener, kept with the waiting window (edit)
  format.ts         + latencyNumber(ms), latencyText(ms) (edit)
  pipeline-view.ts  the figure before the stage tiles; show, failed, clear (edit)
  station.css       .bb-latency styles, tokens only; the pipeline card's two-column head from 720px (edit)
README.md           ## Latency (edit, task 3)
design/DESIGN.md    Listening station: region 6 and the sketches (edit, task 3)
tests/station/
  latency.test.ts   latency.property.test.ts   latency-styles.test.ts   (new)
  runner.test.ts   live.test.ts   format.test.ts   boundaries.test.ts   (edit)
e2e/latency.spec.ts   (new)    e2e/screenshots/latency-1440-day.png  latency-390-night.png   (written by the spec)
```

`structure.md` is not edited by this spec. When the feature is built, its file table needs `latency.ts` and `e2e/latency.spec.ts`. That is one line each, and the owner decides when to add it.

## The pure timer (`latency.ts`)

```ts
/** Onset to output in ms, or null for a missing, non-finite or non-number value or an output before the onset. Never throws; does not round. */
export function latencyMs(onsetMs: unknown, outputMs: unknown): number | null {
  if (typeof onsetMs !== 'number' || typeof outputMs !== 'number') return null;
  if (!Number.isFinite(onsetMs) || !Number.isFinite(outputMs)) return null;
  return outputMs >= onsetMs ? outputMs - onsetMs : null;
}
```

- `Number.isFinite` is false for `NaN`, `Infinity` and `-Infinity`, and `typeof` rules out `undefined`, `null`, strings and objects, so no coercion happens. A boxed `Number` is an object and gives `null`.
- Equal values give `0`. A difference of `-0` cannot occur, because the equal case returns `outputMs - onsetMs` which is `+0`.
- The scan of `tests/station/boundaries.test.ts` reads string literals too, so the file contains none of the forbidden words, in code or in strings.

## Run results (`types.ts`, `runner.ts`, `live.ts`)

```ts
// RunResultOk, added fields
/** Onset to output in ms; null when no output played. */
latencyMs: number | null;
/** Where the onset was read: the start of a clip run, or the arrival of a microphone window. */
onset: 'clip' | 'live';
```

### Clip run (`runSound`)

The first read is already `let t0 = deps.now()` before `loadClip`, and the last is `times.band = deps.now() - t0`. The change names those two reads and keeps their number:

```ts
const onsetMs = deps.now();          // was: let t0 = deps.now();
let t0 = onsetMs;
...
t0 = deps.now();                     // band stage start
... play on every available output ...
const outputMs = deps.now();         // was: times.band = deps.now() - t0;
times.band = outputMs - t0;
...
latencyMs: played.length > 0 ? latencyMs(onsetMs, outputMs) : null,
onset: 'clip',
```

With the scripted clock `[0, 1.5, 10, 14, 20, 20.25, 30, 33, 40, 40.5]` the onset is `0`, the output is `40.5`, so the latency is `40.5`, and the clock was read 10 times. `times.band` stays `0.5`. A drop has an empty `played`, and so does a run where no output was `available()`, so both give `null` through one rule.

### Live run (`createLive`)

`pending` becomes the frame and its arrival time:

```ts
let pending: { frame: MonoFrame; arrivedMs: number } | null = null;
...
deps.capture.onMonoFrame((frame) => {
  if (pending) dropped++;
  pending = { frame, arrivedMs: deps.now() };   // the one new clock read per window
  if (!running) void pump(gen);
}),
```

- A newer window replaces the object, so the older arrival time goes with the dropped frame (Requirement 4.5).
- `pump` takes `const { frame, arrivedMs } = pending` and passes `arrivedMs` to `play(...)`. `t0` (the classify start), `ms` (the classify time) and the gate time stay as they are, so the gate and the Label tile do not change meaning.
- In `play`, the end of the band stage is the output read: `const outputMs = deps.now(); times.band = outputMs - t0;`. The result gets `latencyMs: played.length > 0 ? latencyMs(arrivedMs, outputMs) : null` and `onset: 'live'`. No other read is added.
- A window that is held behind a running classification keeps its own arrival time, so the wait shows in the number. A window that the gate rejects (class `other`, or a cooldown) sends no result, so its arrival read is unused.

Existing live tests drive an injected clock that adds 10 on every read (`now: () => (t += 10)`). The extra read in the listener shifts later reads. The label time is two reads in a row in `pump`, so it stays `10` unless a window arrives while a classification is held, and the gate compares `t0` values. The builder checks every literal in `tests/station/live.test.ts` and changes only those that the extra read moves, with the reason in the commit summary.

## Text (`format.ts`)

```ts
/** The number of the latency figure by the `formatMs` rules, without the unit: "41", "3.5", or "—" for null or an invalid value. */
export function latencyNumber(ms: number | null): string
/** "Onset to output: 41 ms", "Onset to output: 3.5 ms", "Onset to output: — ms". */
export function latencyText(ms: number | null): string
```

`latencyNumber` returns "—" for `null` or a non-number, and otherwise calls `formatMs` and removes its trailing " ms" (`formatMs` also returns "—" for a non-finite or negative value, so an invalid number gives "—" too). `latencyText` is `` `Onset to output: ${latencyNumber(ms)} ms` ``. The view builds the figure from `latencyNumber`, and the e2e test and the unit test check that the figure's text equals `latencyText`. `latencyNumber` is a small addition to the brief's `latencyText` so the view cannot split the sentence by hand. `format.ts` is in the pure scan (it is the one file where `Date` is allowed), so none of its new strings may contain the word `window`. The notes, which do, live in `pipeline-view.ts`.

## The figure (`pipeline-view.ts`, `station.css`)

`mountPipelineView(card)` appends the figure wrapper before the stage row, so the DOM order in the card is: heading, note (both added by `station.ts`), figure, stage tiles.

```html
<div class="bb-latency" data-latency-source="clip">            <!-- attribute absent before the first run -->
  <p class="bb-latency__figure" data-latency-ms="41.2">        <!-- attribute absent while there is no number -->
    <span class="bb-latency__label">Onset to output</span><span class="bb-station-sr">: </span><span class="bb-latency__number">41</span> <span class="bb-latency__unit">ms</span>
  </p>
  <p class="bb-latency__note">From the press to the buzz: fetch, classify, side, pattern and output. The one-time model load and the screen paint are not counted.</p>
</div>
```

- `textContent` of the figure is "Onset to output: 41 ms": the label, the screen-reader-only colon (the existing `.bb-station-sr` class), the number, one space (a text node) and the unit.
- `data-latency-ms` is `String(Math.round(ms * 10) / 10)`, as the Label tile does for `data-classify-ms`.
- Not a live region, no `tabindex`, no `role`. The wrapper is a plain `div`.

| State | Figure text | `data-latency-ms` | `data-latency-source` | Note |
|---|---|---|---|---|
| Before any run, and after `clear()` | Onset to output: — ms | absent | absent | Run a sound to measure it. |
| Clip run with a number | Onset to output: 41 ms | 41.2 | clip | From the press to the buzz: fetch, classify, side, pattern and output. The one-time model load and the screen paint are not counted. |
| Live run with a number | Onset to output: 41 ms | 41.2 | live | From the end of a 0.975 s microphone window to the buzz. Microphone buffering, and the time the sound sat in the window, are not counted. |
| Run with no number (drop, muted, no output) | Onset to output: — ms | absent | clip or live | Nothing buzzed this time, so there is no output to time. |
| `failed()` | unchanged | unchanged | unchanged | unchanged |

### Layout and type

Rules in `station.css` use tokens only (`tests/station/latency-styles.test.ts` reads the `.bb-latency` rules and fails on a `#` colour, an `rgb(` or `hsl(` colour, a `border`, a `background`, an `@keyframes` or a `px` literal inside them; the 720px literal belongs to the `@media` line, outside the rules).

- Phone: the figure is a block under the heading and note: `gap: var(--bb-space-1)`, label in muted `caption`, the number in `display` (`--bb-type-display-size`, `-line`, `-weight`) with `font-variant-numeric: tabular-nums`, the unit in muted `caption` on the same line as the number (the number and unit are inline, baseline aligned, `gap: var(--bb-space-2)`), the note in muted `caption` under them. No background, no border, no radius: the figure sits on the card surface.
- From 720px: the pipeline card becomes a two-column grid. The heading and its note take the first column. The figure takes the second column across both rows, right aligned, with `justify-items: end` and the note's text right aligned and limited by `max-inline-size` so it wraps in a few lines. The stage tiles take both columns. The existing `grid-column` rules of `.bb-station-pipeline` stay. The breakpoint literal is the same 720px as the rest of the file.
- The big number at `display` (up to 64px) is the heaviest text in the card, so it reads first, ahead of the stage tiles. The one accent stays the step numbers. The primary pill on the page is still Start listening.
- The label reads "Onset to output" in a card that already has the heading "Pipeline", so the figure needs no heading of its own. The heading order is unchanged.
- Colour pairs: `text` on `surface` and `text-muted` on `surface` for both themes, all already in the Contrast table. No new row.
- Reduced motion: nothing animates, so nothing changes.

## README `## Latency`

Written in task 3 from the annotations of a real run of `e2e/latency.spec.ts`. The section has this shape, with the numbers and the backend filled from the run:

```
## Latency

Onset to output is how long the station takes from the start of a sound to the moment its vibration pattern is handed to the outputs, shown in the pipeline card. Measured in headless Chromium on the development machine with the dev server, TensorFlow.js backend <backend>:

| Source | Onset to output |
|---|---|
| Try a sound (Knock) | <n> ms |
| Listening (fake microphone, Knock) | <n> ms |

What it covers: ... (clip onset, live onset, output) ...
What it does not count: ...
```

The rows hold the numbers from the run (a single run each, say so; do not add a range the run did not produce). The text states that a clip is processed faster than real time, so the first row is processing latency on a whole clip, not a live delay, and that the second row starts when a 0.975 s microphone window reaches the page, so it leaves out the microphone buffering and the time the sound sat in the window. It says the numbers come from a laptop-class development machine's dev server and that a phone will differ. It says the output is when the pattern is handed over, and for the wristband that is when the frame is queued, not when the motor turns.

## `DESIGN.md` edits (task 3)

- Listening station, region 6 (Pipeline card): add the figure. "Pipeline card, all 12 columns: the heading and a one-line note on the left and, on desktop, the latency figure on the right ('Onset to output', the number in `display` with its unit and one muted note; under the heading on the phone), then five `surface-raised` stage tiles ..."
- The desktop sketch's Pipeline box gains a line with the figure at the right of the heading.
- The phone sketch's "Pipeline (tiles stacked)" line becomes "Pipeline (latency figure, then tiles stacked)".
- The two sentences that the Card rule already holds (a number in `display`, its unit muted beside it) are not repeated.

## Playwright (`e2e/latency.spec.ts`, dev server on 5287)

Launch arguments, `watch(page, origin)` and the ReadPixels allowance are copied from `e2e/live.spec.ts` (fake device, fake UI, `--use-file-for-fake-audio-capture` with `public/clips/knock-01.wav`). A helper reads the figure in one `page.evaluate`, so the text and the data attribute come from the same instant even when a later live event replaces the figure:

```ts
const read = (page) => page.evaluate(() => {
  const fig = document.querySelector('[data-card="pipeline"] .bb-latency__figure')!;
  const wrap = fig.closest('.bb-latency') as HTMLElement;
  return { text: fig.textContent, ms: (fig as HTMLElement).dataset.latencyMs, source: wrap.dataset.latencySource };
});
```

1. **Try a sound, 1440 Day.** Day theme chosen with the theme control. Before the press: the figure text is "Onset to output: — ms", no `data-latency-ms`, no `data-latency-source`, and the note is "Run a sound to measure it.". Press Knock and wait for its row (model timeout as in `station.spec.ts`). Then: the text matches `/^Onset to output: \d+(\.\d)? ms$/`; `data-latency-ms` is finite, above 0 and below 10000; the number in the text equals the rule of `formatMs` applied to `data-latency-ms` (`ms >= 10 ? String(Math.round(ms)) : ms.toFixed(1)`); `data-latency-source` is `clip`; the note is the clip note; the figure and its wrapper have no `tabindex`, no `role` and no `aria-live`, and the figure is not in the tab order (no `a, button, input, [tabindex]` inside `.bb-latency`). Screenshot `e2e/screenshots/latency-1440-day.png`. Push `{ type: 'latency-clip', description: '<backend>, <ms> ms' }` into `test.info().annotations`, with the backend read from the Label tile's `data-backend`.
2. **Start listening, 390 Night.** Viewport 390 x 844, Night chosen. Press Start listening, wait for "Listening" and for the first Knock row. The same checks, with `data-latency-source` `live`, the live note, and the number below 10000. No horizontal scroll (`scrollWidth <= clientWidth`). Screenshot `e2e/screenshots/latency-390-night.png`. Annotation `latency-live`. Stop listening at the end.
3. **A muted run says Nothing buzzed.** Knock switched off in Settings (through the sheet's switch, as `e2e/settings.spec.ts` does), Done, then press Knock: the figure text is "Onset to output: — ms", there is no `data-latency-ms`, `data-latency-source` is `clip`, and the note is "Nothing buzzed this time, so there is no output to time.". This case is not in the owner's list of two. It covers Requirement 6.6, which no other test reaches, and the owner can drop it.

All three tests fail on any `pageerror` and on any console `error` or `warning` except the known ReadPixels note. The annotations are how the README number is read off a real run (task 3).

## Decisions (made by the owner, not to be reopened)

- **Output** is the `deps.now()` read right after the last available output's `play()` returned, the end of the band stage. Not counted: the screen paint of the ghost and row, the Bluetooth radio time and the motor spin-up.
- **Clip onset** is the first `deps.now()` read of `runSound`. The one-time model load is not counted. The number is processing latency on a whole clip, not a live delay.
- **Live onset** is a `deps.now()` read inside the `onMonoFrame` listener, the end time of the 0.975 s window as the page sees it. The wait behind a running classification counts, and the newest waiting window keeps its own arrival time. Microphone, OS and `AudioContext` buffering, the worklet hop and the time the sound sat in the window are not counted.
- **`latencyMs(onsetMs: unknown, outputMs: unknown): number | null`** in a pure `src/station/latency.ts`, added to the `PURE` list of `tests/station/boundaries.test.ts`: `null` for missing, non-number, `NaN`, infinite or negative-difference input, `0` allowed, never throws, never rounds.
- **`RunResultOk`** gains `latencyMs: number | null` and `onset: 'clip' | 'live'`. `runSound` keeps its 10 clock reads; `createLive` adds one read per window, in the listener. A drop, or no available output, gives `null`.
- **`latencyText(ms)`** in `format.ts`: "Onset to output: 41 ms", "Onset to output: 3.5 ms", "Onset to output: — ms".
- **The figure**: one `<p class="bb-latency__figure">` with the sentence as its text, `data-latency-ms` (one decimal) while there is a number, `data-latency-source` on the wrapper after a run, the four notes of Requirement 6.5, no live region, not focusable, `failed()` keeps and `clear()` resets, tokens only, no new colour, border or tile.
- **README** gets a `## Latency` section with numbers from a real run; **DESIGN.md** gets the figure in the Listening station.
- **Tests**: unit tests against a throwing stub first, then `e2e/latency.spec.ts` with the two cases of the brief, annotations carrying the number and backend.

Choices of this design inside those decisions, which need a yes or no:

- `latencyNumber(ms)` is added next to `latencyText` so the view never splits the sentence by hand.
- A third e2e case covers the muted "Nothing buzzed" figure.
- `tests/station/latency-styles.test.ts` is a small check that the new CSS uses tokens only.
- `structure.md` is left for the owner to update (two lines), because this feature was asked not to touch it.

## Risks and honest limits

- `performance.now()` is coarsened by the browser (about 0.1 ms in Chromium without cross-origin isolation, 1 ms in Firefox). A fast run can read as `0` or a round number. The number is a measurement of the page's own clock, not a lab instrument.
- The live number leaves out up to 0.975 s that the sound spent inside the window, plus the audio buffering before it. The true delay a user feels is larger, and the card and the README say the number is not that.
- A clip number depends on the clip length (every frame is classified) and on the backend (`webgl` or `cpu`). The README states the backend with the number.
- The dev server serves unminified code, so a production build may be a little faster. The README says which server the numbers came from.
- The wristband output is counted when the frame is queued for the Bluetooth write. The radio time and the motor spin-up come after it and are not measured.

## Testing strategy

| Layer | What | Where |
|---|---|---|
| Unit: timer | `latencyMs(100, 141.5)` is `141.5`; equal gives `0`; output before onset, `NaN`, `Infinity`, `-Infinity`, `undefined`, `null` and a string in either place give `null`; written first against a throwing stub | `tests/station/latency.test.ts` |
| Property | fast-check, fixed seed, 200 runs: for any two values the result is `null` or a finite number >= 0; for finite `a <= b` it is `b - a`; never throws | `tests/station/latency.property.test.ts` |
| Unit: runner | the scripted clock gives `latencyMs: 40.5`, `onset: 'clip'` and still 10 reads; a disabled class (drop) and a run with no available output give `null` | `tests/station/runner.test.ts` |
| Unit: live | injected clock: latency is the band-stage end read minus the window's arrival read, including a held classification; the newest waiting window's own arrival is used; a drop gives `null`; `onset: 'live'` | `tests/station/live.test.ts` |
| Unit: text | the three `latencyText` literals, `null` and an invalid number, `latencyNumber` | `tests/station/format.test.ts` |
| Boundaries and styles | `latency.ts` in the `PURE` scan; `.bb-latency` rules use tokens only | `tests/station/boundaries.test.ts`, `latency-styles.test.ts` |
| e2e | the three cases above, with screenshots and annotations | `e2e/latency.spec.ts` |
| Docs | `tests/ui` still reads `DESIGN.md`; the README number comes from the e2e annotations | task 3 |
