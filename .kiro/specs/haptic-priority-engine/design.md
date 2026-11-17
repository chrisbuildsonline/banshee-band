# Design: Haptic priority engine

Requirement numbers refer to `requirements.md`.

## Overview

`src/haptics/` decides what to play and on which side. It is a leaf module: plain data in, plain data out, no I/O, no clock, no timers.

```
{ event: SoundEvent, bearingConfidence } + nowMs
   --> class 'other'?                          drop 'no-pattern'
   --> class switched off?                     drop 'disabled-class'
   --> loudnessDb < minLoudnessDb?             drop 'too-quiet'
   --> same class+side within rateLimitMs?     drop 'rate-limited'
   --> side = sideOf(event, bearingConfidence)
   --> priority = urgencyRank*10 + classWeight
   --> a command is playing and priority <= its priority?   drop 'lower-priority'
   --> build HapticCommand from the class pattern, side, urgency, intensity
   --> remember it as the current command and as last-played for class+side
   --> { action: 'play', command }
```

The module does not know which device plays the command. `src/band` (a later feature) takes a `HapticCommand` and plays `segments` on the band or the simulator, or `vibrate` on the phone. This follows the rule in `structure.md` that `haptics` never knows which output is active.

Dependencies: types and constants from `../events` only. The structure rule (audio -> classify and bearing -> haptics -> band and ghosts -> ui) holds. The module does not import `src/bearing`. The caller copies `BearingResult.confidence` into `bearingConfidence`. This keeps the two modules apart and means the confidence type is a plain number.

## Files

```
src/haptics/
  constants.ts   MIN_PULSE_MS, MIN_GAP_MS, MAX_PATTERN_MS, MAX_TOTAL_MS, MIN_REPEAT_PAUSE_MS,
                 DISTINCT_TIMING_MS, UNCERTAIN_CONFIDENCE, CENTRE_DEG, RATE_LIMIT_MS,
                 OTHER_MOTOR_FACTOR, DEFAULT_MIN_LOUDNESS_DB, PATTERN_CLASSES,
                 URGENCY_BASE_LEVEL, URGENCY_RANK, CLASS_WEIGHT
  types.ts       Pulse, Pattern, HapticClass, Side, Segment, HapticCommand, HapticInput,
                 HapticSettings, DropReason, Decision, Violation, HapticEngine
  patterns.json  the six patterns (data)
  patterns.ts    validatePatternData, loadPatterns, patternDuration helpers
  distinct.ts    patternDistance, checkDistinctiveness
  side.ts        sideOf
  priority.ts    priorityOf
  settings.ts    DEFAULT_HAPTIC_SETTINGS, resolveHapticSettings
  command.ts     buildCommand (pattern + side + urgency + intensity -> HapticCommand)
  engine.ts      createHapticEngine
  index.ts       public exports and the module comment
tests/haptics/
  patterns.test.ts  distinct.test.ts  side.test.ts  priority.test.ts  settings.test.ts
  command.test.ts  engine.test.ts  properties.test.ts  boundaries.test.ts  mutate.ts
```

The tests mirror the source paths, as `structure.md` asks. `mutate.ts` is a script and sits in `tests/haptics/` next to `tests/bearing/mutate.ts`. `package.json` gets `haptics:mutate`. `tsconfig.json` needs `resolveJsonModule` for `patterns.json`. Check that it is on before task 2.

## Types

```ts
import type { SoundClass, SoundEvent, Urgency } from '../events';

export type HapticClass = Exclude<SoundClass, 'other'>;
export type Side = 'left' | 'right' | 'centre' | 'unknown';

export interface Pulse { onMs: number; gapMs: number }          // last pulse: gapMs 0
export interface Repeat { count: number; pauseMs: number }
export interface Pattern { class: HapticClass; pulses: Pulse[]; repeat?: Repeat }

export interface Segment { ms: number; left: number; right: number }

export interface HapticCommand {
  eventId: string;
  class: HapticClass;
  side: Side;
  sideKnown: boolean;        // false exactly when side === 'unknown'
  priority: number;
  segments: Segment[];       // on and off, flat, repeats expanded
  vibrate: number[];         // navigator.vibrate pattern: on, off, on, ...
  totalMs: number;
}

export interface HapticInput { event: SoundEvent; bearingConfidence: number }

export interface HapticSettings {
  enabledClasses: Record<HapticClass, boolean>;
  minLoudnessDb: number;     // default -50
  intensity: number;         // 0..1, default 1
  rateLimitMs: number;       // default RATE_LIMIT_MS
}

export type DropReason = 'disabled-class' | 'no-pattern' | 'too-quiet' | 'rate-limited' | 'lower-priority';
export type Decision =
  | { action: 'play'; command: HapticCommand }
  | { action: 'drop'; reason: DropReason };

export interface Violation {
  kind: 'not-distinct' | 'pulse-too-short' | 'gap-too-short' | 'cycle-too-long' | 'total-too-long' | 'pause-too-short';
  classes: string[];
  detail: string;
}

export interface HapticEngine { decide(input: HapticInput, nowMs: number): Decision }
```

`HapticClass` is the six classes. `PATTERN_CLASSES` in `constants.ts` is the runtime list. A test checks that `PATTERN_CLASSES` plus `'other'` equals `SOUND_CLASSES` from `src/events`, so a new sound class cannot be added without a decision about its pattern.

## The six patterns

Rhythm only. Times in milliseconds, as `onMs/gapMs`, last gap 0.

| Class | Pulses | Feel | Cycle | Repeat | Total |
|---|---|---|---|---|---|
| voice | 250/0 | one medium pulse | 250 | none | 250 |
| knock | 70/100, 70/0 | short-short | 240 | none | 240 |
| doorbell | 250/150, 250/0 | long-long (ding-dong) | 650 | none | 650 |
| vehicle | 80/100, 400/0 | short-long (rising rumble) | 580 | none | 580 |
| alarm | 150/100, 150/100, 150/0 | triple | 650 | 3 times, 400 pause | 3800 |
| baby | 100/80 x3, 100/0 | four quick pulses | 640 | none | 640 |

Pulse counts are 1 (voice), 2 (knock, doorbell, vehicle), 3 (alarm) and 4 (baby). The three patterns with two pulses are the only pairs that need the timing test:

| Pair | Distance (ms) | Needs |
|---|---|---|
| knock / doorbell | 180 + 50 + 180 + 0 = 410 | 150 |
| knock / vehicle | 10 + 0 + 330 + 0 = 340 | 150 |
| doorbell / vehicle | 170 + 50 + 150 + 0 = 370 | 150 |

The alarm total is `650 * 4 + 400 * 3 = 3800`, under `MAX_TOTAL_MS` 4000. Every pulse is at least 70 ms and every inner gap is at least 80 ms. These numbers are a first proposal. Task 2 may change them if the distinctiveness test or a feel test says so, as long as every rule in Requirements 3 and 4 holds, and the table here is updated in the same change.

`patterns.json` is an array of objects such as:

```json
[
  { "class": "knock", "pulses": [ { "onMs": 70, "gapMs": 100 }, { "onMs": 70, "gapMs": 0 } ] },
  { "class": "alarm", "pulses": [ { "onMs": 150, "gapMs": 100 }, { "onMs": 150, "gapMs": 100 }, { "onMs": 150, "gapMs": 0 } ],
    "repeat": { "count": 3, "pauseMs": 400 } }
]
```

## Validation and distinctiveness (R3, R4)

`validatePatternData(data: unknown)` walks the data and collects error strings. It never throws. It checks, in this order: the data is an array; each entry is an object with a class in `PATTERN_CLASSES`; there is exactly one entry per class and none for `other`; `pulses` is a non-empty array of objects whose `onMs` and `gapMs` are integers (`Number.isInteger`, which also rejects `NaN` and `Infinity`); the last gap is 0; `repeat`, when present, has an integer `count >= 1` and an integer `pauseMs`; only `alarm` has `repeat` and `alarm` has it. It returns `{ patterns, errors }` where `patterns` holds only the entries that passed the structure checks, deep-copied.

`checkDistinctiveness(patterns)` runs the numeric rules on a list of structurally valid patterns:

```
for each pattern p:
  each onMs < 40               -> 'pulse-too-short'
  each inner gapMs < 80        -> 'gap-too-short'
  cycle(p) > 1500              -> 'cycle-too-long'
  total(p) > 4000              -> 'total-too-long'
  repeat && pauseMs < 300      -> 'pause-too-short'
for each pair (a, b), a before b:
  distinct(a, b) is false      -> 'not-distinct'

distinct(a, b) = a.pulses.length != b.pulses.length || patternDistance(a, b) >= 150
patternDistance(a, b) = sum over i of |a.on[i] - b.on[i]| + |a.gap[i] - b.gap[i]|   (equal lengths)
```

`patternDistance` throws no error for unequal lengths. It returns `Infinity`, which is distinct by the first rule. Each rule is split between structure (the validator, which needs the data to be well formed) and numeric limits (`checkDistinctiveness`, which a test or a Kiro hook can call on any pattern list, including a handmade bad one). The two share the constants and nothing else. `loadPatterns()` calls both and throws one `Error` with every message if either finds anything. The distance uses one cycle only, so repeats do not make the alarm "more different".

## Side (R5)

```ts
function sideOf(event: SoundEvent, bearingConfidence: number): Side {
  if (event.bearingSource !== 'gcc-phat') return 'unknown';
  if (!Number.isFinite(bearingConfidence) || bearingConfidence < 0 || bearingConfidence > 1) return 'unknown';
  if (bearingConfidence < UNCERTAIN_CONFIDENCE) return 'unknown';
  const d = event.bearingDeg;
  if (d === null || !Number.isFinite(d)) return 'unknown';
  if (d < -CENTRE_DEG) return 'left';
  if (d > CENTRE_DEG) return 'right';
  return 'centre';
}
```

The function is written so that every path that is not a confident `gcc-phat` bearing returns `'unknown'` first, and the three known sides are the last lines. The `no-confidence-check` mutant removes the `< UNCERTAIN_CONFIDENCE` line. The loudness bearing from `src/bearing` is a coarse guess from level, and this module never turns it into a side, because the band would then point confidently on weak evidence. `'unknown'` plays both motors equally (R6.4) and the text alert says the side is unknown.

## Command building (R6, R7)

```
level      = URGENCY_BASE_LEVEL[urgency] * intensity
leftLevel  = side == 'left'  ? level : side == 'right' ? level * 0.3 : level
rightLevel = side == 'right' ? level : side == 'left'  ? level * 0.3 : level
```

`buildCommand(pattern, side, urgency, intensity, eventId, priority)` expands the pattern into a list of `{ onMs, offMs }` steps and then into segments:

```
steps = []
for r in 0 .. repeatCount:                    // repeatCount is 0 when there is no repeat
  for each pulse i:
    steps.push(pulse.onMs, pulse.gapMs)       // gapMs of the last pulse is 0
  if r < repeatCount: add pauseMs to the last off step (it is 0 before, so it becomes pauseMs)
segments = for each step with ms > 0: on steps get (leftLevel, rightLevel), off steps get (0, 0)
vibrate  = the ms of the segments
totalMs  = sum of vibrate
```

The last off step of the final cycle is 0 and is not emitted, so the sequence starts and ends with an on segment and strictly alternates. Because every `onMs` is at least 40 and every inner `gapMs` and every pause is at least 80, no on step has `ms` 0, and no off step is merged with another off step by accident. `vibrate` and `segments` come from one list, so they cannot differ (R7.3, R7.4).

Example, `knock` with `side` left, `high`, intensity 1: segments `[{70,1,0.3},{100,0,0},{70,1,0.3}]`, `vibrate` `[70,100,70]`, `totalMs` 240. The same event as `low` and right: `[{70,0.15,0.5},{100,0,0},{70,0.15,0.5}]`, `vibrate` `[70,100,70]`.

The rhythm is a function of the pattern only. `side`, `urgency` and `intensity` enter `buildCommand` only through the levels, which makes the property of R11.5.1 easy to state: the list of `ms` values does not depend on those arguments.

Levels are computed with plain multiplication of numbers in [0, 1], so they stay in [0, 1] (R6.5). `intensity` is already validated by `resolveHapticSettings`.

Open point: with `intensity` 0 every level is 0 and the band does not move, but `vibrate` still holds the rhythm and a phone would buzz. This feature plays the command as specified (R6.2) and leaves the choice to the later output feature, which can treat a command with all levels at 0 as "off". This is noted for the band feature, not decided here.

## Priority (R8)

```
priority = URGENCY_RANK[urgency] * 10 + CLASS_WEIGHT[class]
```

| | alarm | baby | vehicle | doorbell | knock | voice |
|---|---|---|---|---|---|---|
| high | 36 | 35 | 34 | 33 | 32 | 31 |
| medium | 26 | 25 | 24 | 23 | 22 | 21 |
| low | 16 | 15 | 14 | 13 | 12 | 11 |

The alarm outranks traffic at the same urgency (36 over 34, 26 over 24, 16 over 14). Urgency dominates across rows: a `high` voice (31) outranks a `low` alarm (16). So "alarm outranks vehicle" holds at equal urgency, and not when the classifier gave the alarm a lower urgency than the vehicle. The urgency comes from the pipeline and is outside this module.

## Engine state and decisions (R8, R9)

```ts
interface Playing { startMs: number; endMs: number; priority: number }

function createHapticEngine(settingsInput?: unknown): HapticEngine {
  const settings = resolveHapticSettings(settingsInput);      // a copy, read once
  const patterns = byClass(loadPatterns());                   // validated once
  let current: Playing | null = null;
  const lastStart = new Map<string, number>();                // key: class + '|' + side

  return {
    decide(input, nowMs) {
      if (!Number.isFinite(nowMs)) throw new RangeError('nowMs must be a finite number');
      const ev = input.event;
      if (ev.class === 'other') return drop('no-pattern');
      if (!settings.enabledClasses[ev.class]) return drop('disabled-class');
      if (ev.loudnessDb < settings.minLoudnessDb) return drop('too-quiet');
      const side = sideOf(ev, input.bearingConfidence);
      const key = ev.class + '|' + side;
      const last = lastStart.get(key);
      if (last !== undefined && !(nowMs - last >= settings.rateLimitMs)) return drop('rate-limited');
      const priority = priorityOf(ev.urgency, ev.class);
      if (current !== null && nowMs < current.endMs && priority <= current.priority) return drop('lower-priority');
      const command = buildCommand(patterns[ev.class], side, ev.urgency, settings.intensity, ev.id, priority);
      current = { startMs: nowMs, endMs: nowMs + command.totalMs, priority };
      lastStart.set(key, nowMs);
      return { action: 'play', command };
    },
  };
}
```

Notes:

- The checks run in the order of R9.2. `nowMs - last >= rateLimitMs` is written with a negation so that a clock that went back (`nowMs - last` negative) or a `NaN` result is treated as inside the rate limit (R9.6).
- Only the final lines change state, so a drop never does (R8.5, R9.5).
- `current` is a single slot. There is no queue (R8.3). A preempting command overwrites it. The preempted command was simply replaced. The caller's output driver stops the old command when it receives the new one. Stopping hardware is not this module's job.
- A new event that arrives after `endMs` finds `current` stale and plays whatever its priority (R8.6). The slot is not cleared, because comparing `nowMs < endMs` is enough and clearing would need a timer.
- The rate limit is checked before priority (R9.2). A same-class, same-side event inside the limit is dropped even if its urgency is higher than the one that played. This follows the rule as given (the same class and side within `rateLimitMs` of its last played start is dropped). If a rising urgency should break through, that is a change of this rule and needs a requirement of its own.
- With the default `rateLimitMs` 3000 and an alarm that lasts 3800 ms, the same alarm event at 3000 ms is not rate-limited but is dropped as `'lower-priority'` (equal priority while playing). At 3800 ms it plays again.
- `decide` throws only for a non-finite `nowMs` (R9.7). The audio-path pipeline passes `performance.now()` or the event's `t`, so this is a coding error and not user input. This is an assumption to confirm: the alternative is to drop silently, which would hide a bug in the caller.
- Settings are read once (R10.7). The UI creates a new engine when the user changes a setting. This loses the rate-limit memory and the current command, which is acceptable for a settings change. A `setSettings` method is not added, to keep the API small.

## Settings (R10)

```ts
export const DEFAULT_HAPTIC_SETTINGS: Readonly<HapticSettings> = Object.freeze({ ... });
function resolveHapticSettings(input: unknown): HapticSettings   // a new object each time
```

The function reads `input` only when it is a non-null non-array object. For `minLoudnessDb`, `intensity` and `rateLimitMs` it uses the value only if it passes the test of R10.4, and otherwise the default. For `enabledClasses` it takes an object and, for each of the six classes, uses the value only if it is `true` or `false`. It does not coerce (`'yes'`, `1` and `null` fall back to the default, which is `true`). A getter that throws is not handled specially: the function copies values inside a `try` and returns the defaults for that field if reading fails, so the "never throws" rule holds even for hostile objects.

`DEFAULT_MIN_LOUDNESS_DB` is -50 dBFS. A quiet room sits well below that, and the default lets a knock or a doorbell through while it filters hiss. The user changes it in the settings UI (a later feature).

## Mutation check (R12)

`tests/haptics/mutate.ts` follows `tests/bearing/mutate.ts`: a list of mutants, each with a file, a `find` text and a `replace` text. It refuses to start when `git status --porcelain src/haptics` is not empty, unless `--force`. It requires that each `find` text matches exactly once. It writes the mutant, runs `bunx vitest run tests/haptics`, restores the file in a `finally` block and on SIGINT and SIGTERM, and reports a table. It exits 1 on a survivor or a missing match.

| Mutant | File | Change | The test that should fail |
|---|---|---|---|
| `no-confidence-check` | `side.ts` | remove the `bearingConfidence < UNCERTAIN_CONFIDENCE` line | side unit test at 0.79; property "uncertain never sideKnown" |
| `swap-weights` | `constants.ts` | `alarm: 6` and `vehicle: 4` swapped | priority unit test (36 over 34) |
| `shrink-min-gap` | `constants.ts` | `MIN_GAP_MS = 80` becomes `10` | validator and `checkDistinctiveness` tests with a literal 50 ms gap |
| `copy-pattern` | `patterns.json` | the `vehicle` pulses become the `knock` pulses | distinctiveness test on the real file |

The `shrink-min-gap` mutant only dies because the tests use the literal 80 and a bad gap of 50 (R11.2). If the tests imported `MIN_GAP_MS` to build the bad gap, the mutant would survive. The same applies to the other constants. `patterns.json` is data, so `copy-pattern` edits it in place and the `find` text must match exactly once. The `find` text is the whole `vehicle` object, and the check depends on the file layout. Task 8.1 fixes the layout (one pattern per line) so the match is stable.

## Testing strategy (R11)

Unit tests use literal numbers for the rules of R2 (`80`, `40`, `0.8`, `15`, `150`). Property tests build events with `fast-check` arbitraries:

- `class`: one of the six, and sometimes `other` (only for the "other never plays" property);
- `urgency`: one of three;
- `bearingSource`, `bearingDeg` and `bearingConfidence`: arbitrary, including `null`, `NaN` and out of range values, with `bearingSource` and `bearingDeg` allowed to be inconsistent (the engine does not trust them);
- `loudnessDb`: in [-100, 0];
- `intensity`: in [0, 1], and junk (strings, `NaN`, negatives) for the settings property;
- event sequences with increasing `nowMs` for the sequence properties.

Seed fixed, at least 100 runs per property, as the bearing spec does. A test helper `makeEvent(overrides)` builds a valid `SoundEvent` (the id, label and times are filler) so unit tests state only the fields that matter.

The boundary test reads `src/haptics/*.ts`, removes comments, and checks imports and identifiers. `patterns.json` is allowed as an import. This test is part of the same `vitest run tests/haptics`, so it also runs in the mutation check.

## Accessibility and privacy

The haptic alert is one of three forms, and this module serves only that one. It returns `side` and `sideKnown` so the text alert can say "side unknown" when the bearing is weak, and it drops `other` so the band stays quiet while the ghost and the text still show the sound. No UI text is added here. No audio or label enters the module or the command. The module comment states that the band is an aid and not a safety device.

## Risks and open points

- The pattern timings are a proposal, tested only by numbers. Whether six rhythms are easy to tell apart on a wrist needs a try with the real band. The test guarantees a minimum difference, not that it feels clear.
- `intensity` 0 gives a silent band and a buzzing phone (see "Command building"). The output feature decides.
- A rising urgency of the same class and side inside the rate limit is dropped (see "Engine state and decisions").
- `nowMs` that is not finite throws. Confirm this choice with the pipeline feature.
