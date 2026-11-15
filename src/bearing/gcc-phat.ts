import { CHUNK, Q_HIGH, Q_LOW } from './constants';
import { createFftPlan, fft, ifft, type FftPlan } from './fft';

/** FFT plan and scratch arrays for one NFFT-point chunk transform, allocated once and reused. */
export interface PhatWorkspace {
  /** Samples per full chunk; the FFT size is twice this. */
  readonly chunk: number;
  readonly plan: FftPlan;
  /** Hann window for a full chunk; shorter chunks compute theirs on the fly. */
  readonly hann: Float64Array;
  readonly zRe: Float64Array;
  readonly zIm: Float64Array;
  readonly gRe: Float64Array;
  readonly gIm: Float64Array;
  readonly gMag: Float64Array;
}

/** The integer-lag Peak of a correlation and its refinement. */
export interface CorrelationPeak {
  /** Refined lag in samples (left delayed is positive), clamped to ±`limitSamples`. */
  lagSamples: number;
  /** Correlation value at the integer Peak. */
  peak: number;
  /** Index of the integer Peak in the correlation array (lag modulo NFFT). */
  peakIndex: number;
}

/** Hann window without zero end points, so every sample of a chunk of any length >= 1 counts. */
function hannAt(i: number, len: number): number {
  return 0.5 - 0.5 * Math.cos((2 * Math.PI * (i + 0.5)) / len);
}

/** Allocates the FFT plan (2 · chunk points) and scratch arrays. `chunk` is a power of two. */
export function createPhatWorkspace(chunk = CHUNK): PhatWorkspace {
  const n = 2 * chunk;
  const hann = new Float64Array(chunk);
  for (let i = 0; i < chunk; i++) hann[i] = hannAt(i, chunk);
  return {
    chunk,
    plan: createFftPlan(n),
    hann,
    zRe: new Float64Array(n),
    zIm: new Float64Array(n),
    gRe: new Float64Array(n),
    gIm: new Float64Array(n),
    gMag: new Float64Array(n),
  };
}

/** Offset of a parabola's vertex through (-1, ym), (0, y0), (1, yp), limited to ±0.5; 0 when not a proper maximum. */
export function parabolicOffset(ym: number, y0: number, yp: number): number {
  const denom = ym - 2 * y0 + yp;
  if (!(denom < -1e-12)) return 0;
  const off = (0.5 * (ym - yp)) / denom;
  if (!Number.isFinite(off)) return 0;
  return off > 0.5 ? 0.5 : off < -0.5 ? -0.5 : off;
}

/**
 * Adds one chunk's PHAT-weighted cross-spectrum W = G / (|G| + regularization · max|G|), times the
 * chunk energy sqrt(E_L · E_R) of the windowed samples, to `accRe`/`accIm`. G = L · conj(R) of the
 * Hann-windowed, zero-padded chunk, so the correlation peaks at +lag when the left channel is delayed.
 * `len` (1..chunk) samples are read from each channel.
 * Returns false and adds nothing when the cross-spectrum is all zero. Does not modify the inputs.
 */
export function phatSpectrum(
  ws: PhatWorkspace,
  left: ArrayLike<number>,
  right: ArrayLike<number>,
  len: number,
  regularization: number,
  accRe: Float64Array,
  accIm: Float64Array,
): boolean {
  const { plan, zRe, zIm, gRe, gIm, gMag } = ws;
  const n = plan.n;
  const mask = n - 1;
  // Pack both real channels into one complex FFT: Z = L + jR.
  let energyL = 0;
  let energyR = 0;
  for (let i = 0; i < len; i++) {
    const w = len === ws.chunk ? ws.hann[i] : hannAt(i, len);
    const l = w * left[i];
    const r = w * right[i];
    zRe[i] = l;
    zIm[i] = r;
    energyL += l * l;
    energyR += r * r;
  }
  zRe.fill(0, len);
  zIm.fill(0, len);
  fft(plan, zRe, zIm);
  let maxBin = 0;
  for (let k = 0; k < n; k++) {
    const j = (n - k) & mask;
    // L[k] = (Z[k] + conj(Z[n-k])) / 2, R[k] = (Z[k] - conj(Z[n-k])) / 2j.
    const lr = 0.5 * (zRe[k] + zRe[j]);
    const li = 0.5 * (zIm[k] - zIm[j]);
    const rr = 0.5 * (zIm[k] + zIm[j]);
    const ri = 0.5 * (zRe[j] - zRe[k]);
    const re = lr * rr + li * ri;
    const im = li * rr - lr * ri;
    gRe[k] = re;
    gIm[k] = im;
    const mag = Math.sqrt(re * re + im * im);
    gMag[k] = mag;
    if (mag > maxBin) maxBin = mag;
  }
  if (!(maxBin > 0) || !Number.isFinite(maxBin)) return false;
  const floor = regularization * maxBin;
  // Chunk weight: a chunk that holds the sound counts more than the noise-only chunks around it.
  const energy = Math.sqrt(energyL * energyR);
  for (let k = 0; k < n; k++) {
    const w = 1 / (gMag[k] + floor);
    accRe[k] += gRe[k] * w * energy;
    accIm[k] += gIm[k] * w * energy;
  }
  return true;
}

/**
 * Confidence from Peak sharpness: q = peak / sidelobeRms, where sidelobeRms is the RMS of `corr` over
 * every lag except peakIndex ± 2, mapped to clamp01((q - Q_LOW) / (Q_HIGH - Q_LOW)). 0 when the peak
 * is not positive or the sidelobe RMS is 0 or not finite.
 */
export function peakConfidence(corr: Float64Array, peakIndex: number, peak: number): number {
  if (!(peak > 0) || !Number.isFinite(peak)) return 0;
  const n = corr.length;
  let sum = 0;
  let count = 0;
  for (let i = 0; i < n; i++) {
    const d = Math.abs(i - peakIndex);
    if (Math.min(d, n - d) <= 2) continue;
    sum += corr[i] * corr[i];
    count++;
  }
  const sidelobeRms = count > 0 ? Math.sqrt(sum / count) : 0;
  if (!(sidelobeRms > 0) || !Number.isFinite(sidelobeRms)) return 0;
  const c = (peak / sidelobeRms - Q_LOW) / (Q_HIGH - Q_LOW);
  return c > 1 ? 1 : c > 0 ? c : 0;
}

/**
 * Inverse-transforms an accumulated spectrum in place (`re` then holds the correlation) and finds the
 * Peak at integer lags in ±maxLag (at most NFFT/2 - 2), refined by `parabolicOffset` through its two
 * neighbours and clamped to ±`limitSamples`.
 */
export function correlationPeak(
  ws: PhatWorkspace,
  re: Float64Array,
  im: Float64Array,
  maxLag: number,
  limitSamples: number,
): CorrelationPeak {
  const n = ws.plan.n;
  const mask = n - 1;
  ifft(ws.plan, re, im);
  const m = Math.min(maxLag, n / 2 - 2);
  let peakLag = -m;
  let peak = re[(n - m) & mask];
  for (let lag = -m + 1; lag <= m; lag++) {
    const v = re[(lag + n) & mask];
    if (v > peak) {
      peak = v;
      peakLag = lag;
    }
  }
  const peakIndex = (peakLag + n) & mask;
  const offset = parabolicOffset(re[(peakIndex - 1) & mask], peak, re[(peakIndex + 1) & mask]);
  const refined = peakLag + offset;
  const lagSamples = refined > limitSamples ? limitSamples : refined < -limitSamples ? -limitSamples : refined;
  return { lagSamples, peak, peakIndex };
}
