import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { createResampler, resample } from '../../src/audio/resampler';
import { dominantFrequency, rms, sine } from './spectrum';

const OUT = 16000;
const RATES = [8000, 11025, 16000, 22050, 32000, 44100, 48000, 88200, 96000] as const;
/** Edge region skipped by the measurements, in output samples (see resampler.test.ts: at most 46). */
const SKIP = 64;

const finiteSamples = (maxLength: number) =>
  fc.float32Array({ noNaN: true, noDefaultInfinity: true, maxLength });

/** Splits `x` at arbitrary points (repeats allowed, so chunks of length 0 occur). */
function splitAt(x: Float32Array, cuts: number[]): Float32Array[] {
  const points = cuts.map((c) => c % (x.length + 1)).sort((a, b) => a - b);
  const parts: Float32Array[] = [];
  let prev = 0;
  for (const p of points) {
    parts.push(x.subarray(prev, p));
    prev = p;
  }
  parts.push(x.subarray(prev));
  return parts;
}

function concat(parts: Float32Array[]): Float32Array {
  const out = new Float32Array(parts.reduce((a, p) => a + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

describe('resampler properties', () => {
  it('R1: output length is floor(N * outRate / inRate)', () => {
    fc.assert(
      fc.property(fc.constantFrom(...RATES), finiteSamples(5000), (rate, x) => {
        expect(resample(x, rate, OUT).length).toBe(Math.floor((x.length * OUT) / rate));
      }),
    );
  });

  it('R2: streaming output split at arbitrary points equals the one-shot output exactly', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...RATES),
        finiteSamples(5000),
        fc.array(fc.nat(), { maxLength: 12 }),
        (rate, x, cuts) => {
          const r = createResampler(rate, OUT);
          const parts = splitAt(x, cuts).map((chunk) => r.push(chunk));
          parts.push(r.flush());
          expect(concat(parts)).toEqual(resample(x, rate, OUT));
        },
      ),
    );
  });

  it('R3: the output is finite and the input is not mutated', () => {
    fc.assert(
      fc.property(fc.constantFrom(...RATES), finiteSamples(5000), (rate, x) => {
        const before = x.slice();
        const y = resample(x, rate, OUT);
        expect(x).toEqual(before);
        for (let i = 0; i < y.length; i++) if (!Number.isFinite(y[i])) expect.fail(`y[${i}] = ${y[i]}`);
      }),
    );
  });

  it('R4: the same input gives the same output', () => {
    fc.assert(
      fc.property(fc.constantFrom(...RATES), finiteSamples(3000), (rate, x) => {
        expect(resample(x, rate, OUT)).toEqual(resample(x, rate, OUT));
      }),
    );
  });

  it('R5: a pass-band sine keeps its frequency within one bin', () => {
    // 100 Hz to 6000 Hz, capped at the pass band edge of an upsampled input (0.4 of its rate),
    // since a tone above an input's own pass band is not a pass-band tone.
    const rateAndFreq = fc
      .constantFrom(...RATES.filter((r) => r > 8000))
      .chain((rate) => fc.tuple(fc.constant(rate), fc.integer({ min: 100, max: Math.min(6000, Math.floor(0.4 * rate)) })));
    fc.assert(
      fc.property(rateAndFreq, ([rate, f]) => {
        const y = resample(sine(f, rate, 0.5), rate, OUT);
        const bin = OUT / (y.length - 2 * SKIP);
        expect(Math.abs(dominantFrequency(y, OUT, SKIP).freq - f)).toBeLessThanOrEqual(bin);
      }),
      { numRuns: 20 },
    );
  });

  it('R6: a sine from 8500 Hz to the input Nyquist is at least 40 dB down', () => {
    const rateAndFreq = fc
      .constantFrom(...RATES.filter((r) => r / 2 - 100 > 8500))
      .chain((rate) => fc.tuple(fc.constant(rate), fc.integer({ min: 8500, max: rate / 2 - 100 })));
    fc.assert(
      fc.property(rateAndFreq, ([rate, f]) => {
        const x = sine(f, rate, 0.5);
        const y = resample(x, rate, OUT);
        expect(rms(y, SKIP) / rms(x)).toBeLessThan(0.01);
      }),
      { numRuns: 20 },
    );
  });

  it('R7: the length rule holds for any integer rates in range, in any chunking', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 8000, max: 192000 }),
        fc.integer({ min: 8000, max: 48000 }),
        fc.integer({ min: 0, max: 3000 }),
        fc.array(fc.nat(), { maxLength: 5 }),
        (inRate, outRate, n, cuts) => {
          const r = createResampler(inRate, outRate);
          const x = new Float32Array(n).fill(0.25);
          let total = 0;
          for (const chunk of splitAt(x, cuts)) total += r.push(chunk).length;
          total += r.flush().length;
          expect(total).toBe(Math.floor((n * outRate) / inRate));
        },
      ),
      { numRuns: 20 },
    );
  });
});
