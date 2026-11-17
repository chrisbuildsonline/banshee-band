import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { StereoFrame } from '../../src/audio/types';
import { estimateBearing } from '../../src/bearing';
import { MIN_CONFIDENCE, SILENCE_RMS, ILD_DEAD_ZONE_DB } from '../../src/bearing/constants';
import { bearingToLagSec, resolveBearingConfig } from '../../src/bearing/geometry';
import type { BearingResult } from '../../src/bearing/types';
import { FRAME_LEN, makeStereo, mulberry32, toFrames, type SignalKind } from './helpers/synth';

/** Fixed fast-check seed and run count (R10.1). */
const SEED = 20261115;
const RUNS = 100;
const params = { seed: SEED, numRuns: RUNS };
const cfg = resolveBearingConfig();

const kinds: SignalKind[] = ['white', 'tones', 'clap', 'hum'];
const rates = fc.constantFrom(48000, 44100);
const seeds = fc.integer({ min: 0, max: 0x7fffffff });

/** A seeded Window of the synth (8 Frames of 1024). */
function window(signal: SignalKind, sampleRate: number, bearing: number, snrDb: number, seed: number): StereoFrame[] {
  return makeStereo({ signal, sampleRate, snrDb, lagSec: bearingToLagSec(bearing, cfg), seed }).frames;
}

function mapFrames(frames: StereoFrame[], f: (x: number) => number): StereoFrame[] {
  return frames.map((fr) => ({ ...fr, left: fr.left.map(f), right: fr.right.map(f) }));
}

/** R7.3 and R7.7: null iff 'none', finite numbers only, bearing and confidence in range. */
function expectWellFormed(r: BearingResult, frameCount: number): void {
  expect(r.bearingDeg === null).toBe(r.source === 'none');
  for (const v of [r.bearingDeg, r.lagSec, r.ildDb]) if (v !== null) expect(Number.isFinite(v)).toBe(true);
  if (r.bearingDeg !== null) {
    expect(r.bearingDeg).toBeGreaterThanOrEqual(-90);
    expect(r.bearingDeg).toBeLessThanOrEqual(90);
  }
  expect(r.confidence).toBeGreaterThanOrEqual(0);
  expect(r.confidence).toBeLessThanOrEqual(1);
  expect(r.usedFrames + r.skippedFrames).toBe(frameCount);
  if (r.source === 'gcc-phat') expect(r.confidence).toBeGreaterThanOrEqual(MIN_CONFIDENCE);
  else expect(r.lagSec).toBeNull();
}

const LENGTHS = [0, 1, 2, 1023, 1024, 1025, 5000];
/** Sample magnitudes: zero, subnormal, ordinary, large, huge (up to Number.MAX_VALUE). */
const magnitude = fc.constantFrom(0, 5e-324, 1e-40, 1e-6, 1e-3, 0.5, 1, 3e38, 1e99, 1e100, 1e101, 1e200, Number.MAX_VALUE);

/** One finite channel of a given length: zeros, a constant, seeded noise or an explicit short array. */
const channel = (len: number): fc.Arbitrary<Float64Array> =>
  fc.oneof(
    fc.constant(new Float64Array(len)),
    fc.tuple(magnitude, fc.boolean()).map(([a, neg]) => new Float64Array(len).fill(neg ? -a : a)),
    fc.tuple(magnitude, seeds).map(([a, s]) => {
      const rng = mulberry32(s);
      return Float64Array.from({ length: len }, () => a * (2 * rng() - 1));
    }),
    fc.array(fc.double({ noNaN: true, noDefaultInfinity: true }), { minLength: len, maxLength: len }).map((x) => Float64Array.from(x)),
  );

const sampleRate = fc.oneof(
  fc.constantFrom(48000, 44100, 16000, 8000, 1, 0, -48000, NaN, Infinity, -Infinity, 1e-300, 1e300),
  fc.double(),
);

/** Stores a channel as Float32Array, or keeps the doubles (cast) so magnitudes beyond float32 reach the module. */
function asChannel(x: Float64Array, wide: boolean): Float32Array {
  return wide ? (x as unknown as Float32Array) : Float32Array.from(x);
}

/** A list of arbitrary finite Frames: random lengths (a list including the edge lengths) and sample rates. */
const finiteFrames = fc.array(
  fc
    .tuple(fc.oneof(fc.constantFrom(...LENGTHS), fc.integer({ min: 0, max: 64 })), fc.boolean(), sampleRate)
    .chain(([len, wide, rate]) =>
      fc.tuple(channel(len), fc.oneof(channel(len), channel(len + 1)), fc.boolean()).map(([l, r, same]) => {
        const right = same ? l : r;
        return { left: asChannel(l, wide), right: asChannel(right, wide), sampleRate: rate, startSample: 0, startSec: 0 } as StereoFrame;
      }),
    ),
  { maxLength: 4 },
);

// Fixed seed, so a failure here under a loaded full suite is the 5 s default timeout, not the property.
describe('bearing properties (R10)', { timeout: 60_000 }, () => {
  it('the gain property keeps the quietest Window above silenceRms', () => {
    expect(0.1 * 0.01).toBeGreaterThan(SILENCE_RMS);
  });

  it('R10.2: random bearing in [-80, 80], SNR in [10, 40] dB, white noise: error at most 4°', () => {
    fc.assert(
      fc.property(fc.double({ min: -80, max: 80, noNaN: true }), fc.double({ min: 10, max: 40, noNaN: true }), rates, seeds, (b, snr, fs, seed) => {
        const r = estimateBearing(window('white', fs, b, snr, seed));
        expect(r.source).toBe('gcc-phat');
        expect(Math.abs(r.bearingDeg! - b)).toBeLessThanOrEqual(4);
      }),
      params,
    );
  });

  it('R10.3: swapping left and right negates the bearing and keeps source and confidence', () => {
    fc.assert(
      fc.property(fc.constantFrom(...kinds), fc.double({ min: -85, max: 85, noNaN: true }), fc.constantFrom(0, 10, 20), rates, seeds, (k, b, snr, fs, seed) => {
        const frames = window(k, fs, b, snr, seed);
        const a = estimateBearing(frames);
        const m = estimateBearing(frames.map((f) => ({ ...f, left: f.right, right: f.left })));
        expect(m.source).toBe(a.source);
        expect(Math.abs(m.confidence - a.confidence)).toBeLessThanOrEqual(0.05);
        expect(Math.abs(m.bearingDeg! + a.bearingDeg!)).toBeLessThanOrEqual(0.5);
      }),
      params,
    );
  });

  it('R10.4: a common gain in [0.01, 10] changes the bearing by at most 0.5°', () => {
    fc.assert(
      fc.property(fc.constantFrom(...kinds), fc.double({ min: -85, max: 85, noNaN: true }), fc.double({ min: 0.01, max: 10, noNaN: true }), rates, seeds, (k, b, g, fs, seed) => {
        // Source RMS 0.1, so the quietest gain (0.01) leaves 1e-3, above silenceRms.
        const frames = mapFrames(window(k, fs, b, 20, seed), (x) => 10 * x);
        const a = estimateBearing(frames);
        const s = estimateBearing(mapFrames(frames, (x) => g * x));
        expect(s.source).toBe(a.source);
        expect(Math.abs(s.bearingDeg! - a.bearingDeg!)).toBeLessThanOrEqual(0.5);
      }),
      params,
    );
  });

  it('R10.5: leading zero Frames do not change the bearing by more than 0.5°', () => {
    fc.assert(
      fc.property(fc.constantFrom(...kinds), fc.double({ min: -85, max: 85, noNaN: true }), fc.integer({ min: 1, max: 6 }), rates, seeds, (k, b, zeros, fs, seed) => {
        const frames = window(k, fs, b, 20, seed);
        const zero = Array.from({ length: zeros }, () => ({ ...frames[0], left: new Float32Array(FRAME_LEN), right: new Float32Array(FRAME_LEN) }));
        const a = estimateBearing(frames);
        const s = estimateBearing([...zero, ...frames]);
        expect(s.source).toBe(a.source);
        expect(Math.abs(s.bearingDeg! - a.bearingDeg!)).toBeLessThanOrEqual(0.5);
      }),
      params,
    );
  });

  it('R10.6: arbitrary finite input and sample rates never throw and give a well-formed Result', () => {
    fc.assert(
      fc.property(finiteFrames, (frames) => {
        expectWellFormed(estimateBearing(frames), frames.length);
      }),
      params,
    );
  });

  it('R10.7: NaN and ±Infinity at random positions are skipped and counted, never reach the Result', () => {
    const bad = fc.constantFrom(NaN, Infinity, -Infinity);
    const hit = fc.record({ frame: fc.nat(7), index: fc.nat(FRAME_LEN - 1), right: fc.boolean(), value: bad });
    fc.assert(
      fc.property(fc.constantFrom(...kinds), fc.double({ min: -85, max: 85, noNaN: true }), rates, seeds, fc.array(hit, { minLength: 1, maxLength: 12 }), (k, b, fs, seed, hits) => {
        const frames = window(k, fs, b, 20, seed).map((f) => ({ ...f, left: f.left.slice(), right: f.right.slice() }));
        for (const h of hits) (h.right ? frames[h.frame].right : frames[h.frame].left)[h.index] = h.value;
        const r = estimateBearing(frames);
        expectWellFormed(r, frames.length);
        expect(r.skippedFrames).toBe(new Set(hits.map((h) => h.frame)).size);
      }),
      params,
    );
  });

  it("R10.8: the same signal in both channels gives bearing 0 with 'loudness', or 'none' when Silent", () => {
    fc.assert(
      fc.property(fc.oneof(fc.constantFrom(...LENGTHS), fc.integer({ min: 1, max: 64 })).chain((len) => channel(len)), fc.integer({ min: 1, max: 4 }), (x, n) => {
        const ch = Float32Array.from(x);
        const frames = Array.from({ length: n }, () => ({ left: ch, right: ch.slice(), sampleRate: 48000, startSample: 0, startSec: 0 }));
        const r = estimateBearing(frames);
        expectWellFormed(r, n);
        if (r.source !== 'none') {
          expect(r.source).toBe('loudness');
          expect(r.bearingDeg).toBe(0);
          expect(r.confidence).toBe(0);
        }
      }),
      params,
    );
  });

  it("R10.9: a signal on one channel and zeros on the other gives 'none'", () => {
    fc.assert(
      fc.property(fc.constantFrom(...kinds), fc.double({ min: -85, max: 85, noNaN: true }), fc.double({ min: 0, max: 40, noNaN: true }), rates, seeds, fc.boolean(), (k, b, snr, fs, seed, onRight) => {
        const frames = window(k, fs, b, snr, seed).map((f) => {
          const zero = new Float32Array(f.left.length);
          return onRight ? { ...f, left: zero } : { ...f, right: zero };
        });
        const r = estimateBearing(frames);
        expectWellFormed(r, frames.length);
        expect(r.source).toBe('none');
      }),
      params,
    );
  });

  it("R10.10: confidence in [0, 1]; a 'loudness' bearing has the sign of the ILD and |bearing| <= 90", () => {
    // Independent noise on the two channels at different levels (no common source), plus an optional
    // common source, so both 'loudness' and 'gcc-phat' results occur.
    fc.assert(
      fc.property(seeds, fc.double({ min: -30, max: 30, noNaN: true }), fc.double({ min: -85, max: 85, noNaN: true }), fc.boolean(), rates, (seed, levelDb, b, withSource, fs) => {
        const n = 8 * FRAME_LEN;
        const rng = mulberry32(seed);
        const kR = 0.01 * 10 ** (levelDb / 20);
        const src = withSource ? makeStereo({ signal: 'white', sampleRate: fs, snrDb: Infinity, lagSec: bearingToLagSec(b, cfg), seed }) : null;
        const left = Float64Array.from({ length: n }, (_, i) => 0.01 * (2 * rng() - 1) + (src ? 0.3 * src.left[i] : 0));
        const right = Float64Array.from({ length: n }, (_, i) => kR * (2 * rng() - 1) + (src ? 0.3 * src.right[i] : 0));
        const r = estimateBearing(toFrames(left, right, fs));
        expectWellFormed(r, 8);
        if (r.source === 'loudness') {
          expect(r.ildDb).not.toBeNull();
          expect(Math.abs(r.bearingDeg!)).toBeLessThanOrEqual(90);
          if (Math.abs(r.ildDb!) > ILD_DEAD_ZONE_DB) expect(Math.sign(r.bearingDeg!)).toBe(Math.sign(r.ildDb!));
          else expect(r.bearingDeg).toBe(0);
        }
      }),
      params,
    );
  });
});

describe('frame cutting and order (R8.5)', () => {
  it('cutting the Window into Frames of any length up to the chunk size does not change the bearing by more than 0.5°', () => {
    fc.assert(
      fc.property(fc.constantFrom(...kinds), fc.double({ min: -85, max: 85, noNaN: true }), rates, seeds, fc.integer({ min: 1, max: FRAME_LEN }), (k, b, fs, seed, len) => {
        const { left, right, frames } = makeStereo({ signal: k, sampleRate: fs, snrDb: 20, lagSec: bearingToLagSec(b, cfg), seed });
        const a = estimateBearing(frames);
        const s = estimateBearing(toFrames(left, right, fs, len));
        expect(s.source).toBe(a.source);
        expect(Math.abs(s.bearingDeg! - a.bearingDeg!)).toBeLessThanOrEqual(0.5);
      }),
      params,
    );
  });

  it('reordering the Frames of a stationary signal does not change the bearing by more than 0.5°', () => {
    fc.assert(
      fc.property(fc.double({ min: -85, max: 85, noNaN: true }), rates, seeds, fc.array(fc.nat(), { minLength: 8, maxLength: 8 }), (b, fs, seed, keys) => {
        const frames = window('white', fs, b, 20, seed);
        const order = frames.map((f, i) => ({ f, key: keys[i] })).sort((x, y) => x.key - y.key).map((x) => x.f);
        const a = estimateBearing(frames);
        const s = estimateBearing(order);
        expect(s.source).toBe(a.source);
        expect(Math.abs(s.bearingDeg! - a.bearingDeg!)).toBeLessThanOrEqual(0.5);
      }),
      params,
    );
  });
});
