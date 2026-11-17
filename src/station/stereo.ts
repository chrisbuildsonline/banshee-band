import { STEREO_BLOCK, type StereoFrame } from '../audio';
import type { TrySide } from './types';

/**
 * Delay in samples of the far channel for `'left'` and `'right'`. At 16 kHz with 8 cm spacing the largest lag the
 * estimator allows is floor(0.08 / 343 * 16000) = 3, about 53.5 degrees, well outside the centre zone of `sideOf`.
 */
export const SIDE_DELAY_SAMPLES = 3;

/**
 * Peak of the independent dither added to each channel for `'centre'` (1e-4, -80 dBFS, the first value of R7.3;
 * it passed the measurement, so it was not raised). Without it the two channels are bit-identical, and the
 * estimator reports source `'loudness'` with confidence 0, which `sideOf` turns into `'unknown'`.
 */
export const DITHER_AMPLITUDE = 1e-4;

const SEED_LEFT = 0x9e3779b9;
const SEED_RIGHT = 0x85ebca6b;

/** `mono` plus a seeded LCG dither, uniform in [-DITHER_AMPLITUDE, DITHER_AMPLITUDE]. */
function dithered(mono: Float32Array, seed: number): Float32Array {
  const out = new Float32Array(mono.length);
  let s = seed;
  for (let i = 0; i < mono.length; i++) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    out[i] = mono[i] + ((s / 4294967296) * 2 - 1) * DITHER_AMPLITUDE;
  }
  return out;
}

/**
 * The stereo pair for a chosen side, built from a mono clip. `'left'`: the sound reaches the left microphone
 * first, so `left = [...mono, 0, 0, 0]` and `right = [0, 0, 0, ...mono]` (a delayed right channel gives a negative
 * bearing in `src/bearing`); `'right'` is swapped. `'centre'`: no delay, each channel with its own dither.
 * Returns new arrays, never changes `mono`, deterministic. Pure.
 */
export function buildStereo(mono: Float32Array, side: TrySide): { left: Float32Array; right: Float32Array } {
  if (side === 'centre') return { left: dithered(mono, SEED_LEFT), right: dithered(mono, SEED_RIGHT) };
  const n = mono.length === 0 ? 0 : mono.length + SIDE_DELAY_SAMPLES;
  const first = new Float32Array(n);
  const late = new Float32Array(n);
  first.set(mono);
  if (n > 0) late.set(mono, SIDE_DELAY_SAMPLES);
  return side === 'left' ? { left: first, right: late } : { left: late, right: first };
}

/**
 * The pair cut into frames of `block` sample frames (the last one shorter), with `startSample` 0, block, 2 * block,
 * ... and `startSec = startSample / sampleRate`. The frames are views of the pair. Pure.
 */
export function toStereoFrames(pair: { left: Float32Array; right: Float32Array }, sampleRate: number, block = STEREO_BLOCK): StereoFrame[] {
  const frames: StereoFrame[] = [];
  for (let start = 0; start < pair.left.length; start += block) {
    const end = Math.min(start + block, pair.left.length);
    frames.push({ left: pair.left.subarray(start, end), right: pair.right.subarray(start, end), sampleRate, startSample: start, startSec: start / sampleRate });
  }
  return frames;
}
