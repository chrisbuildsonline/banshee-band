import { describe, expect, it } from 'vitest';
import { createFramer } from '../../src/audio/framer';
import { createMonoPipeline } from '../../src/audio/pipeline';
import { resample } from '../../src/audio/resampler';
import type { MonoFrame } from '../../src/audio/types';
import { dominantFrequency, sine } from './spectrum';

/** Edge region skipped by the frequency measurement, in output samples (see resampler.test.ts). */
const SKIP = 64;

function noise(n: number, seed: number): Float32Array {
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    seed = (seed * 1103515245 + 12345) >>> 0;
    x[i] = seed / 0xffffffff - 0.5;
  }
  return x;
}

/** Feeds left/right in stereo frames of `block` samples, then flushes. */
function feed(rate: number, left: Float32Array, right: Float32Array, block: number, flush = true): MonoFrame[] {
  const p = createMonoPipeline(rate);
  const out: MonoFrame[] = [];
  for (let i = 0; i < left.length; i += block) {
    out.push(...p.push(left.subarray(i, i + block), right.subarray(i, i + block)));
  }
  if (flush) out.push(...p.flush());
  return out;
}

describe('createMonoPipeline', () => {
  it('gives the same frames for a mono source as resampling and framing that channel directly', () => {
    const x = noise(48000 * 2, 7);
    const frames = feed(48000, x, x, 1024);
    const expected = createFramer().push(resample(x, 48000, 16000));
    expect(frames.length).toBe(expected.length);
    frames.forEach((fr, i) => expect(fr.samples).toEqual(expected[i].samples));
  });

  it('downmixes as (l + r) / 2', () => {
    const l = noise(16000 * 2, 1);
    const r = noise(16000 * 2, 2);
    const [first] = feed(16000, l, r, 1024);
    for (let i = 0; i < first.samples.length; i++) {
      if (first.samples[i] !== Math.fround((l[i] + r[i]) / 2)) expect.fail(`sample ${i}`);
    }
  });

  it('gives the same frames for stereo frame lengths 128, 1024 and 4096', () => {
    const l = noise(44100 * 2, 3);
    const r = noise(44100 * 2, 4);
    const a = feed(44100, l, r, 128);
    expect(a.length).toBeGreaterThan(0);
    expect(feed(44100, l, r, 1024)).toEqual(a);
    expect(feed(44100, l, r, 4096)).toEqual(a);
    expect(feed(44100, l, r, 1)).toEqual(a);
  });

  it('gives 5 frames for 3 s at 48000 Hz, 0.4875 s apart', () => {
    const x = noise(48000 * 3, 5);
    for (const flush of [false, true]) {
      const frames = feed(48000, x, x, 1024, flush);
      expect(frames.map((f) => f.index)).toEqual([0, 1, 2, 3, 4]);
      expect(frames.map((f) => f.startSec)).toEqual([0, 0.4875, 0.975, 1.4625, 1.95]);
      for (const f of frames) {
        expect(f.sampleRate).toBe(16000);
        expect(f.samples).toHaveLength(15600);
      }
    }
  });

  it('keeps a 1 kHz stereo sine at 48000 Hz at 1 kHz', () => {
    const x = sine(1000, 48000, 2);
    const frames = feed(48000, x, x.slice(), 1024);
    expect(frames.length).toBe(3);
    for (const f of frames) {
      const bin = 16000 / (f.samples.length - 2 * SKIP);
      expect(Math.abs(dominantFrequency(f.samples, 16000, SKIP).freq - 1000)).toBeLessThanOrEqual(bin);
    }
  });

  it('at a context rate of 16000 skips filtering and uses the downmix as is', () => {
    const x = noise(16000, 9);
    const [first] = feed(16000, x, x, 333);
    expect(first.samples).toEqual(x.subarray(0, 15600));
  });

  it('gives the first frame within one stereo frame after 0.975 s of audio has been produced', () => {
    // Producing output sample k needs the filter's half-length plus one of input past it:
    // 105 input samples at 48000 Hz, 96 at 44100, 23 at 8000, none at 16000. 128 bounds them all.
    const LOOKAHEAD = 128;
    for (const rate of [48000, 44100, 16000, 8000]) {
      const p = createMonoPipeline(rate);
      const block = 1024;
      const needed = Math.ceil((15600 * rate) / 16000);
      let pushed = 0;
      let first: MonoFrame[] = [];
      while (first.length === 0) {
        first = p.push(new Float32Array(block), new Float32Array(block));
        pushed += block;
      }
      expect(pushed, `rate ${rate}`).toBeGreaterThanOrEqual(needed);
      expect(pushed, `rate ${rate}`).toBeLessThanOrEqual(needed + LOOKAHEAD + block);
    }
  });

  it('flush emits the frames completed by the tail and keeps the length rule', () => {
    for (const [rate, n] of [[44100, 44100 * 2 + 500], [48000, 48000 * 2 - 7], [8000, 8000 * 3 + 1]] as const) {
      const x = noise(n, 11);
      const out = Math.floor((n * 16000) / rate);
      const expected = out < 15600 ? 0 : Math.floor((out - 15600) / 7800) + 1;
      expect(feed(rate, x, x, 1024).length, `rate ${rate}`).toBe(expected);
    }
  });

  it('reset restarts the index and the stream time', () => {
    const p = createMonoPipeline(48000);
    const x = noise(48000, 13);
    p.push(x, x);
    p.reset();
    const frames = p.push(x, x);
    expect(frames[0].index).toBe(0);
    expect(frames[0].startSec).toBe(0);
    expect(frames).toEqual(feed(48000, x, x, 48000, false));
  });

  it('does not change the stereo arrays it is given', () => {
    const l = noise(20000, 1);
    const r = noise(20000, 2);
    const lc = l.slice();
    const rc = r.slice();
    feed(44100, l, r, 4096);
    expect(l).toEqual(lc);
    expect(r).toEqual(rc);
  });

  it('rejects a context rate the resampler cannot take', () => {
    expect(() => createMonoPipeline(0)).toThrow(RangeError);
    expect(() => createMonoPipeline(44100.5)).toThrow(RangeError);
  });

  it('rejects left and right of different lengths', () => {
    const p = createMonoPipeline(48000);
    expect(() => p.push(new Float32Array(4), new Float32Array(3))).toThrow(RangeError);
  });
});
