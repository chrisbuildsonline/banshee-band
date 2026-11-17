# Requirements: Listening station (round 1)

## Introduction

Every module of the pipeline exists on its own: `src/audio` (clips and framing), `src/classify` (YAMNet), `src/bearing` (GCC-PHAT), `src/haptics` (priority engine), `src/band` (simulator and phone output) and `src/ghosts` (canvas ghosts). `index.html` is still a placeholder. This feature builds the first screen, the **listening station**, in a new module `src/station/`, and wires the real modules together for one input: a recorded sample clip chosen by the user.

A user opens the page, clicks one chip ("Knock") and sees the whole chain work: the clip is classified in the browser, a stereo pair with a delay for the chosen side is built from the mono clip and given to the real GCC-PHAT estimator, the haptic engine decides a pattern, the band simulator (and the phone, when it can vibrate) plays it, and a ghost appears. The page also shows what each step took.

This is round 1. The live microphone path, the PWA, offline caching, settings and latency work are out of scope (see "Out of scope" at the end). The station is an aid and not a safety device. It is one of three forms of an alert (ghost, haptic pattern, text) and no form is the only one.

Terms:

- **Station**: the page `index.html` and its code in `src/station/`.
- **Try a sound**: the card with the sound chips and the side control (Requirement 4).
- **Clip**: one entry of `public/clips/manifest.json`. All six clips are 16 kHz mono 16-bit PCM WAV files.
- **Chosen side**: `'left'`, `'centre'` or `'right'`, as picked in the side control. It is an input of the simulation. It is never called a measurement of the clip.
- **Stereo pair**: the left and right arrays built from the mono clip for the chosen side (Requirement 7).
- **Run**: everything that follows one click on a chip, from loading the clip to showing the ghost.
- **Stage**: one of the five steps of a run: `waveform`, `label`, `bearing`, `pattern`, `band` (Requirement 13).
- **Stage time**: the milliseconds a stage took, measured with `performance.now()` around that stage.
- **Pipeline module**: `src/station/pipeline.ts`, the pure function that turns a classification and a bearing into a validated `SoundEvent` (Requirement 9).
- **Row**: one entry of the event list (Requirement 11).
- **Outer outline**: the first subpath of a ghost path (Requirement 15).

## Requirements

### Requirement 1: Module boundaries

**User story:** As a developer, I want the station to sit on top of the existing modules without changing how they work, so that each part stays testable alone.

#### Acceptance criteria

1. THE station code SHALL live in `src/station/`. It MAY import from `src/events`, `src/audio`, `src/classify`, `src/bearing`, `src/haptics`, `src/band`, `src/ghosts` and `src/ui/theme.ts`. No other module SHALL import from `src/station/`, except `src/main.ts`.
2. THE pure files `wav.ts`, `stereo.ts`, `summary.ts`, `waveform.ts`, `format.ts`, `pipeline.ts`, `runner.ts` and `constants.ts` SHALL NOT use `document`, `window`, `navigator`, `fetch`, `XMLHttpRequest`, `WebSocket`, `console`, `Math.random` or `Date`. They SHALL import only from `src/events`, `src/audio` (types and the framer), `src/classify` (types), `src/bearing`, `src/haptics`, `src/band` (types and label helpers) and `src/ghosts` (names, text helpers) and from files in `src/station/`. `format.ts` MAY use `Date` for the clock text only.
3. A test SHALL scan these files (comments removed) and fail on any import or identifier that breaks criterion 2.
4. THE feature SHALL add exactly three re-exports to `src/audio/index.ts`: `loadManifest`, `fetchClip` and `createFramer`. It SHALL NOT change the behaviour of any function of `src/audio`, `src/classify`, `src/bearing`, `src/haptics`, `src/band` or `src/events`. The only changes to `src/ghosts` are those of Requirements 14 and 15.
5. THE feature SHALL NOT add a dependency to `package.json`.
6. EVERY exported function, constant and type of `src/station/` SHALL have a short doc comment, and `src/station/index.ts` SHALL carry a module comment that says the station is an aid and not a safety device.

### Requirement 2: First screen and layout

**User story:** As a user, I want the first screen to show the product name, what state it is in, and what I can do, so that I can try it without reading anything else.

#### Acceptance criteria

1. THE page `index.html` SHALL be the station. It SHALL have one `<main>`, one `<h1>` with the text "Listening station", and headings in order. The placeholder text "The listening station arrives in a later build" SHALL be gone.
2. THE first things on the screen, in order, SHALL be the header with the brand "Banshee Band" (a link to `/index.html`), the status pill (Requirement 3) and the Day and Night theme control (`initThemeControl` from `src/ui/theme.ts`), then the title block, then the Try a sound card.
3. THE DOM order of `<main>` SHALL be: title block, Try a sound card, ghost field card, "Latest alert" and "Recent sounds" card, band simulator, pipeline card. The footer follows `<main>` content. The tab order SHALL follow the DOM order.
4. AT 720 px and wider ("desktop", tested at 1440 x 900), THE layout SHALL be a 12-column grid with 24 px gaps: the Try a sound card across all 12 columns under the title block; the ghost field card on the left over 7 columns, with a canvas at least 360 px high and a card at least 480 px high; the right column over 5 columns holding the Latest alert and Recent sounds card above the band simulator; the pipeline card across all 12 columns below them. The ghost field card SHALL be wider than the right column and SHALL start at the same top edge as it.
5. BELOW 720 px ("phone", tested at 390 x 844), THE layout SHALL be one column in this visual order: title block, ghost field card, Latest alert and Recent sounds card, band simulator, pipeline card, footer. THE Try a sound card SHALL be a bar fixed to the bottom of the viewport, with the page given enough bottom padding that no content is hidden behind it. Its chips and side control SHALL lie in the lower 45% of a 844 px high viewport, within reach of a thumb. At 390 px there SHALL be no horizontal scrolling.
6. THE page SHALL use the tokens of `design/DESIGN.md` only (soft canvas, floating `surface` cards with `--bb-radius-card` and `--bb-shadow-soft`, one violet accent, Day and Night through `data-theme`). It SHALL NOT use a hard-coded colour, a font or a size that a token covers. The one literal breakpoint is 720 px, as in the other pages.
7. THE page SHALL have no primary (near-black) pill. The Listen action arrives in a later spec, and a screen without a primary action does not use that pill (`design/DESIGN.md`, Components, Pills). The sound chips and the side control are the main action of the screen.
8. THE header SHALL have a secondary pill link "Band simulator" with `href="/band.html"`. It SHALL be reachable by keyboard and take the standard focus ring.
9. THE footer SHALL state the aid sentence verbatim: "Banshee Band is an aid, not a safety device. It can miss or misread sounds, so keep your smoke alarms and other certified alerting devices." It SHALL keep a muted link to `/styleguide.html`.
10. THE title block SHALL say, in plain words, that the sounds are recorded sample clips, that no microphone is used on this screen yet, and that no band is connected so the band is shown on screen.
11. THE build SHALL still list `index.html` as an input (`vite.config.ts` needs no change). `bun run build` SHALL pass.

### Requirement 3: Status pill

**User story:** As a user, I want to see at a glance which output is active, so that I know how an alert will reach me.

#### Acceptance criteria

1. THE status pill SHALL use the status pill classes of `design/DESIGN.md` and SHALL carry the state in its text and in the shape of its glyph, not in its tint.
2. WHEN `createPhoneOutput().available()` is false, read once at load, THE pill SHALL read "Band not connected" with the open circle glyph and the neutral tint.
3. WHEN it is true, THE pill SHALL read "Phone vibration fallback" with the triangle glyph and the neutral tint.
4. WHEN the sound model cannot be loaded, THE pill SHALL read "Problem" with the cross glyph and the strong tint, and the Try a sound card SHALL say in plain words that the model could not be loaded and that the page can be reloaded to try again. THE page SHALL NOT retry by itself. A later chip click tries to load the model again, and a successful load returns the pill to its first state and clears the message.
5. THE pill SHALL be a polite `role="status"` element. Its text SHALL change only in the cases of criteria 2 to 4.
6. THE band simulator on the page SHALL always be available, so the output list of a run is always the simulator, plus the phone when `available()` is true.

### Requirement 4: Try a sound

**User story:** As a user with no microphone, I want to click one sound and see the whole chain work, so that I can judge what the product does.

#### Acceptance criteria

1. THE Try a sound card SHALL show one chip for each clip of `loadManifest()` (read through `src/audio`), in manifest order, with the label `CLASS_NAMES[clip.class]` ("Knock", "Doorbell", "Alarm", "Baby", "Vehicle", "Voice") and a 24 px low-urgency ghost glyph (`createGlyph`) of that class. A chip is a `<button type="button">` and a secondary pill, at least 44 px high and wide.
2. THE card SHALL have a side control with the three options "Left", "Centre" and "Right", as native radios named `side` inside a `<fieldset>` with the legend "Side", default "Centre". Arrow keys SHALL move it and changing it SHALL play nothing. The selected option SHALL differ from the others by more than colour (a check glyph and an accent tint, as on the band simulator page).
3. THE card SHALL say in one muted sentence that the side is simulated: the clip is copied to two channels with a small delay, as if the sound came from that side.
4. WHEN a chip is activated by click, Enter or Space, THE station SHALL start a run for that clip and the chosen side (Requirement 10). No microphone permission, no key and no other click SHALL be needed.
5. WHILE a run is in progress, THE chips SHALL have `aria-disabled="true"` and a click on them SHALL do nothing. They SHALL NOT use the `disabled` attribute, so keyboard focus is not lost. THE card SHALL show the text "Listening to the clip" in a polite live region for that time. WHEN the sound model is loading for the first time, the text SHALL be "Loading the sound model".
6. THE sound model SHALL be loaded with `createClassifier()` on the first activation of a chip, not before. Nothing SHALL load a model, create an `AudioContext` or ask for a microphone on page load. The clip list and the page text SHALL appear without the model.
7. WHEN a run fails, THE live region SHALL say why in plain words and no ghost, row or pattern SHALL be added: "The clip could not be loaded." (`clip-load-failed`), "The clip could not be read." (`clip-unreadable`), "The sound could not be classified." (`classify-failed`), "The sound could not be turned into an alert." (the event did not validate). It SHALL NOT include a URL, a stack trace or a raw error message.
8. WHEN the manifest cannot be loaded, THE card SHALL say "The sample clips could not be loaded." and show no chip. The rest of the page SHALL still render.
9. THE chips SHALL NOT play any sound. Nothing in the station produces audio.

### Requirement 5: Clip to samples

**User story:** As a developer, I want the clip bytes turned into samples by a pure function, so that it is tested without a browser.

#### Acceptance criteria

1. THE module SHALL export `decodePcm16kWav(bytes: ArrayBuffer | Uint8Array): Float32Array | null` from `src/station/wav.ts`. It returns the samples of a RIFF/WAVE file with PCM format 1, one channel, 16000 Hz and 16 bits, each sample as `int16 / 32768`. It walks the chunks (so a `LIST` chunk before `data` is skipped, with the pad byte of an odd chunk), and reads at most the bytes that exist if the `data` chunk claims more.
2. THE function SHALL return `null`, and SHALL NOT throw, for anything else: no RIFF/WAVE header, no `fmt ` or `data` chunk, another format, two channels, another rate, another bit depth, a file shorter than the header, or an empty `data` chunk. It SHALL NOT resample.
3. THE function SHALL NOT keep or change its input.

### Requirement 6: Classification of a clip

**User story:** As a user, I want one answer per clip, so that a clip with a few odd frames still gives its real class.

#### Acceptance criteria

1. THE run SHALL cut the samples into frames with `createFramer()` (15600 samples, hop 7800) and give every frame to `classifier.classify`, one after the other, in order. A clip with no frame (fewer than 15600 samples) fails with `clip-unreadable`.
2. THE module SHALL export `summariseClassifications(results: readonly Classification[]): Classification | null` from `src/station/summary.ts`. The class is the most frequent class of the frames; on a tie for the most, the class is `'other'`. This is the rule of `tests/classify/clip-run.ts`, and the committed results in `tests/classify/clip-results.json` are the reference. `null` for an empty list.
3. THE label SHALL be the most frequent label among the frames of the winning class (the first one to appear on a tie). THE confidence SHALL be the mean confidence of those frames. WHEN the winner is `'other'` by a tie and no frame is `'other'`, the label and the confidence SHALL come from all frames in the same way.
4. THE module SHALL export `rmsDb(samples: Float32Array): number` and `loudestRmsDb(samples: Float32Array): number`. `rmsDb` is `20 * log10(rms)`, floored at -120 and capped at 0; an all-zero input gives -120; a `NaN` sample gives `NaN` (the event validation of Requirement 9 then rejects it). `loudestRmsDb` is the largest `rmsDb` over windows of 15600 samples that start every 7800 samples and end inside the clip (one window of everything for a shorter clip). The event's `loudnessDb` SHALL be `loudestRmsDb` of the mono clip.
5. THE station SHALL show the YAMNet label and the confidence of the summary exactly as `summariseClassifications` returns them, and SHALL NOT change a class by another rule.

### Requirement 7: Stereo pair for a chosen side

**User story:** As a user, I want the side I pick to travel through the real bearing estimator, so that the ghost's position comes from the DSP and not from a lookup.

#### Acceptance criteria

1. THE module SHALL export from `src/station/stereo.ts`: `SIDE_DELAY_SAMPLES = 3`, `DITHER_AMPLITUDE`, `buildStereo(mono: Float32Array, side: 'left' | 'centre' | 'right'): { left: Float32Array; right: Float32Array }` and `toStereoFrames(pair, sampleRate: number, block?: number): StereoFrame[]`. All are pure and deterministic (no `Math.random`, no clock).
2. FOR `'left'`, THE sound reaches the left microphone first, so the right channel is the clip delayed by 3 samples: `left = [...mono, 0, 0, 0]` and `right = [0, 0, 0, ...mono]`. FOR `'right'` the two arrays are swapped. Both arrays have the length `mono.length + 3`. The sign convention is the one of `src/bearing`: a delayed left channel gives a positive bearing (right), a delayed right channel a negative bearing (left). At 16 kHz, 3 samples is the largest lag the estimator allows (`maxLagSamples`), and it gives a bearing of about 53.5 degrees, well outside the 15 degree centre zone of `sideOf`.
3. FOR `'centre'`, THE delay SHALL be 0. Both arrays have the length `mono.length`. Because `estimateBearing` reports bit-identical channels as source `'loudness'` with confidence 0, and `sideOf` then says `'unknown'`, each channel SHALL get its own deterministic dither: uniform values in [-`DITHER_AMPLITUDE`, `DITHER_AMPLITUDE`] from a seeded linear congruential generator, one seed per channel, so the channels differ. The first value of `DITHER_AMPLITUDE` is `1e-4` (-80 dBFS). If the measurement of Requirement 8.3 fails with it, the builder raises it to `1e-3` and then `1e-2`, and writes the chosen value and the reason in the doc comment.
4. THE function SHALL NOT change `mono`, SHALL return new arrays, and SHALL give the same result for the same input. An empty `mono` gives two empty arrays for every side.
5. `toStereoFrames` SHALL cut the pair into frames of `block` sample frames (default `STEREO_BLOCK`, 1024), the last one shorter, each a `StereoFrame` with `sampleRate`, `startSample` (0, 1024, 2048, ...), `startSec = startSample / sampleRate`, and `left` and `right` of equal length. A pair of 2500 samples at 16000 Hz gives three frames of 1024, 1024 and 452 samples.

### Requirement 8: Bearing from the stereo pair

**User story:** As a user, I want an honest side: when the estimator is not sure, the station must say so, and it must never show the wrong side.

#### Acceptance criteria

1. THE run SHALL push the frames of `toStereoFrames(buildStereo(mono, side), 16000)` into `createBearingWindow()` and read `result()`. It SHALL use the real estimator with its default configuration and SHALL NOT replace, scale or round the result. The result is a `BearingResult`: `bearingDeg`, `source`, `confidence`.
2. THE side shown SHALL be the one `sideOf(event, bearing.confidence)` returns: `'left'`, `'centre'`, `'right'` or `'unknown'`. The station SHALL NOT compute a side from the chosen side or from the bearing by another rule. WHEN the estimator is not confident, the ghost, the list, the pattern and the pipeline view SHALL all say "Side unknown".
3. A test on the real clips (`tests/station/clips.test.ts`) SHALL measure, with the real `buildStereo`, `toStereoFrames` and `estimateBearing`, every clip of the manifest for `'left'` and `'right'` and the Knock clip also for `'centre'`, and SHALL assert: (a) for Knock, `'left'` gives side `'left'`, `'right'` gives `'right'` and `'centre'` gives `'centre'` (source `gcc-phat`, confidence at least 0.8); (b) for every clip and every chosen side, the side is either `'unknown'` or the chosen side, never the opposite one; (c) `loudestRmsDb` of every clip is at least -50 (the default loudness threshold of the haptic engine). The test SHALL print one line per clip and side with the side, the bearing and the confidence, and the builder SHALL copy that table into `design.md`.
4. IF (a) cannot be met for Knock, THEN the builder SHALL stop and report the measured values before changing a constant other than `DITHER_AMPLITUDE`, and SHALL NOT weaken the test or `sideOf`.

### Requirement 9: Pipeline module (classification and bearing to event)

**User story:** As a developer, I want one pure place that decides what an event is, so that nothing invalid reaches the haptic engine or the ghosts.

#### Acceptance criteria

1. THE module SHALL export from `src/station/pipeline.ts`: `URGENCY_BY_CLASS`, `buildEvent(input)` and `processEvent(input, engine)`.
2. `URGENCY_BY_CLASS` SHALL be exactly: `alarm` high, `baby` high, `doorbell` medium, `knock` medium, `vehicle` medium, `voice` low, `other` low. It SHALL be frozen, and a test SHALL check it with these literals and that every `SoundClass` has an entry.
3. `buildEvent({ classification, bearing, loudnessDb, nowMs, id })` SHALL return `{ ok: true, event, bearingConfidence }` or `{ ok: false, errors }`. The event is `{ id, t: nowMs, class: classification.class, label: classification.label, confidence: classification.confidence, bearingDeg: bearing.bearingDeg, bearingSource: bearing.source, loudnessDb, urgency: URGENCY_BY_CLASS[classification.class] }`. `bearingConfidence` is `bearing.confidence`, unchanged.
4. THE result SHALL be `ok: true` exactly when `validateSoundEvent` accepts the event, and the returned event SHALL be the one the validator returns. `errors` are the validator's messages. A `NaN` or positive `loudnessDb`, an empty label, a confidence outside 0 to 1, a bearing out of range, a bearing with source `'none'` (or none with a bearing) and an unknown class all give `ok: false`. The function SHALL NOT repair a value, and SHALL NOT throw for any input, including `undefined`, a missing field or a hostile getter.
5. `processEvent(input, engine)` SHALL call `buildEvent`. WHEN the result is `ok: false`, THE engine's `decide` SHALL NOT be called and the result SHALL be `{ ok: false, errors }`. WHEN it is `ok: true`, `decide` SHALL be called exactly once with `{ event, bearingConfidence }` and `input.nowMs`, and the result SHALL be `{ ok: true, event, bearingConfidence, decision }`.
6. THE urgency SHALL depend on the class only. THE bearing confidence SHALL be passed to the engine and, by the station, to the ghost field, unchanged, so that `sideOf` gives the same answer to both.
7. Unit tests with literal values and property tests (`fast-check`, fixed seed, at least 100 runs each) SHALL cover: the literal event of Requirement 9.3 for a Knock input; each class's urgency; for any valid input an event that `validateSoundEvent` accepts and `decide` called once; for any input with a non-finite or positive loudness, a spy engine called zero times; for any input at all (including junk), no throw and `ok` equal to the validator's verdict.

### Requirement 10: Run and outputs

**User story:** As a user, I want one click to drive every output, and to see why a buzz did not play.

#### Acceptance criteria

1. THE module SHALL export `runSound(deps, clipId, side)` from `src/station/runner.ts`, with the dependencies injected: `loadClip(id): Promise<ArrayBuffer>`, `classifier` (`classify(frame)`), `engine` (a `HapticEngine`), `outputs` (a list of `HapticOutput`), `now(): number` (default `performance.now()` in the station) and `epoch(): number` (default `Date.now()`). The runner SHALL NOT touch the DOM. It returns a `RunResult` (Requirement 13) or `{ ok: false, code }` with the code of Requirement 4.7.
2. THE runner SHALL run the stages in this order: `waveform` (load the bytes, `decodePcm16kWav`, `waveformPeaks`), `label` (frames, `classify`, `summariseClassifications`), `bearing` (`buildStereo`, `toStereoFrames`, `createBearingWindow`, `result`), `pattern` (`loudestRmsDb`, `processEvent`), `band` (play the command on every output). Each stage SHALL read the clock exactly once before its work and once after it, in that order, and nothing else SHALL read it. The stage time is the difference. A test with a scripted clock SHALL check the five times and the order.
3. THE event's `t` SHALL be the clock value read at the start of the `pattern` stage. Its `id` SHALL be `station-<n>` with `n` counting runs from 1.
4. THE station SHALL create its engine with `createHapticEngine({ rateLimitMs: 0 })`. A click is a deliberate action, and the default 3000 ms rate limit would swallow a second click on the same sound. All other settings are the defaults (all classes on, -50 dBFS, intensity 1).
5. WHEN `decide` returns `play`, THE `band` stage SHALL call `play(command)` on every available output: the simulator always, and the phone output when `available()` is true. WHEN it returns `drop`, no output SHALL be called, and the result SHALL carry the reason. THE reasons SHALL be shown in plain words: `no-pattern` "This sound has no vibration pattern", `too-quiet` "Too quiet to buzz", `lower-priority` "A stronger alert is still playing", `disabled-class` "This sound is switched off", `rate-limited` "Played a moment ago". A dropped event SHALL still get its ghost and its row.
6. WHEN the event is valid, THE station SHALL call `ghostField.show({ event, bearingConfidence })`, add the row (Requirement 11), update the latest alert (Requirement 12) and fill the pipeline view (Requirement 13), whatever the decision.
7. WHEN the event is not valid, THE station SHALL NOT show a ghost, add a row or play anything, and SHALL show the message of Requirement 4.7.
8. A run SHALL NOT stop a command that is already playing, except through the engine's own priority rule.

### Requirement 11: Event list

**User story:** As a user, I want a short, scannable list of what happened, so that I can read the last few sounds in a glance.

#### Acceptance criteria

1. THE card "Recent sounds" SHALL hold a `<ul>` with one `<li>` per sound, newest first, at most 10. A sound over 10 pushes the oldest out.
2. EACH row SHALL show, in this order: the ghost glyph (`createGlyph(class, urgency)`) inside a 48 px round `surface-raised` tile; the class name (`CLASS_NAMES`) in `body` weight 600, with the side word under it in muted `caption`; and on the right an urgency pill (Low in the neutral tint, Medium in the accent tint, Urgent in the strong tint, the word always shown) and the time as `HH:MM`, 24-hour, local time, with tabular figures.
3. THE side word SHALL be "Left side", "Right side", "Centre" or "Side unknown", from the side of `sideOf`.
4. EACH `<li>` SHALL carry `data-class`, `data-side` (`left`, `centre`, `right` or `unknown`) and `data-urgency`. The row text SHALL read in order as "Knock Left side Urgent 13:36" (class, side, urgency, time) for a screen reader. The glyph is `aria-hidden`.
5. THE row text SHALL NOT contain the event `id`, `confidence`, `loudnessDb` or the bearing in degrees.
6. WHEN the list is empty, THE card SHALL show the single line "No sounds yet. Choose a sound to try." and no row. The empty line SHALL go when the first row is added.
7. THE module SHALL export `formatClock(epochMs: number): string` and `alertText(cls, side, urgency): string` from `src/station/format.ts`. `formatClock` gives "09:05" for 9:05 local time. `alertText` gives "Knock, left side, urgent", "Voice, centre, low", "Baby, side unknown, urgent" and "Doorbell, right side, medium".

### Requirement 12: Latest alert and ghost field

**User story:** As a Deaf or hard-of-hearing user, I want every alert to be seen as a ghost and read as text, so that no single form carries it alone.

#### Acceptance criteria

1. THE station SHALL mount `mountGhostField` from `src/ghosts` in the ghost field card, with the default 8000 ms life, and SHALL NOT change its behaviour. The field's own "Now:" list stays as the text equivalent of the canvas.
2. THE "Latest alert" block SHALL be one element with `aria-live="polite"` and `aria-atomic="true"`. After a run it SHALL hold the text `alertText(class, side, urgency)` ("Knock, left side, urgent") in a large `display`-step class name line with the side and urgency in a `caption` line below, and SHALL change once per run. Before the first run it SHALL say "No sound yet". It SHALL NOT be focusable.
3. EVERY run with a valid event SHALL therefore give a ghost, a pattern (or the reason it did not play) and a text alert. No form SHALL be the only one.
4. THE copy of the station SHALL NOT say that a microphone heard a sound, that the page keeps the user safe, or that it replaces a smoke alarm.

### Requirement 13: Pipeline view

**User story:** As a judge or a curious user, I want to see what each step did and how long it took, so that the chain is visible and not a black box.

#### Acceptance criteria

1. THE pipeline card (heading "Pipeline", full width) SHALL show five stages in a row at 720 px and wider and stacked in one column below it, in this order and with these headings: 1 "Waveform", 2 "Label", 3 "Bearing", 4 "Pattern", 5 "Band". Each stage is a `<section>` (a `surface-raised` tile) with `data-stage` equal to `waveform`, `label`, `bearing`, `pattern` or `band`.
2. EACH stage SHALL show its stage time as text next to its heading, in the form of `formatMs` (Requirement 13.7), and as `data-ms` with the number. Before the first run the text is "— ms" and there is no `data-ms`. After a run, all five SHALL have a finite `data-ms` of 0 or more.
3. THE Waveform stage SHALL draw the clip as an inline SVG of 64 vertical bars (`waveformPeaks(samples, 64)`, each bar's height proportional to the peak of its slice), `aria-hidden`, and SHALL show as text the clip length in seconds ("3.5 s") and the sample rate ("16 kHz").
4. THE Label stage SHALL show the YAMNet label and the score as a percent ("Knock, 67%") and the class name of the summary ("Class: Knock"). THE score text SHALL come from `percentOf` of `src/band`.
5. THE Bearing stage SHALL draw a dial: a half circle from L (left) to R (right) with a needle at the bearing when the side is known, and no needle, a dashed arc and the words "Side unknown" when it is not. It SHALL show the side as text ("Left", "Centre", "Right" or "Side unknown") and the bearing confidence as a percent ("Confidence 93%"). The dial is `aria-hidden`; the text is the content. It SHALL NOT show the bearing in degrees as a promise of precision.
6. THE Pattern stage SHALL show `patternName(command)` and the pulse count (`pulseCount`) when the command played, and the plain reason of Requirement 10.5 when the engine dropped the event ("No buzz: Too quiet to buzz"). WHEN no valid event came out of the run, it SHALL say "Not played".
7. THE Band stage SHALL show which outputs played: "Band simulator" always, and "Phone vibration" when the phone output played; or "No buzz" when nothing played. THE module SHALL export `formatMs(ms: number): string` from `src/station/format.ts`: the value rounded to one decimal below 10 and to a whole number from 10, with " ms" ("0.0 ms", "3.5 ms", "13 ms" for 12.5, "124 ms" for 124.4), and "—" for a value that is not finite or is negative.
8. THE card SHALL keep the result of the latest run until the next one. It SHALL NOT be focusable and SHALL have no `aria-live`; the Latest alert is the one announcement.
9. THE module SHALL export `waveformPeaks(samples: Float32Array, buckets: number): number[]` from `src/station/waveform.ts`: the largest absolute sample of each of `buckets` equal slices (slice `i` covers `floor(i * n / buckets)` up to `floor((i + 1) * n / buckets)`), clamped to 0..1, `NaN` counted as 0, an empty slice 0. It throws a `RangeError` for a `buckets` that is not a positive integer.

### Requirement 14: Ghost polish, eyes

**User story:** As a user, I want the shapes to read as ghosts and not as tombstones or bells.

#### Acceptance criteria

1. EVERY one of the seven paths of `SHAPES` SHALL have two eyes, drawn as the last two subpaths of the path (two closed ovals, each about 2.2 units wide and 3 units high), so that the even-odd fill cuts them as holes. The earlier subpaths are the outer outline first, then any other detail (the Voice mouth). The path of each class SHALL have 3 subpaths, and Voice 4.
2. THE module SHALL export `shapeParts(path: string): { outer: string; details: string[]; eyes: string[] }` from `src/ghosts/outline.ts`, which splits a path at its `M` commands: `outer` is the first subpath, `eyes` the last two, `details` any in between. It is pure and a test SHALL cover it with literals. A path with fewer than three subpaths gives `eyes: []` and `details: []`.
3. THE outline stroke SHALL NOT touch the eyes. The canvas (`draw.ts`) and the glyph (`glyph.ts`) SHALL fill the whole path with the even-odd rule and stroke only `outer` and `details`, so that an urgent outline of 3.5 units does not close an eye. `glyphSpec` SHALL return the whole path as `path` (unchanged for the existing glyph test) and the stroked part as a new `strokePath`.
4. EACH eye SHALL lie fully inside the body and at least 2 units clear of the outline and of every other hole: every pixel within 4 pixels (2 units) of an eye pixel, on the 48 x 48 raster, SHALL be filled in the raster of `outer` and `details` without the eyes. EACH eye SHALL fill between 12 and 48 pixels of the raster, and the two eyes of one ghost SHALL be at least 2.5 units apart (centre to centre) and not overlap.
5. ALL existing shape rules SHALL still hold: only the commands `M L H V C Q Z`, every point inside [2, 22], a filled area of 10% to 80% of the box, and every one of the 21 pairs differing in at least 8% of the 2304 pixels (the existing `tests/ghosts/shapes.test.ts`, unchanged). The eyes SHALL NOT be the reason two classes differ: the outlines still tell the classes apart.
6. THE eyes SHALL meet the contrast of the ghost fill: they show the card surface through the hole, so the existing pair "Ghost fill on card" (3.80 Day, 13.76 Night) is the pair that applies. No new colour is added.
7. THE docs SHALL match: `design/DESIGN.md` (Ghosts) replaces "The ghosts have no eyes, so every difference is in the outline" with a sentence that every ghost has two eyes cut as holes and that every difference is still in the outline, and drops "and no feature" from the Other row. The doc comment of `src/ghosts/shapes.ts` and the lines of `.kiro/specs/ghost-renderer/` that say "no eyes" or "no feature" (`requirements.md` 2.4; `design.md` the Other row, the "ghosts have no eyes" rule and its mention in the module notes) SHALL be changed in the same change. `tests/ui` SHALL pass.

### Requirement 15: Ghost polish, dashed outline

**User story:** As a user, I want the "side unknown" outline to look clean at every urgency, so that it reads as dashed and not as a striped edge.

#### Acceptance criteria

1. THE dash pattern SHALL scale with the outline width. The module SHALL export from `src/ghosts/outline.ts`: `pathLength(path: string): number` (the length of the subpaths of a path in 24-unit box units, curves flattened in at least 16 steps each, closing segments included), and `dashFor(outlineWidth: number, lengthUnits: number): [number, number]`.
2. `dashFor` SHALL choose a whole number of dash periods around the outline so that no stub is left at the start: `count = max(3, round(lengthUnits / (6 * outlineWidth)))`, `period = lengthUnits / count`, `on = period * 2 / 3`, `off = period / 3`. A square outline of length 40 at width 1.5 gives count 4 (40 / 9 = 4.4), `[6.667, 3.333]`; at width 3.5 it gives count 3 (40 / 21 = 1.9, so the minimum), `[8.889, 4.444]`. Literal tests SHALL cover these and an invalid input (a width or length that is not a positive finite number gives `[0, 0]`, meaning a solid line, and never throws).
3. THE uncertain ghost SHALL be drawn with the dash on the outer outline only, with butt caps and the faint solid trace under it as now. The other subpaths (the Voice mouth) SHALL be stroked solid, because a dash on a short subpath looks striped. `DASH_UNITS` SHALL be removed from `src/ghosts/constants.ts` and replaced by `DASH_PERIODS_PER_WIDTH = 6` and `DASH_MIN_COUNT = 3`; `tests/ghosts/constants.test.ts` SHALL be updated for them.
4. FOR all seven shapes at all three urgencies, a test SHALL assert with the real outer lengths: `off` is at least 1.5 times the outline width; the dash count is between 3 and 8; the count does not grow with urgency (low >= medium >= high), and the urgent count is at most 4.
5. THE docs SHALL match: `design/DESIGN.md` (Ghosts, Uncertain) says the outline is a few long dashes (about 3 to 8 around the outline, fewer as the outline gets heavier), and the lines of `.kiro/specs/ghost-renderer/` that name `DASH_UNITS` or the `[3, 2]` pattern (`requirements.md` 9.1; `design.md` the constants table and the drawing steps) SHALL be changed in the same change.

### Requirement 16: Privacy and network

**User story:** As a user, I want to know that nothing leaves my device.

#### Acceptance criteria

1. DURING a page load and a run, THE page SHALL make no request to any other origin than its own. THE only requests SHALL be GET requests for the app's own files, `/clips/manifest.json`, `/clips/<file>.wav` and `/models/yamnet/*`.
2. THE page SHALL NOT use `getUserMedia`, `AudioContext`, `navigator.bluetooth`, `localStorage`, `sessionStorage`, cookies or `IndexedDB` in `src/station/`. THE sound log is not part of this round.
3. THE station SHALL NOT write audio, samples, spectra or the clip bytes to the console or to the DOM. The waveform is 64 numbers.
4. A Playwright test SHALL record every request of a page load plus one run and fail on any request outside the list of criterion 1, and on any console error, console warning or page error. IF the TF.js library writes a console warning that the page cannot avoid, THE test MAY allow that exact message and SHALL say why in a comment; it SHALL NOT filter by severity.

### Requirement 17: Accessibility and motion

**User story:** As a Deaf or hard-of-hearing user, I want the screen to work by keyboard and to stay calm.

#### Acceptance criteria

1. THE tab order SHALL be: brand link, "Band simulator" link, Day and Night buttons, the side radios (one stop, arrow keys inside), the six chips, and the footer links. The ghost field, the Latest alert, the list rows, the pipeline stages and the simulator SHALL hold no focusable element.
2. EVERY interactive element SHALL have the visible focus ring of the design tokens and a target of at least 44 px in both directions.
3. UNDER `prefers-reduced-motion: reduce`, THE station SHALL start no animation: no CSS animation or transition runs (`document.getAnimations()` is empty after a run), the ghost field's own motion rules apply, and the result is shown by static changes (position, size, outline, text).
4. THE station SHALL add no `@keyframes` outside `@media (prefers-reduced-motion: no-preference)`. Nothing SHALL flash more than 3 times per second.
5. EVERY colour pair the station adds SHALL come from the existing contrast table of `design/DESIGN.md` (text on card, muted on card, text on tile, muted on tile, status pill pairs, ghost fill on tile, accent on tile). A new pair, if one is needed, SHALL be added to the table and to `tests/ui` in the same change.
6. THE needle, the arc and the bars of the pipeline view, and the glyphs of the list, SHALL be `aria-hidden` and SHALL always have their value as text beside them.
7. THE copy SHALL be plain: no spooky wording in alerts, statuses, errors or controls.

### Requirement 18: Tests and gates

**User story:** As the maintainer, I want the chain proven by tests that fail first and a gate that closes the feature.

#### Acceptance criteria

1. EVERY pure module SHALL have unit tests with literal values where this spec fixes them (Requirements 5 to 9, 11.7, 13.7, 13.9, 14.2, 15.2) and property tests where it says so. Tests mirror source paths (`tests/station/wav.test.ts`, and so on).
2. A Playwright spec `e2e/station.spec.ts` SHALL have this Given/When/Then test: *Given* the first screen, *When* I choose side "Left" and click "Knock", *Then* a ghost appears on the left (the ghost field list has an item with `data-class="knock"`, `data-side="left"` and `data-x` below 0.5), the Recent sounds list shows "Knock" in its first row, the left motor of the band simulator buzzes (a recorded history of the left motor's `data-level` reaches 75 and stays above the right motor's maximum, which stays above 0), and the pipeline view shows five stage times (five stages with a finite `data-ms`).
3. THE same spec SHALL have: a test that clicks every chip in manifest order (the manifest read through the test's request context) and asserts that the first row of the list has `data-class` equal to the manifest's `class` for that clip (the classifier runs in the browser; the model is loaded once; timeout of at least 120 s); a test that every request of a page load plus a run is allowed by Requirement 16.1 and that there is no console error, warning or page error; a keyboard test (Tab reaches the chips in order; Enter and Space on a chip run it; arrow keys move the side control and play nothing); a reduced-motion test (Requirement 17.3); a layout test at 1440 px (the ghost field card is left of the Recent sounds card, taller than or as tall as 480 px, the pipeline card is below both and as wide as the content) and at 390 px (no horizontal scroll, ghost field above the list, chips within the lower 45% of the viewport); a test that the "Band simulator" link has `href="/band.html"` and leads to a page with the heading "Band simulator"; a test for the empty states ("No sounds yet. Choose a sound to try.", "— ms" five times); and a test that a failed clip request shows "The clip could not be loaded." and adds no row.
4. THE spec SHALL save screenshots at 1440 px in Day and at 390 px in Night, after a Knock run with side Left, with `reducedMotion: 'reduce'`: `e2e/screenshots/station-1440-day.png` and `e2e/screenshots/station-390-night.png`. The builder SHALL look at each one against `design/DESIGN.md` and fix mismatches before the gate.
5. `bun run typecheck`, `bun run test`, `bun run e2e` and `bun run build` SHALL all pass, and the existing e2e specs (`styleguide`, `band`, `ghosts`, `audio-capture`) SHALL still pass. The ghost and styleguide screenshots change because of Requirements 14 and 15; they are regenerated and looked at.
6. `design/DESIGN.md` (Screens, Listening station) SHALL be updated in the same change to describe the round 1 screen (Try a sound card in place of the primary pill, Latest alert and Recent sounds, simulator in the right column, the five-stage pipeline card, the phone bar), and `.kiro/steering/structure.md` SHALL list `src/station/` and its files and say that `index.html` is the station page. THE Rules section of `structure.md` SHALL change only by one line: `src/station` sits with `ui` and nothing but `src/main.ts` imports it.

## Out of scope

A later spec covers these. This one SHALL NOT start them, and its tests SHALL NOT depend on them.

- The live microphone "Listen" path, the Start listening and Stop listening primary pill, and the permission and onboarding flow.
- The PWA manifest, the service worker and the offline cache.
- WebGL versus CPU backend timing, and any claim about which TF.js backend runs.
- Onset-to-output latency (the stage times are step durations on a clip, not the delay between a sound and a buzz).
- Settings (class switches, loudness threshold, intensity), the Bluetooth band and the sound log with the MCP server.
- The Pipeline view and Settings screens as separate pages, and the bottom tab bar.
