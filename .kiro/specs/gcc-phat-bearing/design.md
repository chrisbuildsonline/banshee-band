# Design: GCC-PHAT bearing

Requirement numbers refer to `requirements.md`.

## Overview

`src/bearing/` turns the `StereoFrame`s of one sound event into `{ bearingDeg, source, confidence }`. It is a leaf DSP module: plain data in, plain data out, no I/O, no libraries.

```
StereoFrame[] --> validate/skip --> buffer into full chunks (CHUNK) --> Hann + zero-pad (2·CHUNK)
   --> FFT(L), FFT(R) --> G = L·conj(R) --> PHAT weight --> sum over chunks
   --> IFFT --> peak in ±maxLag --> parabolic refine --> lag --> asin --> bearing
                                \--> confidence = peak sharpness
   low confidence / identical channels --> ILD --> coarse bearing ('loudness')
   silence / one channel / nothing usable --> null ('none')
```

Dependencies: `import type { StereoFrame } from '../audio/types'`; `import type { BearingSource } from '../events'` and the `BEARING_DEG_MIN/MAX` constants. Nothing else. The structure rule (audio -> classify and bearing -> haptics) holds.

## Honest limit

Two microphones separate left from right and cannot tell front from back. A sound behind the user and its mirror in front give the same lag. The Spacing of a laptop pair is a few centimetres (default 0.08 m): at 48 kHz Max lag is `floor(0.08/343*48000)` = 11 samples, one sample is about 5° near the centre, and `asin` makes the steps larger toward ±90°. At 16 kHz Max lag is 3 samples and one sample is about 15°. The module reports a coarse side, and `docs/bearing.md` says so. The UI treats `bearingDeg` as left/right with coarse confidence, as `product.md` says.

## Files

```
src/bearing/
  constants.ts   SPEED_OF_SOUND, DEFAULT_MIC_SPACING_M, SILENCE_RMS, Q_LOW, Q_HIGH, MIN_CONFIDENCE, ...
  types.ts       BearingConfig, BearingResult, BearingWindow
  geometry.ts    resolveBearingConfig, maxLagSamples, lagToBearingDeg, bearingToLagSec
  fft.ts         fft, ifft, createFftPlan (twiddles and bit-reversal table, built once)
  gcc-phat.ts    parabolicOffset, createPhatWorkspace(chunk), phatSpectrum, correlationPeak, peakConfidence
  loudness.ts    rmsScaled, levelDifferenceDb, ildToBearingDeg
  estimate.ts    createBearingWindow, estimateBearing
  index.ts       public exports and the sign-convention comment
tests/bearing/
  helpers/synth.ts      seeded PRNG (mulberry32), analytic signal generators, noise at SNR
  helpers/cases.ts      the case list shared by accuracy test and report script
  geometry.test.ts  fft.test.ts  gcc-phat.test.ts  loudness.test.ts  estimate.test.ts
  accuracy.test.ts  properties.test.ts  boundaries.test.ts  report-fresh.test.ts
  report.ts  mutate.ts  accuracy.json
docs/bearing.md
```

The tests mirror the source paths, as `structure.md` asks. `report.ts` and `mutate.ts` are scripts and sit in `tests/bearing/` next to `tests/classify/report.ts`. `package.json` gets `bearing:report` and `bearing:mutate`.

## Types

```ts
import type { BearingSource } from '../events';

export interface BearingConfig {
  micSpacingM: number;      // 0.08
  speedOfSound: number;     // 343
  silenceRms: number;       // 10 ** (-70 / 20)
  minConfidence: number;    // 0.3
  regularization: number;   // 0.01
  ildSaturationDb: number;  // 12
  ildDeadZoneDb: number;    // 1
}

export interface BearingResult {
  bearingDeg: number | null;   // [-90, 90]; null iff source === 'none'
  source: BearingSource;
  confidence: number;          // [0, 1]
  lagSec: number | null;       // null unless 'gcc-phat'
  ildDb: number | null;        // null when not computable
  usedFrames: number;
  skippedFrames: number;
}

export interface BearingWindow {
  push(frame: StereoFrame): void;
  result(): BearingResult;     // pure read
  reset(): void;
}
```

The result field is `source` here because `SoundEvent` calls it `bearingSource`. The pipeline copies `bearingDeg` and `source` into the event. `confidence` here is the bearing confidence and is not `SoundEvent.confidence` (the classifier's).

## Sign convention

Positive bearing is right. A source on the right reaches the right microphone first, so the left channel is the delayed one. Let `L(t) = s(t - lag)` and `R(t) = s(t)`, so `lag > 0`. Then `L[k] = S[k]·e^{-jω_k·lag}` and `L[k]·conj(R[k]) = |S[k]|²·e^{-jω_k·lag}`. The inverse FFT of that spectrum has its peak at index `-lag`, so a first reading says to use `R[k]·conj(L[k])`. The implementation shows the opposite: with the sign convention where `bearingToLagSec(+30) > 0`, `L[k]·conj(R[k])` peaks at `+lag`, and the code uses it directly. The test `bearingToLagSec(+30)` giving a result near +30° fixes the sign, and the `sign-flip` mutant guards it. The sign is an assumption to confirm with the ghost renderer spec (position = bearing).

## Algorithm details

### Validation and chunking (R7.4 to 7.6, R3.3)

`push(frame)`:

1. Skip (count in `skippedFrames`) when lengths differ, length is 0, `sampleRate` is not finite or not > 0, or `sampleRate` differs from the Window's first accepted rate.
2. Scan both arrays once. Any non-finite sample skips the Frame. The same scan computes the per-channel sum of squares with scaling to avoid overflow: track `maxAbs`, and when `maxAbs > 1e150` skip the Frame (counted). Normal audio is within ±1. Samples whose magnitude is above 1e150 are not real audio and squaring them could overflow.
3. Add the sums to the Window totals (`sumL2`, `sumR2`, `sumLR` difference energy for the identical-channel test, sample count).
4. Append the samples to a per-channel chunk buffer of `CHUNK` samples and process each time it fills, carrying the remainder to the next Frame. `CHUNK` is a parameter of `createPhatWorkspace(chunk)`, and `nfft` is `2 * CHUNK`. A Frame of 1 or 2 samples therefore adds to the buffer and a Frame of 5000 samples completes several chunks. When `result()` is called, a partly filled buffer is zero-padded and processed as a final chunk on scratch space, without changing the state. The value of `CHUNK` is the one measured in task 3.4 (see "Measured values"); the earlier first guess was 1024.
5. A chunk is usable for GCC-PHAT when both channel RMS values in the chunk exceed `silenceRms`.

The clap case (1 Frame of 8) needs one of two measures, whichever meets all bounds: weight each chunk's PHAT cross-spectrum by that chunk's energy before accumulation (so the 7 noise-only chunks no longer count as much as the clap chunk), or use a larger `CHUNK` (4096 measured 3.78° at `regularization` 0.03). The chosen option and value are recorded in "Measured values".

ILD and the silence test use the energy totals over all accepted Frames, not only usable chunks. A transient in 1 of 8 Frames still counts, and the 7 quiet Frames add almost no energy to either channel.

### FFT (R3.1, 3.2)

Iterative radix-2 decimation in time over `Float64Array` re/im. `createFftPlan(n)` builds `cos/sin` twiddle tables and the bit-reverse permutation once. `fft(plan, re, im)` works in place. `ifft` conjugates, runs `fft`, conjugates and divides by `n`. Sizes that are not a power of two throw `RangeError` (only reachable by a coding error). The tests compare it against a naive O(n²) DFT and check Parseval and the impulse and single-bin cases.

### PHAT (R3.4, 3.5)

Per chunk:

```
Lk, Rk = FFT(hann · chunk_L), FFT(hann · chunk_R)   // one complex FFT: pack L as re, R as im, then separate
Gk = Lk · conj(Rk)
m  = max_k |Gk|
if m == 0: skip chunk
Wk = Gk / (|Gk| + reg · m)
acc[k] += Wk
```

Packing two real signals into one complex FFT halves the work: `Z = L + jR`, `L[k] = (Z[k] + conj(Z[n-k]))/2`, `R[k] = (Z[k] - conj(Z[n-k]))/(2j)`. If the sign bookkeeping slows the first version down, use two plain FFTs. Correctness comes first, speed second.

The regulariser exists because pure PHAT gives every bin the same weight. A tone plus broadband noise then has about 3 coherent bins against about 1000 noise bins with random phase, and the tone loses. With `reg = 0.01`, a bin whose `|G|` is 1e-4 of the maximum has weight 0.01, so it adds little. For white noise, all bins are of similar size, `m` is only a few times the mean, and the weight is close to 1, so the result is still PHAT. The value 0.01 is a first guess. Task 3.4 measures it, and the numbers are in "Measured values" below. The PHAT weight itself stays as specified (decision below under Risks).

The PHAT mutants (`phat-off`: weight 1; `phat-weak`: divide by `sqrt(|G|)` scaled) must be killed by the hum test: a 100 Hz hum identical in both channels at +20 dB dominates a plain cross-correlation and gives lag 0, while PHAT whitens it and the broadband source wins. The hum only pulls plain correlation to lag 0 for lags of about 6.5 samples or more, so the hum test uses lags -7, 7.5, -9.5 and 10 samples.

### Peak, interpolation, confidence (R3.6 to 3.8, R5)

After the last push, `result()` copies `acc` into scratch, runs the inverse FFT, and reads `r[lag]` for lag in `-M..M` (index `(lag + nfft) % nfft`), `M = min(maxLagSamples, nfft/2 - 2)`. The peak is the maximum of `r` (not of `|r|`: a negative peak is a polarity inversion, not a delay).

`parabolicOffset(ym, y0, yp) = 0.5 · (ym - yp) / (ym - 2·y0 + yp)`, returns 0 for a denominator ≥ -1e-12 (not a proper maximum), clamped to ±0.5. The refined lag is `(peakIndex + offset) / sampleRate`, then clamped to the continuous limit `micSpacingM / speedOfSound` seconds (`micSpacingM / speedOfSound * sampleRate` samples), not to the whole-sample `maxLagSamples`. With the whole-sample clamp, 85° and 90° would not be reachable. The integer peak search itself stays within ±`M`.

A PHAT peak for a full-band source is close to a sinc, so a parabola through three points has a small bias. The bias is measured in the accuracy table. A bias correction is out of scope unless the measured error breaks a bound.

Confidence: `sidelobeRms` is the RMS of `r` over all `nfft` lags except `peakIndex ± 2`. `q = peak / sidelobeRms`. Confidence = `clamp01((q - 3) / 7)`. For noise-only input, `r` is a random sequence and the largest of ~22 lag values over a 2048-point RMS gives `q` around 3 to 4, so confidence is near 0 to 0.15. For a clean delay `q` is above 10. `Q_LOW`, `Q_HIGH` and `minConfidence` are first values, recorded and measured in task 4.

### Loudness fallback (R6)

```
rms_c   = sqrt(sum_c² / n)
ildDb   = 20 · log10(rmsR / rmsL)
bearing = |ild| <= deadZone ? 0 : 90 · clamp(ild / saturation, -1, 1)
confidence = min(0.5, |ild| / saturation)
```

A linear map from dB to degrees is a deliberate coarse choice: level differences between two microphones in one case or on one device depend on the case, the body of the device and the frequency, so there is no honest physical formula. The output is only "which side, roughly how far".

Source choice (`result()`):

```
if no usable frame or either channel RMS < silenceRms     -> none
if channels identical                                     -> loudness, 0°, conf 0
compute gcc; if conf >= minConfidence                     -> gcc-phat
else                                                      -> loudness (ILD map)
```

One channel silent returns `none` by requirement, even though the ILD could say "hard left". The band's meaning of "no direction" is then safe.

### Streaming state and allocation (R8)

`createBearingWindow` allocates once on the first accepted Frame (it knows `nfft` and `sampleRate` then): plan, `Float64Array` for re/im of the packed FFT, window (Hann) table, `accRe`, `accIm`, scratch for the inverse. `push` reuses them. `result()` allocates one scratch array pair at most, because it must not change `acc`; preallocate that pair too. `reset()` zeros the accumulators and counters but keeps the buffers when `nfft` and `sampleRate` are unchanged. A new `sampleRate` after `reset()` rebuilds the buffers.

`estimateBearing(frames, config)` creates a window, pushes every Frame, returns `result()`.

## Test plan

| File | Covers |
|---|---|
| `geometry.test.ts` | R2: defaults, `RangeError` for bad config, `maxLagSamples` at 16/44.1/48 kHz (3, 10, 11 with default spacing), asin mapping, inverse, oddness, clamping |
| `fft.test.ts` | R3.1, 3.2: against naive DFT for sizes 2..256, round trip, Parseval, impulse, non-power-of-two throws |
| `gcc-phat.test.ts` | R3: `parabolicOffset` on known parabolas and flat/degenerate input; exact integer lag on noise; sign convention; confidence ranges (R5) |
| `loudness.test.ts` | R6: ILD map, dead zone, saturation, sign, confidence cap |
| `estimate.test.ts` | R7, R8: silence, one channel, mono, NaN/Infinity frames, different lengths, rate changes, empty window, streaming equals batch, `result()` is repeatable, `reset()` |
| `accuracy.test.ts` | R9: the table, including 44.1 kHz, half-sample lags, 0/±45/±90, low-SNR rule |
| `properties.test.ts` | R10: fast-check, fixed seed, 100+ runs |
| `boundaries.test.ts` | R1.7, R13: source scan for imports and forbidden identifiers |
| `report-fresh.test.ts` | R11.4: regenerates cases and compares with `accuracy.json` |

### Synthetic signals (R9.1)

All sources are functions of continuous time, so the test needs no fractional-delay filter:

- White noise: `sum_{m=1}^{M} a·cos(2π f_m t + φ_m)`, with `f_m` at 40 Hz steps from 40 Hz up to 0.45·fs and seeded random phases. It is flat in spectrum and noise-like. Because `x` is a function of continuous time, `x(t - lag)` is exact for any fractional `lag`.
- Tones: three sinusoids (500, 1000, 1500 Hz) with seeded phases.
- Clap: sum of damped sinusoids `e^{-t/τ}·cos(2πf_m t + φ_m)`, τ = 2 ms, 40 components between 500 Hz and 8 kHz, starting at a fixed offset in Frame 3, zero before.
- Hum: 100 Hz plus 3 harmonics, identical in both channels, +20 dB over the source RMS.
- Noise: per-channel independent Gaussian noise (Box-Muller from the seeded PRNG) scaled so `signalPower / noisePower` equals the SNR. Signal power is measured over the Window.

The seed is a function of the case index, so the case list is stable.

### Property tests (R10)

Arbitraries for samples use `fc.float({ noNaN: true, noDefaultInfinity: true })` for finite input and a variant with `fc.constantFrom(NaN, Infinity, -Infinity)` mixed in. Lengths come from a list including 0, 1, 2, 1023, 1024, 1025, 5000. For the delay properties the signal comes from the same synth with `fc.integer` seeds, so a failing case is reproducible from the printed seed. `fast-check` `seed` and `numRuns` are fixed in the test file.

### Accuracy report (R11)

`tests/bearing/helpers/cases.ts` exports `buildCases()`, which returns a list of `{ id, signal, sampleRate, snrDb, trueBearingDeg }`. `evaluateCase(c)` returns a row. `accuracy.test.ts` asserts the bounds on the rows. `report.ts` writes `accuracy.json` (stable key order, 3-decimal rounding, `JSON.stringify(rows, null, 2) + '\n'`) and `docs/bearing.md` (a Markdown table plus summary and "Limits"). `report-fresh.test.ts` regenerates rows and checks `JSON.stringify` equals the committed file. Floating-point maths is deterministic in one JS engine, and the 3-decimal rounding protects against last-digit differences across versions.

### Mutation check (R12)

`tests/bearing/mutate.ts` holds a list `{ name, file, find, replace }` over `gcc-phat.ts`. For each mutant it:

1. Refuses if `git status --porcelain src/bearing` shows changes (unless `--force`).
2. Reads the file, throws when `find` does not occur exactly once.
3. Writes the mutated text, runs `bunx vitest run tests/bearing` with `--bail=1`, records the exit code, and restores the file in `finally` (and on SIGINT/SIGTERM).
4. Prints a table: mutant, killed or survived. Exits 1 on any survivor.

Mutants and what kills them:

| Mutant | Change | Expected killer |
|---|---|---|
| `phat-off` | weight `1` instead of `G/(|G|+reg·m)` | hum case in `accuracy.test.ts`, tone case |
| `phat-weak` | divide by `sqrt(|G|)`-scaled magnitude | hum case, 0 dB cases |
| `interp-off` | `parabolicOffset` returns 0 | half-sample cases at SNR ≥ 20 dB (error up to 0.5 sample = about 2.6° at the centre, bound 1.5°) |
| `interp-half` | offset · 0.5 | half-sample cases (error about 0.25 sample, about 1.3°, close to the bound: if it survives, tighten the high-SNR bound to 1.0° or add a direct `parabolicOffset` unit test; both are allowed, and the bound may be tightened, not loosened) |
| `sign-flip` | `-lag` | every sign assertion |

A mutant that survives is a missing test, so the fix is to add or tighten a test.

## Measured values

Source of the numbers: `docs/bearing.md`, section "Measured values". Task 3.4 and 6.2 record measurements there first (the report script of task 7.1 keeps that section), and they are synced here.

### Regularization (task 3.4)

Setup: GCC-PHAT as specified (Hann window, zero padding to twice the chunk, `W = G / (|G| + reg · maxBin)` summed over chunks, integer peak in ±maxLag, parabolic refinement). Signals from `tests/bearing/helpers/synth.ts`, 8 Frames of 1024 samples, 48000 and 44100 Hz, true bearings -60, -45, -30, -15, 0, 10, 25, 45, 60 (edge rows: -85, -75, 65, 80, 85), 3 seeds each. Numbers are worst / mean absolute bearing error in degrees, from the lag alone (before confidence and fallback). Design weight, CHUNK 1024 (NFFT 2048):

| reg | tones 0 dB | tones 10 dB (bound 4) | hum 20 dB (bound 4) | white 0 dB (bound 4) | white 20 dB, 60-85° (bound 5) | clap 10 dB (bound 4) |
|---|---|---|---|---|---|---|
| 0.001 | 74.07 / 18.84 | 40.46 / 14.07 | 0.93 / 0.42 | 1.31 / 0.39 | not measured | 7.00 / 2.32 |
| 0.003 | 42.14 / 16.17 | 29.35 / 10.79 | 0.86 / 0.40 | 1.30 / 0.39 | 3.96 / 1.90 | 81.91 / 4.14 |
| 0.01 | 40.53 / 15.24 | 19.86 / 6.91 | 0.91 / 0.36 | 1.29 / 0.39 | 3.95 / 1.90 | 35.06 / 3.82 |
| 0.03 | 33.42 / 11.62 | 17.40 / 4.40 | 1.17 / 0.35 | 1.28 / 0.39 | 3.95 / 1.90 | 54.79 / 4.51 |
| 0.1 | 27.13 / 8.61 | 7.01 / 2.24 | 62.95 / 9.33 | 1.27 / 0.39 | 3.96 / 1.90 | 18.37 / 3.83 |
| 0.3 | 18.09 / 5.84 | 5.17 / 1.18 | 62.20 / 20.79 | 1.26 / 0.39 | 3.96 / 1.89 | 18.38 / 3.83 |
| 1 | 17.36 / 4.66 | 2.94 / 0.66 | 61.70 / 23.13 | 1.26 / 0.40 | 3.97 / 1.89 | 18.40 / 3.70 |

Tones without noise: worst 0.09°, so the method has no bias on tones and the error is noise. No `regularization` meets both the tone and the hum bounds, hence the tone rule (R9.7). White noise and hum meet their bounds at 0.01. The clap row fails at CHUNK 1024 for every `reg`, because the 7 noise-only chunks get the same PHAT weight as the clap chunk (R9.8).

Longer chunks (the FFT stays twice the chunk):

| chunk | reg | tones 0 dB | tones 10 dB | hum 20 dB | white 0 dB | white 20 dB edge | clap 10 dB |
|---|---|---|---|---|---|---|---|
| 2048 | 0.01 | 64.38 / 11.65 | 29.13 / 6.21 | 0.93 / 0.35 | 1.21 / 0.40 | 3.96 / 1.89 | 5.51 / 1.70 |
| 4096 | 0.03 | 34.82 / 11.33 | 16.48 / 3.80 | 1.19 / 0.35 | 1.11 / 0.40 | 3.94 / 1.88 | 3.78 / 1.07 |
| 8192 | 0.03 | 32.64 / 8.50 | 12.28 / 3.67 | 1.20 / 0.35 | 1.38 / 0.41 | 4.03 / 1.90 | 4.49 / 0.70 |
| 8192 | 0.1 | 29.52 / 6.42 | 9.57 / 2.22 | 62.85 / 13.90 | 1.32 / 0.41 | 3.98 / 1.89 | 2.54 / 0.40 |

Chosen `CHUNK` / energy weighting for the clap row: not yet chosen. Record it here once the accuracy test passes.

### Other items

Filled in during tasks 3, 4 and 6.

| Item | First value | Measured / final | Task |
|---|---|---|---|
| `regularization` | 0.01 | | 3 |
| `Q_LOW`, `Q_HIGH` | 3, 10 | | 4 |
| `minConfidence` | 0.3 | | 4 |
| Noise-only false-gcc rate at `minConfidence` | target < 5% | | 4 |
| Worst error per row group (white noise, tones, clap, hum) | bounds in R9.3 | | 6 |
| Parabolic bias at half-sample lags | n/a | | 6 |
| Time per `push` of 1024 samples, in Node | n/a | | 6 |

## Risks

- **Narrowband sounds (decision).** The PHAT weight of R3.4 stays as is. Tone rows (500/1000/1500 Hz plus noise, 10 dB and 0 dB) are graded under the R9.6 rule (R9.7): each result is within 4° or carries Confidence below `minConfidence` and is labelled `'loudness'` or `'none'`, and among tone results with Confidence at least 0.8 the error is at most 4°. Measured worst error is 19.9° at `regularization` 0.01, and no `regularization` meets both the tone and the hum bounds. The noise-free tone error is 0.09°, so this is the noise sensitivity of narrowband signals and not a bug. Beeps and chimes therefore often fall back to the loudness left/right estimate, and the Limits section says so.
- **Mono microphones.** Many devices put one microphone in both channels. The result is centre + `'loudness'` + confidence 0. Downstream code (haptics) must treat confidence 0 as "no side" and use the same buzz on both sides. This is noted for the haptics spec and is not changed here.
- **Sign convention.** Left negative, right positive is assumed. One constant and one test fix it if the ghost spec says otherwise.
- **Wrong Spacing.** The angle scales with the Spacing. Only a configuration option and a documented limit address this.
- **Sample-rate mismatch of the Window.** Frames with a different rate are skipped. A device that changes rate mid-event drops the event's bearing to `none`, which is safe.
