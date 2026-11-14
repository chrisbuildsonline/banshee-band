# Requirements: YAMNet classification

## Introduction

Banshee Band must know what a sound is. Audio capture (see `.kiro/specs/audio-capture`) delivers mono frames of 15600 samples at 16000 Hz. This feature (F4) runs each frame through the real YAMNet model in TensorFlow.js and turns the 521 AudioSet scores into one of the seven sound classes in `src/events`: knock, doorbell, alarm, baby, vehicle, voice, other. It lives in `src/classify/`.

The model files are bundled in `public/models/yamnet/` and loaded from the app's own origin. Nothing is fetched from a third party at run time.

This feature does not capture audio, estimate bearing, measure loudness, decide urgency, build `SoundEvent` records, drive haptics or ghosts, or add any UI text. It returns `{ class, label, confidence }` and nothing more.

Terms:

- **Frame**: a `Float32Array` of exactly 15600 mono samples at 16000 Hz, values in -1 to 1. It is `MonoFrame.samples` from `src/audio`.
- **Model**: the YAMNet TF.js graph model (`model.json` plus weight shards) in `public/models/yamnet/`.
- **Class map**: `public/models/yamnet/yamnet_class_map.csv`, the AudioSet ontology subset YAMNet predicts. It has a header row and 521 rows with `index`, `mid` and `display_name`.
- **Scores**: the 521 values the Model returns for one Frame. Each is an independent probability from 0 to 1 (a sigmoid output). They do not sum to 1.
- **Index**: a position 0 to 520 in the Scores and in the Class map.
- **Rule**: one entry in the label map that assigns an AudioSet display name to a sound class.
- **Member**: an Index whose class, according to the label map, is a given sound class.
- **Aggregate**: the score of a sound class for one Frame, computed from its Members (Requirement 4).
- **Threshold**: the minimum Aggregate that a specific class needs to be chosen over `other` (Requirement 4).
- **Specific class**: any of knock, doorbell, alarm, baby, vehicle, voice. `other` is the seventh class.
- **Expected class**: the `class` field of a clip in `public/clips/manifest.json`.
- **Clip run**: classifying every Frame of one clip (Requirement 7).
- **Results file**: `tests/classify/clip-results.json`, committed to the repository (Requirement 7).

## Requirements

### Requirement 1: Bundled model files

**User story:** As a user who cares about privacy, I want the classifier model to ship with the app, so that no sound or request leaves my device or reaches a third party.

#### Acceptance criteria

1. THE repository SHALL contain the YAMNet TF.js graph model in `public/models/yamnet/`: `model.json` and every weight shard file named in its `weightsManifest`.
2. THE repository SHALL contain `public/models/yamnet/yamnet_class_map.csv`, the AudioSet class map with 521 data rows, with `index` values 0 to 520 in order and no gaps.
3. THE directory SHALL contain `LICENSE.txt` that states: the licence is Apache License 2.0; the origin of the model (name, publisher, version or retrieval URL); the origin of the class map and the AudioSet ontology (and its own licence, as published by its source); the retrieval date; and whether the files were changed (they SHALL NOT be changed).
4. THE directory SHALL contain `SHA256SUMS` listing the SHA-256 digest of every other file in it, so that a reviewer can detect a modified or truncated file.
5. THE model SHALL take a one-dimensional waveform of float32 samples at 16000 Hz and SHALL return at least the Scores as an array of shape `[frames, 521]`. For a 15600-sample input, `frames` SHALL be 1.
6. THE app code SHALL NOT reference any model URL outside the app's own origin. `src/classify/` SHALL NOT contain `tfhub.dev`, `kaggle.com`, `storage.googleapis.com` or any other absolute `http(s)://` URL, and SHALL NOT pass `fromTFHub: true`.
7. THE bundled model files SHALL be served as static files and SHALL NOT need a backend, an account or an API key.

### Requirement 2: Class map parsing

**User story:** As a developer, I want the class names read from the bundled CSV, so that the label map is checked against the real ontology and not against a copy I typed.

#### Acceptance criteria

1. THE `src/classify/` module SHALL export a pure function `parseClassMap(csvText: string): ClassMapEntry[]`, where `ClassMapEntry` is `{ index: number; mid: string; name: string }`.
2. THE parser SHALL accept a header row `index,mid,display_name`, quoted fields that contain commas (for example `"Male speech, man speaking"`), doubled quotes inside a quoted field, `\n` and `\r\n` line endings, and a trailing newline.
3. IF the header is not exactly `index,mid,display_name`, a row does not have three fields, an `index` is not the next integer in order starting at 0, a `mid` or `name` is empty, or the row count is not 521, THEN THE parser SHALL throw an `Error` whose message names the first problem and its line number.
4. THE parser SHALL NOT read files, call `fetch` or touch the DOM. The caller supplies the text.
5. THE parser SHALL return the entries in index order and SHALL NOT mutate or retain its input.

### Requirement 3: Label map

**User story:** As the author of the haptic engine, I want every AudioSet class to map to one of our seven classes, so that every sound gets a known class and unknown sounds become `other`.

#### Acceptance criteria

1. THE label map SHALL be a pure TypeScript module `src/classify/labelmap.ts` that imports only `src/events` (for `SoundClass` and `SOUND_CLASSES`), with no TensorFlow, DOM, Node or file access.
2. THE label map SHALL hold its Rules as data: a table from a specific class to a list of exact AudioSet `display_name` strings. A Rule SHALL be keyed by display name and not by a literal index, so that the table can be read by a person and checked against the Class map.
3. THE label map SHALL export `buildLabelMap(classMap: ClassMapEntry[]): LabelMap`, which resolves every Rule name to its Index using the Class map. The `LabelMap` SHALL hold `names` (521 display names), `classOf` (a length-521 array giving the sound class of each Index) and `members` (for each sound class, its Indexes in ascending order).
4. IF a Rule names a display name that is not in the Class map, or if the Class map contains a display name twice and a Rule names it, THEN `buildLabelMap` SHALL throw an `Error` that names that string.
5. IF one Index would be assigned to two different specific classes, THEN `buildLabelMap` SHALL throw an `Error` that names the Index, its display name and both classes.
6. EVERY Index that no Rule names SHALL map to `other`. THE label map SHALL NOT leave any Index in 0 to 520 without a class.
7. THE `LabelMap` SHALL expose `classForIndex(index: number): SoundClass`, which SHALL return `other` for an index that is not an integer from 0 to 520 (including negative, fractional, `NaN`, and 521 or more), and SHALL NOT throw.
8. EACH of the six specific classes SHALL have at least one Member, and the Members of the six specific classes SHALL include these AudioSet classes, which the clips and the product description call for. The final lists are set in task 3 against the Class map and recorded in `design.md`:
   - knock: the AudioSet class `Knock`, and other door-knock and tap classes that exist in the Class map.
   - doorbell: `Doorbell` and `Ding-dong`, if present.
   - alarm: the smoke detector and fire alarm classes, and general alarm classes (`Alarm`, `Buzzer`, `Alarm clock`, `Siren`, `Beep, bleep`), where present.
   - baby: `Baby cry, infant cry` and, where present, `Crying, sobbing` and `Whimper`.
   - vehicle: `Vehicle horn, car horn, honking`, `Car`, `Truck`, `Bus`, `Motorcycle`, `Emergency vehicle`, and similar road vehicle classes, where present.
   - voice: `Speech` and its sub-classes (male, female, child speech, conversation, narration), `Shout`, `Yell`.
9. THE label map SHALL NOT map any class to a specific class by a substring or pattern match. It SHALL use exact names only, so that a new or renamed ontology entry cannot be mapped by accident.
10. THE label map SHALL be deterministic and SHALL NOT change after `buildLabelMap` returns. `members` and `classOf` SHALL be frozen or typed read-only.

### Requirement 4: Score aggregation and confidence threshold

**User story:** As a user, I want a sound to be reported as one clear class, even when the model splits its belief over several similar AudioSet classes, so that I get one alert and not three.

#### Acceptance criteria

1. THE label map module SHALL export a pure function `aggregateScores(scores: ArrayLike<number>, map: LabelMap, options?: { threshold?: number }): Classification`, where `Classification` is `{ class: SoundClass; label: string; confidence: number }`.
2. THE function SHALL throw a `RangeError` if `scores` does not have length 521, or if any value is not finite or is outside 0 to 1, or if `threshold` is not a finite number from 0 to 1. The message SHALL name the argument.
3. THE Aggregate of a sound class SHALL be the maximum Score among its Members. A class with no Members SHALL have an Aggregate of 0. The Aggregate SHALL NOT be a sum, because the Scores are independent probabilities and a sum can exceed 1.
4. THE function SHALL choose the specific class with the greatest Aggregate. IF that Aggregate is greater than or equal to the Threshold, THEN the result `class` SHALL be that class. OTHERWISE the result `class` SHALL be `other`.
5. IF two specific classes have equal Aggregates, THEN THE function SHALL choose the class that comes first in this fixed priority order: alarm, baby, doorbell, knock, vehicle, voice. The order is deterministic and puts the classes that need a fast reaction first.
6. WHEN the result `class` is a specific class, THE `label` SHALL be the `display_name` of the Member with the highest Score (the lowest Index if tied), and `confidence` SHALL be the Aggregate.
7. WHEN the result `class` is `other`, THE `label` SHALL be the `display_name` of the Index with the highest Score among the Indexes that map to `other` (the lowest Index if tied), and `confidence` SHALL be the `other` Aggregate computed the same way as in 4.3.
8. THE `confidence` SHALL be a finite number from 0 to 1, and `label` SHALL be a non-empty string.
9. THE default Threshold SHALL be a single named constant `DEFAULT_THRESHOLD` exported from `src/classify`. It SHALL be one global value for all classes. Its value is chosen in task 6 by measuring all six clips and is recorded in `design.md` and in the Results file. It SHALL NOT be tuned per clip.
10. THE function SHALL NOT mutate `scores`, SHALL NOT read any global state, and SHALL give the same result for the same input on every call.
11. THE user-chosen minimum loudness and the per-class on/off settings are NOT applied here. They belong to the settings feature, which filters the `Classification` after the fact.

### Requirement 5: Classifier

**User story:** As the author of the app pipeline, I want one call that turns an audio frame into a class, so that I do not touch TensorFlow.js myself.

#### Acceptance criteria

1. THE `src/classify/` module SHALL export `createClassifier(options?: ClassifierOptions): Promise<Classifier>`, where `ClassifierOptions` is `{ modelUrl?: string; classMapUrl?: string; threshold?: number; fetchFunc?: typeof fetch }` and `Classifier` has `classify(frame: Float32Array): Promise<Classification>` and `dispose(): void`.
2. THE default `modelUrl` SHALL be `${import.meta.env.BASE_URL}models/yamnet/model.json` and the default `classMapUrl` SHALL be `${import.meta.env.BASE_URL}models/yamnet/yamnet_class_map.csv`, so that both are relative to the app's own origin. WHERE a caller passes another URL, THE loader SHALL use it as given. The `fetchFunc` option is the seam that lets Node tests serve the files from disk.
3. THE `createClassifier` function SHALL load the Model with `tf.loadGraphModel` from `@tensorflow/tfjs`, SHALL fetch and parse the Class map with `parseClassMap`, SHALL build the label map with `buildLabelMap`, and SHALL resolve only when all three are ready. It SHALL NOT load the Model, call `fetch` or create a tensor when the module is imported, and SHALL do so only inside `createClassifier`.
4. THE `classify` method SHALL accept a `Float32Array` of exactly 15600 samples. IF the length is different, or any sample is not finite, THEN it SHALL reject with a `ClassifyError` of code `invalid-frame`.
5. THE `classify` method SHALL NOT change the Frame it is given. It SHALL NOT keep a reference to it after the returned promise settles.
6. THE `classify` method SHALL run the Model on the Frame as a one-dimensional float32 tensor, read the first row of the Scores, check it has 521 values, and pass it to `aggregateScores`. IF the Model returns a different shape, THEN it SHALL reject with a `ClassifyError` of code `inference-failed`.
7. THE `classify` method SHALL dispose every tensor it creates or receives, on success and on failure. After 50 calls, `tf.memory().numTensors` SHALL be the same as after the first call.
8. WHEN `classify` is called again before an earlier call has settled, THE Classifier SHALL run the calls one after the other in call order, so that results come back in the order the Frames were given.
9. WHEN `dispose` is called, THE Classifier SHALL release the Model. A later `classify` call SHALL reject with a `ClassifyError` of code `disposed`.
10. THE `ClassifyError` SHALL be an `Error` with a `code` of `model-load-failed`, `class-map-invalid`, `invalid-frame`, `inference-failed` or `disposed`, and a plain-language `message` that says what happened and what the user can do. The message SHALL NOT promise safety or protection. `createClassifier` SHALL reject with `model-load-failed` when the model or a shard cannot be fetched or parsed, and with `class-map-invalid` when the Class map or the label map cannot be built.
11. THE error messages SHALL be fixed strings. They SHALL NOT include URLs, the thrown error's own message, scores or sample values.
12. THE Classifier SHALL set the TensorFlow.js backend only when the caller has not already chosen one, and SHALL wait for `tf.ready()` before it loads the Model. In the browser the default backend (WebGL, with CPU as the fallback) is acceptable, and in Node it SHALL be `cpu`.
13. THE `classify` method SHALL give the same `class` and `label` for the same Frame on repeated calls, and a `confidence` that differs by at most 1e-6.

### Requirement 6: Local-only loading

**User story:** As a user who cares about privacy, I want proof that loading and running the model makes no request outside the app, so that I do not have to trust the code by reading it.

#### Acceptance criteria

1. WHEN `createClassifier` loads the Model and the Class map, THE only requests SHALL be `GET` requests for `modelUrl`, for each weight shard named in `model.json` (resolved relative to `modelUrl`), and for `classMapUrl`.
2. THE integration test SHALL stub the `fetchFunc` with a function that serves files from `public/models/yamnet/` and records each URL it receives. THE test SHALL fail if any recorded URL is on another origin than the base URL it gave, if any path is outside `/models/yamnet/`, or if a shard that `model.json` lists was not requested.
3. THE test SHALL also fail if `globalThis.fetch` is called directly during `createClassifier` or `classify` with the stub in place, to prove no hidden request bypasses `fetchFunc`.
4. THE `classify` method SHALL make no request of any kind.
5. THE `src/classify/` module SHALL NOT use `XMLHttpRequest`, `WebSocket`, `navigator.sendBeacon`, `localStorage`, `indexedDB` or `caches`. It SHALL NOT call `model.save` and SHALL NOT use the TF.js IndexedDB cache scheme (`indexeddb://`).
6. THE module SHALL write no Frame samples, Scores, labels or confidence values to the console, to storage or to the network. THE only console output permitted is an error name, never data.
7. THE browser end-to-end check required by the privacy steering (a Playwright test that fails on any unexpected request while listening) belongs to the feature that connects capture, classification and the UI. This feature provides the Node-level equivalent in 6.2 and 6.3.

### Requirement 7: Real-clip accuracy and the Results file

**User story:** As a developer and as a judge of this project, I want to see that the real model labels the real recordings correctly, so that I know the label map works on actual sound and not only on made-up numbers.

#### Acceptance criteria

1. THE integration test SHALL read `public/clips/manifest.json` and process every entry. At the time of writing there are 6 clips: doorbell-01, knock-01, alarm-smoke-01, baby-cry-01, vehicle-horn-01, voice-speech-01. The test SHALL NOT use a hard-coded list of clip names, and SHALL fail if the manifest has fewer than 6 entries, or if an entry's `class` is not a member of `SOUND_CLASSES`.
2. THE Clip run SHALL decode the clip's WAV file (16 kHz mono 16-bit PCM, per `public/clips/LICENSE.txt`) to floats by dividing each sample by 32768, with a small WAV reader in `tests/classify/wav.ts`. IF a clip is not 16 kHz mono 16-bit PCM, THEN the test SHALL fail with a message that says so, and SHALL NOT resample.
3. THE Clip run SHALL cut the samples into Frames with `createFramer()` from `src/audio` (window 15600, hop 7800), and classify each Frame with the real Model through `createClassifier`. A Frame that is not complete SHALL NOT be classified or padded.
4. THE clip-level class SHALL be the sound class that the most Frames received. IF two or more classes tie for the most Frames, THEN the clip-level class SHALL be `other`, so that a tie cannot pass as a correct answer.
5. A clip SHALL pass IF AND ONLY IF its clip-level class equals its Expected class. The integration test SHALL fail if any clip does not pass. It SHALL NOT skip, retry or loosen a failing clip.
6. THE per-clip accuracy SHALL be recorded as the number of Frames whose class equals the Expected class divided by the number of Frames, together with the Frame counts.
7. THE Results file SHALL be a committed JSON file with, for each clip: `id`, `file`, `expected`, `clipClass`, `pass`, `frames`, `frameAccuracy`, `classCounts` (a count for each of the seven classes), `meanConfidence` (the mean `confidence` of the Frames whose class equals the Expected class, or `null` if there are none), and `topLabel` (the most frequent `label` among the Frames whose class equals the Expected class, or `null`). It SHALL also hold `threshold`, `modelSha256` (the digest of `model.json` from `SHA256SUMS`), `tfjsVersion`, `backend`, `generatedBy` (the script name) and an `overall` object with `clips`, `passed` and `meanFrameAccuracy`. It SHALL NOT hold a timestamp, a machine name, a user name or a path, so that rerunning gives a byte-identical file on the same inputs.
8. THE project SHALL provide a script `bun run classify:report` that runs the Clip run and writes the Results file, with numbers rounded to 4 decimal places.
9. WHEN `bun run test` runs, THE integration test SHALL run the Clip run again and compare it with the committed Results file. It SHALL require the fields `id`, `file`, `expected`, `clipClass`, `pass`, `frames`, `classCounts` and `topLabel` to be equal, and SHALL require `frameAccuracy` and `meanConfidence` to match within 0.01. It SHALL NOT write the file. IF they differ, THEN the failure message SHALL tell the developer to run `bun run classify:report` and review the diff.
10. THE Results file SHALL be accompanied by one sentence in `design.md` that says it is a regression check on six clips, and not a measure of how well the classifier works on other recordings.
11. THE Results file SHALL report any failing clip honestly. A developer SHALL NOT change a clip, its Expected class, or the manifest to make the test pass. IF a clip fails, THEN the allowed fixes are a change to the label map Rules (Requirement 3), a change to the single global `DEFAULT_THRESHOLD`, or a change to the aggregation method with a recorded reason, in all cases justified by the AudioSet names and not by the clip file name.
12. THE integration test SHALL also record, per clip, the mean time of `classify` in milliseconds, and print it to the test output (not into the Results file, because it varies by machine). It SHALL NOT assert a speed.

### Requirement 8: Unit tests for the class map and the label map

**User story:** As a developer, I want the mapping proven without a model or a browser, so that a wrong mapping fails fast.

#### Acceptance criteria

1. THE tests in `tests/classify/classmap.test.ts` SHALL cover Requirement 2 with concrete examples: a valid full-size CSV generated in the test (521 rows with `index` 0 to 520); quoted commas; doubled quotes; `\r\n`; a trailing newline; and each failure in 2.3 (wrong header, wrong field count, index gap, empty name, empty mid, 520 rows, 522 rows) with the line number in the message.
2. THE tests in `tests/classify/labelmap.test.ts` SHALL load the real `public/models/yamnet/yamnet_class_map.csv` from disk, parse it, and build the label map from it.
3. THE tests SHALL check that every Rule name exists in the Class map, so that a typo fails the test.
4. THE tests SHALL check that every Index 0 to 520 has a class that is a member of `SOUND_CLASSES`, and that `classOf` has length 521. This is the check that "every AudioSet index used is covered".
5. THE tests SHALL check that every Index named by a Rule appears in exactly one class's `members`, that `members` over the seven classes together has 521 entries with no duplicate, and that each of the six specific classes has at least one Member.
6. THE tests SHALL check named examples against the real Class map: `Doorbell` maps to doorbell, `Knock` to knock, `Smoke detector, smoke alarm` to alarm, `Baby cry, infant cry` to baby, `Vehicle horn, car horn, honking` to vehicle, `Speech` to voice, and a clearly unrelated class such as `Music` or `Silence` to other. IF a name above is not in the Class map, THEN the task that creates the label map SHALL replace it by the name that is, and record that in `design.md`.
7. THE tests SHALL check that `classForIndex` returns `other` for -1, 521, 1000, 0.5, `NaN`, `Infinity` and `-Infinity`, and does not throw.
8. THE tests SHALL check that `buildLabelMap` throws for each of: a Rule name that is not in the Class map (error names the string); a display name that appears twice in a Class map and is named by a Rule; an Index that two classes would claim (error names the Index and both classes). These tests build the failing case from a modified copy of the Class map or the Rule table, not by editing the real Rules.
9. THE tests SHALL check `aggregateScores` with hand-built score arrays: an all-zero array gives `other`; one doorbell Member at 0.9 gives doorbell, that Member's name as `label`, and confidence 0.9; two alarm Members at 0.6 and 0.4 give confidence 0.6 (max, not sum); a doorbell Aggregate of exactly the Threshold gives doorbell, and just under it gives `other`; a tie between alarm and voice gives alarm; a tie between knock and vehicle gives knock; `other` carries the label and confidence of the best `other` Index; and each invalid input in 4.2 gives a `RangeError` that names the argument.
10. THE tests SHALL check that a high Score on an unmapped Index does not raise a specific class: an `other` Index at 1.0 with a doorbell Member at 0.3 below a Threshold of 0.5 gives `other` with confidence 1.0, and with a Threshold of 0.2 gives doorbell with confidence 0.3.
11. THE tests SHALL run without TensorFlow.js, a browser or network access, and SHALL finish in under 2 seconds.

### Requirement 9: Property tests for aggregation

**User story:** As a developer, I want the aggregation checked against thousands of random score vectors, so that the rules hold for inputs I did not think of.

#### Acceptance criteria

1. THE tests in `tests/classify/aggregate.property.test.ts` SHALL use fast-check with the real label map built from the real Class map, and SHALL use arbitrary arrays of 521 numbers from 0 to 1 (including 0 and 1, and sparse arrays where most values are 0). They SHALL NOT fix the seed in a way that hides failures, and fast-check SHALL report shrunk counterexamples.
2. THE tests SHALL check as properties, for arbitrary scores and an arbitrary Threshold from 0 to 1:
   1. **Valid output**: `class` is in `SOUND_CLASSES`, `confidence` is finite and in 0 to 1, and `label` is a non-empty string.
   2. **Determinism and purity**: two calls give deep-equal results, and the input array is unchanged.
   3. **Aggregate is the maximum**: when the result is a specific class, `confidence` equals the maximum Score over that class's Members, and `label` is the name of the Member with that score (lowest Index on a tie).
   4. **Winner is the best class**: when the result is a specific class, no other specific class has a greater Aggregate, and `confidence` is greater than or equal to the Threshold.
   5. **Threshold gate**: when the result is `other`, every specific class has an Aggregate below the Threshold.
   6. **Threshold limits**: with Threshold 0, the result is never `other`, because every Aggregate is greater than or equal to 0 (an all-zero input gives `alarm` with confidence 0, the first class in priority order); with Threshold 1, the result is a specific class only if some Member scores exactly 1.
   7. **Order independence within a class**: swapping the Scores of any two Members of the same class gives the same `class` and `confidence`.
   8. **Monotonic in the winner**: raising the Score of a Member of the winning specific class (to any value up to 1) keeps the same winning class, and does not lower `confidence`.
   9. **Unmapped scores cannot win a specific class**: with all Members of the specific classes at 0 and Threshold above 0, the result is `other`, whatever the unmapped Scores are.
   10. **Aggregation is not a sum**: with every Member of one class set to 0.5, `confidence` for that class is 0.5, whatever the number of Members.
   11. **Priority**: when two specific classes are set to the same single Score and all others are 0 and the Score is at or above the Threshold, the winner is the one that comes first in priority order.
3. THE tests SHALL check the class map parser as a property: for arbitrary names built from letters, spaces, commas and quotes, a CSV written with correct quoting parses back to the same names, in order.
4. THE tests SHALL prove they can fail. The implementation task SHALL include a check that a deliberately broken aggregation (sum instead of max; `>` instead of `>=` at the Threshold; priority order reversed; unmapped scores counted in a specific class) makes at least one unit test or property test fail each time.
5. THE tests SHALL run without TensorFlow.js, a browser or network access, and each property SHALL run at least 200 times except where noted.

### Requirement 10: Integration test with the real model

**User story:** As a developer, I want the whole chain from WAV file to class tested with the real model, so that I know the bundled files, the preprocessing and the label map work together.

#### Acceptance criteria

1. THE test in `tests/classify/classifier.integration.test.ts` SHALL run in Node under Vitest with `@tensorflow/tfjs` (not `@tensorflow/tfjs-node`), with the `cpu` backend set explicitly, and SHALL load the Model from `public/models/yamnet/` through the `fetchFunc` option of `createClassifier`. The `fetchFunc` is a helper in `tests/classify/fs-fetch.ts` that maps a URL path under a fake origin such as `http://banshee.test/` to a file under `public/`, and returns a `Response` with the file's bytes, so that the same TF.js HTTP loading code runs as in the browser. IF a path does not exist, THEN it SHALL return a `404` response.
2. THE test SHALL be part of `bun run test`. It SHALL set a timeout large enough for a CPU load (at least 120 seconds for the file) and SHALL NOT be skipped when the model files are present.
3. THE test SHALL fail with a clear message, and SHALL NOT be skipped silently, if the model files are missing.
4. THE test SHALL run the Clip run of Requirement 7 for every clip in the manifest, and check the pass condition (7.5) and the Results file comparison (7.9).
5. THE test SHALL check the loading rules of Requirement 6: the recorded requests, the shard coverage, and that `globalThis.fetch` is not called.
6. THE test SHALL check `classify` input handling: a Frame of 15599 samples and of 15601 samples, an empty array, and a Frame with a `NaN` each reject with `ClassifyError` code `invalid-frame`. A Frame of 15600 zeros SHALL resolve with a valid `Classification` and SHALL NOT be a specific class at the default Threshold (silence is `other`). The test SHALL name the real Class map's silence label if it appears.
7. THE test SHALL check that the input Frame is unchanged after `classify`, that two calls on the same Frame agree (Requirement 5.13), and that five calls started together return in call order, each with the same result as the same Frame classified alone.
8. THE test SHALL check `tf.memory().numTensors` is the same after the 1st and the 50th call (Requirement 5.7).
9. THE test SHALL check `dispose`: a later `classify` rejects with code `disposed`.
10. THE test SHALL check the failure paths with the stub: a `fetchFunc` that returns `404` for `model.json` makes `createClassifier` reject with `model-load-failed`, and one that returns a Class map with 520 rows makes it reject with `class-map-invalid`. The messages SHALL contain no URL.
11. THE tests in `tests/classify/model-files.test.ts` SHALL check the bundled files without TensorFlow: every shard in `model.json`'s `weightsManifest` exists; every file in `SHA256SUMS` exists and matches its digest, and every file in the directory other than `SHA256SUMS` is listed; `LICENSE.txt` contains the words `Apache License` and `Version 2.0` and the retrieval date; the Class map parses (Requirement 2).
12. THE tests in `tests/classify/imports.test.ts` SHALL read every `.ts` file under `src/classify/` and fail if a static or dynamic `import` or `from` names a relative path outside `src/classify/`, `src/events/` or `src/audio/`, or an `src/audio/` import is not `import type`. THEY SHALL also fail if `src/classify/` imports a package other than `@tensorflow/tfjs`, and shall check the text rules in 1.6 and 6.5.

### Requirement 11: Project rules

**User story:** As a maintainer, I want this feature to follow the steering rules, so that it fits the rest of the project.

#### Acceptance criteria

1. THE `src/classify/` module SHALL import only from `src/events` (values and types), from `src/audio` (types only, with `import type`), from `@tensorflow/tfjs`, and from its own files. IT SHALL NOT import from `src/bearing`, `src/haptics`, `src/band`, `src/ghosts` or `src/ui`.
2. THE `src/events` module SHALL remain a leaf. This feature SHALL NOT change any file in `src/events`, `src/audio`, or `public/clips`.
3. THE feature SHALL add `@tensorflow/tfjs` to `dependencies` in `package.json` (it is needed at run time in the browser), pinned to an exact version that the test run proves works. IT SHALL add no other runtime dependency. IT SHALL NOT add `@tensorflow/tfjs-node`.
4. THE `src/classify/index.ts` SHALL export `createClassifier`, `aggregateScores`, `buildLabelMap`, `parseClassMap`, `DEFAULT_THRESHOLD`, `ClassifyError` and the types `Classification`, `Classifier`, `ClassifierOptions`, `ClassMapEntry`, `LabelMap` and `ClassifyErrorCode`.
5. THE TensorFlow.js code SHALL be loaded with a dynamic `import('@tensorflow/tfjs')` inside `createClassifier`, so that the static build splits it into its own chunk and the app does not load it before the user starts listening. THE label map, parser and types SHALL NOT import TensorFlow.js, so they stay in the main chunk and in Node tests without it.
6. THE feature SHALL add no strings to the product UI. `ClassifyError` messages are data for the UI to show, and SHALL follow the plain-language rule in the accessibility steering.
7. THE feature SHALL send no audio or derived data anywhere and SHALL keep to the privacy steering.
8. WHEN the feature is complete, `bun run typecheck`, `bun run test` and `bun run build` SHALL pass, and `bun run e2e` SHALL still pass with no change to e2e tests.
9. THE build output SHALL contain the model files from `public/models/yamnet/` unchanged, and SHALL contain no request to another origin in the new chunk (checked by searching `dist/` for `tfhub.dev` and `kaggle.com`).
10. THE files created by this feature SHALL be only: `src/classify/*`, `tests/classify/*`, `public/models/yamnet/*`, the `classify:report` script and the `@tensorflow/tfjs` entry in `package.json`, and the lockfile change.

## Out of scope

- Capturing audio, resampling, framing (F3, `src/audio`). This feature takes the finished Frame.
- Bearing, loudness (dBFS), urgency, and building `SoundEvent` records. The pipeline feature adds them to the `Classification`.
- Per-class on/off settings and the minimum loudness for each class (settings feature).
- Debouncing, smoothing over several Frames, and suppressing repeated alerts for one sound.
- Browser end-to-end tests of capture plus classification (the feature that connects them, see 6.7).
- Fine-tuning, retraining or quantising the model, and classes the AudioSet ontology lacks (for example a specific brand of smoke alarm).
- Speech to text. Voice is a class only.
- Any claim about accuracy on recordings other than the six clips.
- Choosing the Web Worker or the main thread for inference in the app. The Classifier is an object with an async method, and the pipeline feature decides where it runs.

## Assumptions to confirm

- **The YAMNet TF.js model comes from the TF Hub / Kaggle Models listing `google/yamnet/tfjs`** (a graph model, with `model.json` and `group1-shard*.bin` files), and the class map CSV from the YAMNet repository in `tensorflow/models` (`research/audioset/yamnet/yamnet_class_map.csv`). I could not download in this task, so exact file names, sizes and licence wording are to be confirmed in task 1 and written into `LICENSE.txt`. If the TF.js model needs a different input form (for example a batch dimension), task 1 records it in `design.md` and Requirement 5.6 is adjusted to match.
- **AudioSet ontology licence.** The ontology and class labels are published by Google under CC BY-SA 4.0 (as I understand the AudioSet site), while the model is Apache 2.0. The request says "(Apache 2.0)" for the bundle. I will record both in `LICENSE.txt` as published by the source, after checking them in task 1, and not state one licence for files that carry another.
- **Score aggregation is `max`, not sum.** YAMNet's outputs are independent sigmoids, so a sum can pass 1 and would not be a confidence, and `SoundEvent.confidence` must be 0 to 1. Max also stays correct when the label map has many Members for one class (the "Vehicle" family has many).
- **One global Threshold.** A per-class Threshold would give more control but invites tuning to six clips. The initial value is 0.3, to be confirmed by measurement in task 6.
- **Priority order for ties** is alarm, baby, doorbell, knock, vehicle, voice. Exact ties are rare with real float scores, but the order is needed to make the function total and testable.
- **Clip-level class is the mode of Frame classes**, with a tie going to `other`. The request says each clip "classifies to its expected class", and does not say how a clip is reduced to one class. A clip of 3.5 to 9.5 s has 3 to 11 Frames. If you prefer "the Frame with the highest confidence", that is a change to 7.4 only.
- **Frames come from `createFramer` in `src/audio` in the test.** This makes the test use the same window and hop as the app, and the clips are already 16 kHz, so no resampling is needed. The test imports a runtime function from `src/audio`; that is allowed in tests, and `src/classify` itself still imports only types.
- **`fetchFunc` is the file-IO seam.** `@tensorflow/tfjs` in Node has no `file://` handler (that is in `tfjs-node`), so the test serves the files through a fake HTTP origin. It exercises the browser loading path and stays within "`@tensorflow/tfjs` loading from `public/models`".
- **The `cpu` backend in Node may be slow** for YAMNet's spectrogram and convolution layers (seconds per Frame). The six clips have about 35 Frames in total, so the integration test might take a minute or two. Task 1 measures it. If it is too slow, the fallback is `@tensorflow/tfjs-backend-wasm`, which would be a dev dependency and is a change to this requirement. I expect no need.
- **Some YAMNet graph ops may not exist on the `cpu` backend** (the model uses an FFT). Task 1 is a spike to confirm that the model runs in Node before any other code is written.
- **`src/classify` uses `import.meta.env.BASE_URL`**, as `src/audio` does (it has a `vite-env.d.ts`). The Node tests pass full URLs, so they do not depend on it. `src/classify` needs its own `vite-env.d.ts` or a shared one; I assume a one-line copy in `src/classify/`.
- **The Results file path** is `tests/classify/clip-results.json`. The request says "a committed results file" and gives no path.
