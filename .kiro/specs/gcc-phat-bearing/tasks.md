# Tasks: GCC-PHAT bearing

Each task is small and ends in a test gate. For pure code, write the test first, see it fail for the right reason (a stub that throws `not implemented`), then implement. Run `bun run typecheck` and `bun run test` at every gate. Requirement numbers refer to `requirements.md`. Do not add dependencies.

- [x] 1. Contract, constants and geometry
  - [x] 1.1 Create `src/bearing/constants.ts`, `types.ts` and `index.ts` (types and constants only; add the sign-convention and left/right-only comment to `index.ts`).
    - _Requirements: 1.1, 13.3_
  - [x] 1.2 Write `tests/bearing/geometry.test.ts` (defaults, `RangeError` per bad field, `maxLagSamples` at 16000/44100/48000 Hz, asin mapping, clamping, oddness, round trip). Add a stub `src/bearing/geometry.ts` and confirm failure.
    - _Requirements: 2.1-2.6_
  - [x] 1.3 Implement `geometry.ts` until the tests pass.
  - [x] 1.4 Write `tests/bearing/boundaries.test.ts`: scan `src/bearing/*.ts` for imports other than `../audio/types` (type only), `../events` and `./*`, and for the forbidden identifiers (`fetch`, `XMLHttpRequest`, `WebSocket`, `navigator`, `window`, `document`, `console`, `Date`, `Math.random`).
    - _Requirements: 1.2-1.4, 1.7, 13.2_
  - **Gate:** `typecheck` and `test` pass.

- [x] 2. FFT
  - [x] 2.1 Write `tests/bearing/fft.test.ts`: naive DFT comparison for sizes 2 to 256, `ifft(fft(x))` round trip, Parseval, impulse and single-bin inputs, `RangeError` for 0, 1, 3, 6, 100. Add a stub and confirm failure.
    - _Requirements: 3.1, 3.2_
  - [x] 2.2 Implement `src/bearing/fft.ts` (`createFftPlan`, `fft`, `ifft`, in place, tables built once).
  - **Gate:** `fft.test.ts` passes, no new import in `boundaries.test.ts` fails.

- [x] 3. GCC-PHAT core and interpolation
  - [x] 3.1 Create `tests/bearing/helpers/synth.ts` (mulberry32 PRNG, Gaussian noise, analytic white-noise, tones, clap and hum generators, noise at a given SNR, helper that builds `StereoFrame[]` for a bearing and lag). Test the helper itself: determinism, measured SNR within 0.1 dB, an exact analytic delay.
    - _Requirements: 9.1, 9.2_
  - [x] 3.2 Write `tests/bearing/gcc-phat.test.ts`: `parabolicOffset` on exact parabolas (offsets -0.4 to 0.4), flat and degenerate input returns 0, clamp to ±0.5; `phatSpectrum` on noise with integer lags (-11 to 11) at 48 kHz recovers the lag; the sign case (`bearingToLagSec(+30)` gives positive); the hum case (plain correlation would give lag 0, PHAT recovers the true lag; use lags -7, 7.5, -9.5 and 10 samples, since the hum only pulls plain correlation to lag 0 from about 6.5 samples). Add stubs and confirm failure.
    - _Requirements: 3.3-3.8, 4.1_
  - [x] 3.3 Implement `src/bearing/gcc-phat.ts` (chunk spectrum with Hann window and zero padding, PHAT weight with regulariser, accumulation, peak search, `parabolicOffset`).
  - [x] 3.4 Measure `regularization` on the 0 dB tone case, the hum case and white noise at 0 dB, and the clap row. Record the numbers in `docs/bearing.md` under "Measured values" (the report script of task 7.1 must keep that section) and sync them into "Measured values" in `design.md`. Tone rows are graded by the R9.6 rule (R9.7), not a hard 4° bound. For the clap row, choose per-chunk energy weighting or a larger `CHUNK`, whichever meets all bounds, and record the choice. If a hard-bounded row still cannot be met, stop and tell the user.
  - **Gate:** `gcc-phat.test.ts` passes.

- [ ] 4. Confidence and loudness fallback
  - [ ] 4.1 Write the confidence tests in `gcc-phat.test.ts` (clean delay at 20 dB over at least 4 chunks: at least 0.8; independent noise on both channels over 200 seeded trials: confidence below `minConfidence` in at least 95%; range and NaN-free for peak 0 and sidelobe 0) and `tests/bearing/loudness.test.ts` (dead zone, saturation, sign, confidence cap 0.5, overflow-safe RMS). Add stubs and confirm failure.
    - _Requirements: 5.1-5.5, 6.1, 6.2, 6.4_
  - [ ] 4.2 Implement `peakConfidence` and `src/bearing/loudness.ts`.
  - [ ] 4.3 Measure the noise-only false-`gcc-phat` rate and the confidence of the clean cases. Adjust `Q_LOW`, `Q_HIGH` and `minConfidence` only if the 95% target fails, and record the values in "Measured values".
  - **Gate:** `gcc-phat.test.ts` and `loudness.test.ts` pass.

- [ ] 5. Windowed estimator and degenerate input
  - [ ] 5.1 Write `tests/bearing/estimate.test.ts`: empty window, silence, one silent channel (`none`), identical channels (0°, `loudness`, confidence 0), hard-panned level difference with uncorrelated channels (`loudness` with the right sign), NaN and Infinity frames skipped and counted, mismatched lengths, bad and changing sample rate, huge values (up to `Number.MAX_VALUE`) without a non-finite result, `bearingDeg === null` iff `source === 'none'`, `result()` repeatable, `reset()`, streaming equals batch, frame lengths 1, 2, 1023, 1025 and 5000. Add a stub and confirm failure.
    - _Requirements: 6.3-6.6, 7.1-7.7, 8.1-8.4_
  - [ ] 5.2 Implement `src/bearing/estimate.ts` (`createBearingWindow`, `estimateBearing`) with buffers allocated once, and export from `index.ts`.
  - [ ] 5.3 Review that `push` allocates nothing proportional to the frame length and that no Frame array is kept. Write the result in a one-line comment on `push`.
    - _Requirements: 1.5, 8.4_
  - **Gate:** `estimate.test.ts` passes, then `typecheck` and the whole `test` run.

- [ ] 6. Accuracy and property tests
  - [ ] 6.1 Create `tests/bearing/helpers/cases.ts` (`buildCases`, `evaluateCase`) with the signals, SNRs and bearings of Requirement 9, including 0, ±45, ±90, integer lags and half-sample lags, at 48000 and 44100 Hz, plus 16000 Hz rows without bounds.
    - _Requirements: 9.2-9.5_
  - [ ] 6.2 Write `tests/bearing/accuracy.test.ts` with the bounds of Requirement 9.3, the tone rule of 9.7 and the low-SNR rule of 9.6. Run it. If a bound fails, fix the algorithm or stop and ask. Do not loosen a bound without recording the measured values and the reason in `docs/bearing.md` ("Measured values") and syncing them into `design.md`.
    - _Requirements: 9.3, 9.4, 9.6, 9.7, 9.8_
  - [ ] 6.3 Write `tests/bearing/properties.test.ts` with the ten properties of Requirement 10 (fixed `fast-check` seed, at least 100 runs each, lowering `numRuns` only for the slow synth properties and not below 100).
    - _Requirements: 10.1-10.10_
  - [ ] 6.4 Record the worst error per group, the parabolic bias at half-sample lags and the time per 1024-sample `push` in "Measured values".
  - **Gate:** `accuracy.test.ts` and `properties.test.ts` pass; `bun run typecheck` and `bun run test` pass.

- [ ] 7. Accuracy report and limits
  - [ ] 7.1 Write `tests/bearing/report.ts` and add `"bearing:report": "bun run tests/bearing/report.ts"` to `package.json`. It writes `tests/bearing/accuracy.json` and `docs/bearing.md` (table of true vs estimated bearing, error and SNR; per-group summary; configuration; the "Limits" section of Requirement 11.5). The script must keep the "Measured values" section written in tasks 3.4 and 6.2 (preserve or regenerate it, never drop it).
    - _Requirements: 11.1-11.3, 11.5, 11.6_
  - [ ] 7.2 Run `bun run bearing:report` twice and confirm the two outputs are byte-identical (`sha256sum` before and after).
    - _Requirements: 11.4_
  - [ ] 7.3 Write `tests/bearing/report-fresh.test.ts` (regenerate rows, compare with the committed `accuracy.json`). Confirm it fails after a manual edit of one number in the JSON, then restore the file.
    - _Requirements: 11.4_
  - [ ] 7.4 Read `docs/bearing.md` once as a user would. Check that the Limits section names left/right only, the few-centimetre spacing and the mono case, and makes no safety promise.
  - **Gate:** `test` passes including `report-fresh.test.ts`.

- [ ] 8. Mutation check and final gates
  - [ ] 8.1 Write `tests/bearing/mutate.ts` and add `"bearing:mutate": "bun run tests/bearing/mutate.ts"`. Mutants: `phat-off`, `phat-weak`, `interp-off`, `interp-half`, `sign-flip`. It refuses on uncommitted changes in `src/bearing/` without `--force`, requires each `find` text to match exactly once, restores in `finally` and on SIGINT/SIGTERM, and exits 1 on a survivor or a missing match.
    - _Requirements: 12.1-12.8_
  - [ ] 8.2 Commit or stash nothing of the user's: if `src/bearing/` is dirty, ask the user before running with `--force`. Run `bun run bearing:mutate` and paste the killed/survived table into "Measured values" in `design.md`.
  - [ ] 8.3 For each surviving mutant, add or tighten a test (for example a direct `parabolicOffset` unit test, or a tighter high-SNR bound) and run again until all five are killed. Confirm with `git diff --stat src/bearing` that the source is unchanged after the run.
    - _Requirements: 12.7_
  - [ ] 8.4 Final gates: `bun run typecheck`, `bun run test`, `bun run bearing:report` (no diff in `docs/bearing.md` and `accuracy.json` afterwards), `bun run bearing:mutate`. E2E is not required because this feature adds no UI.
  - **Gate:** all four commands exit 0.
