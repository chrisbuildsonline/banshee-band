# Design: SoundEvent contract and CC0 sound clips

## Overview

Two deliverables, tied together by tests.

| Artifact | Job |
|---|---|
| `src/events/` | The `SoundEvent` type, its constants and the validator. A leaf module that every other module may import |
| `public/clips/` | Real CC0 recordings, `manifest.json` and `LICENSE.txt` |
| `tests/events/`, `tests/clips/` | Prove the validator rejects bad input and the clips are present, decodable and licensed |

```
src/events/constants.ts --> types.ts --> validate.ts --> index.ts
                                              ^
tests/events/validate*.test.ts ---------------+
tests/clips/manifest.test.ts --uses--> validateSoundEvent, tests/clips/wav.ts
                         |
                         +--reads--> public/clips/manifest.json, LICENSE.txt, *.wav
```

## Dependency position

`src/events` imports nothing from the project. Every other module may import it. This sits beside the steering rule "audio -> classify and bearing -> haptics -> band and ghosts -> ui" as a shared leaf, and it matches the rule that `mcp/` may import shared event types. `structure.md` does not list `src/events/` yet. I did not edit it. A one-line addition is needed after this feature.

## Files

```
src/events/constants.ts      runtime constant arrays
src/events/types.ts          SoundEvent and union types
src/events/validate.ts       validateSoundEvent, ValidationResult
src/events/index.ts          re-exports
tests/events/validate.test.ts
tests/events/validate.property.test.ts
tests/events/arbitraries.ts  fast-check generators (valid event, per-field invalid values)
tests/clips/wav.ts           small WAV reader (pure)
tests/clips/wav.test.ts
tests/clips/manifest.test.ts
tests/clips/licence.ts       LICENSE.txt parser (pure)
tests/clips/licence.test.ts
public/clips/*.wav
public/clips/manifest.json
public/clips/LICENSE.txt
```

## The contract

### Constants and types

The arrays are the single source. The types derive from them, so the validator and the type cannot disagree (requirement 1.12).

```ts
// constants.ts
export const SOUND_CLASSES = ['knock','doorbell','alarm','baby','vehicle','voice','other'] as const;
export const BEARING_SOURCES = ['gcc-phat','loudness','none'] as const;
export const URGENCY_LEVELS = ['low','medium','high'] as const;
export const BEARING_DEG_MIN = -180;
export const BEARING_DEG_MAX = 180;

// types.ts
export type SoundClass = typeof SOUND_CLASSES[number];
export type BearingSource = typeof BEARING_SOURCES[number];
export type Urgency = typeof URGENCY_LEVELS[number];

export interface SoundEvent {
  id: string;
  t: number;               // ms timestamp, finite, >= 0
  class: SoundClass;
  label: string;           // non-empty human text
  confidence: number;      // 0..1
  bearingDeg: number | null; // [-180, 180] or null
  bearingSource: BearingSource; // 'none' iff bearingDeg === null
  loudnessDb: number;      // dBFS, finite, <= 0
  urgency: Urgency;
}
```

### Bearing convention

The contract fixes only the range. Negative means left and positive means right is the natural reading of [-180, 180], but the sign convention and the meaning of 0 (straight ahead) belong to the bearing feature. This feature records the range only, so it does not claim a meaning it cannot test. The bearing design must state the convention and map it to the left/right label that the UI shows.

### Why `bearingSource` is a separate field

A bearing from GCC-PHAT (time difference) and a bearing from loudness difference have different reliability. Consumers use the source to choose wording and confidence. `none` means no bearing is known. The coupling rule (`none` iff `null`) is checked in one place, the validator.

## Validator

### Signature

```ts
export type ValidationResult =
  | { ok: true; event: SoundEvent }
  | { ok: false; errors: string[] };

export function validateSoundEvent(input: unknown): ValidationResult;
```

### Algorithm

1. Wrap the whole body in `try/catch`. Any exception becomes `{ ok:false, errors:['input could not be read'] }` (2.12).
2. If `input` is not a non-null object, or is an array, return one error `input must be an object` (2.5). Functions have `typeof` `function`, so they fail the object check.
3. Read each of the nine fields once into a local variable (`const raw = input as Record<string, unknown>`). Reading once matters because a getter may return different values per call. The values then validate in a fixed order, which keeps the errors stable.
4. Check each field with a small helper that pushes `"<field>: <rule>"` to `errors`. Messages carry the field name and the rule, never the value (2.14).
5. Run the cross-field check only when `bearingDeg` and `bearingSource` each passed their own check, so one mistake does not produce two noisy messages. When it fails, the message names both fields (2.8).
6. If `errors` is empty, build a new object with only the nine fields and return it (2.2 to 2.4). Else return the errors.

### Field rules

| Field | Rule | Error text |
|---|---|---|
| `id` | `typeof === 'string'` and length > 0 | `id: must be a non-empty string` |
| `t` | `Number.isFinite` and `>= 0` | `t: must be a finite number >= 0` |
| `class` | in `SOUND_CLASSES` | `class: must be one of knock, doorbell, ...` |
| `label` | string, `trim().length > 0` | `label: must be non-empty text` |
| `confidence` | `Number.isFinite` and `0..1` | `confidence: must be a number from 0 to 1` |
| `bearingDeg` | `null`, or `Number.isFinite` and `-180..180` | `bearingDeg: must be null or a number from -180 to 180` |
| `bearingSource` | in `BEARING_SOURCES` | `bearingSource: must be one of ...` |
| `loudnessDb` | `Number.isFinite` and `<= 0` | `loudnessDb: must be a finite number <= 0` |
| `urgency` | in `URGENCY_LEVELS` | `urgency: must be one of ...` |
| cross | `(bearingDeg === null) === (bearingSource === 'none')` | `bearingDeg, bearingSource: bearingSource must be 'none' exactly when bearingDeg is null` |

Details:

- `typeof x === 'number'` is required before `Number.isFinite`. `Number.isFinite` already returns false for non-numbers, so it is enough, and it does not coerce.
- A boxed `new Number(1)` is an object, so it is rejected as the wrong type. A string `"1"` is also rejected. There is no coercion anywhere.
- `-0` passes for `t` and `loudnessDb` (`-0 >= 0` and `-0 <= 0` are true). The returned value keeps it. This is harmless, and a note in the test documents it.
- Enum checks use `includes` on the readonly arrays after a `typeof === 'string'` check. A value like `"__proto__"` or `"constructor"` is never found, since arrays do not have object keys.
- `Object.prototype` properties: the validator reads own and inherited properties with normal property access. An inherited `id` from a prototype counts as present. This is acceptable for a data check and keeps getters and class instances working. A null-prototype object works too.
- Revoked proxy and throwing getters throw on read. The outer `try/catch` handles them.
- Large strings: only `trim().length` is read. Linear cost, no regex.

### Errors never carry values

Labels may in time carry text such as a user-chosen name. The privacy steering says not to log personal data to the console. Messages hold the field name and rule only.

## Clips

### Folder

```
public/clips/
  doorbell-01.wav
  knock-01.wav
  alarm-smoke-01.wav
  baby-cry-01.wav
  vehicle-horn-01.wav
  voice-speech-01.wav
  manifest.json
  LICENSE.txt
```

One clip per class is the minimum. More are welcome when the source is clearly CC0. File names are lowercase, hyphenated, and begin with the class or its common name.

### Format and processing

WAV, 16-bit PCM, mono, 16 kHz preferred (YAMNet input rate), up to 10 s, up to 8 MB total. A conversion command, when needed, is recorded in the Licence entry, for example:

```
ffmpeg -i source.flac -ac 1 -ar 16000 -t 8 -c:a pcm_s16le doorbell-01.wav
```

The conversion step is a one-off by the person adding the clip. No build step produces clips. The tests only read them.

Trimming to the sound itself (a few seconds, with a short lead-in) keeps the repo small and makes the clip useful as a demo.

### Manifest

```json
[
  {
    "file": "doorbell-01.wav",
    "class": "doorbell",
    "label": "Doorbell",
    "durationSec": 3.2,
    "source": "https://freesound.org/people/<user>/sounds/<id>/"
  }
]
```

`label` is the text shown as the event label when the clip plays. `durationSec` is rounded to two decimals, and the test allows 0.05 s of tolerance.

### Licence file

Plain text, one block per clip, blocks separated by a blank line, with fixed keys so a test can parse it.

```
File: doorbell-01.wav
Source: https://freesound.org/people/<user>/sounds/<id>/
Author: <name as shown on the source>
Licence: CC0 1.0 Universal
Licence URL: https://creativecommons.org/publicdomain/zero/1.0/
Changes: trimmed to 3.2 s, converted to 16 kHz mono 16-bit PCM
Retrieved: 2026-11-14
```

The file starts with a short header saying that every clip below is CC0 or public domain, and that the entries record the state when the clip was added. `Retrieved` is the date the licence was checked (requirement 3.8).

### Sourcing procedure

For each class, in this order:

1. Search the source with a CC0 filter (Freesound: licence filter "Creative Commons 0"). Wikimedia Commons: check the file page licence box shows `CC0` or `Public domain`.
2. Open the clip's page and read the licence text on that page. Do not trust a search filter alone.
3. Listen to it. It must be a real recording of the named sound, without music or identifiable private speech.
4. Download, trim and convert, then write the Licence entry and Manifest entry in the same commit.

If no clearly CC0 clip is found for a class, the class stays out and the task is reported, not filled with a synthetic or doubtful clip. Requirement 3.1 would then not be met, and the gap would be shown to the user. I cannot confirm availability from here, so the sourcing task (task 8) is a manual step with a check at the end.

## Testing

### Validator unit tests (`tests/events/validate.test.ts`)

A `validEvent()` helper returns a fresh valid event. Tests use `{ ...validEvent(), field: value }` for each case.

| Group | Cases |
|---|---|
| Accept | typical event; `bearingDeg: null` with `'none'`; each enum value; each boundary (`t: 0`, `confidence: 0` and `1`, `bearingDeg: -180` and `180`, `loudnessDb: 0`) |
| Reject type | each field set to `undefined`, `null` (except `bearingDeg`), number, string, object, array as wrong types |
| Reject range | `t: -1`, `confidence: -0.01` and `1.01`, `bearingDeg: -180.01` and `180.01`, `loudnessDb: 0.01` |
| Reject non-finite | `NaN`, `Infinity`, `-Infinity` for each numeric field |
| Reject coupling | `null` with `gcc-phat`, `null` with `loudness`, `90` with `none` |
| Reject whole input | `null`, `undefined`, `42`, `'x'`, `[]`, `() => {}`, `Symbol()`, `0n` |
| Hostile | throwing getter, revoked proxy, null-prototype object, circular object, 1 MB label (accepted when valid), 1 MB id |
| Shape | extra fields dropped; result is a new object; input not mutated; all errors reported at once; error text does not contain a distinctive label string |

### Property tests (`tests/events/validate.property.test.ts`)

Generators in `tests/events/arbitraries.ts`:

```ts
const validEvent = fc.record({
  id: fc.string({ minLength: 1 }),
  t: fc.double({ min: 0, max: 1e15, noNaN: true }),
  class: fc.constantFrom(...SOUND_CLASSES),
  label: fc.string({ minLength: 1 }).filter(s => s.trim().length > 0),
  confidence: fc.double({ min: 0, max: 1, noNaN: true }),
  loudnessDb: fc.double({ min: -200, max: 0, noNaN: true }),
  urgency: fc.constantFrom(...URGENCY_LEVELS),
  bearing: fc.oneof(
    fc.constant({ bearingDeg: null, bearingSource: 'none' }),
    fc.record({ bearingDeg: fc.double({ min: -180, max: 180, noNaN: true }),
                bearingSource: fc.constantFrom('gcc-phat', 'loudness') }),
  ),
}).map(({ bearing, ...rest }) => ({ ...rest, ...bearing }));
```

`fc.double` can emit `-0`, which is valid. Large `t` such as `Number.MAX_VALUE` is also valid, so the upper bound for `t` can be left open if desired.

Properties:

| # | Property | Requirement |
|---|---|---|
| P1 | For `fc.anything()` and for `fc.object()` the call never throws, and returns `{ok:true,event}` or `{ok:false,errors}` with `errors.length > 0` | 5.3, 2.1, 2.12 |
| P2 | For objects built from per-field arbitrary values (`fc.anything()` per field) the call never throws and the result shape holds | 5.3 |
| P3 | Every `validEvent` passes, and the result `event` deep-equals the input | 5.4, 2.2 |
| P4 | For a valid event, a field, and an invalid value for that field, the result is `ok:false` and `errors` mention the field name | 5.5, 2.6 |
| P5 | For a valid event and any one field removed, the result is `ok:false` and names that field | 5.6 |
| P6 | Idempotent and non-mutating: two calls give deep-equal results, and a deep clone taken before equals the input after | 5.7, 2.13 |
| P7 | For valid events with extra random keys, the result `event` has exactly the nine contract keys | 2.4 |
| P8 | Error strings never contain a random label of length >= 8 given to a rejected event | 2.14 |

P4 design: the invalid values come from a per-field generator table.

| Field | Invalid-value generator |
|---|---|
| `id` | `fc.oneof(fc.constant(''), fc.integer(), fc.constant(null), fc.constant(undefined), fc.object())` |
| `t` | `fc.oneof(fc.double({max: -Number.MIN_VALUE, noNaN: true}) (negative), fc.constantFrom(NaN, Infinity, -Infinity), fc.string(), fc.constant(null))` |
| `class` | `fc.string().filter(s => !SOUND_CLASSES.includes(s))`, plus non-strings |
| `label` | `fc.constantFrom('', '   ', '\n\t')`, plus non-strings |
| `confidence` | out of range doubles, non-finite, non-numbers |
| `bearingDeg` | out of range doubles, non-finite, strings (not `null`) |
| `bearingSource` | unknown strings, non-strings |
| `loudnessDb` | positive doubles, non-finite, non-numbers |
| `urgency` | unknown strings, non-strings |
| coupling | `(null, 'gcc-phat'|'loudness')` and `(number, 'none')`. The errors must name `bearingDeg` and `bearingSource` |

The generator for a `bearingDeg` mutation never produces `null`, since `null` is valid for that field when paired with `none`. The coupling case handles the `null` pairing instead. A mutation of `bearingSource` alone from `gcc-phat` to `none` on a non-null bearing is also a coupling failure, and the test includes it.

P4 is also the check that "single-field mutation" really changes one field only: the property builds `{ ...valid, [field]: invalid }` and asserts the other eight fields are untouched before calling the validator.

Run size: fast-check default of 100 runs per property, with `numRuns: 500` for P1 to P3. No fixed seed. A failing seed prints in the report, and it can be replayed with `fc.assert(..., { seed, path })`.

### Mutation check (requirement 5.9)

One-off, done by hand during the implementation task and not committed: weaken the validator (for example drop the `<= 0` check on `loudnessDb`, or the coupling check) and confirm at least one unit test and one property test fail, then restore it. Task 7 records the result in the commit message.

### Clip tests

`tests/clips/wav.ts`:

```ts
export interface WavInfo { channels: number; sampleRate: number; bitsPerSample: 16;
  frames: number; durationSec: number; peak: number }
export function readWav(bytes: Uint8Array): WavInfo; // throws Error with a clear message
```

It walks RIFF chunks (not assuming `fmt ` and `data` are at fixed offsets, because some files carry `LIST` chunks), requires format tag 1 (PCM) and 16 bits, checks `data` size fits the file, and computes `peak` as the largest absolute sample, which lets the test reject an all-silent file. Errors: `Not a RIFF/WAVE file`, `Missing fmt chunk`, `Unsupported format: expected 16-bit PCM`, `Data chunk is truncated`, `No audio samples`.

`tests/clips/licence.ts` has `parseLicence(text): LicenceEntry[]`, where an entry is `{ file, source, author, licence, ... }`. It throws on a block missing `File`, `Source`, `Author` or `Licence`.

`tests/clips/manifest.test.ts` steps:

1. Read the Manifest. Fail on invalid JSON, a non-array, or an empty array (6.1).
2. For each entry: exact keys, types, class in the clip class set, `validateSoundEvent({ id:'x', t:0, class, label, confidence:1, bearingDeg:null, bearingSource:'none', loudnessDb:-20, urgency:'low' })` is ok (6.2).
3. Directory listing matches the Manifest files both ways, with no duplicates (6.3, 4.7, 4.8).
4. `readWav` on each file. Duration within 0.05 of `durationSec`, duration at most 10 s, `peak > 0`, total bytes at most 8 MB (6.4 to 6.6).
5. `parseLicence` and match by file name. Same source URL, non-empty author, licence matches `/^(CC0( 1\.0 Universal)?|Public Domain)$/i` (6.7).
6. Every required class has at least one entry (6.8).
7. Each failure message lists all offending files, not only the first.

The WAV reader tests build small buffers in code with a helper (`makeWav(frames, opts)`), then truncate or alter them. They include a property test: for any frame count 1 to 2000 and sample rate 8000 to 48000, `readWav(makeWav(...)).durationSec` equals `frames / sampleRate`. This protects the helper that the duration claim depends on.

### What the tests cannot prove

They cannot prove a clip is really CC0, or that it is a real recording. They prove the records are complete and consistent, and that the audio decodes and is not silent. The licence itself is confirmed by hand on the source page (task 8) and recorded with a date.

## Decisions

- **Validator returns a result, it does not throw.** The boundary receives untrusted input (log files, MCP calls, BLE). A result type forces callers to handle failure. Alternative: assertion function that throws. Rejected, since the requirement says never throw.
- **Hand-written validator, no schema library.** Nine fields do not justify a runtime dependency (zod and similar), and the steering favours few dependencies. Cost: the type and the checks are written twice. The constants arrays and the property tests limit the drift.
- **Drop unknown fields instead of rejecting them.** Forward compatible, and it stops stray data (for example audio-derived fields) from flowing on through the log. Reject-on-unknown is stricter, and breaks reading older logs after a field is added.
- **WAV only.** Simple to verify in Node without a decoder. Cost: bigger files than OGG. With short 16 kHz mono clips the total stays small (about 32 KB per second).
- **Licence file as parseable text.** Required by the user as `LICENSE.txt`. A fixed key format lets the manifest test cross-check it. Alternative: put author and licence in the Manifest. Rejected, because the requested Manifest fields are fixed and the licence text should be readable by a person.

## Error handling

- Validator: returns errors, never throws.
- WAV reader and licence parser: throw `Error` with a specific message. Only tests use them.
- Manifest test: collects all problems and fails once with the full list.

## Risks

- **No CC0 clip found for a class (for example a smoke alarm or baby cry).** Mitigation: search several sources, accept public domain, and report the gap to the user instead of using a doubtful licence.
- **A source changes the licence or removes the clip later.** Mitigation: `Retrieved` date and the Licence URL in the entry. CC0 dedications are not revocable for copies already obtained.
- **Clip content with personal data (speech).** Mitigation: requirement 3.6, and a listen check in task 8.
- **Type and validator drift.** Mitigation: shared constants and property tests that use those constants. The property tests cannot detect a missing field in the validator on their own, so P5 (remove each field) and the exact-keys check in P3 cover that.
- **Bearing sign convention not fixed here.** Mitigation: noted above, owned by the bearing feature.
