# Tasks: Audio capture

Each task is small and test-first where the code is pure: write the test, see it fail, then write the code. Run `bun run typecheck` and `bun run test` after each task. Run `bun run e2e` after tasks 7 and 8. Requirement numbers refer to `requirements.md`.

- [x] 1. Constants, types, error mapping and test helper
  - [x] 1.1 Create `src/audio/constants.ts` (`YAMNET_RATE`, `WINDOW_SIZE`, `HOP_SIZE`, `STEREO_BLOCK`, rate limits) and `src/audio/types.ts` (all types from design.md).
    - _Requirements: 1.1-1.6, 4.6, 6.2, 7.4_
  - [x] 1.2 Write `tests/audio/errors.test.ts` (table of error names to codes, non-Error values, no unsafe words in messages), then create `src/audio/errors.ts` with `toCaptureError` until it passes.
    - _Requirements: 1.6, 1.7, 2.5-2.10, 8.10_
  - [x] 1.3 Create `tests/audio/spectrum.ts` (`sine`, `toneAmplitude`, `dominantFrequency`) with `tests/audio/spectrum.test.ts` (known sine gives known amplitude within 1%, a tone 500 Hz away reads near zero).
    - _Requirements: 8.2_

- [x] 2. Write the resampler tests (they fail first)
  - [x] 2.1 Create `tests/audio/resampler.test.ts` with the groups from design.md: length, pass band, stop band (9 kHz at 48000, 12 kHz at 44100, 7.9 kHz at both), DC, passthrough, invalid rates, streaming equals one-shot. State the edge length that the measurements skip.
    - _Requirements: 8.1, 8.3, 5.3-5.5, 5.9-5.12_
  - [x] 2.2 Create `tests/audio/resampler.property.test.ts` with properties R1 to R7. No fixed seed.
    - _Requirements: 8.4-8.6, 8.11, 5.5, 5.6, 5.13, 5.14_
  - [x] 2.3 Add a stub `src/audio/resampler.ts` that throws `not implemented`. Run the tests and confirm they fail for that reason.
    - _Requirements: 8.12_

- [x] 3. Implement the resampler
  - Implement `resample` and `createResampler` as described in design.md: integer ratio reduction, Kaiser windowed-sinc polyphase table (cap 512 rows with linear interpolation), per-row normalisation, streaming history, `flush`, passthrough, `RangeError` for bad rates.
  - Run the tests from task 2 until they pass. Measure the actual attenuation at 7.9 kHz, 9 kHz and 12 kHz and the pass-band ripple, and write the numbers in a comment above the filter design code. If a threshold fails, adjust attenuation target or transition width, and note the change in `design.md`.
  - _Requirements: 5.1-5.15_

- [x] 4. Framer, test first
  - [x] 4.1 Create `tests/audio/framer.test.ts` with the examples in Requirement 8.7 and `tests/audio/framer.property.test.ts` with F1 to F6.
    - _Requirements: 8.7, 8.8, 8.11, 6.2-6.12_
  - [x] 4.2 Create `src/audio/framer.ts` (`createFramer`, `push`, `reset`, read-only `buffered`) until the tests pass.
    - _Requirements: 6.1-6.12_

- [x] 5. Mono pipeline, test first
  - [x] 5.1 Create `tests/audio/pipeline.test.ts`: mono source equals identical left and right, different Stereo frame lengths give the same Mono frames, a 3 s stream at 48000 Hz gives 5 frames with `startSec` 0, 0.4875, 0.975, 1.4625, 1.95, a 1 kHz stereo sine keeps 1 kHz, context rate 16000 skips filtering.
    - _Requirements: 8.9, 7.1-7.8_
  - [x] 5.2 Create `src/audio/pipeline.ts` with `createMonoPipeline` until the tests pass.
    - _Requirements: 7.1-7.8_

- [x] 6. Prove the pure tests can fail
  - Break the resampler one way at a time and confirm a unit test and a property test each fail: cutoff at 0.9 of Nyquist, off-by-one in the length rule, history dropped at chunk boundaries.
  - Break the framer one way at a time: use `windowSize` as the hop, shift a frame by one sample.
  - Restore after each change, then run `bun run test` and confirm everything passes. Do not commit the broken versions. Note the result in the commit message.
  - _Requirements: 8.12_

- [ ] 7. Web Audio graph, microphone path and capture API
  - [ ] 7.1 Add `src/audio/worklet-globals.d.ts` and `src/audio/tap.worklet.ts` (block size option, zero fill for missing input, transferred blocks, `flush` message). Confirm `bun run typecheck` and `bun run build` accept the worklet. Record in a comment which import form works for the worklet URL (`?worker&url` or `new URL`).
    - _Requirements: 4.3-4.8, 10.7_
  - [ ] 7.2 Create `src/audio/graph.ts` (context, stereo input stage, Tap, muted output) and `src/audio/mic.ts` (constraints, settings, `rawProcessing`, track `onended`).
    - _Requirements: 2.1-2.4, 2.11, 4.1, 4.2, 4.9_
  - [ ] 7.3 Create `src/audio/capture.ts` and `src/audio/index.ts`: state machine, listeners with `try/catch`, `generation` guard, idempotent `release()`, check that blocks are contiguous, retry `resume()` once. Nothing runs at import time.
    - _Requirements: 1.1-1.13, 2.12, 2.13, 4.7, 10.2, 10.4_
  - [ ] 7.4 Create `capture-harness.html` and `src/audio/harness.ts` (buttons `Start microphone`, `Start clip`, `Stop`, clip id field, status and log, `window.__frames` metadata only). Do not add it to `vite.config.ts` inputs.
    - _Requirements: 9.2, 9.14_
  - [ ] 7.5 Create `e2e/audio-capture.spec.ts` with the microphone test (constraints, shapes, spacing, stop) and the keyboard test, using `test.use({ launchOptions: { args } })` with both fake-device flags. Run `bun run e2e` and confirm they pass.
    - _Requirements: 9.1, 9.3-9.5, 9.12-9.14_

- [ ] 8. Clip path and the remaining browser tests
  - [ ] 8.1 Create `src/audio/clips.ts` (manifest loading, `listClips`, fetch, `decodeAudioData`, `AudioBufferSourceNode`, flush-and-`flushed` end sequence) and connect it in `capture.ts` with `clip-not-found` and `clip-load-failed`.
    - _Requirements: 3.1-3.10_
  - [ ] 8.2 Add the clip test to `e2e/audio-capture.spec.ts`: no `getUserMedia` call, mono and stereo frames arrive, frame count within one of the expected count, RMS above 0.001 on one frame, state reaches `ended`.
    - _Requirements: 9.6-9.8_
  - [ ] 8.3 Add the parity test (same key sets and lengths for clip and microphone frames), the error stub tests (`NotAllowedError`, `NotFoundError`, `NotReadableError`, then a working clip start), and the network allow-list test.
    - _Requirements: 9.9-9.11, 2.5-2.7, 2.12_
  - [ ] 8.4 Run `bun run e2e` and confirm all audio-capture tests pass. If a test is flaky, fix the cause (wait on state, not on time) and do not add retries.

- [ ] 9. Final checks
  - Run `bun run typecheck`, `bun run test`, `bun run e2e` and `bun run build`, and confirm all pass. Confirm the build output has the worklet file and no `capture-harness.html`.
  - Check that `src/audio/` imports nothing from other `src/` modules: `grep -rn "from '\.\./" src/audio`.
  - Check there is no `console.log` of samples or device labels: `grep -rn "console\." src/audio`.
  - Check that `package.json` has no new runtime dependency.
  - Tell the user about the two open points: the 7.9 kHz wording (assumption 1 in `requirements.md`) with the measured attenuation, and that `structure.md` does not list `capture-harness.html`. Do not edit steering files unless asked.
  - _Requirements: 10.1-10.7_

## Done when

- `createResampler` and `resample` keep a 1 kHz tone at 1 kHz, attenuate a 9 kHz tone at 48000 Hz by at least 50 dB and a 7.9 kHz tone by at least 20 dB, and give exactly `floor(N * outRate / inRate)` samples in any chunking.
- The framer emits `floor((N - 15600) / 7800) + 1` windows of 15600 samples with 7800 samples of overlap, and nothing before the first full window.
- Deliberately broken resampler and framer versions make tests fail (task 6).
- In Chromium with the fake media device, the microphone path delivers stereo frames and 15600-sample mono frames at 16000 Hz, and `getUserMedia` received `channelCount: 2` and the three processing flags set to `false`.
- The clip path delivers the same frame shapes with no microphone permission and no `getUserMedia` call, and ends in the state `ended`.
- Permission denied, no device and device busy each give an `error` state with a code and a plain-language message, and a later start works.
- The e2e network check passes with only same-origin page, script and clip requests.
- `bun run typecheck`, `bun run test`, `bun run e2e` and `bun run build` pass.
