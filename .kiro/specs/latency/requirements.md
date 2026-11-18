# Requirements: Measured onset-to-output latency (F12)

## Introduction

The listening station's pipeline card shows how long each of the five steps took (Waveform, Label, Bearing, Pattern, Band). It does not say how long the whole chain takes from the start of a sound to the moment its vibration pattern is handed to the outputs. `.kiro/specs/listening-station/requirements.md` lists onset-to-output latency as out of scope for round 1. This feature adds it.

The feature measures that time with the clocks the runner and the live loop already use, shows the number in the pipeline card, and records a real measured number in `README.md`. It is honest about what the number covers: it says in the card and in the README which part of the delay is counted and which part is not.

Decisions already made by the owner (listed again in `design.md`, not to be reopened): the meaning of onset and output for clips and for live windows, the pure timer `latencyMs`, the two new fields of the run result, `latencyText`, the look and the markup of the figure, the four notes, the README section and the two Playwright cases.

Terms:

- **Output**: the `deps.now()` read right after the last available output's `play()` returned, which is the end of the band stage. For the band simulator and the phone it is when the pattern starts. For the wristband it is when the frame was queued for the Bluetooth write.
- **Clip run**: one Try a sound press, through `runSound`. **Live run**: one accepted microphone window, through `createLive`.
- **Clip onset**: the first `deps.now()` read of `runSound`, before the clip is loaded.
- **Live onset**: the `deps.now()` read inside the `onMonoFrame` listener, which is the end time of that 0.975 s window (15600 samples at 16 kHz) as the page sees it.
- **Latency**: output minus onset, in milliseconds, or `null` when nothing was handed to an output.
- **Figure**: the latency number in the pipeline card, with its label, unit and note.

## Requirements

### Requirement 1: Module boundaries and privacy

**User story:** As a developer, I want the timer pure and the change small, and as a user, I want the measurement to leave nothing behind.

#### Acceptance criteria

1. THE timer SHALL live in a new file `src/station/latency.ts`. It SHALL be pure: no `document`, `window`, `navigator`, `Date`, `console` (and none of the other names of the scan in `tests/station/boundaries.test.ts`). `latency.ts` SHALL be added to the `PURE` list of that test, and the test SHALL scan it.
2. THE feature SHALL change only `src/station/` (`latency.ts`, `types.ts`, `runner.ts`, `live.ts`, `format.ts`, `pipeline-view.ts`, `station.css`), its tests and e2e spec, `design/DESIGN.md` and `README.md`. `src/audio`, `src/classify`, `src/bearing`, `src/haptics`, `src/band`, `src/events`, `src/ghosts` and `src/pwa` SHALL NOT change, and `package.json` SHALL NOT gain a dependency.
3. THE measured numbers SHALL stay in memory and in the page. Nothing SHALL write them to `localStorage`, `IndexedDB`, the Cache Storage, the sound log or the console, and nothing SHALL send them anywhere. `src/station/` SHALL gain no `console`, `Math.random` or storage call.
4. THE feature SHALL NOT add a `deps.now()` read to `runSound`. It SHALL add exactly one read per window to `createLive` (Requirement 4.5). Both paths SHALL keep the other reads as they are.
5. EVERY exported function, constant and type of the new code SHALL have a short doc comment.

### Requirement 2: What is measured

**User story:** As a judge or a Deaf user, I want to know exactly which delay the number describes, so that it is not mistaken for a claim it cannot support.

#### Acceptance criteria

1. THE output instant SHALL be the end of the band stage: the `deps.now()` read right after the last available output's `play()` returned. THE number SHALL NOT include the screen paint of the ghost and the row, the Bluetooth radio time or the motor spin-up.
2. FOR a clip run, THE onset SHALL be the first `deps.now()` read of `runSound`. That is the chip press once the model is loaded. THE one-time model load on the first press SHALL NOT be counted. THE number SHALL include the clip fetch, the decode, classifying every frame of the clip, the bearing, the event, the pattern and the output.
3. A clip is processed faster than real time, so a clip run's number SHALL be described as processing latency on a whole clip, not as a live delay. The page and the README SHALL say so.
4. FOR a live run, THE onset SHALL be the `deps.now()` read inside the `onMonoFrame` listener. THE number SHALL include the wait behind a classification that was still running (the newest waiting window keeps its own arrival time), the classification, the bearing, the event, the pattern and the output.
5. FOR a live run, THE number SHALL NOT include the microphone, operating system and `AudioContext` buffering, the worklet message hop before the window reaches the page, or the time the sound sat inside the window before the window ended (up to 0.975 s). The page and the README SHALL say so in plain words.
6. WHEN no output played (the decision was a drop, or no output was available), THE latency SHALL be `null`, and the page SHALL say that nothing buzzed.

### Requirement 3: The pure timer

**User story:** As a developer, I want one small function that decides what counts as a valid latency, so that the runner, the live loop and the view cannot disagree.

#### Acceptance criteria

1. `latencyMs(onsetMs: unknown, outputMs: unknown): number | null` SHALL return `outputMs - onsetMs` WHEN both are finite numbers and `outputMs >= onsetMs`. Equal values SHALL give `0`.
2. IT SHALL return `null` for a missing value (`undefined`, `null`), a value that is not a number (a string, an object), `NaN`, `Infinity` or `-Infinity`, in either place, and for an output before the onset (a negative difference).
3. IT SHALL never throw, for any input. IT SHALL NOT round.
4. `latency.ts` SHALL export nothing else that the rest of the code needs; the run results and the view call `latencyMs` and nothing else from it.

### Requirement 4: Run results

**User story:** As the pipeline view, I want every successful run to carry its latency and where it was measured from, so that I can show the figure without any clock of my own.

#### Acceptance criteria

1. THE ok variant of `RunResult` in `src/station/types.ts` SHALL gain `latencyMs: number | null` (onset to output in ms, `null` when no output played) and `onset: 'clip' | 'live'`.
2. `runSound` SHALL use its first `deps.now()` read as the onset and its last read (the end of the band stage) as the output. It SHALL NOT read the clock more often than today (10 reads on a run that reaches the end; `tests/station/runner.test.ts` counts them). WITH the scripted clock `[0, 1.5, 10, 14, 20, 20.25, 30, 33, 40, 40.5]` THE latency SHALL be `40.5` and `onset` SHALL be `'clip'`.
3. A clip run whose decision is a drop, or where no output was available, SHALL have `latencyMs: null`.
4. A clip run that fails (`{ ok: false }`) SHALL carry no latency.
5. `createLive` SHALL read `deps.now()` once in the `onMonoFrame` listener and keep that time with the waiting window. A newer window SHALL replace both the frame and its time. The output read SHALL be the end of the band stage. The result SHALL carry `onset: 'live'`.
6. A live result whose decision is a drop, or where no output was available, SHALL have `latencyMs: null`.
7. THE latency of every result SHALL come from `latencyMs(onset, output)`, so an impossible pair gives `null`, never a negative or non-finite number.

### Requirement 5: Text

**User story:** As a user, I want the number as a plain sentence a screen reader can read in one piece.

#### Acceptance criteria

1. `latencyText(ms: number | null): string` in `src/station/format.ts` SHALL return "Onset to output: 41 ms" for `41`, "Onset to output: 3.5 ms" for `3.5` (the rules of `formatMs`: one decimal below 10, whole from 10), and "Onset to output: — ms" for `null` or any value that is not a finite number of at least 0.
2. THE function SHALL be pure and SHALL NOT throw.

### Requirement 6: The figure in the pipeline card

**User story:** As a judge, I want to see the number next to the pipeline, in the same calm style as the rest of the card, and as a screen-reader user I want it to read as one sentence.

#### Acceptance criteria

1. THE pipeline card SHALL show the figure before the stage tiles. ON desktop (720px and up) it SHALL sit to the right of the "Pipeline" heading and its note. ON the phone it SHALL sit under them.
2. THE figure SHALL be a big-number figure as the Card rule of `design/DESIGN.md` says: a muted `caption` label "Onset to output", the number in `display` type with `font-variant-numeric: tabular-nums`, its unit "ms" in muted `caption` beside it, and one muted `caption` note under it. THE styles SHALL use design tokens only: no new colour, no border, no tile inside a tile. THE one accent in the card SHALL stay the stage numbers.
3. THE figure SHALL be one `<p class="bb-latency__figure">` whose `textContent` reads exactly the sentence of `latencyText` ("Onset to output: 41 ms"). THE colon SHALL be visually hidden but present in the text, so screen readers and tests read the whole sentence.
4. THE figure SHALL carry `data-latency-ms` with the number rounded to one decimal WHILE there is a number, and SHALL carry no `data-latency-ms` otherwise. THE wrapper `.bb-latency` SHALL carry `data-latency-source` with `clip` or `live` after a run, and no `data-latency-source` before the first run.
5. THE note SHALL be one of these four texts, in plain words:
   - before any run: "Run a sound to measure it."
   - after a clip run with a number: "From the press to the buzz: fetch, classify, side, pattern and output. The one-time model load and the screen paint are not counted."
   - after a live run with a number: "From the end of a 0.975 s microphone window to the buzz. Microphone buffering, and the time the sound sat in the window, are not counted."
   - after a run without a number (nothing buzzed): "Nothing buzzed this time, so there is no output to time."
6. A run the Settings muted (class off or under its level) has no number, so THE figure SHALL show "Onset to output: — ms" and the "Nothing buzzed" note.
7. THE figure SHALL NOT be a live region and SHALL NOT be focusable. THE Latest alert stays the one announcement of a sound.
8. `show(result)` SHALL replace the figure with the run's latency and source. `failed()` SHALL keep the previous figure. `clear()` SHALL reset it to "Onset to output: — ms" with the first note and no data attributes.
9. THE figure SHALL need no motion. THE Day and Night themes SHALL show it through tokens only, and every colour pair it uses (`text` and `text-muted` on `surface`) is already a row of the Contrast table of `design/DESIGN.md`.
10. THE figure SHALL not make the page scroll sideways at 390px, and its number SHALL stay readable at 1440px and 390px in both themes.

### Requirement 7: README and design document

**User story:** As a judge reading the repository, I want one real measured number and an honest account of what it covers.

#### Acceptance criteria

1. `README.md` SHALL gain a short `## Latency` section with the real numbers measured by `e2e/latency.spec.ts` in headless Chromium on the development machine, naming the TensorFlow.js backend of that run. THE numbers SHALL come from an actual run. THE spec and the builders SHALL NOT invent, estimate or copy them from another run.
2. THE section SHALL say what onset means for a clip and for a live window, what output means, and what is not counted (Requirement 2.1, 2.2, 2.5). It SHALL say the clip number is processing latency and not a live delay. It SHALL say the numbers come from the development server, not a phone.
3. `design/DESIGN.md` SHALL list the figure in item 6 (Pipeline card) of the Listening station regions and in the desktop sketch (and the phone sketch). `tests/ui`, which reads `DESIGN.md`, SHALL still pass.
4. THE README and DESIGN text SHALL imply no protection and SHALL NOT claim the band buzzes within any time. The aid sentence is unchanged.

### Requirement 8: Tests and accessibility

**User story:** As a maintainer, I want the behaviour covered at every level, so that later work can change the pipeline safely.

#### Acceptance criteria

1. UNIT tests (Vitest, `tests/station`, mirroring source paths) SHALL cover `latencyMs` (the literals and the property of Requirement 3), the runner's latency and clock count, the live loop's latency (held classification, newest waiting window, drop, `onset`) and the `latencyText` literals.
2. THE property test SHALL use fast-check with a fixed seed and 200 runs: for any two values the result is `null` or a finite number of at least 0, and for two finite numbers `a <= b` it is `b - a`.
3. PLAYWRIGHT `e2e/latency.spec.ts` SHALL run with the fake microphone launch arguments of `e2e/live.spec.ts` and cover: (1) Try a sound, Knock chip at 1440 Day, and (2) Start listening at 390 Night, as in `design.md`. Both SHALL fail on a page error and on any console error or warning (the known WebGL ReadPixels note is allowed as in `live.spec.ts`), and SHALL push the number and the backend into `test.info().annotations`.
4. THE figure SHALL be checked for the keyboard and screen readers by its markup: not focusable (no `tabindex`, not in the tab order), no `role="status"` and no `aria-live` on it or its wrapper.
5. `bun run typecheck`, `bun run test`, `bun run e2e` and `bun run build` SHALL pass.

## Out of scope

- The true delay from a sound in the air to a motor turning. That needs a hardware loop (a microphone, a light or accelerometer on the band) and is not built here.
- The screen paint of the ghost and the row, the Bluetooth radio time and the motor spin-up (Requirement 2.1).
- Microphone, operating system and `AudioContext` buffering, the worklet message hop, and the time a sound sat inside a window before the window ended.
- The one-time model load.
- A history, an average, a percentile or a chart of latencies; saving a latency anywhere; a latency alert or budget.
- A change to the five stage times, the Label tile or the live gate.
- A change to the sound log or the MCP server.
- A sound-onset detector inside a window.
- Measuring on a phone.
