// Seeded synthetic test signals. Every source is a function of continuous time, so a delayed
// channel is the same function evaluated at t - lag: fractional delays need no interpolation.
import type { StereoFrame } from '../../../src/audio/types';
import { gaussian, mulberry32 } from './rng';

export { gaussian, mulberry32 } from './rng';

export interface Component {
  freq: number;
  amp: number;
  phase: number;
}

/** Sum of cosines; with `damping`, multiplied by e^{-(t-onset)/tau} from `onsetSec` on and 0 before. */
export interface Source {
  components: Component[];
  damping?: { onsetSec: number; tauSec: number };
}

export type SignalKind = 'white' | 'tones' | 'clap' | 'hum';

export const FRAME_LEN = 1024;
export const WINDOW_FRAMES = 8;
/** RMS of the source over the Window before noise is added (-40 dBFS). */
export const SOURCE_RMS = 0.01;
/** The clap starts at this sample of the Window: Frame 3 (0-based), 256 samples in. */
export const CLAP_ONSET_SAMPLE = 3 * FRAME_LEN + 256;
export const CLAP_TAU_SEC = 0.002;
/** Hum level over the source RMS. */
export const HUM_DB = 20;

/** Equal-amplitude cosines every 40 Hz from 40 Hz to 0.45·fs with seeded phases: flat, noise-like. */
export function whiteNoiseSource(sampleRate: number, seed: number): Source {
  const rng = mulberry32(seed);
  const components: Component[] = [];
  for (let f = 40; f <= 0.45 * sampleRate; f += 40) components.push({ freq: f, amp: 1, phase: 2 * Math.PI * rng() });
  return { components };
}

/** Three equal tones at 500, 1000 and 1500 Hz with seeded phases. */
export function tonesSource(seed: number): Source {
  const rng = mulberry32(seed);
  return { components: [500, 1000, 1500].map((freq) => ({ freq, amp: 1, phase: 2 * Math.PI * rng() })) };
}

/** Clap-like burst: 40 damped cosines evenly spaced from 500 Hz to 8 kHz, tau 2 ms, seeded phases. */
export function clapSource(sampleRate: number, seed: number): Source {
  const rng = mulberry32(seed);
  const components: Component[] = [];
  for (let m = 0; m < 40; m++) components.push({ freq: 500 + (m * 7500) / 39, amp: 1, phase: 2 * Math.PI * rng() });
  return { components, damping: { onsetSec: CLAP_ONSET_SAMPLE / sampleRate, tauSec: CLAP_TAU_SEC } };
}

/** Mains-like hum: 100 Hz and its next 3 harmonics with amplitudes 1, 1/2, 1/3, 1/4 and seeded phases. */
export function humSource(seed: number): Source {
  const rng = mulberry32(seed);
  return { components: [1, 2, 3, 4].map((h) => ({ freq: 100 * h, amp: 1 / h, phase: 2 * Math.PI * rng() })) };
}

/** Direct evaluation of a source at time t (seconds). The reference for `render`. */
export function evaluate(src: Source, t: number): number {
  let tt = t;
  let env = 1;
  if (src.damping) {
    tt = t - src.damping.onsetSec;
    if (tt < 0) return 0;
    env = Math.exp(-tt / src.damping.tauSec);
  }
  let sum = 0;
  for (const c of src.components) sum += c.amp * Math.cos(2 * Math.PI * c.freq * tt + c.phase);
  return env * sum;
}

const ANCHOR = 256;

/** Samples x(i/fs - delaySec) for i in [0, n). Fast phasor recurrence, re-anchored every 256 samples. */
export function render(src: Source, n: number, sampleRate: number, delaySec: number): Float64Array {
  const out = new Float64Array(n);
  const t0 = -delaySec - (src.damping ? src.damping.onsetSec : 0);
  for (const c of src.components) {
    const w = (2 * Math.PI * c.freq) / sampleRate;
    const cw = Math.cos(w);
    const sw = Math.sin(w);
    for (let start = 0; start < n; start += ANCHOR) {
      const ph = 2 * Math.PI * c.freq * (t0 + start / sampleRate) + c.phase;
      let re = c.amp * Math.cos(ph);
      let im = c.amp * Math.sin(ph);
      const end = Math.min(n, start + ANCHOR);
      for (let i = start; i < end; i++) {
        out[i] += re;
        const r = re * cw - im * sw;
        im = im * cw + re * sw;
        re = r;
      }
    }
  }
  if (src.damping) {
    const { tauSec } = src.damping;
    for (let i = 0; i < n; i++) {
      const tt = i / sampleRate + t0;
      out[i] = tt < 0 ? 0 : out[i] * Math.exp(-tt / tauSec);
    }
  }
  return out;
}

export function power(x: ArrayLike<number>): number {
  let s = 0;
  for (let i = 0; i < x.length; i++) s += x[i] * x[i];
  return x.length === 0 ? 0 : s / x.length;
}

/** Independent Gaussian noise of exactly the given power (rescaled after drawing). */
export function noise(n: number, targetPower: number, rng: () => number): Float64Array {
  const g = gaussian(rng);
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) out[i] = g();
  const k = Math.sqrt(targetPower / power(out));
  for (let i = 0; i < n; i++) out[i] *= k;
  return out;
}

/** Cuts two equal-length channels into StereoFrames of `frameLen` samples (Float32). */
export function toFrames(left: ArrayLike<number>, right: ArrayLike<number>, sampleRate: number, frameLen = FRAME_LEN): StereoFrame[] {
  const frames: StereoFrame[] = [];
  for (let start = 0; start < left.length; start += frameLen) {
    const len = Math.min(frameLen, left.length - start);
    const l = new Float32Array(len);
    const r = new Float32Array(len);
    for (let i = 0; i < len; i++) {
      l[i] = left[start + i];
      r[i] = right[start + i];
    }
    frames.push({ left: l, right: r, sampleRate, startSample: start, startSec: start / sampleRate });
  }
  return frames;
}

export interface StereoSpec {
  signal: SignalKind;
  sampleRate: number;
  /** Signal power over noise power per channel, dB. Infinity adds no noise. */
  snrDb: number;
  /** Delay of the left channel relative to the right, seconds. */
  lagSec: number;
  seed: number;
  frames?: number;
}

export interface Stereo {
  left: Float64Array;
  right: Float64Array;
  frames: StereoFrame[];
}

function sourceFor(kind: SignalKind, sampleRate: number, seed: number): Source {
  if (kind === 'white' || kind === 'hum') return whiteNoiseSource(sampleRate, seed);
  if (kind === 'tones') return tonesSource(seed);
  return clapSource(sampleRate, seed);
}

/**
 * Builds a Window: left = s(t - lag), right = s(t), the source scaled to SOURCE_RMS, plus independent
 * noise per channel at `snrDb` (signal power measured over the Window). 'hum' is a white-noise source
 * plus a hum identical in both channels, HUM_DB over the source; the SNR refers to the source.
 */
export function makeStereo(spec: StereoSpec): Stereo {
  const n = (spec.frames ?? WINDOW_FRAMES) * FRAME_LEN;
  const src = sourceFor(spec.signal, spec.sampleRate, spec.seed);
  const left = render(src, n, spec.sampleRate, spec.lagSec);
  const right = render(src, n, spec.sampleRate, 0);
  const k = SOURCE_RMS / Math.sqrt(power(right));
  for (let i = 0; i < n; i++) {
    left[i] *= k;
    right[i] *= k;
  }
  const rng = mulberry32(spec.seed ^ 0x9e3779b9);
  if (Number.isFinite(spec.snrDb)) {
    const nl = noise(n, power(left) / 10 ** (spec.snrDb / 10), rng);
    const nr = noise(n, power(right) / 10 ** (spec.snrDb / 10), rng);
    for (let i = 0; i < n; i++) {
      left[i] += nl[i];
      right[i] += nr[i];
    }
  }
  if (spec.signal === 'hum') {
    const hum = render(humSource(spec.seed + 1), n, spec.sampleRate, 0);
    const kh = (SOURCE_RMS * 10 ** (HUM_DB / 20)) / Math.sqrt(power(hum));
    for (let i = 0; i < n; i++) {
      left[i] += kh * hum[i];
      right[i] += kh * hum[i];
    }
  }
  return { left, right, frames: toFrames(left, right, spec.sampleRate) };
}
