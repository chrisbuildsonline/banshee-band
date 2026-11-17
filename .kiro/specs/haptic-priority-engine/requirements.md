# Requirements: Haptic priority engine

## Introduction

Banshee Band tells a Deaf or hard-of-hearing user about a sound through a vibration on the wrist or phone. This feature (F6) decides what to play and on which side. It lives in `src/haptics/` as a pure TypeScript module. It takes a `SoundEvent` and a bearing confidence and returns either a `HapticCommand` (a rhythm with a level per motor) or a reason for dropping the event.

Output devices (the Bluetooth band, the band simulator and the `navigator.vibrate` fallback) are a later feature. This feature does not talk to hardware, draw ghosts, write text alerts or classify sounds. It does not read a clock and does not start timers. The caller passes the time in.

Rhythm identifies the class and intensity identifies urgency and side (see `.kiro/steering/pattern-language.md`). The phone fallback has no side or intensity control, so the rhythm alone must still identify the class.

Terms:

- **Pattern class**: one of `knock`, `doorbell`, `alarm`, `baby`, `vehicle`, `voice`. The class `other` has no pattern.
- **Pulse**: `{ onMs, gapMs }`. The motor runs for `onMs`, then rests for `gapMs`. The last pulse of a pattern has `gapMs` 0.
- **Pattern**: `{ class, pulses, repeat? }`. `repeat` is `{ count, pauseMs }`: `count` extra repeats of the whole pulse list, with `pauseMs` of rest between repeats.
- **Rhythm**: the sequence of `onMs` and `gapMs` values of a pattern, including repeats and pauses. It does not contain levels.
- **Cycle**: one pass through the pulse list. Its length is the sum of all `onMs` and `gapMs`.
- **Total**: the length of the whole pattern with repeats: `cycle * (1 + count) + pauseMs * count`.
- **Side**: `'left'`, `'right'`, `'centre'` or `'unknown'`. Negative `bearingDeg` is left and positive is right (the `src/bearing` convention).
- **Bearing confidence**: the `confidence` of `BearingResult` in [0, 1]. It is not `SoundEvent.confidence`, which belongs to the classifier.
- **Level**: a motor strength in [0, 1].
- **Segment**: `{ ms, left, right }`, a stretch of time with a fixed level for each motor. A rest has `left` 0 and `right` 0.
- **HapticCommand**: `{ eventId, class, side, sideKnown, priority, segments, vibrate, totalMs }`.
- **Priority**: a rank number. Higher wins (Requirement 8).
- **Playing**: a command is playing while `nowMs < startMs + totalMs`, where `startMs` is the `nowMs` of the call that returned it.

## Requirements

### Requirement 1: Module boundaries

**User story:** As a developer, I want the haptic module to be a pure leaf, so that I can test it without a browser and know that it cannot reach hardware or the network.

#### Acceptance criteria

1. THE module SHALL live in `src/haptics/` and export its public API from `src/haptics/index.ts`.
2. THE module SHALL import only types and constants from `src/events`, files in `src/haptics/`, and `./patterns.json`. It SHALL NOT import from `audio`, `classify`, `bearing`, `band`, `ghosts`, `ui`, `mcp` or any npm package at run time.
3. THE module SHALL NOT use `fetch`, `XMLHttpRequest`, `WebSocket`, `navigator`, `window`, `document`, `console`, `Date`, `performance`, `Math.random`, `setTimeout`, `setInterval`, `requestAnimationFrame` or any other I/O, clock, timer or random source.
4. THE module SHALL take the current time only as the `nowMs` argument of `decide`. It SHALL NOT read a clock.
5. Given the same settings and the same sequence of `decide` calls, THE module SHALL return the same results (deterministic).
6. THE module SHALL NOT modify its inputs. A returned `HapticCommand` SHALL NOT share arrays with the pattern data, so a caller that changes a command cannot change a pattern.
7. A test SHALL scan `src/haptics/*.ts` (comments removed) and fail on any import other than the allowed ones and on the forbidden identifiers in criterion 3.

### Requirement 2: Named constants

**User story:** As a developer, I want every limit to be a named constant, so that the tests, the validator and the pattern language rules point at one value.

#### Acceptance criteria

1. THE module SHALL export these constants from `src/haptics/constants.ts` with exactly these values:

   | Constant | Value | Meaning |
   |---|---|---|
   | `MIN_PULSE_MS` | 40 | Shortest pulse. |
   | `MIN_GAP_MS` | 80 | Shortest rest between two pulses. |
   | `MAX_PATTERN_MS` | 1500 | Longest cycle (pulses and gaps). |
   | `MAX_TOTAL_MS` | 4000 | Longest pattern including repeats and pauses. |
   | `MIN_REPEAT_PAUSE_MS` | 300 | Shortest rest between repeats. |
   | `DISTINCT_TIMING_MS` | 150 | Smallest timing distance between two patterns with the same pulse count. |
   | `UNCERTAIN_CONFIDENCE` | 0.8 | Bearing confidence below this gives side `'unknown'`. |
   | `CENTRE_DEG` | 15 | Half width of the centre zone. |
   | `RATE_LIMIT_MS` | 3000 | Default rate limit. |

2. THE module SHALL also export `PATTERN_CLASSES` (`knock`, `doorbell`, `alarm`, `baby`, `vehicle`, `voice`), the urgency base levels (Requirement 6), the other-motor factor 0.3 (`OTHER_MOTOR_FACTOR`), the urgency ranks and the class weights (Requirement 8), and `DEFAULT_MIN_LOUDNESS_DB` (-50).
3. NO other file in `src/haptics/` SHALL repeat one of these values as a literal in code that makes a decision. A test SHALL NOT import these constants to build its expected values where the value itself is the thing being checked (Requirement 11.2).

### Requirement 3: Pattern data and validation

**User story:** As a developer, I want patterns to be data that is checked when it loads, so that a bad edit of `patterns.json` fails at once and not on a user's wrist.

#### Acceptance criteria

1. THE patterns SHALL be stored in `src/haptics/patterns.json` as an array with exactly one pattern for each of `knock`, `doorbell`, `alarm`, `baby`, `vehicle` and `voice`. This is six patterns, the maximum that `pattern-language.md` allows (doorbell is the one spare).
2. THE class `other` SHALL have no pattern. A pattern for `other`, or for any class outside the six, SHALL be a validation error.
3. EVERY pattern SHALL have a `class`, a `pulses` array with at least one pulse, and optionally `repeat`. Every pulse SHALL have integer `onMs` and `gapMs` (milliseconds are whole numbers so that `navigator.vibrate` gets the same values).
4. THE last pulse of every pattern SHALL have `gapMs` 0. Every other pulse SHALL have `gapMs` greater than or equal to `MIN_GAP_MS`.
5. EVERY pulse SHALL have `onMs` greater than or equal to `MIN_PULSE_MS`.
6. THE cycle of every pattern SHALL be at most `MAX_PATTERN_MS`, and its total SHALL be at most `MAX_TOTAL_MS`.
7. WHEN a pattern has `repeat`, `repeat.count` SHALL be an integer greater than or equal to 1 and `repeat.pauseMs` SHALL be an integer greater than or equal to `MIN_REPEAT_PAUSE_MS`.
8. ONLY the `alarm` pattern SHALL have `repeat`. A `repeat` on any other class SHALL be a validation error, and the `alarm` pattern SHALL have one.
9. THE module SHALL provide `validatePatternData(data: unknown)` that returns `{ patterns, errors }`. It SHALL NOT throw for any input, including `null`, a non-array, or entries with wrong types, missing fields, `NaN` or `Infinity`. Every error is a short string that names the class (when known) and the rule.
10. THE module SHALL provide `loadPatterns()` that validates the data from `patterns.json` once, runs `checkDistinctiveness` (Requirement 4), and returns the patterns in `PATTERN_CLASSES` order. IF there is any error or violation, THEN it SHALL throw an `Error` that lists all of them. This is the only function in the module that throws on data, and it throws only for a bad bundled file, never for user input.
11. `loadPatterns()` SHALL return the same patterns on each call, and a caller changing the returned value SHALL NOT affect later calls (Requirement 1.6).

### Requirement 4: Distinctiveness

**User story:** As a user who feels the band without looking, I want every sound class to have its own rhythm, so that I can tell a doorbell from a knock by feel and also on a phone that has one motor and one strength.

#### Acceptance criteria

1. THE module SHALL export `checkDistinctiveness(patterns)` that returns an array of violations. The array is empty when the set is good. It SHALL NOT throw for any array of validated patterns.
2. TWO patterns SHALL count as distinct WHEN their pulse counts differ. WHEN the pulse counts are equal, they are distinct only if `sum over i of (|onMs_a[i] - onMs_b[i]| + |gapMs_a[i] - gapMs_b[i]|)` is greater than or equal to `DISTINCT_TIMING_MS`. The pulse count is that of one cycle, and repeats do not change it.
3. EVERY pair of patterns in the set SHALL be distinct. A pair that is not distinct SHALL give a violation that names both classes and the measured distance.
4. THE function SHALL also report a violation for each pattern that breaks a limit of Requirement 3 (pulse shorter than `MIN_PULSE_MS`, inner gap shorter than `MIN_GAP_MS`, cycle longer than `MAX_PATTERN_MS`, total longer than `MAX_TOTAL_MS`, repeat pause shorter than `MIN_REPEAT_PAUSE_MS`), so that one call tells a test or a Kiro hook everything that is wrong.
5. EACH violation SHALL be a plain object `{ kind, classes, detail }`. `kind` is one of `'not-distinct'`, `'pulse-too-short'`, `'gap-too-short'`, `'cycle-too-long'`, `'total-too-long'`, `'pause-too-short'`. `classes` lists the class names involved. `detail` is a short human-readable string.
6. THE distance function SHALL be symmetric, and the distance from a pattern to itself SHALL be 0.
7. A test SHALL run `checkDistinctiveness` on the real `patterns.json` and require an empty result.

### Requirement 5: Side from bearing

**User story:** As a user, I want the band to point to the side of the sound only when the app is fairly sure, so that a wrong buzz does not send me the wrong way.

#### Acceptance criteria

1. WHEN `bearingSource` is `'gcc-phat'`, `bearingDeg` is not null, and the bearing confidence is greater than or equal to `UNCERTAIN_CONFIDENCE`, THE module SHALL map `bearingDeg` to a side: `'left'` when `bearingDeg < -CENTRE_DEG`, `'right'` when `bearingDeg > CENTRE_DEG`, and `'centre'` when `|bearingDeg| <= CENTRE_DEG`.
2. WHEN `bearingSource` is `'loudness'` or `'none'`, THE side SHALL be `'unknown'`, whatever `bearingDeg` and the bearing confidence are.
3. WHEN the bearing confidence is less than `UNCERTAIN_CONFIDENCE`, THE side SHALL be `'unknown'`. Confidence 0.8 is confident enough. Confidence 0.79 is not.
4. WHEN the bearing confidence is `NaN`, not a number, or outside [0, 1], or WHEN `bearingDeg` is null or not finite, THE side SHALL be `'unknown'`. The function SHALL NOT throw.
5. THE module SHALL NEVER return a side of `'left'`, `'right'` or `'centre'` for an input that Criteria 2 to 4 call unknown. `sideKnown` is false exactly when the side is `'unknown'`.
6. A bearing of exactly +15 or -15 degrees SHALL be `'centre'`. A negative bearing SHALL map to left and a positive bearing to right.
7. THE side mapping SHALL be a pure function `sideOf(event, bearingConfidence)`, exported for tests.

### Requirement 6: Intensity and motor levels

**User story:** As a user, I want the strength of a buzz to say how urgent the sound is and where it came from, and the rhythm to say what it is.

#### Acceptance criteria

1. THE base level SHALL depend only on `event.urgency`: `low` 0.5, `medium` 0.75, `high` 1.0.
2. THE level SHALL be the base level multiplied by `settings.intensity` (in [0, 1]).
3. WHEN the side is `'left'`, THE left motor SHALL get the level and the right motor SHALL get `OTHER_MOTOR_FACTOR` (0.3) times the level. WHEN the side is `'right'`, the right motor SHALL get the level and the left motor 0.3 times the level.
4. WHEN the side is `'centre'` or `'unknown'`, BOTH motors SHALL get the level.
5. EVERY motor level SHALL be a finite number in [0, 1].
6. THE rhythm (the sequence of `onMs` and `gapMs`, with repeats and pauses) SHALL be identical for every side, every urgency and every intensity of one class. Intensity SHALL NOT depend on the class.
7. IN a segment that is a pulse, the levels SHALL be as in Criteria 3 and 4. IN a segment that is a rest, both levels SHALL be 0.

### Requirement 7: HapticCommand

**User story:** As the author of an output driver, I want one flat command that I can play without knowing how patterns work.

#### Acceptance criteria

1. WHEN the engine plays an event, THE `HapticCommand` SHALL contain `eventId` (the event's `id`), `class`, `side`, `sideKnown`, `priority`, `segments`, `vibrate` and `totalMs`.
2. `segments` SHALL be a flat list of `{ ms, left, right }`. It SHALL expand every repeat and every pause between repeats. It SHALL start with a pulse segment and end with a pulse segment, and pulse and rest segments SHALL alternate. Every `ms` SHALL be an integer greater than 0, so no empty segment is emitted. The last pulse's gap of 0 is not emitted.
3. `vibrate` SHALL be the `number[]` for `navigator.vibrate`: the `ms` values of `segments` in order, alternating on and off, starting with on. It SHALL contain no levels and no side. It SHALL be derived from the same rhythm as `segments`, so that a phone that ignores side and intensity still plays the same rhythm.
4. `totalMs` SHALL equal the sum of `ms` over `segments` and the sum of `vibrate`.
5. `totalMs` SHALL be at most `MAX_TOTAL_MS`.
6. FOR the `alarm` class, THE command SHALL contain the repeats and pauses of the pattern. FOR every other class it SHALL contain one cycle.
7. THE command SHALL contain only numbers, strings and booleans (and arrays and plain objects of them). It SHALL NOT contain audio, spectra or the event's `label`.

### Requirement 8: Priority and preemption

**User story:** As a user, I want the most important sound to win when two sounds come close together, and I do not want old alerts replayed late.

#### Acceptance criteria

1. THE priority SHALL be `urgencyRank * 10 + classWeight`. `urgencyRank` is `high` 3, `medium` 2, `low` 1. `classWeight` is `alarm` 6, `baby` 5, `vehicle` 4, `doorbell` 3, `knock` 2, `voice` 1.
2. AT the same urgency, `alarm` SHALL outrank `vehicle` (and every other class), and the order of classes SHALL follow the weights. A higher urgency of any class SHALL outrank a lower urgency of any class (for example, `high` `voice` 31 outranks `low` `alarm` 16).
3. THE engine SHALL keep at most one current command (the one most recently played) with its start time. There SHALL be no queue.
4. WHEN `nowMs < startMs + totalMs` of the current command (it is playing) and the new event has a strictly higher priority, THE engine SHALL return `{ action: 'play', command }` for the new event, and the new command SHALL replace the current one.
5. WHEN a command is playing and the new event has an equal or lower priority, THE engine SHALL return `{ action: 'drop', reason: 'lower-priority' }`. It SHALL NOT keep the event for later, and a dropped event SHALL NOT change the engine state in any way.
6. WHEN no command is playing (`nowMs >= startMs + totalMs`, or nothing has played), THE engine SHALL play the event, whatever its priority.
7. THE engine SHALL NOT play a dropped event later. No call to `decide` SHALL return a command for an event that an earlier call dropped.
8. THE priority SHALL be exported as a pure function `priorityOf(urgency, class)`.

### Requirement 9: Decisions and drop reasons

**User story:** As a user, I want only the sounds I chose, loud enough to matter, without a buzz storm.

#### Acceptance criteria

1. THE module SHALL provide `createHapticEngine(settings?)` that returns `{ decide(input, nowMs) }`. `input` is `{ event: SoundEvent, bearingConfidence: number }`. `decide` returns `{ action: 'play', command: HapticCommand }` or `{ action: 'drop', reason }`. `reason` is one of `'disabled-class'`, `'no-pattern'`, `'too-quiet'`, `'rate-limited'`, `'lower-priority'`.
2. THE engine SHALL test the event in this order and return the first reason that applies: (1) `'no-pattern'` when the class is `other`; (2) `'disabled-class'` when the class is switched off in `enabledClasses`; (3) `'too-quiet'` when `event.loudnessDb < minLoudnessDb` (an event exactly at the threshold is loud enough); (4) `'rate-limited'`; (5) `'lower-priority'` (Requirement 8).
3. THE class `other` SHALL never buzz. The ghost and the text alert still show it, because they do not depend on this module, and `decide` SHALL return `{ action: 'drop', reason: 'no-pattern' }` for it in every state, including when everything else is idle.
4. THE engine SHALL keep, for each pair of class and side, the `nowMs` of the last event that was played. WHEN an event has the same class and the same side (including `'unknown'`) as a played event and `nowMs - lastStartMs < settings.rateLimitMs`, THE engine SHALL drop it as `'rate-limited'`. WHEN `nowMs - lastStartMs >= rateLimitMs`, the rate limit SHALL NOT apply.
5. ONLY an event that is played SHALL update the last-played time. A dropped event SHALL NOT.
6. WHEN `nowMs` is less than the last start of the same class and side (the clock went back), THE event SHALL be treated as inside the rate limit and dropped as `'rate-limited'`. The engine SHALL NOT throw for this.
7. IF `nowMs` is not a finite number, THEN `decide` SHALL throw a `RangeError` that names the argument. This is a coding error of the caller, and it is the only way `decide` throws. Other bad input (see Requirement 5.4) SHALL NOT throw.
8. THE returned command's `priority`, `side` and `sideKnown` SHALL satisfy Requirements 5 and 8, and its `class` SHALL be the event's class.

### Requirement 10: Settings

**User story:** As a user, I want to choose which sounds matter and how loud they must be, and I want a broken settings file to leave me with working defaults, not a dead band.

#### Acceptance criteria

1. THE settings SHALL be a plain object: `enabledClasses` (a record from each pattern class to a boolean), `minLoudnessDb`, `intensity` and `rateLimitMs`.
2. THE defaults SHALL be exported as `DEFAULT_HAPTIC_SETTINGS`: all six classes on, `minLoudnessDb` -50, `intensity` 1, `rateLimitMs` `RATE_LIMIT_MS`. The exported object SHALL be frozen, and `resolveHapticSettings` SHALL return a new object each time.
3. THE module SHALL provide `resolveHapticSettings(input: unknown)` that returns a complete, valid settings object and SHALL NOT throw for any input (including `undefined`, `null`, strings and arrays).
4. A value SHALL be valid as follows. `minLoudnessDb`: a finite number less than or equal to 0. `intensity`: a finite number in [0, 1]. `rateLimitMs`: a finite number greater than or equal to 0. Each entry of `enabledClasses`: a boolean.
5. WHEN a value is not valid, THE default for that field (or for that class) SHALL be used. A bad value SHALL NOT change another field. A missing field uses the default. A key of `enabledClasses` that is not a pattern class SHALL be ignored.
6. `createHapticEngine` SHALL resolve its settings with `resolveHapticSettings`, so `createHapticEngine()`, `createHapticEngine(undefined)` and `createHapticEngine('junk')` all work.
7. THE engine SHALL read its settings once, at creation. A caller that changes the object it passed in afterwards SHALL NOT change the engine. To change settings, the caller creates a new engine.

### Requirement 11: Tests

**User story:** As a developer, I want tests that fail when a rule is broken, so that I can change a pattern or the priority table without fear.

#### Acceptance criteria

1. THE tests SHALL live in `tests/haptics/` and mirror the source paths. They SHALL use Vitest and `fast-check`.
2. WHERE a test checks a rule whose value is a constant of Requirement 2 (for example the 80 ms gap, the 0.8 confidence, the 15 degree centre zone, the 40 ms pulse), THE test SHALL use the literal number, and not the constant, so that a change of the constant makes the test fail.
3. UNIT tests SHALL cover: the validator (each rule of Requirement 3, with a bad example for each, and no throw for junk input); the side mapping (confidence 0.79 and 0.8, bearings of -15.01, -15, 0, 15 and 15.01, `'loudness'` and `'none'` sources, null bearing, `NaN` confidence); the priority formula (alarm over vehicle at the same urgency, high urgency of any class over low alarm, all 18 values); preemption (higher priority preempts, equal and lower are dropped as `'lower-priority'`, a new event after the end of the current command plays); stale drop (a dropped event never plays later); the rate limit (the same class and side at `rateLimitMs - 1` and `rateLimitMs`; a different side or class is not limited; a clock that goes back); the reasons `'no-pattern'`, `'disabled-class'` and `'too-quiet'` (at threshold and 0.01 dB below); the order of Requirement 9.2; and settings validation.
4. A DISTINCTIVENESS test SHALL check `patterns.json` with `checkDistinctiveness` (empty result), and SHALL check that `checkDistinctiveness` reports each kind of violation for a bad example (so that the check itself cannot silently pass).
5. PROPERTY tests (`fast-check`, fixed seed, at least 100 runs each) SHALL show for every pattern class and for generated events:
   1. the rhythm (`vibrate` and the `ms` values of `segments`) is identical across every side, urgency and intensity of one class;
   2. an input with source `'loudness'` or `'none'`, or a bearing confidence below 0.8, never gives `sideKnown` true;
   3. `totalMs` equals the sum of the `segments` `ms` values and the sum of `vibrate`;
   4. `vibrate` alternates on and off starting with on, has an odd length, and its values equal the rhythm of the pattern (including repeats and pauses);
   5. every `left` and `right` level is in [0, 1], and rest segments are 0 and 0;
   6. `decide` never throws for a valid event and a finite `nowMs`, whatever the settings (including junk settings);
   7. no event that was dropped is returned later in a `play` result, over random event sequences;
   8. whenever a `play` result replaces a command that is still playing, the new priority is strictly higher than the one it replaced.
6. A BOUNDARY test SHALL enforce Requirement 1.7.
7. THE tests SHALL use plain data and need no browser, no DOM and no timers.

### Requirement 12: Mutation check

**User story:** As a developer, I want proof that the tests notice a broken engine or a broken pattern table.

#### Acceptance criteria

1. THE repository SHALL contain `bun run haptics:mutate` (`tests/haptics/mutate.ts`) that applies each mutant below to the source text, runs `vitest run tests/haptics`, restores the original text, and reports whether the tests failed (mutant killed) or passed (mutant survived).
2. Mutant `no-confidence-check`: the side mapping ignores the bearing confidence (a low confidence still gives a side).
3. Mutant `swap-weights`: the class weights of `alarm` and `vehicle` are swapped.
4. Mutant `shrink-min-gap`: `MIN_GAP_MS` is reduced (for example from 80 to 10).
5. Mutant `copy-pattern`: one pattern in `patterns.json` is made a copy of another (for example `vehicle` takes the pulses of `knock`).
6. EVERY mutant SHALL be killed. The script SHALL exit with a non-zero code if any mutant survives, or if the text to replace is not found exactly once (so a refactor cannot silently disable a mutant).
7. THE script SHALL restore the changed files in a `finally` block and on SIGINT and SIGTERM, and SHALL refuse to start when `src/haptics/` has uncommitted changes that it did not make, unless `--force` is given. This prevents loss of work.

### Requirement 13: Privacy, accessibility and wording

**User story:** As a user, I want the haptic alert to be one of several ways to learn about a sound, and I do not want the app to promise safety.

#### Acceptance criteria

1. THE module SHALL NOT store, log, send or return audio, spectra, the event `label` or any personal data. The `HapticCommand` SHALL contain only the fields of Requirement 7.
2. THE module SHALL return `side` and `sideKnown` so that the text alert can say "side unknown" and the ghost can show an uncertain direction. A haptic command SHALL NOT be the only form of an alert (see `accessibility.md`). This feature adds no UI text.
3. EVERY exported function, constant and type SHALL have a short doc comment. The comment in `src/haptics/index.ts` SHALL state that the module decides what to play and not how, that rhythm identifies the class, and that intensity encodes urgency and side only.
4. NO comment or document of this feature SHALL say that the band keeps the user safe or replaces a certified smoke alarm or other certified device.

### Requirement 14: Gates

**User story:** As a maintainer, I want the feature to leave the repository green.

#### Acceptance criteria

1. WHEN the feature is done, `bun run typecheck`, `bun run test` and `bun run e2e` SHALL pass.
2. THE feature SHALL add no run-time dependency. `fast-check` and Vitest already exist.
3. THE feature SHALL add the script `haptics:mutate` to `package.json`.
