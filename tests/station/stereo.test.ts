import { describe, expect, it } from 'vitest';
import { estimateBearing } from '../../src/bearing';
import { buildStereo, DITHER_AMPLITUDE, SIDE_DELAY_SAMPLES, toStereoFrames } from '../../src/station/stereo';

const MONO = Float32Array.of(1, 2, 3, 4);
const arr = (x: Float32Array) => Array.from(x);

/** 1 s of seeded white noise at 16 kHz, uniform in [-0.25, 0.25]. */
function whiteNoise(seed = 12345, n = 16000): Float32Array {
  let s = seed >>> 0;
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    out[i] = (s / 4294967296 - 0.5) * 0.5;
  }
  return out;
}

describe('buildStereo (R7.1 to R7.4)', () => {
  it('SIDE_DELAY_SAMPLES is 3', () => {
    expect(SIDE_DELAY_SAMPLES).toBe(3);
  });

  it('left: the right channel is delayed by 3 samples', () => {
    const { left, right } = buildStereo(MONO, 'left');
    expect(arr(left)).toEqual([1, 2, 3, 4, 0, 0, 0]);
    expect(arr(right)).toEqual([0, 0, 0, 1, 2, 3, 4]);
  });

  it('right: the left channel is delayed by 3 samples', () => {
    const { left, right } = buildStereo(MONO, 'right');
    expect(arr(left)).toEqual([0, 0, 0, 1, 2, 3, 4]);
    expect(arr(right)).toEqual([1, 2, 3, 4, 0, 0, 0]);
  });

  it('centre: no delay, a small dither that differs per channel', () => {
    const { left, right } = buildStereo(MONO, 'centre');
    expect(left.length).toBe(4);
    expect(right.length).toBe(4);
    for (let i = 0; i < 4; i++) {
      expect(Math.abs(left[i] - MONO[i])).toBeLessThanOrEqual(DITHER_AMPLITUDE + 1e-6);
      expect(Math.abs(right[i] - MONO[i])).toBeLessThanOrEqual(DITHER_AMPLITUDE + 1e-6);
    }
    expect(arr(left)).not.toEqual(arr(right));
  });

  it('the dither stays within DITHER_AMPLITUDE and is not constant', () => {
    const { left, right } = buildStereo(new Float32Array(10000), 'centre');
    for (const ch of [left, right]) {
      expect(Math.max(...ch.map(Math.abs))).toBeLessThanOrEqual(DITHER_AMPLITUDE);
      expect(Math.max(...ch)).toBeGreaterThan(DITHER_AMPLITUDE / 2);
      expect(Math.min(...ch)).toBeLessThan(-DITHER_AMPLITUDE / 2);
    }
  });

  it('is deterministic, returns new arrays and does not change the input', () => {
    for (const side of ['left', 'centre', 'right'] as const) {
      const mono = MONO.slice();
      const a = buildStereo(mono, side);
      const b = buildStereo(mono, side);
      expect(arr(a.left)).toEqual(arr(b.left));
      expect(arr(a.right)).toEqual(arr(b.right));
      expect(a.left).not.toBe(mono);
      expect(a.right).not.toBe(mono);
      expect(a.left.length).toBe(a.right.length);
      expect(arr(mono)).toEqual([1, 2, 3, 4]);
    }
  });

  it('an empty clip gives two empty arrays for every side', () => {
    for (const side of ['left', 'centre', 'right'] as const) {
      const { left, right } = buildStereo(new Float32Array(0), side);
      expect([left.length, right.length]).toEqual([0, 0]);
    }
  });
});

describe('toStereoFrames (R7.5)', () => {
  it('2500 samples at 16000 Hz give frames of 1024, 1024 and 452', () => {
    const pair = { left: new Float32Array(2500).fill(0.1), right: new Float32Array(2500).fill(0.2) };
    const frames = toStereoFrames(pair, 16000);
    expect(frames.map((f) => f.left.length)).toEqual([1024, 1024, 452]);
    expect(frames.map((f) => f.right.length)).toEqual([1024, 1024, 452]);
    expect(frames.map((f) => f.startSample)).toEqual([0, 1024, 2048]);
    expect(frames.map((f) => f.startSec)).toEqual([0, 0.064, 0.128]);
    expect(frames.every((f) => f.sampleRate === 16000)).toBe(true);
    expect(frames[2].left[0]).toBe(Math.fround(0.1));
    expect(frames[2].right[0]).toBe(Math.fround(0.2));
  });

  it('honours a block size and gives no frame for an empty pair', () => {
    const pair = { left: new Float32Array(10), right: new Float32Array(10) };
    expect(toStereoFrames(pair, 16000, 4).map((f) => f.left.length)).toEqual([4, 4, 2]);
    expect(toStereoFrames({ left: new Float32Array(0), right: new Float32Array(0) }, 16000)).toEqual([]);
  });
});

describe('the real estimator on seeded white noise (R7.2, R7.3)', () => {
  const noise = whiteNoise();
  const bearingOf = (side: 'left' | 'centre' | 'right') => estimateBearing(toStereoFrames(buildStereo(noise, side), 16000));

  it('left gives a bearing between -60 and -47', () => {
    const b = bearingOf('left');
    expect(b.source).toBe('gcc-phat');
    expect(b.confidence).toBeGreaterThanOrEqual(0.8);
    expect(b.bearingDeg).toBeGreaterThanOrEqual(-60);
    expect(b.bearingDeg).toBeLessThanOrEqual(-47);
  });

  it('right gives a bearing between 47 and 60', () => {
    const b = bearingOf('right');
    expect(b.source).toBe('gcc-phat');
    expect(b.confidence).toBeGreaterThanOrEqual(0.8);
    expect(b.bearingDeg).toBeGreaterThanOrEqual(47);
    expect(b.bearingDeg).toBeLessThanOrEqual(60);
  });

  it('centre gives a bearing between -15 and 15', () => {
    const b = bearingOf('centre');
    expect(b.source).toBe('gcc-phat');
    expect(b.confidence).toBeGreaterThanOrEqual(0.8);
    expect(b.bearingDeg).toBeGreaterThanOrEqual(-15);
    expect(b.bearingDeg).toBeLessThanOrEqual(15);
  });
});
