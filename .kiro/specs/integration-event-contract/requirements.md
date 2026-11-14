# Requirements: SoundEvent contract and CC0 sound clips

## Introduction

Every module in Banshee Band passes the same record: a `SoundEvent`. Classification produces it, bearing adds direction, the haptic engine reads it, the ghost renderer draws it, the UI lists it, and the `banshee-log` MCP server stores and returns it. This feature defines that record once, with a validator that guards each module boundary, and adds the real recorded clips that the app plays when there is no microphone.

This feature does not implement audio capture, YAMNet, bearing, haptics, band drivers, ghosts or the MCP server. It only defines the shared type and the clip assets they will all use.

Terms:

- **SoundEvent**: the record described in Requirement 1.
- **Validator**: the function `validateSoundEvent(input: unknown)`.
- **Sound class**: one of `knock`, `doorbell`, `alarm`, `baby`, `vehicle`, `voice`, `other`.
- **Clip**: a recorded audio file in `public/clips`.
- **Manifest**: `public/clips/manifest.json`.
- **Licence file**: `public/clips/LICENSE.txt`.
- **CC0 or public domain**: the work carries the Creative Commons CC0 1.0 dedication, or is marked public domain by its source (for example Public Domain Mark or a US government work).
- **dBFS**: decibels relative to digital full scale. 0 is the loudest representable level, so values are zero or negative.

## Requirements

### Requirement 1: SoundEvent type

**User story:** As a developer of any module, I want one shared event type, so that modules agree on the data they exchange without reading each other's code.

#### Acceptance criteria

1. THE SoundEvent type SHALL be exported from `src/events/` and SHALL have exactly these fields: `id`, `t`, `class`, `label`, `confidence`, `bearingDeg`, `bearingSource`, `loudnessDb`, `urgency`.
2. THE `id` field SHALL be a string.
3. THE `t` field SHALL be a number in milliseconds, finite and greater than or equal to 0.
4. THE `class` field SHALL be one of `knock`, `doorbell`, `alarm`, `baby`, `vehicle`, `voice`, `other`.
5. THE `label` field SHALL be non-empty human-readable text.
6. THE `confidence` field SHALL be a finite number from 0 to 1 inclusive.
7. THE `bearingDeg` field SHALL be either a finite number from -180 to 180 inclusive, or `null`.
8. THE `bearingSource` field SHALL be one of `gcc-phat`, `loudness`, `none`.
9. THE `bearingSource` field SHALL be `none` if and only if `bearingDeg` is `null`.
10. THE `loudnessDb` field SHALL be a finite number less than or equal to 0, in dBFS.
11. THE `urgency` field SHALL be one of `low`, `medium`, `high`.
12. THE `src/events/` module SHALL export the list of sound classes, bearing sources and urgency levels as runtime constants, and SHALL derive the matching TypeScript union types from them, so that the types and the validator cannot disagree.
13. THE SoundEvent type SHALL NOT include audio samples, spectra, embeddings or any other data derived from the audio signal beyond the fields in 1.1.
14. THE `src/events/` module SHALL NOT import from any other `src/` module or from the DOM, so that `mcp/` can share its types and tests can run in Node.

### Requirement 2: Validator

**User story:** As a developer, I want a validator that checks any value at a module boundary, so that a malformed event is caught where it enters instead of crashing a later module.

#### Acceptance criteria

1. THE Validator SHALL accept one argument of type `unknown` and SHALL return either `{ ok: true, event }` or `{ ok: false, errors }`, where `errors` is a non-empty array of strings.
2. WHEN the input satisfies every rule in Requirement 1, THE Validator SHALL return `{ ok: true, event }`, where `event` has exactly the fields in 1.1 and the same values as the input.
3. THE Validator SHALL return a new object in `event` and SHALL NOT keep a reference to the input object.
4. WHEN the input has fields other than those in 1.1, THE Validator SHALL ignore them and SHALL NOT copy them into `event`.
5. IF the input is `null`, `undefined`, a primitive, an array or a function, THEN THE Validator SHALL return `{ ok: false, errors }`.
6. IF a required field is missing, or has the wrong type, THEN THE Validator SHALL return `{ ok: false, errors }` with an error that names that field.
7. IF `t`, `confidence`, `bearingDeg` or `loudnessDb` is `NaN`, `Infinity` or `-Infinity`, THEN THE Validator SHALL reject the input and the error SHALL name the field.
8. IF `bearingDeg` is `null` and `bearingSource` is not `none`, or `bearingDeg` is a number and `bearingSource` is `none`, THEN THE Validator SHALL reject the input and the error SHALL name both fields.
9. IF `id` is not a string, or is an empty string, THEN THE Validator SHALL reject the input.
10. IF `label` is not a string, or is empty after trimming whitespace, THEN THE Validator SHALL reject the input.
11. THE Validator SHALL report every field that fails in one call, not only the first.
12. THE Validator SHALL NOT throw for any input, including objects with throwing getters, revoked proxies, objects with a `null` prototype, circular structures, and very large strings. IF reading the input throws, THEN THE Validator SHALL return `{ ok: false, errors }` with an error that says the input could not be read.
13. THE Validator SHALL NOT mutate its input.
14. THE Validator SHALL NOT include the rejected input values in error text, so that logging an error never writes a label or other free text to the console. It MAY name the field and the rule.
15. THE Validator SHALL be a pure, synchronous function with no I/O, no network and no global state.

### Requirement 3: Real CC0 clips

**User story:** As a user without a microphone, I want recorded sounds to play through the full pipeline, so that I can try Banshee Band and judge it without any hardware or permission.

#### Acceptance criteria

1. THE `public/clips` folder SHALL contain at least one real recording for each of these classes: `doorbell`, `knock`, `alarm` (smoke alarm), `baby` (baby cry), `vehicle` (car horn or engine), `voice` (speech).
2. EACH Clip SHALL be a recording of a real sound. Synthesised tones, generated noise and text-to-speech output SHALL NOT be used.
3. EACH Clip SHALL be CC0 or public domain, confirmed against the source page at the time it is added.
4. EACH Clip SHALL be in WAV format, 16-bit PCM, so that it decodes in a browser, in Node tests and in YAMNet without extra codecs.
5. EACH Clip SHALL be no longer than 10 seconds, and the total size of `public/clips` SHALL be no more than 8 MB, so that the static site stays small.
6. THE `voice` Clip SHALL be speech by a person who is not identifiable as a private individual from the content, for example a public domain reading, and SHALL NOT contain personal data.
7. THE Licence file SHALL contain one entry per Clip with the file name, the source URL of the page where the Clip was published, the author or uploader name, and the licence name (for example `CC0 1.0 Universal` or `Public Domain`).
8. WHERE a source changes or removes a Clip, THE Licence file SHALL still hold the entry recorded when the Clip was added.
9. IF a Clip was trimmed, converted or resampled, THEN THE Licence file entry SHALL say so.

### Requirement 4: Manifest

**User story:** As a developer, I want a machine-readable list of the clips, so that the fallback input, the e2e tests and the MCP `replay_clip` tool find clips without hard-coded names.

#### Acceptance criteria

1. THE Manifest SHALL be valid JSON holding an array with one object per Clip.
2. EACH Manifest entry SHALL have exactly these fields: `file` (name relative to `public/clips`), `class`, `label`, `durationSec`, `source`.
3. THE `class` field SHALL be one of the sound classes in Requirement 1.4, other than `other`.
4. THE `label` field SHALL be non-empty human-readable text that is also valid as a SoundEvent `label`.
5. THE `durationSec` field SHALL be a positive number that matches the duration decoded from the file within 0.05 seconds.
6. THE `source` field SHALL be the source URL, and SHALL equal the URL in the matching Licence file entry.
7. EVERY Manifest `file` SHALL exist in `public/clips`, and EVERY audio file in `public/clips` SHALL appear in the Manifest, so that no unlisted or unlicensed file ships.
8. THE Manifest SHALL contain no duplicate `file` values.
9. THE Manifest SHALL cover every class named in 3.1.

### Requirement 5: Validator tests

**User story:** As a developer, I want the validator proven against bad input, so that I can trust it at every boundary.

#### Acceptance criteria

1. WHEN `bun run test` is run, THE unit tests in `tests/events/validate.test.ts` SHALL cover one accepted example, and at least one rejected example for each rule in Requirement 1 and each of 2.5 to 2.10.
2. THE unit tests SHALL check the boundary values: `t` of 0, `confidence` of 0 and 1, `bearingDeg` of -180 and 180, `loudnessDb` of 0, and just outside each range.
3. THE property tests in `tests/events/validate.property.test.ts` SHALL use fast-check, and SHALL check that for arbitrary input (`fc.anything()`, plus objects built from arbitrary values for each field) the Validator never throws and always returns a result of the documented shape.
4. THE property tests SHALL check that every event from a generator of valid events passes, and that `event` equals the input in the 1.1 fields.
5. THE property tests SHALL check that changing exactly one field of a valid event to an invalid value makes the Validator fail, and that the errors name that field. The mutations SHALL include: wrong type, `NaN`, `Infinity`, out-of-range number, unknown enum string, empty string, and a `bearingSource` that disagrees with `bearingDeg`.
6. THE property tests SHALL check that removing any one field makes the Validator fail.
7. THE property tests SHALL check that validating the same input twice gives equal results, and that the input is unchanged afterwards.
8. IF a property fails, THEN fast-check SHALL report a shrunk counterexample, and the test SHALL NOT fix the seed in a way that hides failures in CI.
9. THE tests SHALL prove they can fail: the implementation task SHALL include a check that a deliberately broken validator makes at least one test fail.
10. THE tests SHALL run without a browser.

### Requirement 6: Manifest and clip tests

**User story:** As a developer, I want a test that fails when a clip is missing, undecodable or not clearly licensed, so that the licence claim stays true.

#### Acceptance criteria

1. WHEN `bun run test` is run, THE test in `tests/clips/manifest.test.ts` SHALL parse the Manifest and fail if it is not a non-empty array, so that an empty manifest never passes.
2. THE test SHALL check each Manifest entry against Requirement 4.2 to 4.4, using `validateSoundEvent` on an event built from the entry's `class` and `label` to prove the label and class are acceptable.
3. THE test SHALL check that every Manifest file exists, and that every `.wav` file in `public/clips` is listed.
4. THE test SHALL decode each file with a small WAV reader, check the RIFF and `fmt ` headers, 16-bit PCM, a sample rate of at least 8000 Hz, at least one channel, a `data` chunk whose length matches the file, and at least one sample, and SHALL compute the duration from the header.
5. THE test SHALL fail if a decoded clip is entirely silent (every sample is 0), so that an empty recording does not pass as audio.
6. THE test SHALL check durations against 4.5, and the 10 second and 8 MB limits from 3.5.
7. THE test SHALL parse the Licence file, and for each Manifest entry find an entry with the same file name, the same source URL, a non-empty author, and a licence that is `CC0 1.0 Universal`, `CC0`, or `Public Domain`. The test SHALL fail and list any file that lacks one.
8. THE test SHALL check that every class in 3.1 has at least one clip.
9. THE WAV reader SHALL have its own unit tests, including a truncated file, a wrong header, a non-PCM format, and a zero-length data chunk. Each of those SHALL be rejected with a clear error.
10. THE tests SHALL run without a browser and without network access. They cannot verify the source page, so the licence check is a record-keeping check. Requirement 3.3 is confirmed by the person adding the Clip.

### Requirement 7: Project rules

**User story:** As a maintainer, I want this feature to follow the steering rules, so that it fits the rest of the project.

#### Acceptance criteria

1. THE feature SHALL add no runtime dependencies and make no network request at run time.
2. THE feature SHALL keep `src/events/` free of imports from other `src/` modules, and `mcp/` SHALL import nothing from `src/` except `src/events/` types.
3. WHEN the feature is complete, `bun run typecheck` and `bun run test` SHALL pass.
4. THE feature SHALL NOT add UI copy. WHERE later features show a Clip's label, the label SHALL NOT promise safety or protection.

## Out of scope

- Mapping YAMNet labels to sound classes, urgency rules, bearing estimation, and creating events. Those belong to their own features, and they all produce `SoundEvent`.
- The log store and the MCP tools. They will use the type and the validator.
- Stereo or spatialised test clips. The recorded clips are used as they are. Bearing tests use synthetic stereo signals.
- Verifying clip licences over the network inside a test.
- Changes to steering files.

## Assumptions to confirm

- The class list has seven values, including `doorbell` and `other`. `product.md` currently names five classes (knock, alarm, voice, vehicle, baby). I followed your list. `product.md` and `structure.md` (which has no `src/events/` entry) need a one-line update afterwards. I did not touch them.
- `id` must be non-empty, not only a string.
- `label` must be non-blank after trimming.
- Fields outside the contract are ignored and dropped, not rejected. This keeps old data readable when a field is added later. If you prefer strict rejection of unknown fields, change 2.4.
- `loudnessDb` must be finite, so true digital silence (`-Infinity`) is not valid. Producers clamp to a floor such as -120.
- Clips are WAV, 16-bit PCM, because a Node test can read the header without a codec and the browser decodes it natively. Alternatives such as OGG are smaller but need a decoder in tests.
- Limits of 10 seconds per clip and 8 MB total are my choice. Short clips are enough for classification and keep hosting small.
- Clips can be mono. YAMNet takes mono 16 kHz audio, and the fallback path does not need real stereo.
- The `source` field in the Manifest is the URL. The author and licence live in the Licence file.
- Suggested sources are Freesound (filter by CC0), Wikimedia Commons (public domain or CC0), and OpenGameArt (CC0). Some of these need a login to download. Pixabay and similar sites use their own licences, not CC0, so they are not acceptable.
