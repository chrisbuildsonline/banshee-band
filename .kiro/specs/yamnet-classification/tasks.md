# Tasks: YAMNet classification

Each task is small. Where the code is pure, write the test first, see it fail, then write the code. Run `bun run typecheck` and `bun run test` after each task. Requirement numbers refer to `requirements.md`. The spike in task 1 comes first because the rest depends on the model running in Node.

- [x] 1. Spike: get the real model and run it in Node
  - [x] 1.1 Download the YAMNet TF.js graph model and `yamnet_class_map.csv` into `public/models/yamnet/`, unchanged. Record the exact source URLs, version and retrieval date. Check the licence of the model and of the AudioSet ontology as published by their sources. If the total size is over 50 MB, stop and ask.
    - _Requirements: 1.1, 1.2, 1.7_
  - [x] 1.2 Write `public/models/yamnet/LICENSE.txt` (Apache 2.0 notice, per-file origin table, retrieval date, "unmodified") and `SHA256SUMS`.
    - _Requirements: 1.3, 1.4_
  - [x] 1.3 Add `@tensorflow/tfjs` to `dependencies` at an exact version (no `^`). Write a throwaway script outside `src/` that serves `public/models` through a `fetchFunc` (the first draft of `tests/classify/fs-fetch.ts`), loads the model with `tf.loadGraphModel` on the `cpu` backend, runs one 15600-sample frame of zeros and one clip frame, and prints `model.inputs`, the output shapes and order, the load time and the time per frame.
    - _Requirements: 1.5, 5.3, 5.12, 11.3_
  - [x] 1.4 Write the findings in the "Measured values" table in `design.md`. If an op is missing on `cpu`, the model input shape differs from 1-D, or a frame takes more than 10 s, stop and tell the user before going on. Delete the throwaway script.

- [ ] 2. Class map parser, test first
  - [ ] 2.1 Create `src/classify/constants.ts`, `src/classify/types.ts` and `src/classify/vite-env.d.ts`.
    - _Requirements: 11.4_
  - [ ] 2.2 Write `tests/classify/classmap.test.ts` (Requirement 8.1) and the parser round-trip property in `tests/classify/aggregate.property.test.ts` (Requirement 9.3). Add a stub `src/classify/classmap.ts` that throws `not implemented`, and confirm the tests fail for that reason.
    - _Requirements: 8.1, 9.3_
  - [ ] 2.3 Implement `parseClassMap` until the tests pass. Also run it on the real CSV.
    - _Requirements: 2.1-2.5_

- [ ] 3. Label map, test first
  - [ ] 3.1 Read the real `yamnet_class_map.csv` and write down, for each of the six specific classes, every display name that fits by its meaning. Decide the placement of overlapping names (sirens, `Beep, bleep`, `Child speech`, `Door`, `Thump, thud`). Do not look at the clip results yet.
    - _Requirements: 3.8_
  - [ ] 3.2 Write `tests/classify/labelmap.test.ts` (Requirement 8.2 to 8.8): real CSV, rule names exist, coverage of 521, named examples, `classForIndex`, `buildLabelMap` failures from modified copies. Add a stub `buildLabelMap`, and confirm failure.
    - _Requirements: 8.2-8.8, 8.11_
  - [ ] 3.3 Create `src/classify/rules.ts` and `src/classify/labelmap.ts` until the tests pass. Copy the final Rule lists into the "Measured values" table in `design.md`, and note any name from Requirement 3.8 or 8.6 that is not in the real CSV, with its replacement.
    - _Requirements: 3.1-3.10_

- [ ] 4. Aggregation, test first
  - [ ] 4.1 Add the `aggregateScores` unit cases (Requirement 8.9 and 8.10) to `tests/classify/labelmap.test.ts`, and the properties 9.2.1 to 9.2.11 to `tests/classify/aggregate.property.test.ts`, with the independent oracle from `design.md`. Add a stub and confirm failure.
    - _Requirements: 8.9, 8.10, 9.1, 9.2, 9.5_
  - [ ] 4.2 Create `src/classify/aggregate.ts` until the tests pass. Use `DEFAULT_THRESHOLD = 0.3` for now.
    - _Requirements: 4.1-4.10_

- [ ] 5. Classifier, loader and error type
  - [ ] 5.1 Create `src/classify/errors.ts` (`ClassifyError`, fixed plain-language messages, no URLs, no safety promises).
    - _Requirements: 5.10, 5.11_
  - [ ] 5.2 Create `tests/classify/fs-fetch.ts` (fake origin, path under `public/`, `..` refused, 404 for a missing file, records URLs) and `tests/classify/wav.ts` (16 kHz mono 16-bit PCM only, a clear error otherwise).
    - _Requirements: 7.2, 10.1_
  - [ ] 5.3 Write `tests/classify/classifier.integration.test.ts` for Requirements 6.2, 6.3 and 10.5 to 10.10 (loading requests, input handling, purity, order, tensor count, dispose, failure paths), with a 120 s file timeout. Add a stub `createClassifier` and confirm failure.
    - _Requirements: 6.2, 6.3, 10.1-10.3, 10.5-10.10_
  - [ ] 5.4 Create `src/classify/classifier.ts` and `src/classify/index.ts`: dynamic TF.js import, class map and label map load, `loadGraphModel` with `fetchFunc`, warm-up, validation, `tf.tidy`, queue, `dispose`. Only this file imports `@tensorflow/tfjs`. Run the test until it passes.
    - _Requirements: 5.1-5.13, 6.1, 6.4-6.6, 11.4, 11.5_

- [ ] 6. Real clips, threshold and Results file
  - [ ] 6.1 Create `tests/classify/clip-run.ts` and the clip tests in the integration file (Requirement 7.1 to 7.5, 7.12, 10.4). Create `tests/classify/report.ts` and the `classify:report` script in `package.json`.
    - _Requirements: 7.1-7.8, 7.12, 10.4_
  - [ ] 6.2 Run `bun run classify:report` once to a scratch location and look at the per-clip output: class counts and top labels for every clip. Write down what each clip's real top AudioSet labels are.
  - [ ] 6.3 If a clip fails, fix it only in the ways allowed by Requirement 7.11 (Rules by the meaning of the names, the one global `DEFAULT_THRESHOLD`, or the aggregation method with a recorded reason). Do not edit a clip, the manifest or an Expected class. After every change, re-run the unit and property tests, since a Rule change can break a named example. Record each change and its reason in `design.md`.
    - _Requirements: 7.11, 4.9_
  - [ ] 6.4 When all 6 clips pass, run `bun run classify:report` to write `tests/classify/clip-results.json`, and review it. Add the comparison with the committed file to the integration test (Requirement 7.9). Commit the Results file. Write the final threshold, the reason, the per-clip accuracy and the one-sentence caveat from Requirement 7.10 into `design.md`.
    - _Requirements: 4.9, 7.5-7.10_
  - [ ] 6.5 If a clip cannot pass with a fair change, do not mark this task done. Record the Results file with the failure, describe the cause, and tell the user.

- [ ] 7. Model file checks, boundary check and mutation check
  - [ ] 7.1 Create `tests/classify/model-files.test.ts` (Requirement 10.11) and `tests/classify/imports.test.ts` (Requirement 10.12). Also assert `FRAME_SIZE === WINDOW_SIZE` from `src/audio`.
    - _Requirements: 10.11, 10.12, 1.3, 1.4, 1.6, 6.5_
  - [ ] 7.2 Prove the tests can fail. Change the code one way at a time and confirm at least one test fails each time, then restore: `max` to `sum`; `>=` to `>`; reverse `CLASS_PRIORITY`; count unmapped scores into a specific class; remove one Rule name; change a shard's bytes; skip `tidy` disposal in `classify`; add an `import '../ui/...'` to a classify file. Do not commit the broken versions. Put the outcome in the commit message.
    - _Requirements: 9.4_

- [ ] 8. Final checks
  - Run `bun run typecheck`, `bun run test` and `bun run build`, then `bun run e2e` (no e2e change expected), and confirm they pass.
  - Check that the build has a separate TF.js chunk, that `dist/models/yamnet/` has the files unchanged (compare `SHA256SUMS`), and that `grep -rn "tfhub.dev\|kaggle.com\|storage.googleapis.com" dist src/classify` finds nothing.
  - Check `grep -rn "console\." src/classify` finds no logging of samples, scores or URLs.
  - Check `git status` shows changes only in the files allowed by Requirement 11.10, and none in `src/events`, `src/audio` or `public/clips`.
  - Check that `package.json` has `@tensorflow/tfjs` in `dependencies` at an exact version and no other new runtime dependency.
  - Tell the user: the final threshold and why; the per-clip results; the load time and per-frame time in Node and that the browser speed is not yet measured; the licence note for the ontology; and that the browser end-to-end no-request check is left to the feature that connects capture, classification and UI. Do not edit steering files unless asked.
  - _Requirements: 11.1-11.10_

## Done when

- `public/models/yamnet/` holds the unmodified model, class map, `LICENSE.txt` and `SHA256SUMS`, and `model-files.test.ts` passes.
- `buildLabelMap` over the real class map gives a class for all 521 Indexes, every Rule name exists in the CSV, and an unknown Index maps to `other`.
- The aggregation property tests pass at 200 runs or more, and the deliberately broken versions in task 7.2 each make a test fail.
- `createClassifier` loads the model in Node with `@tensorflow/tfjs` through `public/models`, requesting only the model, its shards and the class map from the given origin.
- Every clip in `public/clips/manifest.json` (6 at the time of writing) classifies to its Expected class, and `tests/classify/clip-results.json` is committed with the per-clip accuracy and matches a fresh run.
- `src/classify` imports only `src/events`, types from `src/audio`, its own files and `@tensorflow/tfjs`.
- `bun run typecheck`, `bun run test` and `bun run build` pass, and `bun run e2e` still passes.
