// Polyphase windowed-sinc resampler. Pure, deterministic, no Web Audio or DOM.
import { MAX_IN_RATE, MAX_OUT_RATE, MIN_IN_RATE, MIN_OUT_RATE } from './constants';

export interface Resampler {
  /** Feeds input samples and returns every output sample that is now complete. */
  push(chunk: Float32Array): Float32Array;
  /** Ends the stream (missing future input counts as zeros), returns the rest and resets for reuse. */
  flush(): Float32Array;
}

/** Most phase rows kept in a table. Beyond this, rows are linearly interpolated. */
const MAX_ROWS = 512;
/** Largest finite Float32 value. Outputs saturate here so that finite input never gives Infinity. */
const F32_MAX = 3.4028234663852886e38;

/*
 * Filter design: Kaiser-windowed sinc, A = 70 dB target.
 * Downsampling: 6 dB point at 0.46875 * outRate (7500 Hz for 16 kHz) and a transition band of
 * 0.0625 * outRate (1000 Hz). Upsampling: 6 dB point at 0.45 * inRate, transition 0.1 * inRate.
 *
 * Measured with tests/audio/spectrum.ts on 1 s tones, output at 16 kHz, edges skipped,
 * relative to a 1 kHz tone of the same input amplitude (tests/audio/resampler.test.ts pins these):
 *   7.9 kHz at 48000 Hz: -39.1 dB      7.9 kHz at 44100 Hz: -39.1 dB      (limit 20 dB)
 *   8.1 kHz at 48000 Hz: -85.7 dB      8.1 kHz at 44100 Hz: -84.1 dB      (stop band start, limit 60 dB)
 *   9 kHz at 48000 Hz (folds to 7 kHz): -77.9 dB                          (limit 50 dB)
 *   12 kHz at 44100 Hz (folds to 4 kHz): -91.5 dB                         (limit 50 dB)
 *   Pass band ripple, 100 Hz to 6 kHz in 100 Hz steps: within 0.0013 dB at 48000 Hz, 0.0011 dB at 44100 Hz
 */
const ATTENUATION_DB = 70;

function checkRate(name: 'inRate' | 'outRate', rate: number, min: number, max: number): void {
  if (!Number.isInteger(rate) || rate < min || rate > max) {
    throw new RangeError(`${name} must be an integer from ${min} to ${max} Hz, got ${rate}`);
  }
}

function gcd(a: number, b: number): number {
  while (b !== 0) [a, b] = [b, a % b];
  return a;
}

/** Zeroth-order modified Bessel function of the first kind (power series). */
function besselI0(x: number): number {
  let sum = 1;
  let term = 1;
  const q = (x * x) / 4;
  for (let k = 1; k < 200; k++) {
    term *= q / (k * k);
    sum += term;
    if (term < sum * 1e-17) break;
  }
  return sum;
}

interface Design {
  /** Phase rows: row r is the kernel for fractional position r / rows. `rows + 1` rows are stored when interpolating. */
  table: Float64Array;
  taps: number;
  half: number;
  rows: number;
  interpolate: boolean;
}

function design(inRate: number, outRate: number, L: number): Design {
  const down = inRate > outRate;
  const fc = down ? 0.46875 * outRate : 0.45 * inRate;
  const df = down ? 0.0625 * outRate : 0.1 * inRate;
  const order = (ATTENUATION_DB - 7.95) / (2.285 * 2 * Math.PI * (df / inRate));
  const width = order / 2; // window half-width in input samples
  const half = Math.ceil(width);
  const taps = 2 * half + 2; // offsets j - half for j = 0 .. 2 * half + 1
  const beta = 0.1102 * (ATTENUATION_DB - 8.7);
  const i0Beta = besselI0(beta);
  const s = (2 * fc) / inRate;

  const interpolate = L > MAX_ROWS;
  const rows = interpolate ? MAX_ROWS : L;
  const stored = interpolate ? rows + 1 : rows;
  const table = new Float64Array(stored * taps);
  for (let r = 0; r < stored; r++) {
    const frac = r / rows;
    const base = r * taps;
    let sum = 0;
    for (let j = 0; j < taps; j++) {
      const t = j - half - frac;
      const u = t / width;
      if (u <= -1 || u >= 1) continue;
      const x = Math.PI * s * t;
      const sinc = x === 0 ? 1 : Math.sin(x) / x;
      const h = s * sinc * (besselI0(beta * Math.sqrt(1 - u * u)) / i0Beta);
      table[base + j] = h;
      sum += h;
    }
    for (let j = 0; j < taps; j++) table[base + j] /= sum; // DC gain exactly 1 per row
  }
  return { table, taps, half, rows, interpolate };
}

function passthrough(): Resampler {
  return { push: (chunk) => chunk.slice(), flush: () => new Float32Array(0) };
}

/**
 * Streaming resampler from `inRate` to `outRate`. Output sample k sits at input position k * M / L,
 * computed with integers, so there is no drift and the output does not depend on chunk sizes.
 */
export function createResampler(inRate: number, outRate: number): Resampler {
  checkRate('inRate', inRate, MIN_IN_RATE, MAX_IN_RATE);
  checkRate('outRate', outRate, MIN_OUT_RATE, MAX_OUT_RATE);
  if (inRate === outRate) return passthrough();

  const g = gcd(inRate, outRate);
  const L = outRate / g;
  const M = inRate / g;
  const { table, taps, half, rows, interpolate } = design(inRate, outRate, L);

  // buf[i] holds input sample (bufStart + i). Samples before 0 are zeros, kept in the buffer so that
  // every output sums the same values in the same order whatever the chunking.
  let buf = new Float32Array(4096 + 2 * taps);
  let bufStart = 0;
  let bufLen = 0;
  let inCount = 0;
  let k = 0;

  function reset(): void {
    buf.fill(0, 0, half);
    bufStart = -half;
    bufLen = half;
    inCount = 0;
    k = 0;
  }
  reset();

  function append(chunk: Float32Array | null, n: number): void {
    const need = bufLen + n;
    if (need > buf.length) {
      const grown = new Float32Array(Math.max(need, buf.length * 2));
      grown.set(buf.subarray(0, bufLen));
      buf = grown;
    }
    if (chunk) buf.set(chunk, bufLen);
    else buf.fill(0, bufLen, need);
    bufLen = need;
  }

  /** Emits outputs k .. kEnd - 1, then drops input that no later output needs. */
  function emit(kEnd: number): Float32Array {
    const count = Math.max(0, kEnd - k);
    const out = new Float32Array(count);
    for (let i = 0; i < count; i++, k++) {
      const pos = k * M;
      const n = Math.floor(pos / L);
      const p = pos - n * L;
      const at = n - half - bufStart;
      let acc: number;
      if (interpolate) {
        const scaled = p * rows;
        const r = Math.floor(scaled / L);
        const a = (scaled - r * L) / L;
        const b0 = r * taps;
        const b1 = b0 + taps;
        let acc0 = 0;
        let acc1 = 0;
        for (let j = 0; j < taps; j++) {
          const v = buf[at + j];
          acc0 += table[b0 + j] * v;
          acc1 += table[b1 + j] * v;
        }
        acc = acc0 + a * (acc1 - acc0);
      } else {
        const b = p * taps;
        acc = 0;
        for (let j = 0; j < taps; j++) acc += table[b + j] * buf[at + j];
      }
      out[i] = acc > F32_MAX ? F32_MAX : acc < -F32_MAX ? -F32_MAX : acc;
    }
    const keepFrom = Math.floor((k * M) / L) - half - bufStart;
    if (keepFrom > 0) {
      buf.copyWithin(0, keepFrom, bufLen);
      bufLen -= keepFrom;
      bufStart += keepFrom;
    }
    return out;
  }

  return {
    push(chunk) {
      append(chunk, chunk.length);
      inCount += chunk.length;
      // Output k needs input up to n + half + 1, where n = floor(k * M / L). The total never
      // exceeds floor(inCount * L / M), the length rule.
      return emit(Math.min(Math.ceil(((inCount - half - 1) * L) / M), Math.floor((inCount * L) / M)));
    },
    flush() {
      append(null, half + 2);
      const out = emit(Math.floor((inCount * L) / M));
      reset();
      return out;
    },
  };
}

/** One-shot resampling. Equal to pushing `input` into `createResampler` and flushing. */
export function resample(input: Float32Array, inRate: number, outRate: number): Float32Array {
  const r = createResampler(inRate, outRate);
  const head = r.push(input);
  const tail = r.flush();
  if (tail.length === 0) return head;
  const out = new Float32Array(head.length + tail.length);
  out.set(head);
  out.set(tail, head.length);
  return out;
}
