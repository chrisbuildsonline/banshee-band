# Design: YAMNet classification

## Overview

A 15600-sample mono frame goes in. A `{ class, label, confidence }` comes out. Between them sit three parts with different jobs.

```
Float32Array(15600)  --> [ Classifier ]  --> scores (521 floats) --> [ aggregateScores + LabelMap ] --> Classification
                          TF.js graph model                           pure, no TF.js, no DOM
                          (lazy import)                               imports src/events only

public/models/yamnet/yamnet_class_map.csv --> parseClassMap --> buildLabelMap(rules) --> LabelMap
```

Only the Classifier touches TensorFlow.js. The class map parser, label map and aggregation are plain TypeScript, so Vitest runs them without a model, and fast-check can throw thousands of score vectors at them.

## Dependency position

```
src/events   (leaf)
src/audio    (types only, import type)
      \         /
       src/classify  --> @tensorflow/tfjs (dynamic import, Classifier only)
```

`src/classify` imports values from `src/events` (`SOUND_CLASSES`, `SoundClass`), only types from `src/audio` (`MonoFrame`, if a convenience overload is wanted), and its own files. It does not import `ui`, `haptics`, `band`, `ghosts` or `bearing`. `tests/classify/imports.test.ts` enforces this by reading the source files.

## Files

```
src/classify/constants.ts        FRAME_SIZE (15600), SCORE_COUNT (521), DEFAULT_THRESHOLD, CLASS_PRIORITY
src/classify/types.ts            ClassMapEntry, LabelMap, Classification, Classifier, ClassifierOptions, ClassifyErrorCode
src/classify/classmap.ts         parseClassMap (pure)
src/classify/rules.ts            RULES: the display-name table per specific class (data only)
src/classify/labelmap.ts         buildLabelMap, classForIndex (pure)
src/classify/aggregate.ts        aggregateScores (pure)
src/classify/errors.ts           ClassifyError and its fixed messages
src/classify/classifier.ts       createClassifier (the only file that imports TF.js)
src/classify/vite-env.d.ts       /// <reference types="vite/client" /> for import.meta.env.BASE_URL
src/classify/index.ts            public exports

public/models/yamnet/model.json
public/models/yamnet/group1-shard*.bin       (names fixed by the downloaded model)
public/models/yamnet/yamnet_class_map.csv
public/models/yamnet/LICENSE.txt
public/models/yamnet/SHA256SUMS

tests/classify/classmap.test.ts
tests/classify/labelmap.test.ts
tests/classify/aggregate.property.test.ts
tests/classify/model-files.test.ts
tests/classify/imports.test.ts
tests/classify/classifier.integration.test.ts
tests/classify/fs-fetch.ts           fetchFunc that serves public/ over a fake origin
tests/classify/wav.ts                16 kHz mono 16-bit PCM reader
tests/classify/clip-run.ts           shared Clip run used by the test and the report script
tests/classify/clip-results.json     committed Results file
tests/classify/report.ts             `bun run classify:report`
```

`aggregate.ts` is split from `labelmap.ts` so each file does one thing. The requirements say "label map module" for both, and both stay inside `src/classify/` and import only `src/events`.

## Public API

```ts
// constants.ts
export const FRAME_SIZE = 15600;     // equals WINDOW_SIZE in src/audio, kept local so there is no runtime import
export const SCORE_COUNT = 521;
export const DEFAULT_THRESHOLD = 0.15;  // started at 0.3; reason for the change in "Measured values"
export const CLASS_PRIORITY = ['alarm', 'baby', 'doorbell', 'knock', 'vehicle', 'voice'] as const;

// types.ts
export interface ClassMapEntry { index: number; mid: string; name: string }

export interface LabelMap {
  readonly names: readonly string[];                          // length 521
  readonly classOf: readonly SoundClass[];                    // length 521
  readonly members: Readonly<Record<SoundClass, readonly number[]>>;
  classForIndex(index: number): SoundClass;
}

export interface Classification { class: SoundClass; label: string; confidence: number }

export interface ClassifierOptions {
  modelUrl?: string; classMapUrl?: string; threshold?: number; fetchFunc?: typeof fetch;
}
export interface Classifier {
  classify(frame: Float32Array): Promise<Classification>;
  dispose(): void;
}

export type ClassifyErrorCode =
  'model-load-failed' | 'class-map-invalid' | 'invalid-frame' | 'inference-failed' | 'disposed';
```

`FRAME_SIZE` duplicates `WINDOW_SIZE` from `src/audio` on purpose. `classify` may import only types from `src/audio`, and a value import would break that rule. A test in `tests/classify/classifier.integration.test.ts` asserts `FRAME_SIZE === WINDOW_SIZE`, so the two cannot drift.

## The pure parts

### Class map parser

A small state-machine CSV parser, around 40 lines, no library. It reads characters, tracks "in quotes", handles `""` inside a quoted field, and splits on `\n` or `\r\n`. After parsing it checks the header, the field count, that `index` equals the row position, that `mid` and `name` are not empty, and that there are 521 rows. Each failure throws `Error("yamnet_class_map.csv line N: ...")`. The parser takes text, so it runs in Node (tests read the file) and in the browser (the loader fetches it).

The real file has 521 rows, and names such as `"Male speech, man speaking"` with commas, which is why a naive `split(',')` is not enough.

### Rules

`rules.ts` is a data table keyed by exact AudioSet display name:

```ts
export const RULES: Readonly<Record<Exclude<SoundClass, 'other'>, readonly string[]>> = {
  knock:    ['Knock', 'Tap'],
  doorbell: ['Doorbell', 'Ding-dong'],
  alarm:    ['Alarm', 'Car alarm', 'Alarm clock', 'Siren', 'Civil defense siren', 'Buzzer',
             'Smoke detector, smoke alarm', 'Fire alarm', 'Beep, bleep'],
  baby:     ['Baby laughter', 'Crying, sobbing', 'Baby cry, infant cry', 'Whimper', 'Babbling'],
  vehicle:  ['Vehicle', 'Motor vehicle (road)', 'Car', 'Vehicle horn, car horn, honking', 'Toot', 'Skidding',
             'Tire squeal', 'Car passing by', 'Race car, auto racing', 'Truck', 'Air brake',
             'Air horn, truck horn', 'Reversing beeps', 'Ice cream truck, ice cream van', 'Bus',
             'Emergency vehicle', 'Police car (siren)', 'Ambulance (siren)', 'Fire engine, fire truck (siren)',
             'Motorcycle', 'Traffic noise, roadway noise', 'Bicycle', 'Accelerating, revving, vroom'],
  voice:    ['Speech', 'Child speech, kid speaking', 'Conversation', 'Narration, monologue', 'Speech synthesizer',
             'Shout', 'Bellow', 'Whoop', 'Yell', 'Children shouting', 'Screaming', 'Whispering', 'Chatter',
             'Hubbub, speech noise, speech babble'],
};
```

These are the final lists, as in `src/classify/rules.ts`. They were set from the real class map by the meaning of each name, before any clip was run. Every other Index is `other` (521 Indexes in total). `Male speech, man speaking` and `Female speech, woman speaking` are not in YAMNet's 521 classes, so they are not listed. `Speech` covers them. A name that is not in the CSV fails `buildLabelMap`, so a wrong name cannot ship.

Final placements of the overlapping names:

- **Sirens.** `Siren` and `Civil defense siren` are warnings heard at home, so alarm. `Police car (siren)`, `Ambulance (siren)`, `Fire engine, fire truck (siren)` and `Emergency vehicle` name a vehicle on the road, so vehicle.
- **Beeps.** `Beep, bleep` is alarm. `Reversing beeps` names a vehicle, so vehicle. `Car alarm` is an alarm, not traffic, so alarm.
- **Child sounds.** `Child speech, kid speaking` is speech, so voice. `Babbling` (an infant's pre-speech sounds) and `Baby laughter` are baby.
- **Knock.** `Door` (any door sound, also opening and closing), `Slam` and `Thump, thud` do not mean a knock, so they stay other. `Tap` (a light knock; in the AudioSet ontology it sits under `Door` next to `Knock`) is knock.
- **Engines.** `Engine`, `Idling` and `Engine starting` can be any machine (generator, mower), so other. Rail, air and water vehicles are not road vehicles, so other.

Choices that need care, because they decide whether the six clips pass:

- **Siren.** AudioSet has `Siren`, `Civil defense siren`, `Police car (siren)`, `Ambulance (siren)`, `Fire engine, fire truck (siren)`. For this product an alarm class is a household alarm. The emergency vehicle sirens are in the vehicle family. The task decides one place for each name, and records why. A name appears in at most one class (Requirement 3.5).
- **Voice vs baby.** A baby cry also scores on `Speech` and `Child speech, kid speaking` in YAMNet. The aggregation takes the best class, so `Baby cry, infant cry` at 0.8 beats `Speech` at 0.4. If a crying clip still goes to voice, the first fix is the Rules (do not put `Child speech` and `Babbling` in voice if baby cries use them), not a per-class weight.
- **Knock.** AudioSet has `Knock` and also `Tap`, `Thump, thud`, `Door`, `Slam`. A knock clip may score highest on `Door` or `Thump, thud`. Task 6 reads the real top labels for the knock clip and decides which names are fair Members, based on what the name means, not on the clip's file name.
- **Vehicle horn.** `Vehicle horn, car horn, honking` is the direct match. The `Toot` and `Beep, bleep` names may fire too, and `Beep, bleep` is in alarm. If the horn clip goes to alarm, that is a real overlap, and it is a trade-off that is written down, not hidden.

### LabelMap

```ts
export function buildLabelMap(classMap: ClassMapEntry[], rules = RULES): LabelMap
```

1. Build `nameToIndexes: Map<string, number[]>` from the Class map (a name can in theory repeat).
2. For each specific class and each rule name, look it up. Not found: throw `Error(`label map rule "${name}" is not in the class map`)`. Found at more than one Index: throw as well. The mapping is by exact name, so a repeated name is ambiguous, and the safe answer is to refuse.
3. Assign `classOf[index] = cls`. If `classOf[index]` is already a specific class, throw with the Index, its name and both classes.
4. Everything left stays `other`.
5. Build `members` per class with ascending indices (the loop order guarantees it if filled by scanning `classOf` once at the end, which is what the code does).
6. Freeze `names`, `classOf`, each `members` array and the object.

`classForIndex(i)` checks `Number.isInteger(i) && i >= 0 && i < 521` and returns `classOf[i]`, else `'other'`. This is the "unknown maps to other" rule.

`rules` is a parameter, defaulting to `RULES`. The failure tests pass a modified copy, so they never edit the real table (Requirement 8.8).

### aggregateScores

```ts
export function aggregateScores(scores: ArrayLike<number>, map: LabelMap, options?: { threshold?: number }): Classification
```

```
validate: length 521; each value finite and in [0,1]; threshold finite in [0,1]  -> RangeError naming the argument
for each class c in CLASS_PRIORITY ∪ other:
    best[c] = (max score over members[c], index of the first member that has it)   // 0 and no index if no members
winner = first class in CLASS_PRIORITY with the greatest best[c].score    // strict ">" keeps the earlier class on a tie
if best[winner].score >= threshold and the class has a member:
    return { class: winner, label: names[best[winner].index], confidence: best[winner].score }
else:
    return { class: 'other', label: names[best.other.index], confidence: best.other.score }
```

Properties of this choice:

- **Max, not sum.** Scores are independent sigmoids. A sum can pass 1, would break `SoundEvent.confidence` (0 to 1), and would favour classes with many Members (the vehicle family) over classes with one (doorbell).
- **Priority only breaks exact ties.** Because the loop goes in priority order with strict `>`, the first class keeps a tie.
- **Threshold at the winner only.** The best specific class either clears the threshold or all do not clear it, since the winner has the greatest Aggregate. So one comparison is enough.
- **`other` is explicit.** It has its own best Member and label, so a quiet room reports something like `Silence` with a confidence, not an empty label. `other` always has Members (the 521 minus the Rule Indexes), so `names[best.other.index]` is defined.
- **All zeros at Threshold 0** gives `alarm` with confidence 0, the first class in priority order. This is a corner case of the rule "greater than or equal". It is written into the property test and is not reachable with the default Threshold.

The loops are over fixed arrays (6 classes, about 20 to 60 Members each, 521 total), done once per frame. The function allocates only the result object. It does not sort.

## The Classifier

```ts
export async function createClassifier(options: ClassifierOptions = {}): Promise<Classifier>
```

Load sequence:

1. `const tf = await import('@tensorflow/tfjs')` (dynamic, so Vite puts TF.js in its own chunk, loaded when the user starts listening). If the caller has not set a backend, `await tf.ready()`. In Node the default backend is `cpu`, since `webgl` is not available, and the test calls `tf.setBackend('cpu')` itself so that the result does not depend on detection.
2. `fetch` the Class map with `options.fetchFunc ?? fetch`, then `parseClassMap`, then `buildLabelMap`. A failure becomes `class-map-invalid` (bad content) or `model-load-failed` (request failed).
3. `tf.loadGraphModel(modelUrl, { fetchFunc })`. `loadGraphModel` fetches `model.json`, then each shard named in `weightsManifest`, relative to `modelUrl`. A failure becomes `model-load-failed`. `fromTFHub` is never passed.
4. A warm-up call on a frame of zeros, discarded, so the first real `classify` does not pay the shader or graph compile cost. It also proves the model runs, so a broken model fails in `createClassifier` and not at the first sound.

`classify(frame)`:

```
validate length === 15600 and every sample finite (loop, no allocation) -> else invalid-frame
return queue.then(() => run(frame))        // one inference at a time, in call order
run:
  scoresRow = tf.tidy(() => {
      const input = tf.tensor1d(frame)                  // copies, so the caller's array is not kept
      const out = model.predict(input)                  // tf.Tensor | tf.Tensor[]  (scores, embeddings, spectrogram)
      const scores = Array.isArray(out) ? out[0] : out
      return scores                                      // tidy disposes the other tensors
  })
  const data = await scoresRow.data(); scoresRow.dispose()
  check shape [1, 521] (or 521 values for the first row) -> else inference-failed
  return aggregateScores(data.subarray(0, 521), map, { threshold })
```

Details:

- **Input tensor.** `tf.tensor1d(frame)` copies the data, so the caller's `Float32Array` is not kept or changed. The model's waveform input is 1-D, according to the YAMNet TF.js documentation, which is to be confirmed in task 1 (the spike prints `model.inputs` and the output shapes).
- **Output.** YAMNet gives scores, embeddings and a log-mel spectrogram. Only the scores are used. `tf.tidy` disposes tensors created inside it, except the one it returns. Outputs the model creates inside `predict` are inside the `tidy` callback, so they are tracked. The extra outputs (embeddings, spectrogram) are therefore freed, and test 10.8 proves it with `tf.memory().numTensors`.
- **Values** from `data()` can be slightly outside 0 to 1 if a sigmoid or float error produces it. Before `aggregateScores` the code clamps to [0,1], after checking `Number.isFinite`. A non-finite value is an `inference-failed` error. Clamping happens only here, and `aggregateScores` still rejects an out-of-range array, so the pure function keeps its strict contract.
- **Queue.** A `Promise` chain (`queue = queue.then(run, run)`) serialises calls. A failing call does not break the chain, since the next call starts from a settled promise.
- **dispose.** Disposes the model (`model.dispose()`), sets `disposed = true`, and later `classify` rejects with `disposed`. An in-flight call finishes first, because of the queue (`dispose` runs through the queue as well, to avoid releasing weights under a running inference).
- **Errors.** `ClassifyError extends Error` with `code`. The thrown message is a fixed string per code, for example for `model-load-failed`: "The sound recognition model could not be loaded. Reload the page. If it keeps happening, the app files may be incomplete." Nothing from the original error goes in the message (it could hold a URL). The original is kept as `cause` only if `cause` carries no data that would be logged by default; to keep it simple it is not kept.

The backend choice is left to TF.js in the browser. WebGL runs YAMNet faster than the hop (0.4875 s) on most devices, but this is measured and recorded in the Results run (7.12), not promised.

### Where it runs

The classifier object has no knowledge of workers or the main thread. The pipeline feature decides. If inference is too slow on the main thread, the pipeline can put the Classifier in a Worker, and the API (`classify(Float32Array)` returning a promise) works across `postMessage` without changes. This is left out of scope.

## Model files

`public/models/yamnet/` holds the files as downloaded, unchanged. `SHA256SUMS` is created by `sha256sum` over them and is checked by `tests/classify/model-files.test.ts`. A modified or truncated shard fails the test.

`LICENSE.txt` records, per file group:

| Files | Origin | Licence |
|---|---|---|
| `model.json`, `group1-shard*.bin` | YAMNet, Google, TF.js conversion published on TF Hub / Kaggle Models (exact URL and version recorded in task 1) | Apache License 2.0 |
| `yamnet_class_map.csv` | YAMNet repository, `tensorflow/models` (`research/audioset/yamnet`) | The file is Apache License 2.0 (Apache 2.0 repository). The AudioSet ontology names and ids it lists are CC BY-SA 4.0, as stated on research.google.com/audioset and in the `audioset/ontology` README. The model is Apache 2.0, so `LICENSE.txt` must give the attribution and the CC BY-SA 4.0 notice for the names. |

The file also holds the full Apache 2.0 text or the standard header with a pointer to `https://www.apache.org/licenses/LICENSE-2.0`, the retrieval date, and "Files are unmodified."

## Testing

### Unit tests (no TF.js)

`tests/classify/labelmap.test.ts` reads the real CSV with `node:fs`, parses it and builds the label map. This is the check that matters most: the rules are verified against the real ontology, so "every AudioSet index used is covered" is a fact about the shipped file.

| Group | Cases |
|---|---|
| Parser | generated 521-row CSV; quoted comma; doubled quote; CRLF; trailing newline; each failure with a line number |
| Rules vs CSV | every name in `RULES` exists exactly once; none is in two classes |
| Coverage | `classOf.length === 521`; every entry is in `SOUND_CLASSES`; `members` sizes add up to 521; each specific class has a Member |
| Named examples | `Doorbell` to doorbell, `Knock` to knock, `Smoke detector, smoke alarm` to alarm, `Baby cry, infant cry` to baby, `Vehicle horn, car horn, honking` to vehicle, `Speech` to voice, `Music` and `Silence` to other (replace by the real name if the CSV differs) |
| `classForIndex` | -1, 521, 1000, 0.5, NaN, ±Infinity give `other` |
| `buildLabelMap` failures | unknown name, duplicated name, double-claimed Index, using modified copies of the data |
| `aggregateScores` | the hand-built cases in Requirement 8.9 and 8.10 |

### Property tests

Arbitraries:

```ts
const score = fc.double({ min: 0, max: 1, noNaN: true });
const dense  = fc.array(score, { minLength: 521, maxLength: 521 });
const sparse = fc.array(fc.option(score, { nil: 0 }), { minLength: 521, maxLength: 521 })   // mostly zero
const threshold = fc.double({ min: 0, max: 1, noNaN: true });
```

The properties are the list in Requirement 9.2, implemented one by one. Several use a helper `agg(scores, cls)` in the test that recomputes the max with a plain loop over `map.members[cls]`, as an independent oracle. The oracle uses a different code path from `aggregateScores` (it uses `reduce`, the implementation uses a loop with an index), and a deliberately broken implementation is expected to disagree with it.

The parser round-trip property builds names with `fc.stringMatching`-like arbitraries over letters, spaces, commas and quotes, writes a CSV with correct quoting, and compares. The CSV writer in the test is eight lines and is not shared with `src`, so the test is not checking the parser against itself.

Mutation check (Requirement 9.4), done by hand and not committed: change `max` to `sum`; change `>=` to `>`; reverse `CLASS_PRIORITY`; count unmapped scores in a specific class. Each must make at least one test fail. The result goes in the commit message.

### Integration test

`tests/classify/classifier.integration.test.ts`:

```
beforeAll: tf.setBackend('cpu'); classifier = await createClassifier({
              modelUrl: 'http://banshee.test/models/yamnet/model.json',
              classMapUrl: 'http://banshee.test/models/yamnet/yamnet_class_map.csv',
              fetchFunc: recordingFsFetch })      // logs URLs, serves from public/
```

`fs-fetch.ts` returns `async (input, init) => Response`. It parses the URL, rejects other origins with a thrown error (so a stray request fails loudly), maps the path to `public/<path>`, rejects any `..` segment, and returns `new Response(bytes, { status: 200 })` or a 404 `Response`. TF.js's HTTP loader calls `fetchFunc(path, requestInit)` with the weights URLs resolved from `model.json`, so shard requests go through it too, and the test records them.

Test cases are the list in Requirement 10.

The Clip run, shared in `tests/classify/clip-run.ts`:

```
for entry of manifest:                       // read from public/clips/manifest.json
  pcm = readWav(public/clips/<file>)         // 16 kHz mono 16-bit PCM, else throw
  framer = createFramer()                    // src/audio
  frames = framer.push(pcm)
  results = []; for f of frames: results.push(await classifier.classify(f.samples))
  tally classCounts; clipClass = mode (tie -> other)
  frameAccuracy = count(class === expected) / frames.length
```

The 6 clips give 70 Frames in total, 6 to 18 per clip (6, 11, 11, 18, 6, 18). At about 150 to 170 ms per Frame on the Node `cpu` backend this is roughly 10 to 12 s of inference.

`report.ts` calls the same function and writes `tests/classify/clip-results.json` with `JSON.stringify(x, null, 2)` and a trailing newline. It is run with `bun run tests/classify/report.ts`, and `package.json` gets `"classify:report": "bun run tests/classify/report.ts"`. `bun` runs TS directly. The script sets the same `cpu` backend.

Results file shape:

```json
{
  "generatedBy": "classify:report",
  "tfjsVersion": "x.y.z",
  "backend": "cpu",
  "modelSha256": "…",
  "threshold": 0.15,
  "overall": { "clips": 6, "passed": 6, "meanFrameAccuracy": 0.0 },
  "clips": [
    { "id": "doorbell-01", "file": "doorbell-01.wav", "expected": "doorbell", "clipClass": "doorbell", "pass": true,
      "frames": 3, "frameAccuracy": 1,
      "classCounts": { "knock": 0, "doorbell": 3, "alarm": 0, "baby": 0, "vehicle": 0, "voice": 0, "other": 0 },
      "meanConfidence": 0.0, "topLabel": "Doorbell" }
  ]
}
```

(Numbers above are placeholders, not results.)

Comparison tolerance (7.9): classes, counts and labels must match exactly, scores within 0.01. This tolerates small float differences between machines, while a change in the label map or the threshold that moves a Frame shows up.

The record is a regression check on six clips. It says nothing about other recordings. These clips are also not independent: each is a single short recording of one source, so a pass of 6 of 6 is evidence that the pipeline is wired right and that the rules are sensible, not an accuracy figure.

### Boundary test

`imports.test.ts` reads the sources with `fs`, removes comments, and scans `import ... from '...'`, `import('...')` and `export ... from '...'`. Allowed specifiers: `./...` within `src/classify`, `../events` (or `../events/...`), `../audio` with `import type`, and `@tensorflow/tfjs`. The test also checks that only `classifier.ts` mentions `@tensorflow/tfjs`, so the pure files stay pure, and that the strings in Requirements 1.6 and 6.5 are absent.

### What the tests cannot prove

- Accuracy on any sound other than the six clips.
- That WebGL in a real browser gives the same labels as the CPU backend. Scores can differ slightly. The label map threshold has room, and the browser run belongs to the e2e feature.
- Performance on a phone.
- That the clips are not in the model's own training data (AudioSet is YouTube audio; the clips come from other sources, but it is not verified).

## Decisions

- **Max aggregation.** Stays in 0 to 1, independent of the number of Members, and an alert on `Doorbell` is not out-voted by 30 vehicle names. Alternative: noisy-or (`1 - Π(1 - s)`), which also stays in 0 to 1 but is not easy to explain and lets many small scores add up to a false alarm. Rejected.
- **One global Threshold.** Easy to explain and test, and does not invite fitting to six clips. Alternative: per-class thresholds (higher for voice, lower for alarm). Useful later; needs more data than six clips.
- **Rules keyed by exact display names, checked against the CSV.** Alternative: raw indices (short, but unreadable and wrong silently if the model changes) or substring matching (catches names by accident, for example `Bell` in `Bicycle bell`). Exact names fail loudly.
- **`buildLabelMap` takes the Class map as data.** The pure module has no file access, and the browser and Node load the same CSV by different routes.
- **`fetchFunc` seam, not `tfjs-node`.** `tfjs-node` needs native binaries, which complicates install, and the project says `@tensorflow/tfjs`. The fake origin keeps the browser loading path under test.
- **Dynamic import of TF.js.** TF.js is large (over a megabyte minified). A user who never starts listening does not pay for it.
- **Frame length check in the Classifier and not the label map.** The label map is about scores, the Classifier is about audio.
- **Warm-up inference in `createClassifier`.** Moves the first-run cost to loading, where the UI can show "Loading". Cost: a second of loading.
- **Fixed error messages without the cause.** The cause may contain a URL or a path, and the privacy steering says not to put such data in logs.
- **`other` has a label and a confidence.** The UI and the log can show what the model thinks it is (`Music`, `Silence`), which a Deaf user may want, and the value is still a valid `SoundEvent.confidence`.

## Error handling

- Bad frames (`invalid-frame`), a model with the wrong output shape (`inference-failed`), a failed load (`model-load-failed`), a bad class map or label map (`class-map-invalid`) and use after `dispose` (`disposed`) are `ClassifyError`s that reject the promise. They are expected failures that the caller can show or ignore.
- Programming errors in the pure code (wrong length scores, a threshold out of range) throw `RangeError`.
- The pipeline feature decides what to do on a rejected `classify` (drop the frame, keep listening). This feature only guarantees that one failure does not break later calls.
- Console output: none, except an error name if something is unexpected. Never samples, scores or URLs.

## Risks

- **Model source and format not yet confirmed.** Confirmed in task 1: Kaggle Models `google/yamnet/tfJs/tfjs/1`, input `waveform` with shape `[-1]`, outputs in the order scores, embeddings, spectrogram. The model has no FFT op, so every op runs on the `cpu` backend (see Measured values). Closed.
- **CPU backend speed.** Measured: about 150 to 170 ms per Frame on the Node `cpu` backend, and about 30 ms to load the model, so the integration test and the report script run in Node. Closed for tests. Speed on a phone is not measured.
- **A clip may not reach its class with a fair label map.** All 6 of 6 clips pass at threshold 0.15 with no rule, clip or expected class changed. Two pass narrowly: `knock-01` 6 to 5 (knock to other) and `alarm-smoke-01` 5 to 4 (alarm to voice). Still open as a regression risk. A pass is not an accuracy figure, and the six clips are one recording each.
- **License text for the class map.** Resolved. `public/models/yamnet/LICENSE.txt` gives Apache 2.0 for the model and for the CSV file, and the CC BY-SA 4.0 notice for the AudioSet names and ids. Closed.
- **Large files in git.** The model files, class map, licence and checksums are about 16.2 MB. Git LFS is not used. Closed.
- **TF.js version.** Pinned to 4.22.0 in `package.json`, and the integration test is the check on an upgrade. Kept as a watch item.
- **Browser backend differences** (WebGL float precision on mobile GPUs) can move a score by a few thousandths. In headless Chromium TF.js uses `webgl` (README, Latency section), and `e2e/station.spec.ts` checks that every Try a sound chip gives its manifest class in the browser. That test checks the class of each whole clip, not frame counts or scores, so a score near the threshold is not covered. Phone GPUs are not tested. Still open.
- **`import.meta.env` in Node tests.** Closed. `createClassifier` reads `import.meta.env.BASE_URL` only for a URL the caller did not pass, and `tests/classify/report.ts` passes full `modelUrl` and `classMapUrl` values.
- **No phone or real-room testing.** All checks use six short clips and a fake microphone in Chromium. Real rooms, phone microphones and sounds that are not in the clips are untested. Open.
- **The threshold was chosen from six clips.** 0.15 sits between 0.074 (highest target-class score on a frame without the sound) and 0.208 (lowest on a frame with it) across 70 frames. Other recordings may put those values elsewhere. Open.

## Measured values

Source: `docs/yamnet.md` and `tests/classify/clip-results.json`.

| Item | Value |
|---|---|
| Model source | YAMNet TF.js graph model, Google, Kaggle Models `google/yamnet/tfJs/tfjs/1` (https://www.kaggle.com/models/google/yamnet/tfJs/tfjs/1). `https://tfhub.dev/google/tfjs-model/yamnet/tfjs/1` redirects to the same files. |
| Class map source | `tensorflow/models`, `research/audioset/yamnet/yamnet_class_map.csv` (master branch) |
| Retrieval date | 2026-11-14 |
| Model format | `graph-model`, TensorFlow.js Converter v2.1.0. No FFT op (the spectrogram uses `MatMul`), so every op runs on the `cpu` backend. |
| Model file sizes | `model.json` 100759 B; `group1-shard1of4.bin` to `group1-shard3of4.bin` 4194304 B each; `group1-shard4of4.bin` 3455404 B; `yamnet_class_map.csv` 14096 B (CRLF line endings). About 16.2 MB with `LICENSE.txt` and `SHA256SUMS`. |
| Model SHA-256 (as in the Results file) | `552a4e59884a7fad25dbdbc1bbe75af2a416bca44de12523081d4b55606d59d3` |
| Licences | Model Apache 2.0. Class map file Apache 2.0. AudioSet names and ids in the CSV CC BY-SA 4.0. |
| Input | `waveform`, float32, shape `[-1]` (1-D, no batch dimension), as assumed above |
| Outputs, in order | `Identity` scores `[1, 521]`, `Identity_1` embeddings `[1, 1024]`, `Identity_2` log-mel spectrogram `[96, 64]`, for a 15600-sample input |
| TF.js version, backend | `@tensorflow/tfjs` 4.22.0, `cpu` in Node (bun and Vitest) |
| Node `cpu` load time | about 30 ms for `loadGraphModel` from local files through `fetchFunc` |
| Node `cpu` time per Frame | about 150 to 170 ms in the spike (105 to 170 ms across runs). WebGL in a browser is not measured. |
| Spike check | zeros: top index 494 (`Silence`) at 1.0. First Frame of `doorbell-01.wav`: index 349 (`Doorbell`) 0.92, index 350 (`Ding-dong`) 0.88. |
| Final Rule lists | in "Rules" above |
| Final `DEFAULT_THRESHOLD` | 0.15, one global value (started at 0.3). Reason below. |

### Threshold reason

The first run at 0.3 passed 5 of 6 clips. `knock-01` failed (4 knock Frames, 7 other). A per-Frame look at all six clips (level, top-5 AudioSet labels, Aggregate per class) showed:

- 0.3 cut through Frames that contain the target sound, judged by their own top labels: `knock-01` Frame 1 (Door 0.267, Tap 0.208, Knock 0.128; knock Aggregate 0.208), `knock-01` Frame 3 (top label Knock 0.282) and `doorbell-01` Frame 1 (Doorbell 0.299, after Mallet percussion and Glockenspiel).
- The highest target-class score on Frames without those sounds was 0.074 (knock, on an `alarm-smoke-01` Frame topped by Sliding door, Door, Glass), then 0.053 (voice, on a Frame topped by Wood).

0.15 sits between 0.074 and 0.208, with a margin of about 0.06 to 0.08 on each side. It was chosen from the Aggregates of all 70 Frames, not per clip. No Rule, clip, manifest entry or Expected class changed, and the aggregation (max) is unchanged. A threshold only moves a Frame between `other` and its best specific class. The three Frames above moved to knock, knock and doorbell, all correct. No Frame moved to a wrong class.

### Clip results

Node, `@tensorflow/tfjs` 4.22.0, `cpu`, threshold 0.15. 6 of 6 clips pass, mean frame accuracy 0.7778, 70 Frames in total.

| Clip | Expected | Got | Frames | Frame accuracy | Class counts | Mean confidence | Top label |
|---|---|---|---|---|---|---|---|
| doorbell-01 | doorbell | doorbell | 6 | 1.0 | doorbell 6 | 0.795 | Doorbell |
| knock-01 | knock | knock | 11 | 0.5455 | knock 6, other 5 | 0.6698 | Knock |
| alarm-smoke-01 | alarm | alarm | 11 | 0.4545 | alarm 5, voice 4, other 2 | 0.8708 | Smoke detector, smoke alarm |
| baby-cry-01 | baby | baby | 18 | 1.0 | baby 18 | 0.7988 | Crying, sobbing |
| vehicle-horn-01 | vehicle | vehicle | 6 | 0.6667 | vehicle 4, voice 1, other 1 | 0.8775 | Vehicle horn, car horn, honking |
| voice-speech-01 | voice | voice | 18 | 1.0 | voice 18 | 0.9977 | Speech |

What the model hears in the Frames that do not match the expected class:

- `knock-01`: the 5 `other` Frames are gaps between knocks (RMS -42 to -66 dBFS) that the model calls `Silence` at 1.0, which is correct. The clip passes 6 to 5, a narrow margin.
- `alarm-smoke-01`: after the alarm stops (first 2.4 s) the recording holds quiet speech in a room (about -46 dBFS, Speech 0.38 to 0.92), so 4 Frames are voice, which is what they are. The clip passes 5 to 4.
- `vehicle-horn-01`: one Frame between honks is topped by Speech 0.58 (voice), and the last Frame is `Silence`.
- `doorbell-01`: one Frame is topped by Mallet percussion and Glockenspiel, with Doorbell 0.299, and is doorbell at 0.15.

No clip was re-cut.

The Results file is a regression check on these six clips, and not a measure of how well the classifier works on other recordings.

### Mutation check

Each change was made by hand, one at a time, the tests were run and the file was restored (not committed). All 8 were caught:

| Change | Caught by |
|---|---|
| `max` to `sum` in the Aggregate | 8 tests, e.g. properties 9.2.1, 9.2.3, 9.2.5, 9.2.6 |
| `>=` to `>` at the Threshold | unit "equal to the Threshold", properties 9.2.6, 9.2.11 |
| `CLASS_PRIORITY` reversed | unit "ties by priority", property 9.2.6 |
| unmapped scores counted in a specific class | unit "best other Index", properties 9.2.3, 9.2.6, 9.2.9 |
| one Rule name removed (`Doorbell`) | 6 unit tests, e.g. "maps the named examples" |
| one byte of `group1-shard4of4.bin` flipped | `model-files.test.ts` SHA256SUMS check |
| `tf.tidy` removed in `classify` | integration "same number of tensors after the 1st and the 50th call" |
| `import '../ui/index'` added to `labelmap.ts` | `imports.test.ts` boundary check |
