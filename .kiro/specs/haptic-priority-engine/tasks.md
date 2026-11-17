# Tasks: Haptic priority engine

Each task is small and ends in a test gate. Write the test first, see it fail for the right reason (a stub that throws `not implemented`), then implement. Run `bun run typecheck` and `bun run test` at every gate. Requirement numbers refer to `requirements.md`. Do not add dependencies. Tests use literal numbers for the rules of Requirement 2 (see Requirement 11.2).

- [x] 1. Contract, constants and boundaries
  - [x] 1.1 Create `src/haptics/constants.ts`, `types.ts` and `index.ts` (types and constants only; put the module comment of Requirement 13.3 in `index.ts`). Check that `tsconfig.json` has `resolveJsonModule` and turn it on if not.
    - _Requirements: 1.1, 2.1, 2.2, 13.3_
  - [x] 1.2 Write `tests/haptics/boundaries.test.ts`: scan `src/haptics/*.ts` (comments removed) for imports other than `../events`, `./*` and `./patterns.json`, and for the forbidden identifiers. Write `tests/haptics/constants.test.ts`: the nine values of Requirement 2.1 as literals, and `PATTERN_CLASSES` plus `'other'` equals `SOUND_CLASSES` as a set.
    - _Requirements: 1.2, 1.3, 1.4, 1.7, 2.1, 2.2_
  - **Gate:** `typecheck` and `test` pass.

- [x] 2. Patterns, validation and distinctiveness
  - [x] 2.1 Write `tests/haptics/patterns.test.ts` for `validatePatternData` and `loadPatterns`: one bad example per rule of Requirement 3 (missing class, extra class, a pattern for `other`, empty `pulses`, non-integer `onMs`, `NaN`, `Infinity`, last gap not 0, inner gap 50, pulse 30, cycle 1600, total 4100, `repeat.count` 0, `repeat.pauseMs` 200, `repeat` on `knock`, no `repeat` on `alarm`); junk input (`null`, `42`, `'x'`, `{}`, `[null]`) returns errors and does not throw; `loadPatterns()` returns six patterns in `PATTERN_CLASSES` order, twice the same value, and mutating one result does not change the next. Add stubs and confirm failure.
    - _Requirements: 3.1-3.11_
  - [x] 2.2 Write `tests/haptics/distinct.test.ts` for `patternDistance` and `checkDistinctiveness`: symmetry, zero distance to itself, different pulse counts are distinct, equal counts at distance 149 and 150, `Infinity` for unequal lengths, one bad example for each violation kind (`'not-distinct'`, `'pulse-too-short'`, `'gap-too-short'`, `'cycle-too-long'`, `'total-too-long'`, `'pause-too-short'`), several violations in one call, and an empty result for `patterns.json`. Add stubs and confirm failure.
    - _Requirements: 4.1-4.7_
  - [x] 2.3 Create `src/haptics/patterns.json` with the six patterns of the design (one pattern per line, so the mutation check of task 8 can match one). Implement `patterns.ts` and `distinct.ts` until the tests pass.
    - _Requirements: 3.1-3.11, 4.1-4.7_
  - [x] 2.4 Print the pairwise distance table of the real patterns once (a throwaway test run or REPL, not committed) and check it against the table in `design.md`. If a number differs or a pair is close to 150, change the data and update the design table in the same change.
    - _Requirements: 4.2, 4.3, 4.7_
  - **Gate:** `patterns.test.ts`, `distinct.test.ts` and `boundaries.test.ts` pass.

- [x] 3. Side from bearing
  - [x] 3.1 Write `tests/haptics/side.test.ts`: confidence 0.79 gives `'unknown'` and 0.8 gives a side; bearings of -15.01, -15, 0, 15 and 15.01 (`'left'`, `'centre'`, `'centre'`, `'centre'`, `'right'`); sources `'loudness'` and `'none'` with confidence 1 give `'unknown'`; `bearingDeg` null, `NaN`, confidence `NaN`, -0.1, 1.1 and a string give `'unknown'` and do not throw; negative is left and positive is right. Add a stub and confirm failure.
    - _Requirements: 5.1-5.7_
  - [x] 3.2 Implement `src/haptics/side.ts` (`sideOf`) as in the design.
  - **Gate:** `side.test.ts` passes.

- [x] 4. Priority and settings
  - [x] 4.1 Write `tests/haptics/priority.test.ts`: all 18 values as literals (36 down to 11 as in the design table), alarm over vehicle at each urgency, `high` voice over `low` alarm, the class order at one urgency. Add a stub and confirm failure.
    - _Requirements: 8.1, 8.2, 8.8_
  - [x] 4.2 Implement `src/haptics/priority.ts`.
  - [x] 4.3 Write `tests/haptics/settings.test.ts`: defaults as literals (all six on, -50, 1, 3000); `DEFAULT_HAPTIC_SETTINGS` is frozen; `resolveHapticSettings` returns a new object each time; each field with a bad value (`NaN`, `Infinity`, a string, `null`, -1 or 2 for `intensity`, 5 for `minLoudnessDb`, -1 for `rateLimitMs`) falls back alone and leaves the other fields as given; a non-boolean class value falls back to `true`; an unknown class key is ignored; `undefined`, `null`, `'junk'`, `[]` and an object with a throwing getter give the defaults and do not throw. Add a stub and confirm failure.
    - _Requirements: 10.1-10.5_
  - [x] 4.4 Implement `src/haptics/settings.ts`.
  - **Gate:** `priority.test.ts` and `settings.test.ts` pass.

- [x] 5. Command building
  - [x] 5.1 Create `tests/haptics/helpers/events.ts` (`makeEvent(overrides)` builds a valid `SoundEvent`, `makeInput` adds `bearingConfidence`). Write `tests/haptics/command.test.ts`: exact `segments`, `vibrate` and `totalMs` for `knock` (left, high; right, low), `voice` (one pulse, so one segment), `doorbell`, `vehicle`, `baby` and `alarm` (with repeats: 3 pulses, 4 cycles, 400 ms pauses, 3800 ms); levels for left, right, centre and unknown at each urgency and at intensity 1, 0.5 and 0; motor levels 0.3 times the level on the other side as literals; segments start and end with a pulse and alternate; no segment has `ms` 0; mutating a command does not change the next one. Add a stub and confirm failure.
    - _Requirements: 6.1-6.7, 7.1-7.7_
  - [x] 5.2 Implement `src/haptics/command.ts` (`buildCommand`) as in the design.
  - **Gate:** `command.test.ts` passes.

- [x] 6. Engine
  - [x] 6.1 Write `tests/haptics/engine.test.ts`:
    - every drop reason: `'no-pattern'` for `other` (also when the class is off and when it is loud), `'disabled-class'`, `'too-quiet'` at -50.01 versus -50 as the threshold, `'rate-limited'` and `'lower-priority'`;
    - the order of Requirement 9.2 with an event that meets two reasons at once (`other` that is also quiet; a disabled class that is also quiet; a quiet event that is also in the rate limit);
    - preemption: a `high` alarm preempts a `low` knock that is playing; `medium` vehicle preempts nothing when a `high` alarm plays; an equal priority is dropped; an event after `startMs + totalMs` plays whatever its priority (also at exactly `startMs + totalMs`);
    - stale drop: a dropped event is never played by a later call, and a drop leaves the state unchanged (the next call behaves as if the dropped call did not happen);
    - rate limit: the same class and side at `rateLimitMs - 1` is dropped and at `rateLimitMs` plays; another side and another class are not limited; side `'unknown'` is a side of its own; a clock that goes back is `'rate-limited'`; a custom `rateLimitMs`; only played events update the last start;
    - the 3000 ms alarm case of the design (`'lower-priority'` at 3000, play at 3800);
    - the command's `eventId`, `class`, `side`, `sideKnown` and `priority`;
    - settings: junk and `undefined` give a working engine; changing the passed object later does not change the engine; `enabledClasses` off for one class only affects that class;
    - `decide` throws `RangeError` for `NaN` and `Infinity` as `nowMs` and for nothing else.
    Add a stub and confirm failure.
    - _Requirements: 8.3-8.7, 9.1-9.8, 10.6, 10.7_
  - [x] 6.2 Implement `src/haptics/engine.ts` (`createHapticEngine`) and export the public API from `index.ts` (doc comment on every export).
    - _Requirements: 1.5, 1.6, 9.1-9.8, 13.3_
  - **Gate:** `engine.test.ts` and `boundaries.test.ts` pass, then `typecheck` and the whole `test` run.

- [x] 7. Property tests
  - [x] 7.1 Write `tests/haptics/properties.test.ts` with the eight properties of Requirement 11.5 (fixed `fast-check` seed, at least 100 runs each). Use the arbitraries of the design (inconsistent `bearingSource` and `bearingDeg`, `NaN`, junk settings, sequences with increasing `nowMs`).
    - _Requirements: 11.5, 6.6, 5.5, 7.4, 6.5, 8.5, 8.7_
  - [x] 7.2 If a property fails, decide whether the code or the requirement is wrong. Fix the code, or stop and ask when a requirement needs to change. Do not weaken a property to make it pass.
  - [x] 7.3 Check the property run time (`vitest` output). Keep the whole `tests/haptics` run under about 10 seconds, and lower `numRuns` only for the sequence properties and not below 100.
  - **Gate:** `properties.test.ts` passes; `typecheck` and `test` pass.

- [x] 8. Mutation check
  - [x] 8.1 Write `tests/haptics/mutate.ts` and add `"haptics:mutate": "bun run tests/haptics/mutate.ts"` to `package.json`. Mutants: `no-confidence-check`, `swap-weights`, `shrink-min-gap`, `copy-pattern`. It refuses on uncommitted changes in `src/haptics/` without `--force`, requires each `find` text to match exactly once, restores in `finally` and on SIGINT and SIGTERM, and exits 1 on a survivor or a missing match. Confirm the `patterns.json` layout from task 2.3 gives one match for the `vehicle` object.
    - _Requirements: 12.1-12.7, 14.3_
  - [x] 8.2 If `src/haptics/` is dirty, ask the user before running with `--force`. Run `bun run haptics:mutate` and paste the killed/survived table into "Mutation check" in `design.md`.
  - [x] 8.3 For each surviving mutant, add or tighten a test (for example a literal bound in the validator test, or a direct `sideOf` case) and run again until all four are killed. Confirm with `git diff --stat src/haptics` that the source is unchanged after the run.
    - _Requirements: 12.6_
  - **Gate:** `bun run haptics:mutate` exits 0 with all four mutants killed.

- [x] 9. Review and final gates
  - [x] 9.1 Check the doc comments of every export and the module comment in `index.ts` (it says the module decides what to play, rhythm identifies the class, intensity encodes urgency and side only, and the band is an aid and not a safety device).
    - _Requirements: 13.3, 13.4_
  - [x] 9.2 Check that no code outside `src/haptics/` and `tests/haptics/` changed, apart from `package.json` (and `tsconfig.json` if task 1.1 needed it): `git diff --stat`.
    - _Requirements: 1.2, 14.2, 14.3_
  - [x] 9.3 Final gates: `bun run typecheck`, `bun run test`, `bun run e2e`, `bun run haptics:mutate`. This feature adds no UI, so the e2e run only shows that nothing else broke.
    - _Requirements: 14.1_
  - **Gate:** `typecheck`, `test` and `e2e` exit 0 (all green), and `haptics:mutate` exits 0.
