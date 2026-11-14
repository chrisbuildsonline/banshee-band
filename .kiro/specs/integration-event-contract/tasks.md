# Tasks: SoundEvent contract and CC0 sound clips

Each task is small and test-first: write the test, see it fail, then write the code. Run `bun run typecheck` and `bun run test` after each task. No e2e run is needed, since this feature has no UI. Requirement numbers refer to `requirements.md`.

- [x] 1. Create the constants and types
  - Create `src/events/constants.ts` (`SOUND_CLASSES`, `BEARING_SOURCES`, `URGENCY_LEVELS`, bearing range) and `src/events/types.ts` (`SoundEvent` and union types derived from the constants).
  - Create `src/events/index.ts` that re-exports them.
  - Confirm `src/events/` has no imports outside itself.
  - Write a type-level check in `tests/events/types.test.ts`: a sample event of type `SoundEvent` compiles, and `// @ts-expect-error` lines show that a wrong class, a wrong urgency and a missing field fail to compile.
  - _Requirements: 1.1-1.14, 7.2_

- [x] 2. Write the validator unit tests (they fail first)
  - [x] 2.1 Create `tests/events/validate.test.ts` with the `validEvent()` helper and the accept cases and boundary cases from design.md.
    - _Requirements: 5.1, 5.2_
  - [x] 2.2 Add reject cases: wrong type per field, out of range, `NaN`/`Infinity`, coupling, empty id, blank label, whole-input cases (`null`, primitives, array, function).
    - _Requirements: 2.5-2.10, 5.1_
  - [x] 2.3 Add hostile-input cases (throwing getter, revoked proxy, null prototype, circular, 1 MB strings) and shape cases (extra fields dropped, new object, input not mutated, all errors reported, no input value in error text).
    - _Requirements: 2.3, 2.4, 2.11-2.14_
  - [x] 2.4 Add a stub `src/events/validate.ts` that returns `{ ok: false, errors: ['not implemented'] }`. Run the tests and confirm the accept cases fail.
    - _Requirements: 5.9_

- [x] 3. Implement the validator
  - Implement `validateSoundEvent` as described in design.md: outer `try/catch`, read each field once, per-field checks, cross-field check, new object on success, field names only in errors.
  - Export `ValidationResult` and `validateSoundEvent` from `src/events/index.ts`.
  - Run the tests from task 2 until they pass.
  - _Requirements: 2.1-2.15_

- [x] 4. Write and run the validator property tests
  - [x] 4.1 Create `tests/events/arbitraries.ts` with `validEvent` and the per-field invalid-value generators from design.md.
    - _Requirements: 5.4, 5.5_
  - [x] 4.2 Create `tests/events/validate.property.test.ts` with properties P1 to P8. Use `numRuns: 500` for P1 to P3. Do not set a fixed seed.
    - _Requirements: 5.3-5.8_
  - [x] 4.3 Check P4 builds exactly one changed field: assert the other eight fields equal the original before validating.
    - _Requirements: 5.5_
  - [x] 4.4 If a property fails, read the shrunk counterexample, and decide whether the validator or the generator is wrong before changing either.
    - _Requirements: 5.8_

- [x] 5. Prove the tests can fail
  - Weaken the validator one way at a time and confirm a unit test and a property test each fail: remove the `<= 0` check on `loudnessDb`, remove the coupling check, accept `NaN` for `confidence`, copy extra fields into `event`, return the input object itself.
  - Restore the validator after each change. Run `bun run test` and confirm all pass.
  - Do not commit the weakened versions. Note the result in the commit message.
  - _Requirements: 5.9_

- [x] 6. Write the WAV reader and licence parser, test first
  - [x] 6.1 Create `tests/clips/wav.test.ts` with a `makeWav(frames, { sampleRate, channels, bits, format })` helper and cases: valid file, extra `LIST` chunk before `data`, truncated file, wrong `RIFF` header, non-PCM format, 8-bit samples, zero-length data, all-zero samples (`peak` is 0).
    - _Requirements: 6.4, 6.5, 6.9_
  - [x] 6.2 Add the property test: for any frames 1..2000 and sample rate 8000..48000, `durationSec` equals `frames / sampleRate`.
    - _Requirements: 6.4, 6.9_
  - [x] 6.3 Create `tests/clips/wav.ts` with `readWav` until the tests pass.
    - _Requirements: 6.4, 6.5, 6.9_
  - [x] 6.4 Create `tests/clips/licence.test.ts` (valid block, missing author, missing source, two blocks, blank lines, extra key) and then `tests/clips/licence.ts` with `parseLicence`.
    - _Requirements: 6.7_

- [ ] 7. Write the manifest test (it fails first)
  - Create `tests/clips/manifest.test.ts` with steps 1 to 7 from design.md. Collect all problems and fail once with the full list.
  - Run it with an empty `manifest.json` (`[]`) and confirm it fails because the manifest is empty. This shows 6.1 does not pass vacuously.
  - Then run it with the current `public/clips` (only `.gitkeep`) and confirm it fails and lists the missing classes.
  - _Requirements: 6.1-6.8, 6.10_

- [ ] 8. Source the clips (manual, one class at a time)
  - For each of `doorbell`, `knock`, `alarm`, `baby`, `vehicle`, `voice`, follow the sourcing procedure in design.md: find a candidate, open the source page and read the licence on it, listen to it, then download.
  - Trim to at most 10 s and convert to 16-bit PCM WAV (16 kHz mono preferred). Save as `public/clips/<name>-01.wav`.
  - Add the entry to `public/clips/LICENSE.txt` (file, source URL, author, licence, licence URL, changes, retrieved date) and to `public/clips/manifest.json` (file, class, label, durationSec, source) in the same step.
  - Run `bun run test` after each clip. The manifest test should list one fewer missing class each time.
  - For the `voice` clip, check that the speech is a public domain reading or similar, and has no personal data.
  - If no clearly CC0 or public domain clip exists for a class, stop, leave that class out and report it to the user. Do not use a synthetic or doubtful clip.
  - Delete `public/clips/.gitkeep` once real files are present.
  - _Requirements: 3.1-3.9, 4.1-4.9_

- [ ] 9. Final checks
  - Run `bun run typecheck` and `bun run test`, and confirm both pass.
  - Check that `src/events/` has no imports from other `src/` modules or from the DOM, for example with `grep -rn "from '" src/events`.
  - Check that `public/clips` is under 8 MB and holds only `.wav`, `manifest.json` and `LICENSE.txt`.
  - Open `LICENSE.txt` and check each entry by eye against its source page once more.
  - Tell the user that `product.md` (five classes) and `structure.md` (no `src/events/`) need a one-line update. Do not edit them unless asked.
  - _Requirements: 7.1-7.4_

## Done when

- `validateSoundEvent` rejects every malformed case in the unit and property tests, and never throws.
- The weakened-validator check in task 5 made tests fail.
- Every manifest clip exists, decodes as non-silent 16-bit PCM audio, matches its stated duration, and has a Licence entry with a CC0 or public domain licence, source URL and author.
- All six classes have at least one clip, or the missing classes are reported to the user with the reason.
- `bun run typecheck` and `bun run test` pass.
