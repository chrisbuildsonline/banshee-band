# Requirements: Audio capture

## Introduction

Banshee Band needs a stream of audio from either a microphone or a recorded clip. Two later features read that stream. Bearing (F5, GCC-PHAT) needs raw stereo samples at the sound card's rate. Classification (F4, YAMNet) needs mono, 16 kHz, 0.975 s windows. This feature produces both streams from one Web Audio graph, so the clip path and the microphone path give the same kind of frames. It lives in `src/audio/`.

This feature does not implement YAMNet, label mapping, bearing, loudness metering, haptics, band drivers, ghosts, log storage or any UI. It does not add settings or text to the interface.

Terms:

- **Capture**: the object returned by `createCapture()` (Requirement 1).
- **Source**: the input being captured. Either the microphone, or a Clip chosen by id.
- **Clip**: a recorded WAV file in `public/clips`, listed in `public/clips/manifest.json`.
- **Clip id**: the Manifest `file` name without the `.wav` extension, for example `doorbell-01`.
- **Context rate**: the sample rate of the `AudioContext`, set by the browser and device (commonly 44100 or 48000 Hz). This feature does not force it.
- **Stereo frame**: a block of raw left and right samples at the context rate (Requirement 4).
- **Mono frame**: a window of exactly 15600 samples of mono audio at 16000 Hz, which is 0.975 s (Requirement 6).
- **Hop**: the distance between the starts of two consecutive mono frames. 7800 samples, which is 50% of the window.
- **Resampler**: the pure function or object that converts mono samples from one rate to another (Requirement 5).
- **Framer**: the pure object that cuts a continuous 16 kHz stream into mono frames.
- **Tap**: the `AudioWorkletNode` that copies the raw input samples to the main thread.
- **Stream time**: seconds since the first sample of the current capture. Stereo frames and mono frames share this origin.
- **Capture state**: the value described in Requirement 1.
- **dB**: decibels. Attenuation of X dB means the output amplitude is below the input amplitude by 20·log10 of the ratio.

## Requirements

### Requirement 1: Capture API and state

**User story:** As a developer of the classifier, the bearing module and the UI, I want one small API for starting and stopping audio and for receiving frames, so that I do not touch Web Audio or `getUserMedia` myself.

#### Acceptance criteria

1. THE `src/audio/` module SHALL export `createCapture()` that returns a Capture with these members: `start(source)`, `stop()`, `state`, `onMonoFrame(listener)`, `onStereoFrame(listener)`, `onStateChange(listener)`, and `listClips()`.
2. THE `source` argument of `start` SHALL be either `{ kind: 'mic' }` or `{ kind: 'clip', id: string }`.
3. THE `start` method SHALL return a promise that resolves to the new Capture state, and SHALL NOT reject for the expected failures in Requirement 2 and Requirement 3. Those failures SHALL appear as an error state.
4. THE Capture state SHALL be one of: `idle`, `starting`, `listening`, `ended` and `error`.
5. WHILE the state is `listening`, THE state SHALL hold the source, the context rate, the number of input channels (1 or 2), and `rawProcessing`, which is `true` only when the browser reports echo cancellation, noise suppression and auto gain control as off for a microphone, and always `true` for a Clip.
6. WHILE the state is `error`, THE state SHALL hold an error with a `code` and a plain-language `message`. The `code` SHALL be one of `permission-denied`, `no-device`, `device-busy`, `insecure-context`, `unsupported`, `clip-not-found`, `clip-load-failed`, `worklet-failed`, `unknown`.
7. THE error `message` SHALL be plain language that says what happened and what the user can do, and SHALL NOT promise safety or protection.
8. THE `onMonoFrame`, `onStereoFrame` and `onStateChange` methods SHALL each return a function that removes the listener, and SHALL support more than one listener.
9. IF a listener throws, THEN THE Capture SHALL keep delivering frames to the other listeners and SHALL NOT stop capturing.
10. WHEN `stop` is called, THE Capture SHALL stop all microphone tracks, disconnect the graph, close the `AudioContext`, discard any partly filled mono frame, and set the state to `idle`.
11. WHEN `start` is called while a capture is running, THE Capture SHALL stop the running capture first, and then start the new one.
12. THE Capture SHALL NOT call `getUserMedia`, create an `AudioContext` or make any request when the module is imported or when `createCapture()` is called. It SHALL do so only inside `start`.
13. THE `src/audio/` module SHALL NOT import from `src/ui`, and SHALL import from other `src/` modules only `src/events/` if it needs it.

### Requirement 2: Microphone capture

**User story:** As a Deaf or hard-of-hearing user with a stereo microphone, I want the app to hear raw stereo sound, so that it can tell which side a sound came from.

#### Acceptance criteria

1. WHEN `start({ kind: 'mic' })` is called, THE Capture SHALL call `navigator.mediaDevices.getUserMedia` with an audio constraint that has `channelCount: 2`, `echoCancellation: false`, `noiseSuppression: false` and `autoGainControl: false`, and no video.
2. THE Capture SHALL request the microphone only from inside `start`, so that the caller can tie it to a user action. No other function SHALL request it.
3. WHEN the stream has one channel, THE Capture SHALL feed that channel to both the left and the right channel of the graph, so that downstream code always sees two equal channels.
4. WHEN the stream has two channels, THE Capture SHALL pass them through unchanged and in order (left, right).
5. IF `getUserMedia` fails because the user or the browser denied permission (`NotAllowedError`, `SecurityError`), THEN THE Capture SHALL set an error state with code `permission-denied`.
6. IF `getUserMedia` fails because there is no audio input device (`NotFoundError`, `OverconstrainedError`), or `navigator.mediaDevices` has no input device listed, THEN THE Capture SHALL set an error state with code `no-device`.
7. IF `getUserMedia` fails because the device is in use or unreadable (`NotReadableError`, `AbortError`), THEN THE Capture SHALL set an error state with code `device-busy`.
8. IF `navigator.mediaDevices` is missing and the page is not a secure context, THEN THE Capture SHALL set an error state with code `insecure-context`. IF it is missing for another reason, THEN the code SHALL be `unsupported`.
9. IF `getUserMedia` fails with any other error, THEN THE Capture SHALL set an error state with code `unknown`.
10. THE error handling for 2.5 to 2.9 SHALL be a pure function from a thrown value and an environment summary to an error object, so that it is unit-testable without a browser.
11. IF the microphone stream ends while listening (device unplugged, permission revoked), THEN THE Capture SHALL stop the graph and set an error state with code `no-device` or `permission-denied` as far as the browser tells it apart, else `device-busy`.
12. WHEN a start attempt fails, THE Capture SHALL release every resource it created (tracks, nodes, context), so that a later `start` works.
13. THE Capture SHALL NOT write audio samples to the console, to storage or to the network.

### Requirement 3: Clip capture

**User story:** As a user without a microphone, I want to play a recorded sound through the same pipeline, so that I can try the whole app with no hardware and no permission.

#### Acceptance criteria

1. THE `listClips()` method SHALL return a promise of the Manifest entries as `{ id, file, class, label, durationSec }`, read from `/clips/manifest.json` (relative to the base URL) and not from a hard-coded list.
2. WHEN `start({ kind: 'clip', id })` is called, THE Capture SHALL fetch the Clip's WAV file from the same origin, decode it with `AudioContext.decodeAudioData`, and play it into the graph described in Requirement 4 in real time, once.
3. THE Clip path SHALL NOT ask for microphone permission and SHALL NOT call `getUserMedia`.
4. THE Clip path SHALL NOT make audible sound through the speakers or headphones, because the users cannot rely on it and it would feed back into an open microphone. Output SHALL stay silent unless a later feature adds a monitor option.
5. WHEN the Clip is mono, THE graph SHALL feed it to both channels (Requirement 2.3). WHEN the Clip is stereo, THE graph SHALL pass it through.
6. WHEN the Clip finishes playing, THE Capture SHALL deliver every stereo and mono frame that is complete, then set the state to `ended`, and then release the graph.
7. IF the Clip id is not in the Manifest, THEN THE Capture SHALL set an error state with code `clip-not-found`.
8. IF the Manifest or the file cannot be fetched or decoded, THEN THE Capture SHALL set an error state with code `clip-load-failed`.
9. THE Clip path SHALL use the same Tap, the same downmix, the same Resampler and the same Framer as the microphone path, so that the two paths differ only in the node that feeds the graph.
10. THE only requests the Clip path makes SHALL be `GET` requests to the same origin for `/clips/manifest.json` and one `/clips/<file>.wav`.

### Requirement 4: Shared graph and stereo tap

**User story:** As the author of the bearing module, I want raw stereo samples at the real sample rate, so that I can measure the tiny time difference between the two channels.

#### Acceptance criteria

1. THE Capture SHALL build one graph for both Sources: source node, stereo input stage, Tap, and a muted connection to the context destination, so that the browser keeps pulling audio through the Tap.
2. THE stereo input stage SHALL be an `AudioNode` with two channels, `channelCountMode: 'explicit'` and `channelInterpretation: 'speakers'`, so that a mono source is up-mixed to equal left and right channels by the browser.
3. THE Tap SHALL be an `AudioWorkletNode` loaded with `audioWorklet.addModule`. IF the module fails to load, THEN THE Capture SHALL set an error state with code `worklet-failed`.
4. THE Tap SHALL copy the left and right input samples without filtering, gain, resampling or dithering, at the context rate.
5. THE Tap SHALL collect samples in blocks of 1024 frames by default, and SHALL post each block to the main thread with its two sample arrays transferred, not copied.
6. EACH Stereo frame delivered to `onStereoFrame` SHALL hold `left` and `right` (`Float32Array`, equal length), `sampleRate` (the context rate), `startSample` (frame count since capture start) and `startSec` (`startSample / sampleRate`).
7. THE Tap SHALL NOT drop or reorder blocks. Consecutive Stereo frames SHALL have `startSample` values that differ by exactly the length of the earlier frame.
8. THE Tap SHALL NOT allocate in `process()` except the block arrays that are posted. It SHALL keep no per-sample objects and SHALL do no logging.
9. THE Capture SHALL NOT enable any browser audio processing: echo cancellation, noise suppression and auto gain control stay off (Requirement 2.1), and no other node in the graph changes the signal before the Tap.

### Requirement 5: Resampler

**User story:** As the author of the classifier, I want any input rate converted to 16 kHz mono without aliasing, so that YAMNet sees the same spectrum no matter which sound card or clip it came from.

#### Acceptance criteria

1. THE Resampler SHALL be pure TypeScript in `src/audio/resampler.ts`, with no import of Web Audio, DOM or other `src/` modules, and no global state.
2. THE Resampler SHALL provide a one-shot function `resample(input: Float32Array, inRate: number, outRate: number): Float32Array`, and a streaming object `createResampler(inRate, outRate)` with `push(chunk): Float32Array` and `flush(): Float32Array`.
3. THE Resampler SHALL accept any input rate from 8000 to 192000 Hz and any output rate from 8000 to 48000 Hz, including non-integer ratios such as 44100 to 16000. IF a rate is outside that range, not an integer, or not finite, THEN it SHALL throw a `RangeError` that names the argument.
4. WHEN the input rate equals the output rate, THE Resampler SHALL return a copy of the input unchanged.
5. THE total output length for N input samples, after `flush`, SHALL be exactly `floor(N * outRate / inRate)`. A Resampler SHALL NOT drift: for any N this holds for any way of splitting the input into chunks.
6. THE streaming output SHALL be identical, sample for sample, whatever the chunk sizes are, including chunks of length 0 and 1, and SHALL equal the output of the one-shot function.
7. THE Resampler SHALL apply an anti-alias low-pass filter before it reduces the rate. WHEN `inRate` is greater than `outRate`, THE filter SHALL have its 6 dB point at 7500 Hz for a 16000 Hz output (that is, 0.46875 of the output rate), a transition band of 1000 Hz, and at least 60 dB attenuation from the stop band start. WHEN `inRate` is lower than `outRate`, THE filter SHALL have its 6 dB point at 0.45 of the input rate.
8. THE filter SHALL have linear phase and its output SHALL be time-aligned with the input, so that a sound at input time t appears at output time t, with no delay to compensate.
9. A 1 kHz sine at amplitude 1 SHALL come out with a dominant frequency of 1 kHz (within one FFT bin of the output) and an amplitude between 0.98 and 1.02, for input rates 44100 and 48000 and for 8000 and 22050.
10. A tone at 9 kHz, sampled at 48000 Hz (which would fold to 7 kHz if not filtered), SHALL come out at least 50 dB below a 1 kHz tone of the same input amplitude. The same SHALL hold for a 12 kHz tone sampled at 44100 Hz.
11. A tone at 7.9 kHz sampled at 48000 Hz and at 44100 Hz SHALL come out at least 20 dB below a 1 kHz tone of the same input amplitude.
12. A DC input of constant value c SHALL give an output of c (within 1e-6) except within the filter's edge region at the start and end of the stream.
13. FOR finite input samples, THE Resampler SHALL return finite output samples, and SHALL NOT mutate its input.
14. THE Resampler SHALL be deterministic. The same input gives the same output on every run.
15. THE Resampler SHALL build its filter tables once in `createResampler`, and SHALL NOT allocate per output sample in `push`, except the returned output array.

### Requirement 6: Framer

**User story:** As the author of the classifier, I want fixed windows with 50% overlap, so that YAMNet gets exactly the input shape it expects, twice per window length.

#### Acceptance criteria

1. THE Framer SHALL be pure TypeScript in `src/audio/framer.ts`, with no import of Web Audio, DOM or other `src/` modules.
2. THE Framer SHALL be created with `createFramer({ windowSize, hop })`, with the defaults `windowSize = 15600` and `hop = 7800`. IF `windowSize` or `hop` is not a positive integer, or `hop` is greater than `windowSize`, THEN it SHALL throw a `RangeError`.
3. THE Framer SHALL provide `push(chunk: Float32Array): Frame[]`, where `Frame` is `{ index, startSample, samples }`. `samples` has length `windowSize`.
4. THE frame with index `i` SHALL contain the input samples from position `i * hop` up to but not including `i * hop + windowSize`, counted from the first sample pushed, and `startSample` SHALL equal `i * hop`.
5. AFTER a total of N samples have been pushed, THE Framer SHALL have emitted `N < windowSize ? 0 : floor((N - windowSize) / hop) + 1` frames in total, whatever the chunk sizes were.
6. THE Framer SHALL emit the same frames, with the same sample values, for every way of splitting the input into chunks, including chunks of length 0 and 1, and chunks larger than one window.
7. WHEN a chunk completes more than one frame, THE Framer SHALL return all of them in order in one call.
8. THE returned `samples` array SHALL be a new array owned by the caller. The Framer SHALL NOT keep or change it afterwards.
9. THE Framer SHALL provide `reset()` that drops all buffered samples and restarts the index at 0.
10. THE Framer SHALL NOT emit a partly filled or zero-padded window. A tail shorter than a window is dropped.
11. THE Framer SHALL keep at most `windowSize` samples buffered, so that its memory does not grow with the length of the stream.
12. THE Framer SHALL NOT mutate the chunk it is given.

### Requirement 7: Mono pipeline

**User story:** As a developer, I want the step from stereo blocks to YAMNet windows to be one tested unit, so that the microphone and clip paths cannot differ.

#### Acceptance criteria

1. THE `src/audio/` module SHALL provide a pure `createMonoPipeline(contextRate)` that takes Stereo frames and returns Mono frames, built from a downmix, the Resampler (to 16000 Hz) and the Framer, and importing no Web Audio or DOM code.
2. THE downmix SHALL be the mean of the left and right samples, `(l + r) / 2`.
3. WHEN left and right are equal (a mono source), THE downmix SHALL equal that single channel exactly.
4. EACH Mono frame delivered to `onMonoFrame` SHALL hold `samples` (`Float32Array` of 15600), `sampleRate` (16000), `index`, and `startSec` (stream time of its first sample, `startSample / 16000`).
5. THE pipeline SHALL give the same mono frames for the same stereo input whatever the Stereo frame length is (for example 128, 1024 or 4096 samples).
6. THE Capture SHALL use this pipeline for both Sources, and SHALL call `onMonoFrame` listeners from the main thread after each Stereo frame that completes a window.
7. WHEN the context rate is 16000, THE pipeline SHALL skip filtering and use the downmix as is (Requirement 5.4).
8. THE first Mono frame SHALL appear after 15600 samples at 16000 Hz have been produced, which is 0.975 s of audio, plus no more than one Stereo frame of delay.

### Requirement 8: Unit and property tests for the resampler and framer

**User story:** As a developer, I want the signal-processing code proven against many inputs without a browser, so that I can trust it before any hardware is involved.

#### Acceptance criteria

1. WHEN `bun run test` is run, THE tests in `tests/audio/resampler.test.ts` SHALL cover Requirements 5.3 to 5.5 and 5.9 to 5.12 with concrete examples: a 1 kHz sine at 44100, 48000, 22050 and 8000 Hz; a 9 kHz tone at 48000 Hz; a 12 kHz tone at 44100 Hz; a 7.9 kHz tone at 48000 and 44100 Hz; DC; and each invalid rate.
2. THE tests SHALL measure the frequency and amplitude of a result with a small pure DFT or Goertzel helper in `tests/audio/spectrum.ts`, with its own unit tests (a known sine gives the known frequency and amplitude), and SHALL NOT depend on a DSP library.
3. THE tests SHALL ignore the filter's edge region when they measure (at least the filter half-length at the start and at the end), and SHALL state that length in the test.
4. THE property tests in `tests/audio/resampler.property.test.ts` SHALL use fast-check and SHALL check, for arbitrary supported rates and arbitrary finite input: output length equals `floor(N * outRate / inRate)`; streaming output split at arbitrary points equals one-shot output exactly; the output is finite; the input is not mutated; the same input gives the same output.
5. THE property tests SHALL check, for a sine of arbitrary frequency in 100 Hz to 6000 Hz and arbitrary supported input rate, that the dominant output frequency is the input frequency, within one bin.
6. THE property tests SHALL check that for a sine of arbitrary frequency between 8500 Hz and the input Nyquist frequency, the output amplitude is at least 40 dB below the input amplitude.
7. THE tests in `tests/audio/framer.test.ts` SHALL cover Requirements 6.2 to 6.12 with concrete examples: fewer than 15600 samples gives no frame; exactly 15600 gives one; 15600 + 7800 gives two; 23399 gives one; a chunk of 40000 samples gives four frames at once; `reset`; and each invalid option.
8. THE property tests in `tests/audio/framer.property.test.ts` SHALL use fast-check and SHALL check, for arbitrary `windowSize`, `hop` and arbitrary chunk splits of a ramp signal (sample `n` has value `n`): the frame count formula in 6.5; each frame's `samples[j]` equals `startSample + j`; consecutive frames overlap by `windowSize - hop` samples with equal values; splitting does not change the output; the total buffered count never exceeds `windowSize`.
9. THE tests in `tests/audio/pipeline.test.ts` SHALL check Requirement 7: a mono source and the same signal as identical left and right give the same Mono frames; different Stereo frame lengths give the same Mono frames; the first frame index and `startSec` values follow the hop (0, 0.4875, 0.975 s); a 1 kHz stereo sine at 48000 Hz gives Mono frames whose dominant frequency is 1 kHz.
10. THE tests in `tests/audio/errors.test.ts` SHALL check that each thrown error name in Requirement 2.5 to 2.9 maps to the stated code, and that a non-Error thrown value maps to `unknown` without throwing.
11. IF a property fails, THEN fast-check SHALL report a shrunk counterexample, and the tests SHALL NOT fix the seed in a way that hides failures.
12. THE tests SHALL prove they can fail: the implementation task SHALL include a check that a deliberately broken resampler and a deliberately broken framer each make at least one test fail.
13. THE tests SHALL run without a browser and without network access.

### Requirement 9: Browser tests

**User story:** As a developer, I want proof that frames really flow in Chromium on both paths, so that the Web Audio wiring is checked and not assumed.

#### Acceptance criteria

1. THE e2e tests in `e2e/audio-capture.spec.ts` SHALL run in Chromium launched with `--use-fake-device-for-media-stream` and `--use-fake-ui-for-media-stream`, set in the spec file with `test.use({ launchOptions: { args } })`, without changing `playwright.config.ts`.
2. THE e2e tests SHALL use a harness page `capture-harness.html` served by the dev server. It SHALL be a test page that is not linked from the app, shows no product UI, and records frame metadata (not samples) that the test reads.
3. THE microphone test SHALL click a button on the harness page to call `start({ kind: 'mic' })`, wait for the state `listening`, and wait for at least two Mono frames and at least 40 Stereo frames.
4. THE microphone test SHALL check: the state holds a context rate above 0 and 1 or 2 channels; every Stereo frame has equal-length `left` and `right`; every Stereo frame length matches the previous frame's `startSample` step; every Mono frame has 15600 samples and `sampleRate` 16000; consecutive Mono frames are 0.4875 s apart in `startSec`, and the first two frames' `startSample` values are 0 and 7800.
5. THE microphone test SHALL check that the `getUserMedia` call received `channelCount: 2`, `echoCancellation: false`, `noiseSuppression: false` and `autoGainControl: false`, by wrapping `navigator.mediaDevices.getUserMedia` in an init script that records its argument.
6. THE clip test SHALL start `{ kind: 'clip', id: 'doorbell-01' }` with no microphone permission granted and no `getUserMedia` call, and SHALL check that Mono frames arrive (15600 samples, 16000 Hz), that Stereo frames arrive, and that the state reaches `ended` after the Clip's duration.
7. THE clip test SHALL check that the number of Mono frames matches the Resampler's output length for the decoded Clip, within one frame, using the Manifest `durationSec` and the context rate: `floor(floor(duration * 16000 - 15600) / 7800) + 1`, with a tolerance of one frame.
8. THE clip test SHALL check that at least one Mono frame of the doorbell clip has a root-mean-square value above 0.001, so that silence does not pass.
9. THE shape of the frames from the clip test SHALL equal the shape of the frames from the microphone test: the same field names, the same lengths, the same `sampleRate` for Mono frames.
10. THE error tests SHALL stub `navigator.mediaDevices.getUserMedia` with an init script that rejects with `NotAllowedError`, then `NotFoundError`, then `NotReadableError`, and SHALL check that the state becomes `error` with the codes `permission-denied`, `no-device` and `device-busy`, with a non-empty `message`, and that a following clip `start` works.
11. THE e2e tests SHALL record all network requests during listening, and SHALL fail on any request whose origin is not the dev server, or whose path is not the page, its scripts and modules, `/clips/manifest.json`, or `/clips/*.wav`. This is the unexpected-request check required by the privacy steering.
12. THE e2e tests SHALL check that after `stop()` the microphone track state is `ended`, and that no more frames arrive.
13. THE e2e tests SHALL NOT depend on the fake device's waveform, only on frame shape and timing.
14. THE harness page SHALL be reachable by keyboard and its buttons SHALL have visible labels. It SHALL NOT use sound for feedback.

### Requirement 10: Project rules

**User story:** As a maintainer, I want this feature to follow the steering rules, so that it fits the rest of the project.

#### Acceptance criteria

1. THE feature SHALL add no runtime dependencies, SHALL use no DSP library, and SHALL send no audio or derived data anywhere. The only requests are the same-origin Clip requests in 3.10.
2. THE feature SHALL write no audio, spectra or sample values to the console, to storage or to the network.
3. THE Resampler, Framer, mono pipeline and error mapping SHALL be pure functions or objects with no Web Audio, DOM or global state, and SHALL be deterministic.
4. THE feature SHALL work with no band and no microphone (Clip path), in any browser that supports `AudioWorklet`. IF `AudioWorklet` or `AudioContext` is missing, THEN THE Capture SHALL set the error code `unsupported`.
5. THE feature SHALL add no strings to the product UI. Error messages in the state are data for the UI to show, and they SHALL follow the plain-language rule in the accessibility steering.
6. WHEN the feature is complete, `bun run typecheck`, `bun run test` and `bun run e2e` SHALL pass.
7. THE worklet source SHALL build with `bun run build`, and SHALL be loaded in dev and in the static build with the same code path.

## Out of scope

- YAMNet loading, inference and the label-to-class mapping (F4).
- GCC-PHAT, the bearing sign convention and left/right decisions (F5). This feature only delivers raw stereo frames, with `startSec` so that F5 can align them with a Mono frame.
- Loudness (dBFS) measurement. F4 and F5 compute it from the frames they receive.
- Choosing an input device, device lists, sample-rate selection, looping or seeking a Clip, a speaker monitor.
- Permission explanation text and the settings UI. The caller shows the explanation before it calls `start`.
- Any UI, text alert, ghost or haptic output.
- Verifying that a real stereo microphone gives true stereo. The fake device may be mono or stereo, so tests check the shape, not the content.

## Assumptions to confirm

- **7.9 kHz is below the 8 kHz Nyquist frequency of the output**, so it is not strictly "above Nyquist" and it does not alias. I read the acceptance criterion as "a tone near the top edge is attenuated" and set 20 dB for it (5.11). I added a real alias check: a 9 kHz tone at 48000 Hz would fold to 7 kHz, and it must come out at least 50 dB down (5.10). If you want 7.9 kHz attenuated more, the filter needs a longer kernel or a lower cutoff, and the loss near 7 kHz grows. YAMNet's mel bands stop at 7.5 kHz, so I put the 6 dB point there.
- **Clip id** is the file name without `.wav`, so `doorbell-01`. The Manifest has no separate id field.
- **The clip request is same-origin**, so it counts as an allowed request under the "no network calls in the audio path" rule. The e2e check uses an allow list (9.11). If you want zero requests, the clips would have to be imported as bundled assets, which still become requests in a static site.
- **Clips are silent on the speakers.** It prevents feedback with an open microphone and does not matter for Deaf users. A monitor option can come later.
- **Clips play once, in real time**, not faster than real time. A faster path would need an `OfflineAudioContext` and would not match the microphone path. The cost is that the clip e2e test takes the clip's length (about 4 s for `doorbell-01`).
- **Stereo frames carry 1024 frames each by default** (about 21 ms at 48 kHz). F5 will collect several to form its analysis window. The size can be set through a `createCapture` option if F5 needs another.
- **The main thread does the downmix, resampling and framing.** The cost is small (about 16000 output samples per second) and it keeps that code pure and testable. If it shows up in profiling, it can move into a worker later without changing the API.
- **The Capture state holds no loudness and no event.** Creating `SoundEvent` records belongs to the classify and bearing features.
- **`start` never rejects for expected failures** and returns the state instead. An unexpected programming error still throws.
- **`capture-harness.html` stays out of the production build.** It sits at the project root like `styleguide.html` and is served by the dev server only, because `vite.config.ts` lists the build inputs.
- **Playwright's default Chromium is enough** for the fake device flags. The fake device may deliver one channel, so the tests accept 1 or 2.
