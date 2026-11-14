# Design: Audio capture

## Overview

One Web Audio graph feeds two outputs. Both the microphone and the recorded clips go through it.

| Output | Rate and shape | Consumer |
|---|---|---|
| Stereo frames | raw left and right, context rate, 1024 frames per block | bearing (F5, GCC-PHAT) |
| Mono frames | mono, 16000 Hz, 15600 samples, hop 7800 | classifier (F4, YAMNet) |

The Web Audio part is thin. Everything that can be wrong in the numbers (resampling, windowing, timing) is plain TypeScript that Vitest tests without a browser.

```
mic (getUserMedia)  --\
                       +--> stereo input stage --> Tap (AudioWorklet) --> muted gain --> destination
clip (decodeAudioData) /     (2 ch, explicit,        |
                              speakers up-mix)       | postMessage, transferred blocks
                                                     v
                                  main thread: Stereo frame --> onStereoFrame
                                                     |
                                                     v
                                  createMonoPipeline: downmix -> Resampler -> Framer
                                                     |
                                                     v
                                                onMonoFrame
```

## Dependency position

`src/audio` is the lowest module. It imports nothing from the project (it does not need `src/events`). `classify` and `bearing` import its frame types. It never imports `src/ui`.

## Files

```
src/audio/constants.ts     YAMNET_RATE, WINDOW_SIZE, HOP_SIZE, STEREO_BLOCK, resampler limits
src/audio/types.ts         StereoFrame, MonoFrame, CaptureSource, CaptureState, CaptureError, Capture, ClipInfo
src/audio/errors.ts        toCaptureError(thrown, env): CaptureError   (pure)
src/audio/resampler.ts     resample, createResampler                    (pure)
src/audio/framer.ts        createFramer                                 (pure)
src/audio/pipeline.ts      createMonoPipeline                           (pure)
src/audio/tap.worklet.ts   AudioWorkletProcessor (runs in the worklet scope)
src/audio/graph.ts         builds context, input stage, Tap, muted output; message handling
src/audio/mic.ts           getUserMedia constraints and the mic source node
src/audio/clips.ts         manifest loading, fetch, decode, the clip source node
src/audio/capture.ts       createCapture: state machine, listeners, start/stop
src/audio/index.ts         re-exports types and createCapture
capture-harness.html       test page (dev server only)
src/audio/harness.ts       harness page script: wires buttons, records frame metadata
tests/audio/spectrum.ts    pure DFT/Goertzel helpers for tests
tests/audio/spectrum.test.ts
tests/audio/resampler.test.ts
tests/audio/resampler.property.test.ts
tests/audio/framer.test.ts
tests/audio/framer.property.test.ts
tests/audio/pipeline.test.ts
tests/audio/errors.test.ts
e2e/audio-capture.spec.ts
```

`harness.ts` is the only file in `src/audio` that touches the DOM page. It is test scaffolding. It is not exported from `index.ts`, and the build does not include it, since `vite.config.ts` lists only `index.html` and `styleguide.html`.

## Public API

```ts
// constants.ts
export const YAMNET_RATE = 16000;
export const WINDOW_SIZE = 15600;   // 0.975 s
export const HOP_SIZE = 7800;       // 50% overlap
export const STEREO_BLOCK = 1024;

// types.ts
export type CaptureSource =
  | { kind: 'mic' }
  | { kind: 'clip'; id: string };

export interface StereoFrame {
  left: Float32Array;
  right: Float32Array;     // same length as left
  sampleRate: number;      // context rate
  startSample: number;     // frames since capture start
  startSec: number;        // startSample / sampleRate
}

export interface MonoFrame {
  samples: Float32Array;   // length 15600, caller owns it
  sampleRate: 16000;
  index: number;           // 0, 1, 2, ...
  startSec: number;        // stream time of samples[0]
}

export type CaptureErrorCode =
  | 'permission-denied' | 'no-device' | 'device-busy' | 'insecure-context' | 'unsupported'
  | 'clip-not-found' | 'clip-load-failed' | 'worklet-failed' | 'unknown';

export interface CaptureError { code: CaptureErrorCode; message: string }

export type CaptureState =
  | { status: 'idle' }
  | { status: 'starting'; source: CaptureSource }
  | { status: 'listening'; source: CaptureSource; sampleRate: number; channels: 1 | 2; rawProcessing: boolean }
  | { status: 'ended'; source: CaptureSource }
  | { status: 'error'; error: CaptureError };

export interface ClipInfo { id: string; file: string; class: string; label: string; durationSec: number }

export interface Capture {
  readonly state: CaptureState;
  start(source: CaptureSource): Promise<CaptureState>;
  stop(): Promise<void>;
  onMonoFrame(l: (f: MonoFrame) => void): () => void;
  onStereoFrame(l: (f: StereoFrame) => void): () => void;
  onStateChange(l: (s: CaptureState) => void): () => void;
  listClips(): Promise<ClipInfo[]>;
}

export function createCapture(options?: { stereoBlock?: number }): Capture;
```

`ClipInfo.class` is a plain string because `src/audio` does not import `src/events`. The UI can narrow it with the validator.

State transitions:

```
idle --start--> starting --ok--> listening --clip ends--> ended --(graph released)
  ^                 |                |
  |                 +--failure--> error          mic track ends --> error
  +------ stop() from any state
```

`ended` and `error` both leave the graph released. `start` is allowed from any state.

## The pure parts

### Resampler

Goal: correct, exact length, no aliasing, and the same output for any chunking.

Method: polyphase windowed-sinc filter, designed in the input-rate domain.

1. Reduce the ratio. `g = gcd(inRate, outRate)`, `L = outRate / g` (phases), `M = inRate / g` (step). Output sample `k` sits at input position `k * M / L`. Its integer part is `n = floor(k*M / L)` and its fractional phase is `p = (k*M) mod L`. Both come from integer arithmetic, so there is no float drift over long streams. For 48000 to 16000, `L = 1`, `M = 3`. For 44100 to 16000, `L = 160`, `M = 441`.
2. Design the kernel. Kaiser-windowed sinc with the 6 dB point `fc` and a transition width `Δf` = 1000 Hz.
   - Downsampling to 16 kHz: `fc = 7500 Hz` (passband edge 7000 Hz, stop band edge 8000 Hz).
   - General downsampling: `fc = 0.46875 * outRate`, and `Δf = 0.0625 * outRate`, which is the same shape scaled to the output rate.
   - Upsampling: `fc = 0.45 * inRate`, `Δf = 0.1 * inRate`.
   - Attenuation target `A = 70 dB` (a margin over the 60 dB requirement). Kaiser parameters: `beta = 0.1102 * (A - 8.7)` and tap count `T = ceil((A - 7.95) / (2.285 * 2π * Δf / inRate)) + 1`, made odd. For 48 kHz and `Δf` = 1000 Hz that is about 190 taps, for 44.1 kHz about 175.
3. Build the table. For each phase `p` in `0..L-1`, tap `j` in `-H..H` (`H = (T-1)/2`): `h[p][j] = sinc kernel at offset (j - p/L)`, times the window, with `2 fc / inRate` as the scale. Then divide each row by its sum so that DC gain is exactly 1.
4. Compute output `k`: `y[k] = sum_j h[p][j] * x[n + j]`, where samples before the first input are 0 and samples after the last input are 0.
5. Table size cap. If `L > 512` (odd rates such as 44101), build 512 phase rows and linearly interpolate between the two nearest rows. This keeps the table at most 512 × T floats (about 400 KB). The output length rule and the chunking identity do not change, because they depend only on `k`, `n` and `p`.

Streaming state: a history buffer of `2H` most recent input samples plus the pending input, the count `inCount` of input samples seen, the next output index `k`, and the running `n`, `p`. `push(chunk)` appends and emits every output `k` whose `n + H <= inCount - 1`. The `n + H` rule is the lookahead the symmetric kernel needs. `flush()` treats the missing future input as zeros, and emits until `k = floor(inCount * L / M) - 1`, which is the total length rule in Requirement 5.5.

The kernel is symmetric (linear phase) and centred on `n`, so output `k` is aligned to input time `k * M / L`. There is no group delay to remove (Requirement 5.8). The start of the stream sees zeros before sample 0, so there is a short edge transient of at most `H` input samples at the start and at the end. Tests skip it.

Chunk invariance holds because output `k` always sums the same input samples in the same order, no matter where the chunk edges fall. The sum runs in a fixed order with `Float64` accumulation and a single rounding to `Float32` at the end, so the results are bit-identical, and the property test can use exact equality.

Passthrough: `inRate === outRate` returns `chunk.slice()` and `flush()` returns an empty array.

Validation: rates must be integers in range, or `RangeError` with the argument name. Out-of-range is cheap to check and stops a silent 0 Hz or NaN rate from creating an enormous table.

Cost: 16000 outputs per second × about 190 taps × 1 multiply-add is about 3 million operations per second. This is small enough to run on the main thread.

Allocation: the tables are built once. `push` allocates only the returned output array (the history buffer is a reused ring, grown only if a chunk is larger than the buffer, which is done once).

Expected frequency response, to be confirmed by measurement in task 3 (not assumed): flat within ±0.1 dB to 6 kHz, about −6 dB at 7.5 kHz, below −60 dB from 8 kHz. A tone at 7.9 kHz should sit around −30 to −40 dB. The requirement is 20 dB, so there is room. If the measurement misses a threshold, adjust `A` or `Δf`, and record the change in this file.

### Framer

A fixed ring buffer of `windowSize` samples plus a count `total` of samples pushed.

```
push(chunk):
  for each sample: ring[write] = s; write = (write + 1) % windowSize; total++
    if total >= windowSize and (total - windowSize) % hop === 0:
       emit frame i = (total - windowSize) / hop  (copy ring from oldest to newest)
```

The inner loop above is written per sample for clarity. The implementation processes the chunk in runs, copying up to the next emit point with `set`, so it does not branch per sample. The result is the same and the property tests cover both.

Frame `i` covers `[i*hop, i*hop + windowSize)`, and it is emitted when sample `i*hop + windowSize - 1` arrives. That gives the count formula `floor((N - windowSize)/hop) + 1` for `N >= windowSize`. A frame is copied out into a new `Float32Array(windowSize)`, 47 KB every 0.4875 s, which is negligible and means the consumer can keep or transfer it.

Memory is bounded by `windowSize` (Requirement 6.11), because the ring is fixed.

`hop` greater than `windowSize` is rejected. A hop equal to the window gives no overlap, and this is allowed.

### Mono pipeline

```ts
export function createMonoPipeline(contextRate: number): {
  push(left: Float32Array, right: Float32Array, startSample: number): MonoFrame[];
  reset(): void;
}
```

`push` makes a downmix buffer `(l[i] + r[i]) / 2` (reused, grown if needed), runs it through the Resampler, then the Framer, and builds `MonoFrame` objects with `startSec = frame.startSample / 16000`. `startSample` of the Stereo frame is not used for the maths. Stream time comes from counting, so a missing block cannot silently shift the timeline. The worklet delivers blocks in order, and the Capture checks that each `startSample` continues from the previous one. If it does not, it sets the state to `error` with code `unknown` and a message about lost audio, instead of delivering a shifted stream.

Equal left and right (mono source) give `(l + l)/2 = l` exactly, as floating-point `l + l` is exact for `Float32` promoted to `Float64` (a doubling), and halving is exact.

The downmix is done by the main-thread pipeline and not in the worklet, because the worklet posts raw stereo for F5 anyway. The mono mix is then a cheap loop over the same arrays.

### Error mapping

```ts
export function toCaptureError(thrown: unknown, env: { hasMediaDevices: boolean; isSecureContext: boolean }): CaptureError
```

| Condition | Code |
|---|---|
| `!env.hasMediaDevices && !env.isSecureContext` | `insecure-context` |
| `!env.hasMediaDevices` | `unsupported` |
| `NotAllowedError`, `SecurityError` | `permission-denied` |
| `NotFoundError`, `OverconstrainedError`, `DevicesNotFoundError` | `no-device` |
| `NotReadableError`, `AbortError`, `TrackStartError` | `device-busy` |
| anything else, including non-Error values | `unknown` |

It reads `name` through a guarded access, since the thrown value is untrusted. Messages are fixed strings. They never include the thrown value's own message, so a device name or other detail does not reach the UI or console. Examples (plain language, no safety claims):

- `permission-denied`: "Microphone access was blocked. Allow the microphone in your browser settings, or try a recorded sound instead."
- `no-device`: "No microphone was found. Connect one, or try a recorded sound instead."
- `device-busy`: "The microphone is in use by another app or could not be opened. Close the other app and try again."
- `insecure-context`: "The microphone needs a secure page (https or localhost). You can still try a recorded sound."
- `unsupported`: "This browser cannot capture audio here. Try a recent Chrome or Edge."

## The Web Audio parts

### Context and graph (`graph.ts`)

1. `new AudioContext({ latencyHint: 'interactive' })`. No `sampleRate` option, so the context follows the device and `sampleRate` is whatever the browser gives. The Resampler handles it.
2. `await ctx.resume()`. `start` runs after a user action, so autoplay rules allow it.
3. `await ctx.audioWorklet.addModule(workletUrl)`. On failure, error `worklet-failed`.
4. Stereo input stage: `new GainNode(ctx, { channelCount: 2, channelCountMode: 'explicit', channelInterpretation: 'speakers', gain: 1 })`. A mono source connected to it is up-mixed to equal left and right by the Web Audio rules for speakers (mono to stereo copies the channel to both). A stereo source passes through. Gain 1 does not change the signal.
5. Tap: `new AudioWorkletNode(ctx, 'banshee-tap', { numberOfInputs: 1, numberOfOutputs: 1, channelCount: 2, channelCountMode: 'explicit', outputChannelCount: [2], processorOptions: { block: stereoBlock } })`.
6. Tap output to a `GainNode` with `gain = 0`, then to `ctx.destination`. Some browsers do not pull a node with no path to the destination. The zero gain keeps the speakers silent (Requirement 3.4) while the graph runs.
7. `node.port.onmessage` receives `{ left: ArrayBuffer, right: ArrayBuffer, startSample }` and calls the Capture.

The worklet URL is imported with Vite: `import workletUrl from './tap.worklet.ts?worker&url'`. Vite bundles the worklet to a standalone file in the build and serves it in dev. This is the same code path in both (Requirement 10.7). If the `?worker&url` import turns out not to work for worklets in the installed Vite version, the fallback is `new URL('./tap.worklet.ts', import.meta.url)` with `{ type: 'module' }`, and task 6 records which one worked.

### Tap (`tap.worklet.ts`)

```ts
class TapProcessor extends AudioWorkletProcessor {
  private block: number; private left: Float32Array; private right: Float32Array;
  private fill = 0; private startSample = 0;
  process(inputs: Float32Array[][]): boolean {
    const ch = inputs[0];
    const l = ch[0], r = ch[1] ?? ch[0];       // defensive: one channel is duplicated
    if (!l) return true;                         // no input this quantum (source not connected yet)
    for (let i = 0; i < l.length; i++) {
      this.left[this.fill] = l[i]; this.right[this.fill] = r[i];
      if (++this.fill === this.block) this.post();
    }
    return true;
  }
}
registerProcessor('banshee-tap', TapProcessor);
```

`post()` sends the two buffers with `postMessage(msg, [left.buffer, right.buffer])`, then allocates two new arrays and resets `fill`. That is two allocations per block (about 47 times per second), which is the cost of a zero-copy transfer. A recycled-buffer scheme would remove it, and it adds a return channel, so it is not worth it. No allocation in the per-sample loop. The `ch[1] ?? ch[0]` line is only a safety net, since the explicit two-channel input stage already guarantees two channels.

A render quantum has 128 frames, and 1024 is a multiple of 128, so blocks are whole quanta. A block size that is not a multiple still works through the `fill` counter, and the spec test uses 1024.

A silent input (no signal yet) arrives as zeros, not as an empty array, once the source is connected. When `inputs[0]` is empty the quantum is skipped, and that would create a gap in `startSample`. To avoid a gap, the Tap counts those quanta as zeros: if `l` is missing it writes 128 zeros. The Tap never skips time.

The worklet scope has no `AudioWorkletProcessor` type in the DOM lib. A small `src/audio/worklet-globals.d.ts` declares `AudioWorkletProcessor`, `registerProcessor` and `sampleRate`. The worklet file is excluded from the DOM-only parts of the code and shares no runtime code with the main thread.

### Microphone (`mic.ts`)

```ts
const constraints: MediaStreamConstraints = {
  audio: { channelCount: 2, echoCancellation: false, noiseSuppression: false, autoGainControl: false },
  video: false,
};
```

`channelCount: 2` as a plain number is an `ideal` value. A mono microphone still opens, with one channel, and the input stage up-mixes it. After the stream opens:

- `track.getSettings()` gives `channelCount`, `echoCancellation`, `noiseSuppression`, `autoGainControl`. `channels` in the state is `settings.channelCount === 1 ? 1 : 2`. If the setting is missing it assumes 2, since the stage makes it 2 either way.
- `rawProcessing` is true only if all three settings are `false`. If a browser ignores a constraint, the state says so and F5 or the UI can warn that direction may be less reliable. This feature does not warn the user itself.
- `ctx.createMediaStreamSource(stream)` connects to the input stage.
- `track.onended` sets the error state (Requirement 2.11). The error code comes from the track's mute state and `permissions.query` is not used. Without a reliable signal, the code is `device-busy`, and the message tells the user to check the microphone.

If `navigator.mediaDevices` is missing, `toCaptureError` receives the environment and maps it, as the table shows.

Browsers may ask for permission per call. `stop()` stops every track, so the browser's recording indicator turns off.

### Clips (`clips.ts`)

```ts
async function loadManifest(): Promise<ClipInfo[]>   // fetch `${import.meta.env.BASE_URL}clips/manifest.json`
async function playClip(ctx, id, dest, onEnded)       // fetch wav, decodeAudioData, AudioBufferSourceNode
```

- Manifest entries become `ClipInfo` with `id = file.replace(/\.wav$/, '')`. An entry that is not an object with string `file`, `class`, `label` and a number `durationSec` is dropped, not thrown on, so that one bad entry does not block the rest.
- `decodeAudioData` decodes at the context rate. The browser does the resampling for the clip. The Resampler then does the 16 kHz step for both paths, so the 16 kHz step has one implementation.
- A decoded mono buffer feeds the input stage and is up-mixed (Requirement 3.5).
- `source.start()` plays in real time. `source.onended` triggers the end sequence.
- Fetch uses `credentials: 'omit'`, `cache: 'force-cache'` is not set (default caching is fine). No headers are added.

End sequence (Requirement 3.6): `onended` posts `{ type: 'flush' }` to the Tap. The Tap posts its partly filled block (shorter than `block`), then `{ type: 'flushed' }`. Messages on one port arrive in order, so when the main thread sees `flushed` every sample has been delivered and processed. Then the Capture runs the Resampler `flush()` through the Framer (which may emit nothing, since partial windows are dropped), sets the state to `ended` and releases the graph. The `flush` of the Resampler matters for the length rule, and the tail only matters if it completes a window.

### Capture (`capture.ts`)

The state machine holds: the current state, the sets of listeners, a `session` object (context, nodes, stream, pipeline) or `null`, and a counter `generation` that increments on every `start` and `stop`. Async steps check that `generation` still matches after each `await`, so a `stop()` or second `start()` during a slow `getUserMedia` or fetch cleans up the late result and does not resurrect a stopped capture.

`start(source)`:

1. `await stop()` if a session exists. Increment `generation`. Set `starting`.
2. Check the environment (`AudioContext`, `AudioWorklet`). If missing, error `unsupported`.
3. For mic: call `getUserMedia`. For a clip: get the manifest and the decoded buffer (before building the graph, so a bad id fails early with `clip-not-found` or `clip-load-failed`, without a context).
4. Create the context and graph, connect the source, and start playing (clip) or wait for frames (mic).
5. Set `listening`.

Any failure after a resource exists runs `release()`, which stops tracks, disconnects nodes and closes the context, and then sets `error`. `release()` is idempotent.

Listener delivery uses a `for` loop over a copy of the listener array, with `try/catch` around each call (Requirement 1.9). A caught listener error is reported with `console.error` and the error's `name` only, never frame data.

`onStereoFrame` listeners get the arrays as received. The arrays belong to the receiver. The Capture does not keep them after delivery, except that the mono pipeline reads them synchronously before the stereo listeners run. A listener may keep or transfer them.

## Testing

### Test helpers

`tests/audio/spectrum.ts`:

```ts
export function sine(freq: number, rate: number, seconds: number, amp = 1): Float32Array;
export function toneAmplitude(x: Float32Array, rate: number, freq: number, skip: number): number; // Goertzel/DFT on x[skip .. len-skip]
export function dominantFrequency(x: Float32Array, rate: number, skip: number): { freq: number; amp: number }; // scans a grid in 10 Hz steps
```

`toneAmplitude` correlates with sine and cosine at the exact frequency over an integer or windowed span, and returns the amplitude. A Hann window removes leakage when the duration is not a whole number of cycles. The helper has its own tests: a known sine returns its amplitude within 1%, and a tone 500 Hz away reads near zero. `skip` is the filter half-length in output samples, so the edge transient is ignored.

Attenuation checks compare `toneAmplitude` of the output at the tone's expected output frequency (for aliased tones, the folded frequency, for example 7000 Hz for a 9 kHz tone at 16 kHz output) with the same measure for a 1 kHz reference at equal input amplitude. They pass if the ratio meets the dB limit in the requirement.

### Resampler tests

| Group | Cases |
|---|---|
| Length | 1 s at 48000, 44100, 22050, 8000, 96000 gives 16000 samples. N = 1, 2, 7, 441 gives `floor(N*16000/rate)` |
| Pass band | 1 kHz sine at each rate keeps frequency and amplitude 0.98 to 1.02. 100 Hz and 6 kHz also pass |
| Stop band | 9 kHz at 48000, 12 kHz at 44100, 7.9 kHz at 48000 and 44100, with the dB limits in Requirement 5.10 and 5.11 |
| DC | constant 0.5 gives 0.5 within 1e-6 away from the edges |
| Passthrough | equal rates return an equal copy, not the same array |
| Errors | rate 0, negative, NaN, 1.5, 7999, 192001, as input and as output rate give `RangeError` naming the argument |
| Streaming | chunks of 1, 7, 128, 4096 equal the one-shot result exactly |

Property tests (`fc.assert`, 100 runs, 20 for the heavier ones, no fixed seed):

| # | Property |
|---|---|
| R1 | For input rate in `fc.constantFrom(8000, 11025, 16000, 22050, 32000, 44100, 48000, 88200, 96000)`, arbitrary finite samples of length 0 to 5000: output length `floor(N*16000/rate)` |
| R2 | Same input, arbitrary split points: concatenated streaming output equals one-shot output with `toEqual` (bit-exact) |
| R3 | Output is finite and the input is unchanged (deep clone before and after) |
| R4 | Two calls give equal output |
| R5 | Sine of frequency 100..6000 Hz (`fc.integer`) at a rate from the list above 8000: dominant output frequency within 1 bin (10 Hz grid, so within 10 Hz) |
| R6 | Sine of frequency from 8500 Hz to input Nyquist minus 100 Hz: output amplitude at the folded frequency at least 40 dB below input amplitude. Cases where the folded frequency lands on a multiple that cannot be told apart are excluded by comparing total output RMS against input RMS instead (RMS ratio below 0.01), which is simpler and does not need the folded frequency |
| R7 | Arbitrary `inRate` in 8000..192000 (integers, not only the list) and arbitrary N: length rule holds, so rates with large `L` (the interpolated table) are covered |

R6 uses output RMS (skipping the edges) against the input RMS, and the threshold 0.01 (40 dB). The 40 dB figure is looser than the 50 dB example, since the property covers the whole range including frequencies close to 8500 Hz, where the transition band ends.

### Framer tests

Examples listed in Requirement 8.7. Property tests (`fc.record` for `windowSize` 1..200 and `hop` 1..windowSize, data length 0..2000, split points):

| # | Property |
|---|---|
| F1 | Total frame count equals the formula |
| F2 | For the ramp signal, `frame.samples[j] === frame.startSample + j` and `startSample === index * hop` |
| F3 | Adjacent frames: the last `windowSize - hop` samples of frame `i` equal the first `windowSize - hop` of frame `i+1` |
| F4 | Different splits give identical frame lists |
| F5 | Frames are independent copies: changing a returned frame changes no later frame |
| F6 | Buffered count never exceeds `windowSize` (exposed through a `buffered` read-only property) |

The default sizes are also tested with the concrete numbers in the requirement (15600 and 7800).

### Pipeline tests

Use a synthetic stereo signal split in Stereo frames of different lengths. For a stream of exactly 3 s at 48000 Hz the number of Mono frames is `floor((48000 - 15600)/7800) + 1 = 5`, since the resampler gives 48000 samples at 16000 Hz. The tests check this number, the `startSec` values (0, 0.4875, 0.975, 1.4625, 1.95), and the 1 kHz dominant frequency.

### Error mapping tests

A table of `{ name, expectedCode }` run through `toCaptureError`, with `DOMException` and plain objects with a `name`. Non-Error throwables (`undefined`, `null`, a string, a number, an object whose `name` getter throws) map to `unknown` without throwing. Messages are non-empty and contain none of the words "protect", "safe", "guarantee".

### Breaking tests on purpose (requirement 8.12)

By hand during task 7, not committed: break the resampler one way at a time (cutoff at 0.9 of Nyquist, off-by-one in the length rule, history dropped across chunk boundaries) and the framer (hop applied as `windowSize`, a frame off by one sample). Confirm that at least one unit test and one property test fail each time. Restore after each.

### Browser tests (`e2e/audio-capture.spec.ts`)

```ts
test.use({ launchOptions: { args: [
  '--use-fake-device-for-media-stream',
  '--use-fake-ui-for-media-stream',
] } });
```

`--use-fake-ui-for-media-stream` accepts the permission prompt, which is needed because Playwright's headless Chromium has no UI to click. Permission denial is tested with a stub instead (see below).

Harness page: `capture-harness.html` has buttons `Start microphone`, `Start clip`, `Stop`, a clip id field, and a `<pre id="status">` that shows the state as JSON, and a `<pre id="log">` with frame counts. `harness.ts` stores `window.__frames = { mono: [{ length, sampleRate, index, startSec, rms }], stereo: [{ leftLength, rightLength, sampleRate, startSample }] }`, only metadata, never samples. The harness keeps the last 200 entries so memory stays flat.

| Test | Steps and checks |
|---|---|
| Microphone path | init script wraps `getUserMedia` and stores its argument. Click start. Wait for state `listening`, at least 2 mono and 40 stereo frames. Check constraints (Req 9.5), shapes and spacing (Req 9.4). Click stop. Check the track is `ended` and the frame counter stops |
| Clip path | no `getUserMedia` call is recorded (stub counts calls). Start `doorbell-01`. Check shapes, the frame count within one, RMS above 0.001 on one frame, state `ended` |
| Shape parity | compare the key set and the lengths of both runs' first mono frame and first stereo frame |
| Errors | init script replaces `getUserMedia` with a function that rejects with a `DOMException` of each name. Check codes and message. Then start a clip and see `listening` |
| Network | `page.on('request')` collects URLs through the mic run and the clip run. Fail if any request has a different origin, or a path outside the allow list (page, `/src/`, `/@vite/`, `/node_modules/`, `/clips/manifest.json`, `/clips/*.wav`, favicon) |
| Keyboard | Tab reaches each harness button in order with a visible focus outline, and Enter or Space activates it |

Frame timing in the browser follows real time and the machine's load. The tests do not check wall-clock timing. They check the stream-time fields (`startSec`, `startSample`), which come from counting samples, and they wait with `expect.poll` and a generous timeout (10 s).

The clip test takes about as long as the clip (3.7 s plus start-up).

### What the tests cannot prove

- They cannot show that a real stereo microphone delivers distinct channels. The fake device does not.
- They cannot check true audio quality of the 7.9 kHz region on every device. They check the filter, and the filter is deterministic.
- They cannot detect browser differences outside Chromium. Firefox and Safari are not in the Playwright project, and the error path `unsupported` is covered by unit tests only.

## Decisions

- **Downmix, resample and frame on the main thread.** Keeps the code pure and testable, and the cost is small. Alternative: do it in the worklet, which avoids posting stereo blocks for the classifier. Rejected, because F5 needs the stereo blocks anyway, and worklet code is hard to unit test.
- **Polyphase windowed-sinc with exact integer phases.** Gives exact output length and bit-exact chunk invariance, which makes property tests simple. Alternatives: linear interpolation (aliasing, fails the stop-band requirement) and `OfflineAudioContext` (asynchronous, not pure, not streaming). A biquad or Butterworth IIR followed by decimation is cheaper, and it has phase distortion and a harder exact-length story, so it was not chosen.
- **Cutoff at 7.5 kHz, not 8 kHz.** A filter that passes up to 8 kHz cannot also remove energy just above it. The 7.5 kHz point matches the top of YAMNet's mel range. The cost is that a 7.9 kHz tone is attenuated.
- **Clip decoding by the browser at the context rate.** It reuses the browser's decoder and keeps one 16 kHz conversion path. Alternative: parse the WAV ourselves and push samples at the context rate. That would make the clip path testable in Node, but a clip played through the Web Audio graph exercises the same graph as the microphone, which is the point of the requirement.
- **Real-time clip playback.** Same graph, same timing behaviour as the microphone. Cost: a clip takes its own length to finish.
- **Silent output through a zero-gain node.** Keeps the graph pulled, with no sound.
- **`start` returns the state and does not reject for expected failures.** UI code is simpler, and the error is data it can render. A rejection is kept for programming errors.
- **Frame objects carry `startSec` on a shared timeline.** F5 can pick the Stereo frames that cover a Mono frame without any clock handling.
- **Missing block ends the capture with an error.** A silent shift in time would give wrong bearings. Failing loudly is safer for an aid that must not mislead.
- **Hand-written, no DSP library.** Required by the steering file.

## Error handling

- Expected failures (permission, device, clip, worklet) become an `error` state. `start` still resolves.
- Rate and option errors in the pure code throw `RangeError` (programming errors).
- Listener exceptions are caught and do not stop the stream.
- Every error path calls `release()`, so a failed start leaves no open microphone, no running context.
- Console output: error names only. No samples, no file contents, no device labels.

## Risks

- **Chromium's fake device may be mono, or deliver a beep pattern.** Mitigation: tests check shape and timing, not content, and accept 1 or 2 channels.
- **Autoplay policy blocks `AudioContext`.** Mitigation: `start` is called from a click, and `resume()` is awaited. If the context still reports `suspended` afterwards, the implementation retries `resume()` once and then reports the error code `unknown`. The e2e tests use a click, so they exercise the normal case. The Framer also exposes a read-only `buffered` count, which property F6 reads.
- **`?worker&url` may not give a worklet-ready file in this Vite version.** Mitigation: the fallback `new URL(...)` form noted above, found in task 6 and recorded.
- **The browser ignores a constraint** (for example echo cancellation stays on). Mitigation: `rawProcessing` reports it. This feature cannot force it.
- **Main-thread pressure drops blocks.** The Tap does not drop, and messages queue. If the main thread is blocked for long, blocks arrive late, but in order, and the stream time stays right because it comes from counting. Latency grows, and that is acceptable for an aid.
- **Filter spec mismatch.** The thresholds in the requirements are tests, so a mismatch shows up in task 3. The fix is a parameter change, not a redesign.
- **Table memory for odd rates.** Capped at 512 phases, about 400 KB.
