# Requirements: Haptic outputs

## Introduction

`src/haptics` decides what to play: a `HapticCommand` with `segments` (`{ ms, left, right }`, motor levels 0..1, alternating pulse and rest, starting and ending with a pulse), a `vibrate` array, `totalMs`, `side` and `sideKnown`. This feature plays that command. It adds the output side in `src/band/`: one output interface, a timed segment player, a phone output that wraps `navigator.vibrate`, and a software band simulator. It also adds a page, `band.html`, that shows the simulator and lets a new wearer feel each pattern.

The Bluetooth band is a later feature (`band-ble-protocol`). It will implement the same interface. This feature does not stub it, and the page has no Connect band pill yet.

The band is an aid and not a safety device. The simulator and the phone vibration are two forms of one alert, and no form is the only one (see `.kiro/steering/accessibility.md`).

Terms:

- **Command**: a `HapticCommand` from `src/haptics`.
- **Output**: an object that implements `HapticOutput` (Requirement 1).
- **Segment player**: the timer logic that walks the segments of a command and reports motor levels at each segment start (Requirement 2).
- **Levels**: `{ left, right }`, each in [0, 1].
- **Scheduler**: `{ setTimeout, clearTimeout }`, injected into the segment player so that tests use a fake clock.
- **Simulator**: the UI component made by `mountBandSimulator` (Requirements 4 to 6).
- **Motor card**: the card of the simulator that shows one motor.
- **Pattern timeline**: the card of the simulator that names the pattern and draws its segments.
- **Side text**: the plain words for the side of a command (Requirement 5.2).
- **Feel a pattern card**: the card of the page where the user chooses a class and a side and plays the real pattern (Requirement 8).
- **Playing**: a command is playing from the call of `play` until the final 0/0 emission, or until `stop` or a newer `play`.

## Requirements

### Requirement 1: Module boundaries and the output interface

**User story:** As a developer, I want every output to implement one interface, so that `haptics` never knows which output is active and the Bluetooth band can be added later without a change elsewhere.

#### Acceptance criteria

1. THE module SHALL export from `src/band/index.ts` the interface `HapticOutput`: `{ kind: 'simulator' | 'phone'; available(): boolean; play(command: HapticCommand): void; stop(): void }`. `HapticCommand` is the type of `src/haptics`.
2. THE files in `src/band/` SHALL import only from `src/events`, `src/haptics` (types and pure functions), files in `src/band/`, and CSS files. They SHALL NOT import from `audio`, `classify`, `bearing`, `ghosts`, `ui` or `mcp`.
3. NO file in `src/haptics/` SHALL import from `src/band/`. The existing boundary test of `src/haptics` already enforces this, and it SHALL keep passing.
4. THE module SHALL NOT use `fetch`, `XMLHttpRequest`, `WebSocket`, `navigator.bluetooth`, `console`, `Math.random` or `Date` in `src/band/` code, and SHALL NOT add a stub or a placeholder for the Bluetooth output. The `kind` union has the two values of this feature only. The BLE feature extends it.
5. EVERY exported function, constant and type of `src/band/` SHALL have a short doc comment. The comment in `src/band/index.ts` SHALL state that outputs play a command that `haptics` has already decided on, and that the band is an aid and not a safety device.
6. NO output SHALL modify the command it receives. THE command and its arrays SHALL be treated as read-only.
7. A test SHALL scan `src/band/*.ts` (comments removed) and fail on any import other than the allowed ones and on the forbidden identifiers of criterion 4.

### Requirement 2: Segment player

**User story:** As a developer, I want one tested component that turns a command into timed motor levels, so that the simulator (and later the band) shows exactly what the engine decided, at the right time.

#### Acceptance criteria

1. THE module SHALL export `createSegmentPlayer(onLevels, scheduler)` from `src/band/segment-player.ts`. `onLevels` is a function that takes `{ left, right }`. `scheduler` is `{ setTimeout, clearTimeout }` with the signatures of the globals.
2. THE player SHALL return `{ play(command), stop() }`. It SHALL NOT read a clock, and SHALL NOT call the global `setTimeout` or `clearTimeout`. It SHALL use only the injected scheduler.
3. A module-level default scheduler SHALL be exported for browser code (`browserScheduler`). It SHALL look up `globalThis.setTimeout` and `globalThis.clearTimeout` at the time of each call, and not when the module loads, so a clock that a test installs later still controls the player.
4. WHEN `play(command)` is called, THE player SHALL emit the levels of each segment at the segment's start offset. The start offset of segment `i` is the sum of the `ms` of segments `0` to `i - 1`. The first segment has offset 0 and SHALL be emitted before `play` returns. Every later offset SHALL be scheduled at once, with one `setTimeout(fn, offset)` per segment, measured from the call of `play`. Segments SHALL NOT be chained, so that a timer that fires late does not shift the later segments.
5. THE player SHALL emit `{ left: 0, right: 0 }` at offset `command.totalMs`. This emission is the end of the command.
6. UNDER a fake clock, EVERY emission SHALL occur at exactly its offset. IN a browser, every emission SHALL occur within 50 ms of its offset (the timer resolution and the main thread decide the rest).
7. WHEN `play` is called while a command is playing, THE player SHALL cancel every pending timer of the old command first and SHALL NOT emit the 0/0 of the old command. It SHALL then start the new command as in criterion 4. The engine has already decided the preemption, so the player does not compare priorities.
8. WHEN `stop()` is called while a command is playing, THE player SHALL cancel every pending timer and emit `{ left: 0, right: 0 }` once. WHEN `stop()` is called and nothing is playing (never played, already ended or already stopped), THE player SHALL emit nothing.
9. AFTER a command ends or is stopped, THE player SHALL emit nothing more for that command, whatever the scheduler does.
10. WHEN a command has no segments, THE player SHALL emit `{ left: 0, right: 0 }` once, before `play` returns, and SHALL schedule nothing.
11. THE player SHALL pass `left` and `right` to `onLevels` as given in the segment. It SHALL NOT clamp, scale or round them. THE player SHALL NOT throw if `onLevels` throws; the error SHALL NOT stop the later emissions.
12. THE player SHALL emit fresh `{ left, right }` objects, so a caller that keeps or changes one cannot change the next.

### Requirement 3: Phone output

**User story:** As a user with a phone and no band, I want the phone to buzz the rhythm of the sound, and to stay quiet when I turned the strength to zero.

#### Acceptance criteria

1. THE module SHALL export `createPhoneOutput(nav?)` from `src/band/phone-output.ts`. It SHALL return a `HapticOutput` with `kind` `'phone'`. `nav` is an optional object `{ vibrate?: unknown }`, used by tests. When it is missing, the output SHALL use `globalThis.navigator`, looked up at the time of each call.
2. `available()` SHALL return `false` when `navigator` is missing or `navigator.vibrate` is not a function, and `true` otherwise. It SHALL NOT call `vibrate`.
3. WHEN the output is available and not every segment of the command has `left` and `right` equal to 0, `play(command)` SHALL call `navigator.vibrate(command.vibrate)` exactly once, with the array of the command unchanged (same values, same order, no copy that differs).
4. WHEN every segment of the command has `left` 0 and `right` 0 (the user set the strength to 0), `play(command)` SHALL NOT call `navigator.vibrate`. The user turned strength to zero, and a phone that buzzes at full strength would ignore that choice. The decision is recorded in `design.md`.
5. `stop()` SHALL call `navigator.vibrate(0)` when the output is available. It SHALL NOT call it when `navigator.vibrate` is missing.
6. WHEN `navigator.vibrate` is missing, `play` and `stop` SHALL do nothing and SHALL NOT throw.
7. WHEN `navigator.vibrate` throws, `play` and `stop` SHALL catch the error and SHALL NOT throw. The output SHALL NOT log it.
8. THE phone output SHALL ignore the return value of `navigator.vibrate`. The browser may refuse a call that has no user activation. That is not an error of this module.
9. THE phone has no side or strength control. The phone output SHALL NOT try to encode side or level in the array. The rhythm alone identifies the class (`.kiro/steering/pattern-language.md`).

### Requirement 4: Band simulator, motor cards

**User story:** As a user, I want to see what each wrist motor does, with the strength written as a number, so that I do not need a band or good eyesight to follow it.

#### Acceptance criteria

1. THE module SHALL export `mountBandSimulator(container: HTMLElement)` from `src/band/simulator.ts`. It SHALL return `{ output, destroy }`. `output` is a `HapticOutput` with `kind` `'simulator'`, and its `available()` SHALL always return `true`.
2. THE simulator SHALL render, inside `container`, a left motor card and a right motor card. Each card has a visible heading ("Left motor", "Right motor"), the level as a display number in percent with a `%` unit in muted caption type (for example `80` and `%`), and a decorative bar.
3. THE percent SHALL be the level times 100, rounded to the nearest integer. A level of 0 SHALL show `0`. The bar fill SHALL follow the same percent.
4. EACH motor card SHALL have the attribute `data-motor` (`left` or `right`) and `data-level` with the integer percent as text (for example `"100"`). The number in the DOM text and `data-level` SHALL always agree.
5. THE bars SHALL be hidden from assistive technology (`aria-hidden="true"`). The number and the heading carry the value.
6. WHILE nothing is playing, both cards SHALL show 0.
7. THE simulator SHALL create its levels from the segment player (Requirement 2) with the browser scheduler, and its `output.play(command)` SHALL start the player. Its `output.stop()` SHALL stop the player, which sets both cards to 0.
8. THE motor cards SHALL NOT be interactive and SHALL NOT be in the tab order.
9. `destroy()` SHALL stop the player without announcing, cancel every timer, and remove everything the simulator added to `container`. After `destroy`, `output.play` and `output.stop` SHALL do nothing and SHALL NOT throw. Calling `destroy` twice SHALL NOT throw.
10. MOUNTING twice into two containers SHALL give two independent simulators.

### Requirement 5: Band simulator, pattern timeline and side text

**User story:** As a user, I want the pattern named in plain words, with the side stated, so that I know what I felt and from where, also when I could not look.

#### Acceptance criteria

1. THE simulator SHALL render a pattern timeline card beneath the motor cards. It SHALL name the pattern in text: the class label, then the side text (for example "Knock, left stronger").
2. THE side text SHALL be, for the side of the command: `'left'` gives "left stronger"; `'right'` gives "right stronger"; `'centre'` gives "both motors, centre"; `'unknown'` gives "Side unknown, both motors equal". The strings SHALL be exactly these.
3. THE class label SHALL be the class name with a capital first letter (Knock, Doorbell, Alarm, Baby, Vehicle, Voice).
4. THE timeline SHALL draw two lanes, labelled `L` and `R`, over the range 0 to `totalMs`. Each pulse segment SHALL be a mark whose start and width are proportional to its start offset and `ms`. A rest segment is a gap. The height of a mark SHALL follow the level of that motor in that segment, so a stronger motor has a taller mark. The lanes SHALL be drawn as one SVG that is `aria-hidden="true"`.
5. THE timeline SHALL show the scale as text: `0 ms` at the start and `<totalMs> ms` at the end.
6. THE timeline SHALL also state in text how many pulses the pattern has and its length, for example "3 pulses, 240 ms". The pulse count is the number of segments with a level above 0 in either motor, or, for a command with all levels at 0, the number of segments at even index.
7. WHEN the side is `'unknown'`, THE simulator SHALL show it differently from `'centre'` by more than colour: its own words (criterion 2), its own glyph (a question-mark glyph, against a centre glyph that is not a question mark), and a dashed outline on both motor cards. Under `'centre'` and the two known sides, the motor cards SHALL have a solid outline or none. The state SHALL be in the DOM as `data-side` (`left`, `right`, `centre` or `unknown`) on the simulator root.
8. EVERY side SHALL have a glyph next to the side text, drawn as inline SVG with `aria-hidden="true"`: a left arrow, a right arrow, a centre mark and a question mark. The words carry the meaning.
9. WHEN no command has played yet, THE timeline card SHALL say "No pattern yet" and both lanes SHALL be empty. `data-side` SHALL be absent.
10. AFTER a command ends (the final 0/0), THE timeline SHALL keep showing the last pattern, and the motor cards SHALL show 0. A `stop` SHALL do the same.
11. A new `play` SHALL replace the pattern name, side text, glyph, lanes and `data-side` at once, and SHALL NOT leave parts of the old pattern on screen.

### Requirement 6: Band simulator, announcement, motion and keyboard

**User story:** As a screen-reader user or a user who prefers less motion, I want the simulator to tell me what happened once, and to stay still when I ask for that.

#### Acceptance criteria

1. THE simulator SHALL contain one `aria-live="polite"` region. WHEN `output.play(command)` is called, THE region text SHALL be set once to the pattern name and side text, for example "Knock, left stronger". It SHALL NOT change at each segment, and SHALL NOT change when the command ends or is stopped.
2. THE live region text SHALL be set again for a second `play` with the same pattern and side, so a user who plays the same pattern twice hears it twice. (The implementation may clear the region and set the text again in the next browser task. It SHALL NOT use sound.)
3. THE motor levels and the pattern name SHALL be in the DOM as text, not only in canvas or SVG. THE number in each motor card SHALL update at each segment start, also under reduced motion.
4. UNDER `prefers-reduced-motion: reduce`, THE bars SHALL change without transitions (`transition: none`). The numbers SHALL still update. NO animation of the simulator SHALL run under reduced motion.
5. WHEN motion is allowed, THE bars MAY use `transition-duration: var(--bb-motion-fast)`. No `@keyframes` animation SHALL be used in the simulator. The numbers SHALL never lag behind a transition.
6. THE simulator SHALL use only design tokens (`var(--bb-...)`) for colour, radius, spacing, type and motion. It SHALL work in Day and Night.
7. THE simulator SHALL NOT contain an element that is focusable, so it does not change the tab order of its page. The simulator SHALL NOT use sound for any feedback.
8. THE colours of the text, the numbers, the lane marks, the bars and the dashed outline SHALL meet WCAG AA against the surface they sit on: 4.5:1 for text and 3:1 for marks, bars and outlines, in Day and Night, using the pairs of the contrast table of `design/DESIGN.md`.

### Requirement 7: Band simulator page

**User story:** As a user, I want a page where I can see the band simulator and learn what the band feels like, with plain words about whether my phone can vibrate.

#### Acceptance criteria

1. THE repository SHALL contain `band.html` at the root. It SHALL be an input of the Vite build in `vite.config.ts`, so `bun run build` emits `dist/band.html`.
2. THE page SHALL have one `<main>`, one `<h1>` with the text "Band simulator", and headings in order, as the common rules of `design/DESIGN.md` (Screens) ask.
3. THE page SHALL have a header with the brand (a link to `index.html`), the status pill of criterion 4 and the Day and Night theme control. The theme control SHALL work as it does on the other pages (`data-theme` on `<html>`, with the OS setting as the default).
4. THE status pill SHALL say whether phone vibration is available on this device. WHEN the phone output is available, the pill SHALL read "Phone vibration on" with a triangle glyph and the accent tint. WHEN it is not, the pill SHALL read "No phone vibration here" with an open-circle glyph and the neutral tint. The glyph is inline SVG with `aria-hidden="true"`. The label carries the meaning.
5. THE page SHALL contain, in this DOM and reading order: the header, the title block, the Feel a pattern card, the two motor cards, the pattern timeline card, and the footer. THE footer SHALL contain the aid sentence of `design/DESIGN.md` exactly: "Banshee Band is an aid, not a safety device. It can miss or misread sounds, so keep your smoke alarms and other certified alerting devices."
6. THE page SHALL NOT have a Connect band pill, a primary pill, or any text that says a band is connected. The page SHALL say in plain words, in the title block, that this is a simulator of the wrist band and that no band is connected. (The Connect band pill arrives with the BLE feature.)
7. THE page SHALL mount the simulator with `mountBandSimulator` and SHALL create the phone output with `createPhoneOutput`. It SHALL play a command on the simulator and, WHEN `phone.available()` is true, on the phone output too.
8. THE page SHALL work without a band, without Bluetooth, without a microphone and without network access. It SHALL ask for no permission.
9. THE tab order SHALL follow the reading order: brand link, theme control, the side control, the class chips. The motor cards and the timeline are not in the tab order. Every interactive element SHALL have a visible focus ring (`--bb-color-focus`, 3px, 2px offset) and a target of at least 44px.
10. THE page SHALL work at 1440 px and at 390 px. Below 720 px the layout is one column, except that the two motor cards stay side by side (`design/DESIGN.md`, Band simulator).
11. THE page SHALL make no network request except for its own files, and SHALL log nothing to the console.

### Requirement 8: Feel a pattern card

**User story:** As a new wearer, I want to try each vibration pattern, on each side, before I need it, so that I can learn the language of the band.

#### Acceptance criteria

1. THE card SHALL have the heading "Feel a pattern" and a short plain sentence that says choosing a sound plays its pattern on the simulator and, when the phone can vibrate, on the phone.
2. THE card SHALL have six class chips, as secondary pills: Knock, Doorbell, Alarm, Baby, Vehicle, Voice. The label is the text of the chip. Each chip is a real `<button type="button">` and plays on click, on Enter and on Space.
3. THE card SHALL have a side segmented control with four options: Left, Centre, Right, Unknown. It SHALL be a group of native radio inputs with one label text each (or an equivalent that gives arrow-key selection and a screen-reader group name "Side"). Exactly one option is selected, and the default is Centre. The selected option SHALL differ by more than colour: an accent tint, a check or filled glyph, and `aria-checked` or `checked`.
4. CHANGING the side SHALL NOT play a pattern. Only a chip plays.
5. WHEN a chip is chosen, THE page SHALL build the command with the real `src/haptics` engine and builder, and not with a copy of the patterns. For the chosen class and side it SHALL build a `SoundEvent` with this urgency: `high` for alarm and baby, `medium` for vehicle, doorbell and knock, `low` for voice. It SHALL pass a bearing confidence of 0.9 and a `gcc-phat` bearing of -45 degrees for Left, 0 for Centre and +45 for Right. FOR Unknown, it SHALL pass a bearing confidence of 0.5.
6. THE page SHALL create a new engine (`createHapticEngine()`) for each choice, so that the rate limit and the priority of an earlier choice cannot swallow the new one. The event loudness SHALL be above the default threshold (for example -20 dBFS). WHEN `decide` does not return a `play` (this is a coding error), THE page SHALL show the plain text "This pattern could not be played" in a polite live region and SHALL NOT throw.
7. THE page SHALL call `play(command)` on the simulator output, and on the phone output only when `available()` is true, with the same command object.
8. A new choice while a pattern plays SHALL replace the old one: the simulator cancels the old schedule (Requirement 2.7), and the phone's `navigator.vibrate` call replaces the old vibration.
9. THE card is for learning. Its chips SHALL NOT claim that the band is connected or that a sound has been heard.
10. THE page SHALL NOT read a microphone, a clip or the log.

### Requirement 9: Design gate

**User story:** As the designer, I want the page to follow the design system and not drift from it.

#### Acceptance criteria

1. THE page SHALL meet `design/DESIGN.md`: a soft canvas, floating white surfaces (cards with `--bb-radius-card` 20 px and `--bb-shadow-soft`, no borders), tiles inside cards at `--bb-radius-control` 12 px, pills at `--bb-radius-pill`, one accent (violet) and no other hue, the Night theme through the existing theme tokens, large display numbers for the motor levels, and a tinted status pill. It SHALL use no hard-coded colour or size where a token exists.
2. THE motor level numbers SHALL use the `display` type step with `font-variant-numeric: tabular-nums`, and the `%` unit SHALL use the muted `caption` step.
3. THE page SHALL meet the rules of `design/DESIGN.md` for secondary pills (surface fill, 1px border, min height 44 px, `label` type, hover lift to `surface-raised`).
4. A task SHALL have the builder take Playwright screenshots of the page at 1440 px and 390 px, in Day and Night (four screenshots), look at each one, and fix anything that breaks the design (text on a mismatched surface, overflow, a missing glyph, a bar that overflows its card, a chip row that is not at least 44 px).
5. THE Band simulator section of `design/DESIGN.md` SHALL be updated in the same change to describe the Feel a pattern card, the status pill and the missing Connect band pill, at 1440 px and 390 px (Requirement 7.6). The status-pill table of `design/DESIGN.md` SHALL get the two new rows of Requirement 7.4. If the tokens or the contrast table change, `src/ui/tokens.css` and `tests/ui/tokens.test.ts` SHALL change in the same commit.

### Requirement 10: Tests

**User story:** As a developer, I want tests that fail when the timing, the phone rules or the page flow break.

#### Acceptance criteria

1. UNIT and property tests SHALL live in `tests/band/` and mirror the source paths. They SHALL use Vitest and `fast-check`. They SHALL need no browser and no DOM, and SHALL use a fake scheduler that the test advances by hand.
2. SEGMENT player unit tests SHALL cover: the emission offsets equal the cumulative `ms` (checked with literal numbers for a knock and an alarm command); the first emission happens inside `play`; the final `{0, 0}` comes at `totalMs`; a second `play` cancels the first (no emission of the old command after it, and no 0/0 of the old command); `stop` emits `{0, 0}` once and cancels the rest; `stop` when nothing plays emits nothing; two `stop` calls emit once; a command with no segments; a throwing `onLevels`; the emitted objects are fresh.
3. PHONE output unit tests, with a stubbed `navigator.vibrate`, SHALL cover: `vibrate` is called once with the array of the command; a command with every level 0 does not call `vibrate`; a command with one level above 0 does; `navigator.vibrate` missing gives `available()` false and `play` and `stop` do not throw; `stop` calls `vibrate(0)`; a throwing `vibrate` does not throw out of `play` or `stop`; `navigator` itself missing.
4. A PROPERTY test (`fast-check`, fixed seed, at least 100 runs) SHALL build commands with the real engine for generated classes, urgencies, bearings, confidences and intensities, play each on the segment player with a fake scheduler, run the clock to the end, and show that: the emissions in order reproduce the `left` and `right` of the segments in order; the emission times are the cumulative `ms`; the last emission is `{0, 0}` at `totalMs`; and there is exactly one emission per segment plus the final one.
5. A PROPERTY test SHALL show that, for any engine command, the phone output calls `vibrate` zero times when every level is 0 and once with the command's `vibrate` otherwise.
6. UNIT tests SHALL cover the pure label helpers: side text for all four sides (exact strings), class labels, and the percent rounding (0, 0.3, 0.15, 0.5, 0.75, 1, and a value such as 0.005 that rounds up). Tests that compare these values SHALL use literals.
7. A BOUNDARY test SHALL enforce Requirement 1.7.
8. PLAYWRIGHT tests in `e2e/band.spec.ts` on `band.html` SHALL cover: choosing Knock with Left shows the left level greater than the right level (read from `data-level`) and the text "left stronger"; choosing Unknown shows equal levels, the text "Side unknown", and `data-side="unknown"`; with `page.clock` the levels return to 0 after `totalMs` and not before; an init script that stubs `navigator.vibrate` records the call and the test checks it got the knock `vibrate` array `[70, 100, 70]`, once per choice; with `navigator.vibrate` not a function the status pill reads "No phone vibration here" and a choice does not throw; the status pill reads "Phone vibration on" with the stub; the live region text is set once per choice; keyboard flow (Tab reaches the side control and the chips in order, arrow keys change the side, Enter and Space on a chip play); `prefers-reduced-motion: reduce` gives bars with no transition and numbers that still update; no console errors or page errors; no request to another origin; and the four screenshots of Requirement 9.4 saved to `e2e/screenshots/`.
9. THE tests SHALL follow `.kiro/steering/accessibility.md`: this feature changes UI, so it ships the e2e checks for keyboard flow and reduced motion.

### Requirement 11: Privacy and wording

**User story:** As a user, I want a page that does not collect or promise anything beyond what it does.

#### Acceptance criteria

1. THE feature SHALL NOT store, log, send or display audio, spectra or the event `label`. THE page SHALL NOT use `localStorage` except what the shared theme control already does.
2. NO copy of the page or the simulator SHALL say that the band or the phone keeps the user safe, that it replaces a smoke alarm or another certified device, or that a sound was detected. The aid sentence of Requirement 7.5 SHALL be used verbatim.
3. THE UI copy SHALL use plain language, and SHALL state clearly that no band is connected and which output plays (the simulator, and the phone when it can vibrate).
4. THE feature SHALL add no analytics, third-party script or API key.

### Requirement 12: Gates

**User story:** As a maintainer, I want the feature to leave the repository green and shippable.

#### Acceptance criteria

1. WHEN the feature is done, `bun run typecheck`, `bun run test` and `bun run e2e` SHALL pass.
2. WHEN the feature is done, `bun run build` SHALL succeed and emit `dist/band.html`.
3. THE feature SHALL add no run-time dependency and no dev dependency.
4. THE feature SHALL leave `src/haptics/` unchanged.
