# Requirements: GCC-PHAT bearing

## Introduction

Banshee Band tells the user which side a sound came from. Audio capture (see `.kiro/specs/audio-capture`) delivers `StereoFrame` values (`left` and `right` as separate `Float32Array`, same length, normally `STEREO_BLOCK` = 1024 sample frames, plus `sampleRate`). This feature (F5) turns the stereo frames of one sound event into a bearing. It lives in `src/bearing/` as a pure TypeScript module with its own FFT and no DSP library.

Two microphones give left or right, not front or back. A laptop or phone microphone pair is a few centimetres apart, so one sample of delay is about 5 degrees near the centre and the resolution gets coarser toward the sides. The output is a coarse side estimate with a confidence, and the documentation must say so.

This feature does not capture audio, classify sounds, decide urgency, build `SoundEvent` records, draw ghosts or add UI text. It returns a bearing, its source and a confidence.

Terms:

- **Frame**: a `StereoFrame` from `src/audio/types.ts`. `left` and `right` have equal length. `sampleRate` is the context rate in Hz.
- **Window**: the ordered list of Frames that belong to one sound event.
- **Bearing**: an angle in degrees in [-90, 90]. 0 is straight ahead (or straight behind). Negative is the left side, positive is the right side. This sign convention is an assumption to confirm with the ghost renderer spec. `SoundEvent.bearingDeg` allows [-180, 180], and this module only produces the [-90, 90] part.
- **Lag**: the delay of the left channel relative to the right channel, in seconds. A positive lag means the sound reached the right microphone first, so the Bearing is positive.
- **Spacing**: the distance between the two microphones in metres. Default `DEFAULT_MIC_SPACING_M` = 0.08.
- **Speed of sound**: `SPEED_OF_SOUND` = 343 m/s.
- **Max lag**: `Spacing / SPEED_OF_SOUND` seconds. `maxLagSamples` = `floor(maxLagSec * sampleRate)`, at least 1.
- **GCC-PHAT**: generalised cross-correlation with phase transform weighting. The cross-spectrum is divided by its own magnitude (plus a small regulariser, Requirement 3) so that only phase, which carries the delay, remains.
- **Peak**: the highest GCC-PHAT value within ±Max lag.
- **Confidence**: a number in [0, 1] that grows with Peak sharpness (Requirement 5).
- **ILD**: inter-channel level difference, `20·log10(rmsRight / rmsLeft)` in dB over the Window.
- **Silent channel**: a channel whose RMS over the Window is below `SILENCE_RMS` (default 10^(-70/20), about 3.2e-4).
- **Result**: `{ bearingDeg: number | null, source: BearingSource, confidence: number, lagSec: number | null, ildDb: number | null, usedFrames: number, skippedFrames: number }`. `BearingSource` is `'gcc-phat' | 'loudness' | 'none'` from `src/events`.

## Requirements

### Requirement 1: Module boundaries

**User story:** As a developer, I want the bearing module to be a pure leaf, so that I can test it without a browser and be sure no audio leaves the device.

#### Acceptance criteria

1. THE module SHALL live in `src/bearing/` and export its public API from `src/bearing/index.ts`.
2. THE module SHALL import only `import type` from `src/audio/types` and values or types from `src/events`. It SHALL NOT import from `classify`, `haptics`, `band`, `ghosts`, `ui`, `mcp` or any npm package at run time.
3. THE module SHALL NOT use `fetch`, `XMLHttpRequest`, `WebSocket`, `navigator`, `window`, `document`, `console`, `Date`, `Math.random` or any other I/O, clock or random source.
4. THE module SHALL NOT use a DSP, FFT or maths library. The FFT is written in the module.
5. THE module SHALL NOT keep a reference to a Frame's arrays after a call returns, and SHALL NOT modify them.
6. Given the same inputs and configuration, THE module SHALL return the same Result (deterministic).
7. A test SHALL scan `src/bearing/*.ts` and fail on any import other than the allowed ones and on the forbidden identifiers in criterion 3.

### Requirement 2: Configuration and geometry

**User story:** As a user with a different device, I want the microphone spacing to be configurable, so that the angle fits my hardware as well as it can.

#### Acceptance criteria

1. THE module SHALL accept an optional partial configuration: `micSpacingM` (default 0.08), `speedOfSound` (default 343), `silenceRms`, `minConfidence` (default from Requirement 6), `regularization` (Requirement 3), `ildSaturationDb` and `ildDeadZoneDb` (Requirement 7).
2. IF a configuration value is not a finite number greater than 0 (or, for `ildDeadZoneDb`, greater than or equal to 0), THEN `resolveBearingConfig` SHALL throw a `RangeError` that names the field. This is the only function that throws. It runs at set-up, not on audio.
3. THE module SHALL provide `maxLagSamples(sampleRate, config)` that returns `max(1, floor(micSpacingM / speedOfSound * sampleRate))`.
4. THE module SHALL provide `lagToBearingDeg(lagSec, config)` that returns `asin(clamp(lagSec * speedOfSound / micSpacingM, -1, 1))` in degrees. The result SHALL be in [-90, 90].
5. THE module SHALL provide `bearingToLagSec(bearingDeg, config)` as the inverse, used by tests to build signals.
6. THE function `lagToBearingDeg` SHALL be monotonic and odd (`f(-x) = -f(x)`), and `lagToBearingDeg(bearingToLagSec(b)) ≈ b` within 1e-9 degrees for b in [-90, 90].

### Requirement 3: FFT and GCC-PHAT

**User story:** As a user, I want the delay between my two microphones measured accurately even when the sound is coloured or echoing, so that the side is right.

#### Acceptance criteria

1. THE module SHALL provide an in-place radix-2 complex FFT and inverse FFT over `Float64Array` real and imaginary parts, for power-of-two sizes. For a size that is not a power of two (or less than 2) THE function SHALL throw a `RangeError`. Callers inside the module only pass valid sizes.
2. THE FFT SHALL match a direct DFT within 1e-9 relative error for sizes 2 to 256, and `ifft(fft(x))` SHALL return `x` within 1e-9.
3. THE module SHALL compute the cross-spectrum `G[k] = L[k] · conj(R[k])`, which peaks at +lag with the sign convention where `bearingToLagSec(+30)` is greater than 0 (Requirement 2), using Hann-windowed, zero-padded input. The FFT size SHALL be the smallest power of two at least twice the chunk length, so circular wrap-around cannot alias the search range. Samples SHALL be buffered into full chunks across Frames, not one chunk per Frame, so Frames of any length (including 1 or 2 samples) give a valid Result. A final partial chunk is zero-padded when the Result is read. The chunk length is a parameter of the workspace (`createPhatWorkspace`), with its value recorded in `design.md`.
4. THE module SHALL apply the phase transform `W[k] = G[k] / (|G[k]| + regularization · maxBin)`, where `maxBin` is the largest `|G[k]|` of that chunk and `regularization` defaults to 0.01. The regulariser keeps near-empty bins from adding random phase when the signal is narrowband (a tone plus noise). When `maxBin` is 0, the chunk SHALL be skipped.
5. WHEN the Window has more than one usable chunk, THE module SHALL sum the `W[k]` of all chunks before one inverse FFT. It SHALL NOT average per-frame bearings. A chunk SHALL count as usable when both channels exceed `silenceRms` and all samples are finite.
6. THE Peak SHALL be searched at integer lags in [-maxLagSamples, +maxLagSamples], using the full correlation array (so the neighbours of a Peak at the edge exist).
7. THE module SHALL refine the Peak by parabolic interpolation through the Peak and its two neighbours. The offset SHALL be limited to ±0.5 sample. WHEN the three points are flat or the denominator is 0, the offset SHALL be 0. The refined lag in seconds SHALL be clamped to the continuous Max lag, `micSpacingM / speedOfSound` seconds (that is, `micSpacingM / speedOfSound * sampleRate` samples), and not to the whole-sample `maxLagSamples`, so bearings of 85° and 90° are reachable.
8. THE module SHALL expose the parabolic step as a pure function `parabolicOffset(yPrev, yPeak, yNext)`.

### Requirement 4: Bearing from lag

**User story:** As a user, I want the side and a rough angle, so that the ghost and the wrist buzz point the right way.

#### Acceptance criteria

1. WHEN GCC-PHAT is used, THE Result `bearingDeg` SHALL be `lagToBearingDeg(refinedLag)`, `bearingSource` SHALL be `'gcc-phat'`, and `lagSec` SHALL be the refined lag.
2. THE Result SHALL never contain a bearing outside [-90, 90], so it also satisfies `SoundEvent.bearingDeg` in [-180, 180].
3. A delay larger than Max lag (not physical for the configured Spacing) SHALL produce ±90 and SHALL NOT throw.
4. THE module SHALL NOT claim a front or back direction. No output field, comment or document SHALL describe a front/back result.

### Requirement 5: Confidence

**User story:** As a user, I want the app to know when the bearing is a guess, so that it does not point a ghost the wrong way with false certainty.

#### Acceptance criteria

1. THE module SHALL compute Confidence from the sharpness of the Peak: the ratio `q = peak / sidelobeRms`, where `sidelobeRms` is the RMS of the correlation over all lags except the Peak ±2 lags. Confidence SHALL be `clamp01((q - Q_LOW) / (Q_HIGH - Q_LOW))`. `Q_LOW` and `Q_HIGH` are named constants. Their first values (3 and 10) are recorded, and changed only with the measurement in task 4.
2. WHEN `peak <= 0` or `sidelobeRms` is 0 or not finite, Confidence SHALL be 0.
3. Confidence SHALL be in [0, 1] and never NaN.
4. For white noise with an exact delay at SNR of 20 dB or more over at least 4 chunks, Confidence SHALL be at least 0.8 (test).
5. For independent noise on the two channels (no common source), Confidence SHALL be below `minConfidence` in at least 95% of seeded trials (test).

### Requirement 6: Loudness fallback and source choice

**User story:** As a user of a device whose two microphones are too close, or that records mono, I still want a rough side when the delay is not usable.

#### Acceptance criteria

1. THE module SHALL compute ILD over the Window from the finite chunks of both channels.
2. THE module SHALL map ILD to a coarse bearing: 0 when `|ild| <= ildDeadZoneDb` (default 1), otherwise `90 · clamp(ild / ildSaturationDb, -1, 1)` with `ildSaturationDb` default 12. Positive ILD (right louder) SHALL give a positive bearing.
3. WHEN GCC-PHAT Confidence is at least `minConfidence` (default 0.3), THE module SHALL return the GCC-PHAT result.
4. WHEN GCC-PHAT Confidence is below `minConfidence`, and both channels are not Silent, THE module SHALL return the loudness bearing with `bearingSource` `'loudness'` and `lagSec` null. The `confidence` of a loudness Result SHALL be `min(0.5, |ild| / ildSaturationDb)`, so it never claims more than a coarse guess.
5. WHEN the two channels are identical (every sample pair differs by at most 1e-6 times the channel RMS, a mono signal sent to both channels), THE module SHALL skip GCC-PHAT and return bearing 0 with `'loudness'` and confidence 0. A bearing of 0 here means "no side information", and the document SHALL say so.
6. THE module SHALL NOT return `'loudness'` when GCC-PHAT was used, and SHALL NOT return `'gcc-phat'` with Confidence below `minConfidence`.

### Requirement 7: Silence, one channel and bad input

**User story:** As a user, I want the app to say "no direction" instead of inventing one.

#### Acceptance criteria

1. WHEN the Window is empty, or every Frame is skipped, or both channels are Silent, THE Result SHALL have `bearingDeg` null, `bearingSource` `'none'`, `confidence` 0, `lagSec` null and `ildDb` null.
2. WHEN exactly one channel is Silent, THE Result SHALL be the same as in criterion 1. A source heard on one microphone only is not given a direction.
3. THE Result SHALL have `bearingDeg` null if and only if `bearingSource` is `'none'`, as `SoundEvent` requires.
4. WHEN a Frame contains NaN or ±Infinity in either channel, THE module SHALL skip that Frame, count it in `skippedFrames`, and continue. It SHALL NOT throw and SHALL NOT let a non-finite value reach the Result.
5. WHEN a Frame has channels of different length, an empty channel, or a non-finite or non-positive `sampleRate`, or a `sampleRate` that differs from the first usable Frame in the Window, THE module SHALL skip it and count it.
6. FOR any finite input (any amplitude up to `Number.MAX_VALUE` samples included), THE module SHALL NOT throw. Very large samples SHALL be handled without overflow in the Result (compute RMS with scaling, or skip the Frame and count it).
7. THE Result SHALL contain only finite numbers or null.

### Requirement 8: Windowed API

**User story:** As the pipeline author, I want to feed frames as they arrive and get one answer when the event ends.

#### Acceptance criteria

1. THE module SHALL export `estimateBearing(frames: readonly StereoFrame[], config?: Partial<BearingConfig>): BearingResult`, a pure function over a whole Window.
2. THE module SHALL export `createBearingWindow(config?)` that returns `{ push(frame), result(), reset() }`, for streaming use. `estimateBearing` SHALL equal pushing the same frames one by one and calling `result()`.
3. `result()` SHALL NOT change the state, so it can be called more than once.
4. THE state SHALL use buffers allocated once at creation (FFT tables, spectra, scratch arrays). `push` SHALL NOT allocate arrays proportional to the frame length on each call. This is checked in code review against the design, not by a test.
5. THE result for a Window SHALL NOT depend on how the samples are cut into Frames of at most the chunk size, within the tolerance of the accuracy table. Frame order SHALL NOT change the result for a stationary signal by more than 0.5 degrees (property test).

### Requirement 9: Accuracy on synthetic signals

**User story:** As a reviewer, I want a measured error bound, so that I know what the bearing can be trusted for.

#### Acceptance criteria

1. THE tests SHALL generate signals with a seeded PRNG (no `Math.random`), delayed by evaluating the source analytically at `t - lag` (a sum of sinusoids for noise and tones, damped sinusoids for a clap), so that fractional delays carry no interpolation error from the test itself.
2. Test configuration: 48000 Hz, Spacing 0.08 m, a Window of 8 Frames of 1024 samples, left channel delayed by `bearingToLagSec(trueBearing)`, independent white noise added to each channel at the stated SNR (signal power over noise power per channel). Delays SHALL include integer sample lags and half-sample lags.
3. THE estimate SHALL stay within these bounds (provisional until task 6 measures them; a bound may only be changed in a commit that records the measured values in `design.md`, and SHALL NOT be loosened to hide a regression):

| Signal | SNR | True bearing | Max abs error |
|---|---|---|---|
| White noise | 20 dB and above | -60 to 60° | 1.5° |
| White noise | 20 dB and above | 60 to 85° and -85 to -60° | 5° |
| White noise | 0 dB | -60 to 60° | 4° |
| Tones (500, 1000, 1500 Hz) plus noise | 10 dB and 0 dB | -60 to 60° | graded by the rule in criterion 7, not a hard bound |
| Clap-like transient (damped noise burst, 1 Frame of 8) | 10 dB | -60 to 60° | 4° |
| Strong common hum (100 Hz, +20 dB over the source, same in both channels) plus delayed white-noise source | 20 dB | -60 to 60° | 4° |

4. THE same bounds SHALL hold at 44100 Hz. At 16000 Hz the bound SHALL be reported in the accuracy table but is not required to meet the 48000 Hz values, because one sample is about 15° there.
5. Bearings of exactly 0, ±45 and ±90 and lags at the integer and half-sample points SHALL each be in the test set.
6. WHEN SNR is below 0 dB (down to -10 dB), THE result SHALL either meet a 10° bound or carry Confidence below `minConfidence` (and then be labelled `'loudness'` or `'none'`). It SHALL NOT report `'gcc-phat'` with a large error at high Confidence (test: among results with Confidence at least 0.8, error at most 10°).
7. THE tone rows (500, 1000 and 1500 Hz plus noise, at 10 dB and 0 dB) SHALL be graded by the rule of criterion 6 with a 4° bound instead of a hard bound: each result either is within 4° of the true bearing, or carries Confidence below `minConfidence` and is labelled `'loudness'` or `'none'`. Among tone results with Confidence at least 0.8 the error SHALL be at most 4°. Reason: the measured worst error is 19.9° at `regularization` 0.01 (10 dB), and no `regularization` meets both the tone bound and the hum bound (see "Measured values" in `design.md`). Without noise the tone error is 0.09°, so the error comes from the noise sensitivity of narrowband signals and is not a bug. The PHAT weight of Requirement 3.4 stays unchanged.
8. THE clap row SHALL keep its hard 4° bound. The design SHALL meet it either by weighting each chunk's PHAT cross-spectrum by that chunk's energy before accumulation, or by a larger chunk length, whichever meets all bounds. The chosen value SHALL be recorded in "Measured values" in `design.md`.

### Requirement 10: Property tests

**User story:** As a developer, I want randomised tests, so that a bug in a corner I did not think of is found.

#### Acceptance criteria

1. THE tests SHALL use `fast-check` with a fixed seed recorded in the test file and at least 100 runs per property.
2. Random delay and noise: for a random bearing in [-80, 80], random SNR in [10, 40] dB and white noise, the absolute error SHALL be at most 4°.
3. Mirror symmetry: swapping `left` and `right` SHALL negate the bearing within 0.5° and keep the source and Confidence (within 0.05).
4. Gain invariance: scaling both channels by a common factor in [0.01, 10] (that stays above `silenceRms`) SHALL change the bearing by at most 0.5°.
5. Time shift invariance: adding the same non-zero number of leading zero Frames SHALL NOT change the bearing by more than 0.5°.
6. Never throws: for arbitrary finite float arrays (including all zeros, constants, huge values, subnormal values, length 0, 1, 2, 1023, 1024, 1025, 5000) and arbitrary valid or invalid `sampleRate`, `estimateBearing` SHALL return a Result that meets Requirement 7.3 and 7.7, with `bearingDeg` in [-90, 90] when not null.
7. Non-finite input: arrays that contain NaN, Infinity or -Infinity at random positions SHALL not throw and SHALL not put a non-finite number in the Result. A Frame with a non-finite sample SHALL be counted in `skippedFrames`.
8. Mono: for any signal sent to both channels, the Result SHALL be bearing 0 with `'loudness'`, or `'none'` for a Silent signal.
9. One channel: for any signal on one channel and zeros on the other, the Result SHALL be `'none'`.
10. Bounds: Confidence in [0, 1]; ILD result bearing has the same sign as the ILD; `|bearing|` from `'loudness'` is at most 90.

### Requirement 11: Accuracy report

**User story:** As a judge or a future maintainer, I want to see the measured accuracy, so that the limits are not hidden.

#### Acceptance criteria

1. THE repository SHALL contain a script run by `bun run bearing:report` (`tests/bearing/report.ts`) that generates the cases of Requirement 9 with the fixed seed and writes `docs/bearing.md` and `tests/bearing/accuracy.json`.
2. `accuracy.json` SHALL list, for every case: signal type, sample rate, SNR in dB, true bearing, true lag in samples, estimated bearing, signed error, absolute error, `bearingSource`, Confidence, and whether the bound of Requirement 9 was met.
3. `docs/bearing.md` SHALL contain a table with the same columns (true vs estimated bearing, error, SNR), a summary of mean and worst error per signal type and SNR, the configuration used, and the section "Limits" (criterion 4).
4. THE report SHALL be deterministic: running it twice produces byte-identical files. A test SHALL regenerate the cases in memory and compare them with the committed `accuracy.json`, so a stale file fails the test run.
5. THE "Limits" section of `docs/bearing.md` SHALL state: two microphones give left or right, not front or back, so a sound behind the user gets the same bearing as the mirrored sound in front; a laptop microphone pair is a few centimetres apart, so one sample is about 5° near the centre at 48 kHz and much more near ±90°, and the angle is coarse; the angle scales with the assumed Spacing, so a wrong Spacing gives a wrong angle; many devices record the same signal in both channels (mono), and then the module reports centre with `'loudness'`, which means "unknown side"; narrowband sounds (beeps, chimes) often fall back to the coarser loudness left/right estimate, because noise easily hides their delay; reverberation, several simultaneous sources and wind noise reduce Confidence or give a wrong side; the module is an aid and can be wrong.
6. THE document SHALL NOT promise protection or safety.

### Requirement 12: Mutation check

**User story:** As a developer, I want proof that the tests notice a broken algorithm.

#### Acceptance criteria

1. THE repository SHALL contain `bun run bearing:mutate` (`tests/bearing/mutate.ts`) that applies each of the following mutants to a copy of the source text, runs `vitest run tests/bearing`, restores the original text, and reports whether the tests failed (mutant killed) or passed (mutant survived).
2. Mutant `phat-off`: the phase transform is replaced by weight 1 (plain cross-correlation, no division by magnitude).
3. Mutant `phat-weak`: the division uses the square root of the magnitude (a PHAT-β of 0.5 instead of 1).
4. Mutant `interp-off`: the parabolic offset is forced to 0.
5. Mutant `interp-half`: the parabolic offset is halved.
6. Mutant `sign-flip`: the sign of the lag is flipped.
7. Every mutant SHALL be killed. The script SHALL exit with a non-zero code if any mutant survives, or if a replacement text is not found in the source (so a refactor cannot silently disable a mutant).
8. THE script SHALL restore the source files in a `finally` block and on SIGINT, and SHALL refuse to start if `src/bearing/` has uncommitted changes that it did not make, unless `--force` is given. This prevents loss of work.

### Requirement 13: Privacy and documentation

**User story:** As a privacy-minded user, I want proof that bearing estimation never sends or stores audio.

#### Acceptance criteria

1. THE module SHALL NOT store, log or return any raw samples or spectra. The Result SHALL contain only the numbers listed in the Terms.
2. THE test of Requirement 1.7 SHALL cover the absence of network and console use in `src/bearing/`.
3. EVERY exported function and type SHALL have a short doc comment. Comments SHALL state the sign convention and the left/right-only limit once, in `src/bearing/index.ts`.
4. THE `README.md` tech list already names the module, and no UI text is added by this feature.
