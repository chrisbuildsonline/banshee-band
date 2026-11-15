import { describe, expect, it } from 'vitest';
import type { StereoFrame } from '../../src/audio/types';
import { createBearingWindow, estimateBearing } from '../../src/bearing/estimate';
import { bearingToLagSec, resolveBearingConfig } from '../../src/bearing/geometry';
import type { BearingResult } from '../../src/bearing/types';
import { makeStereo, mulberry32, noise, toFrames } from './helpers/synth';

const cfg = resolveBearingConfig();
const FS = 48000;
const frame = (left: ArrayLike<number>, right: ArrayLike<number>, sampleRate = FS): StereoFrame => ({
  left: Float32Array.from(left),
  right: Float32Array.from(right),
  sampleRate,
  startSample: 0,
  startSec: 0,
});
const white = (bearing: number, seed = 1, snrDb = 30) => makeStereo({ signal: 'white', sampleRate: FS, snrDb, lagSec: bearingToLagSec(bearing, cfg), seed });

function expectValid(r: BearingResult) {
  expect(r.bearingDeg === null).toBe(r.source === 'none');
  for (const v of [r.bearingDeg, r.confidence, r.lagSec, r.ildDb, r.usedFrames, r.skippedFrames]) if (v !== null) expect(Number.isFinite(v)).toBe(true);
  expect(r.confidence).toBeGreaterThanOrEqual(0);
  expect(r.confidence).toBeLessThanOrEqual(1);
  if (r.bearingDeg !== null) expect(Math.abs(r.bearingDeg)).toBeLessThanOrEqual(90);
  if (r.source !== 'gcc-phat') expect(r.lagSec).toBeNull();
}

const NONE = { bearingDeg: null, source: 'none', confidence: 0, lagSec: null, ildDb: null };

describe('estimateBearing', () => {
  it('finds the bearing of a delayed white-noise source on both sides', () => {
    for (const b of [-50, 0, 30]) {
      const r = estimateBearing(white(b).frames);
      expectValid(r);
      expect(r.source).toBe('gcc-phat');
      expect(Math.abs(r.bearingDeg! - b)).toBeLessThan(1.5);
      expect(r.lagSec! * FS).toBeCloseTo((bearingToLagSec(b, cfg) * FS), 0);
      expect(r.usedFrames).toBe(8);
      expect(r.skippedFrames).toBe(0);
      expect(Math.abs(r.ildDb!)).toBeLessThan(0.5);
    }
  });

  it('returns none for an empty window, silence and one silent channel', () => {
    expect(estimateBearing([])).toEqual({ ...NONE, usedFrames: 0, skippedFrames: 0 });
    const zeros = new Float32Array(1024);
    expect(estimateBearing([frame(zeros, zeros), frame(zeros, zeros)])).toEqual({ ...NONE, usedFrames: 2, skippedFrames: 0 });
    const quiet = Float32Array.from(noise(1024, 1e-9, mulberry32(3)));
    expect(estimateBearing([frame(quiet, quiet.map((v) => -v))])).toMatchObject(NONE);
    const s = white(20);
    expect(estimateBearing(toFrames(s.left, new Float64Array(s.left.length), FS))).toMatchObject(NONE);
    expect(estimateBearing(toFrames(new Float64Array(s.right.length), s.right, FS))).toMatchObject(NONE);
  });

  it('treats identical channels (mono) as centre, loudness, confidence 0', () => {
    const s = white(40);
    const r = estimateBearing(toFrames(s.right, s.right, FS));
    expect(r).toMatchObject({ bearingDeg: 0, source: 'loudness', confidence: 0, lagSec: null });
    expect(r.ildDb).toBe(0);
  });

  it('falls back to loudness with the right sign for uncorrelated channels of different level', () => {
    const rng = mulberry32(8);
    const quietLeft = noise(8192, 1e-6, rng);
    const loudRight = noise(8192, 1e-4, rng);
    const r = estimateBearing(toFrames(quietLeft, loudRight, FS));
    expectValid(r);
    expect(r.source).toBe('loudness');
    expect(r.ildDb).toBeCloseTo(20, 6);
    expect(r.bearingDeg).toBe(90);
    expect(r.confidence).toBe(0.5);
    const mirrored = estimateBearing(toFrames(loudRight, quietLeft, FS));
    expect(mirrored.bearingDeg).toBe(-90);
  });

  it('skips and counts frames with NaN or Infinity, different lengths, empty channels and bad or changing rates', () => {
    const good = white(25).frames;
    const bad: StereoFrame[] = [];
    for (const v of [NaN, Infinity, -Infinity]) {
      const f = frame(good[0].left, good[0].right);
      f.left[100] = v;
      bad.push(f);
      const g = frame(good[1].left, good[1].right);
      g.right[1023] = v;
      bad.push(g);
    }
    bad.push(frame(new Float32Array(10), new Float32Array(11)));
    bad.push(frame(new Float32Array(0), new Float32Array(0)));
    for (const rate of [0, -48000, NaN, Infinity, 44100]) bad.push(frame(good[2].left, good[2].right, rate));
    const mixed = [...good.slice(0, 4), ...bad, ...good.slice(4)];
    const r = estimateBearing(mixed);
    expectValid(r);
    expect(r.skippedFrames).toBe(bad.length);
    expect(r.usedFrames).toBe(8);
    expect(r).toEqual({ ...estimateBearing(good), skippedFrames: bad.length });
    expect(estimateBearing(bad.slice(0, 6))).toEqual({ ...NONE, usedFrames: 0, skippedFrames: 6 });
  });

  it('skips huge samples (up to Number.MAX_VALUE) and keeps the result finite', () => {
    const big = new Float32Array(1024).fill(1e38);
    const r1 = estimateBearing([frame(big, big.map((v, i) => (i % 2 ? v : -v)))]);
    expectValid(r1);
    const huge: StereoFrame = { left: new Float64Array(1024).fill(Number.MAX_VALUE) as unknown as Float32Array, right: new Float64Array(1024).fill(-Number.MAX_VALUE) as unknown as Float32Array, sampleRate: FS, startSample: 0, startSec: 0 };
    const r2 = estimateBearing([huge, ...white(10).frames]);
    expectValid(r2);
    expect(r2.skippedFrames).toBe(1);
    const nearCap: StereoFrame = { ...huge, left: new Float64Array(1024).map((_, i) => 1e99 * Math.sin(i)) as unknown as Float32Array, right: new Float64Array(1024).map((_, i) => 1e99 * Math.sin(i + 3)) as unknown as Float32Array };
    const r3 = estimateBearing([nearCap]);
    expectValid(r3);
    expect(r3.usedFrames).toBe(1);
  });

  it('does not modify the frames', () => {
    const { frames } = white(-20);
    const copy = frames.map((f) => [Array.from(f.left), Array.from(f.right)]);
    estimateBearing(frames);
    frames.forEach((f, i) => {
      expect(Array.from(f.left)).toEqual(copy[i][0]);
      expect(Array.from(f.right)).toEqual(copy[i][1]);
    });
  });

  it('gives the same result for any cut into frames (1, 2, 1023, 1025, 5000 samples)', () => {
    const s = white(35, 4);
    const ref = estimateBearing(toFrames(s.left, s.right, FS));
    for (const len of [1, 2, 1023, 1025, 5000]) {
      const r = estimateBearing(toFrames(s.left, s.right, FS, len));
      expect(r.source, `frames of ${len}`).toBe('gcc-phat');
      expect(r.bearingDeg!, `frames of ${len}`).toBeCloseTo(ref.bearingDeg!, 9);
      expect(r.confidence).toBeCloseTo(ref.confidence, 9);
      expect(r.usedFrames).toBe(Math.ceil(8192 / len));
    }
  });

  it('a partial final chunk is used: 1500 samples still give the bearing', () => {
    const s = white(-30, 6, 40);
    const r = estimateBearing(toFrames(s.left.subarray(0, 1500), s.right.subarray(0, 1500), FS, 750));
    expect(r.source).toBe('gcc-phat');
    expect(Math.abs(r.bearingDeg! + 30)).toBeLessThan(3);
  });
});

describe('createBearingWindow', () => {
  it('streaming equals batch, result() is repeatable, reset() empties the window', () => {
    const a = white(15);
    const w = createBearingWindow();
    for (const f of a.frames) w.push(f);
    const first = w.result();
    expect(w.result()).toEqual(first);
    expect(first).toEqual(estimateBearing(a.frames));
    w.push(a.frames[0]);
    expect(w.result()).toEqual(estimateBearing([...a.frames, a.frames[0]]));
    w.reset();
    expect(w.result()).toEqual({ ...NONE, usedFrames: 0, skippedFrames: 0 });
    const b = makeStereo({ signal: 'white', sampleRate: 44100, snrDb: 30, lagSec: bearingToLagSec(-40, cfg), seed: 2 });
    for (const f of b.frames) w.push(f);
    expect(w.result()).toEqual(estimateBearing(b.frames));
  });

  it('takes a partial config and rejects a bad one at set-up', () => {
    expect(() => createBearingWindow({ micSpacingM: -1 })).toThrow(RangeError);
    const s = white(60);
    const r = estimateBearing(s.frames, { micSpacingM: 0.16 });
    // The same delay with twice the spacing is a smaller angle.
    expect(r.bearingDeg!).toBeCloseTo((Math.asin(Math.sin((60 * Math.PI) / 180) / 2) * 180) / Math.PI, 0);
    const strict = estimateBearing(s.frames, { minConfidence: 1 });
    expect(strict.source === 'gcc-phat' ? strict.confidence : 0).toBeLessThanOrEqual(1);
  });
});
