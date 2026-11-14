# Design: GCC-PHAT bearing

Requirement numbers refer to `requirements.md`.

## Overview

`src/bearing/` turns the `StereoFrame`s of one sound event into `{ bearingDeg, source, confidence }`. It is a leaf DSP module: plain data in, plain data out, no I/O, no libraries.

```
StereoFrame[] --> validate/skip --> chunk (<= 1024) --> Hann + zero-pad (2048)
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
  gcc-phat.ts    parabolicOffset, phatSpectrum, correlationPeak, peakConfidence
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

Positive bearing is right. A source on the right reaches the right microphone first, so the left channel is the delayed one. Let `L(t) = s(t - lag)` and `R(t) = s(t)`, so `lag > 0`. Then `L[k] = S[k]·e^{-jω_k·lag}` and `L[k]·conj(R[k]) = |S[k]|²·e^{-jω_k·lag}`. The inverse FFT of that spectrum has its peak at index `-lag`, so the code uses `R[k]·conj(L[k])` (the conjugate), which peaks at `+lag`. The test `bearingToLagSec(+30)` giving a result near +30° fixes the sign, and the `sign-flip` mutant guards it. Requirement 3.3 allows either form for this reason. The sign is an assumption to confirm with the ghost renderer spec (position = bearing).

## Algorithm details

### Validation and chunking (R7.4 to 7.6, R3.3)

`push(frame)`:

1. Skip (count in `skippedFrames`) when lengths differ, length is 0, `sampleRate` is not finite or not > 0, or `sampleRate` differs from the Window's first accepted rate.
2. Scan both arrays once. Any non-finite sample skips the Frame. The same scan computes the per-channel sum of squares with scaling to avoid overflow: track `maxAbs`, and when `maxAbs > 1e150` skip the Frame (counted). Normal audio is within ±1. Samples whose magnitude is above 1e150 are not real audio and squaring them could overflow.
3. Add the sums to the Window totals (`sumL2`, `sumR2`, `sumLR` difference energy for the identical-channel test, sample count).
4. Cut the Frame into chunks of at most `CHUNK = 1024` samples. `nfft` is a constant `2 * CHUNK` = 2048, so one 1024-sample Frame is one chunk, a 5000-sample Frame is five chunks, and a shorter Frame is zero-padded.
5. A chunk is usable for GCC-PHAT when both channel RMS values in the chunk exceed `silenceRms`.

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

The regulariser exists because pure PHAT gives every bin the same weight. A tone plus broadband noise then has about 3 coherent bins against about 1000 noise bins with random phase, and the tone loses. With `reg = 0.01`, a bin whose `|G|` is 1e-4 of the maximum has weight 0.01, so it adds little. For white noise, all bins are of similar size, `m` is only a few times the mean, and the weight is close to 1, so the result is still PHAT. The value 0.01 is a first guess. Task 3 measures it on the 0 dB tone case and the hum case, and the chosen value and the numbers go into "Measured values" below.

The PHAT mutants (`phat-off`: weight 1; `phat-weak`: divide by `sqrt(|G|)` scaled) must be killed by the hum test: a 100 Hz hum identical in both channels at +20 dB dominates a plain cross-correlation and gives lag 0, while PHAT whitens it and the broadband source wins.

### Peak, interpolation, confidence (R3.6 to 3.8, R5)

After the last push, `result()` copies `acc` into scratch, runs the inverse FFT, and reads `r[lag]` for lag in `-M..M` (index `(lag + nfft) % nfft`), `M = min(maxLagSamples, nfft/2 - 2)`. The peak is the maximum of `r` (not of `|r|`: a negative peak is a polarity inversion, not a delay).

`parabolicOffset(ym, y0, yp) = 0.5 · (ym - yp) / (ym - 2·y0 + yp)`, returns 0 for a denominator ≥ -1e-12 (not a proper maximum), clamped to ±0.5. The refined lag is `(peakIndex + offset) / sampleRate`, then clamped to ±`M_sec`.

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

Filled in during tasks 3, 4 and 6. Empty until then.

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

- **PHAT on tones.** Handled by the regulariser. If the 0 dB tone case still fails, the fallback is to weight bins by `|G|^0.5` where SNR is low. That changes the PHAT definition, so it needs a decision from the user.
- **Mono microphones.** Many devices put one microphone in both channels. The result is centre + `'loudness'` + confidence 0. Downstream code (haptics) must treat confidence 0 as "no side" and use the same buzz on both sides. This is noted for the haptics spec and is not changed here.
- **Sign convention.** Left negative, right positive is assumed. One constant and one test fix it if the ghost spec says otherwise.
- **Wrong Spacing.** The angle scales with the Spacing. Only a configuration option and a documented limit address this.
- **Sample-rate mismatch of the Window.** Frames with a different rate are skipped. A device that changes rate mid-event drops the event's bearing to `none`, which is safe.
