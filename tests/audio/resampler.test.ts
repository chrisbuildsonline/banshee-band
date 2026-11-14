import { describe, expect, it } from 'vitest';
import { createResampler, resample } from '../../src/audio/resampler';
import { dominantFrequency, sine, toneAmplitude } from './spectrum';

const OUT = 16000;

/**
 * Edge region skipped by every measurement, in output samples.
 * The filter reaches at most H + 1 input samples on each side of an output sample
 * (H is the kernel half-length). For the rates in this file that is at most
 * 35 output samples when downsampling (about 105 taps per side at 48000 Hz)
 * and 46 output samples when upsampling from 8000 Hz. 64 covers both with room.
 */
const SKIP = 64;

const db = (ratio: number) => 20 * Math.log10(ratio);

function testSignal(n: number): Float32Array {
  // Deterministic broadband signal: a few tones plus a fixed pseudo-random sequence.
  const x = new Float32Array(n);
  let seed = 12345;
  for (let i = 0; i < n; i++) {
    seed = (seed * 1103515245 + 12345) >>> 0;
    x[i] = 0.3 * Math.sin(i * 0.05) + 0.2 * Math.sin(i * 0.9) + 0.4 * (seed / 0xffffffff - 0.5);
  }
  return x;
}

function streamed(x: Float32Array, inRate: number, outRate: number, sizes: number[]): Float32Array {
  const r = createResampler(inRate, outRate);
  const parts: Float32Array[] = [];
  let pos = 0;
  let s = 0;
  while (pos < x.length) {
    const size = sizes[s++ % sizes.length];
    parts.push(r.push(x.subarray(pos, pos + size)));
    pos += size;
  }
  parts.push(r.flush());
  const out = new Float32Array(parts.reduce((a, p) => a + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

describe('resample: length', () => {
  for (const rate of [48000, 44100, 22050, 8000, 96000]) {
    it(`1 s at ${rate} Hz gives 16000 samples`, () => {
      expect(resample(new Float32Array(rate), rate, OUT).length).toBe(16000);
    });
  }

  for (const rate of [48000, 44100, 22050, 8000]) {
    for (const n of [0, 1, 2, 7, 441]) {
      it(`${n} samples at ${rate} Hz give floor(N * 16000 / rate)`, () => {
        expect(resample(new Float32Array(n), rate, OUT).length).toBe(Math.floor((n * OUT) / rate));
      });
    }
  }
});

describe('resample: pass band', () => {
  for (const rate of [44100, 48000, 22050, 8000]) {
    it(`a 1 kHz sine at ${rate} Hz keeps its frequency and amplitude`, () => {
      const y = resample(sine(1000, rate, 1), rate, OUT);
      const bin = OUT / (y.length - 2 * SKIP);
      const { freq } = dominantFrequency(y, OUT, SKIP);
      expect(Math.abs(freq - 1000)).toBeLessThanOrEqual(bin);
      const amp = toneAmplitude(y, OUT, 1000, SKIP);
      expect(amp).toBeGreaterThanOrEqual(0.98);
      expect(amp).toBeLessThanOrEqual(1.02);
    });
  }

  for (const rate of [44100, 48000]) {
    for (const f of [100, 6000]) {
      it(`a ${f} Hz sine at ${rate} Hz passes`, () => {
        const y = resample(sine(f, rate, 1), rate, OUT);
        const amp = toneAmplitude(y, OUT, f, SKIP);
        expect(amp).toBeGreaterThanOrEqual(0.98);
        expect(amp).toBeLessThanOrEqual(1.02);
      });
    }
  }

  it('is time-aligned: the output matches a sine sampled directly at 16 kHz', () => {
    for (const rate of [44100, 48000, 22050, 8000]) {
      const y = resample(sine(1000, rate, 1), rate, OUT);
      const ref = sine(1000, OUT, 1);
      let worst = 0;
      for (let i = SKIP; i < y.length - SKIP; i++) worst = Math.max(worst, Math.abs(y[i] - ref[i]));
      expect(worst, `rate ${rate}`).toBeLessThan(0.02);
    }
  });

  it('is time-aligned: an impulse at 0.1 s peaks at output sample 1600', () => {
    for (const rate of [44100, 48000, 96000]) {
      const x = new Float32Array(rate / 2);
      x[rate / 10] = 1;
      const y = resample(x, rate, OUT);
      let peak = 0;
      for (let i = 1; i < y.length; i++) if (y[i] > y[peak]) peak = i;
      expect(peak, `rate ${rate}`).toBe(1600);
      expect(y[1599], `rate ${rate}`).toBeCloseTo(y[1601], 6);
    }
  });
});

describe('resample: stop band', () => {
  const ref = (rate: number) => toneAmplitude(resample(sine(1000, rate, 1), rate, OUT), OUT, 1000, SKIP);

  it('a 9 kHz tone at 48000 Hz (folds to 7 kHz) is at least 50 dB below 1 kHz', () => {
    const y = resample(sine(9000, 48000, 1), 48000, OUT);
    expect(db(ref(48000) / toneAmplitude(y, OUT, 7000, SKIP))).toBeGreaterThanOrEqual(50);
  });

  it('a 12 kHz tone at 44100 Hz (folds to 4 kHz) is at least 50 dB below 1 kHz', () => {
    const y = resample(sine(12000, 44100, 1), 44100, OUT);
    expect(db(ref(44100) / toneAmplitude(y, OUT, 4000, SKIP))).toBeGreaterThanOrEqual(50);
  });

  for (const rate of [48000, 44100]) {
    it(`a tone just past the 8 kHz stop band start at ${rate} Hz (8.1 kHz, folds to 7.9 kHz) is at least 60 dB down`, () => {
      const y = resample(sine(8100, rate, 1), rate, OUT);
      expect(db(ref(rate) / toneAmplitude(y, OUT, 7900, SKIP))).toBeGreaterThanOrEqual(60);
    });

    it(`a 7.9 kHz tone at ${rate} Hz is at least 20 dB below 1 kHz`, () => {
      const y = resample(sine(7900, rate, 1), rate, OUT);
      expect(db(ref(rate) / toneAmplitude(y, OUT, 7900, SKIP))).toBeGreaterThanOrEqual(20);
    });
  }
});

describe('resample: the measured response written in resampler.ts', () => {
  const rel = (f: number, rate: number, at = f) => {
    const y = resample(sine(f, rate, 1), rate, OUT);
    const ref = toneAmplitude(resample(sine(1000, rate, 1), rate, OUT), OUT, 1000, SKIP);
    return db(toneAmplitude(y, OUT, at, SKIP) / ref);
  };
  const near = (measured: number, documented: number, label: string) =>
    expect(Math.abs(measured - documented), `${label}: measured ${measured.toFixed(2)} dB`).toBeLessThan(0.5);

  it('7.9 kHz, 9 kHz and 12 kHz attenuation', () => {
    near(rel(7900, 48000), -39.1, '7.9 kHz at 48000');
    near(rel(7900, 44100), -39.1, '7.9 kHz at 44100');
    near(rel(8100, 48000, 7900), -85.7, '8.1 kHz at 48000');
    near(rel(8100, 44100, 7900), -84.1, '8.1 kHz at 44100');
    near(rel(9000, 48000, 7000), -77.9, '9 kHz at 48000');
    near(rel(12000, 44100, 4000), -91.5, '12 kHz at 44100');
  });

  it('pass band ripple from 100 Hz to 6 kHz', () => {
    for (const rate of [48000, 44100]) {
      let worst = 0;
      for (let f = 100; f <= 6000; f += 100) {
        const amp = toneAmplitude(resample(sine(f, rate, 0.5), rate, OUT), OUT, f, SKIP);
        worst = Math.max(worst, Math.abs(db(amp)));
      }
      expect(worst, `rate ${rate}: worst ${worst.toFixed(5)} dB`).toBeLessThan(0.0015);
    }
  });
});

describe('resample: DC', () => {
  for (const rate of [48000, 44100, 22050, 11025, 8000, 96000]) {
    it(`a constant 0.5 at ${rate} Hz stays 0.5 away from the edges`, () => {
      const y = resample(new Float32Array(rate).fill(0.5), rate, OUT);
      for (let i = SKIP; i < y.length - SKIP; i++) {
        if (Math.abs(y[i] - 0.5) > 1e-6) expect.fail(`sample ${i} is ${y[i]}`);
      }
    });
  }
});

describe('resample: passthrough', () => {
  it('equal rates return an equal copy, not the same array', () => {
    const x = testSignal(1000);
    const y = resample(x, 16000, 16000);
    expect(y).not.toBe(x);
    expect(y).toEqual(x);
  });

  it('the streaming form copies each chunk and flushes nothing', () => {
    const r = createResampler(16000, 16000);
    const x = testSignal(300);
    const y = r.push(x);
    expect(y).not.toBe(x);
    expect(y).toEqual(x);
    expect(r.flush().length).toBe(0);
  });
});

describe('resample: invalid rates', () => {
  const badIn = [0, -1, Number.NaN, 1.5, 7999, 192001, Number.POSITIVE_INFINITY];
  const badOut = [0, -1, Number.NaN, 1.5, 7999, 48001, Number.POSITIVE_INFINITY];
  for (const rate of badIn) {
    it(`inRate ${rate} throws a RangeError naming inRate`, () => {
      expect(() => resample(new Float32Array(4), rate, OUT)).toThrow(RangeError);
      expect(() => createResampler(rate, OUT)).toThrow(/inRate/);
    });
  }
  for (const rate of badOut) {
    it(`outRate ${rate} throws a RangeError naming outRate`, () => {
      expect(() => resample(new Float32Array(4), 48000, rate)).toThrow(RangeError);
      expect(() => createResampler(48000, rate)).toThrow(/outRate/);
    });
  }
  it('accepts the limits', () => {
    expect(() => createResampler(8000, 8000)).not.toThrow();
    expect(() => createResampler(192000, 48000)).not.toThrow();
  });
});

describe('resample: streaming equals one-shot', () => {
  for (const rate of [44100, 48000, 22050, 8000, 11025]) {
    const x = testSignal(rate);
    for (const sizes of [[1], [7], [128], [4096], [0, 1, 0, 300, 5000]]) {
      it(`at ${rate} Hz with chunks of ${sizes.join(',')}`, () => {
        expect(streamed(x, rate, OUT, sizes)).toEqual(resample(x, rate, OUT));
      });
    }
  }

  it('can be reused after flush', () => {
    const r = createResampler(44100, OUT);
    const x = testSignal(5000);
    const a = [...r.push(x), ...r.flush()];
    const b = [...r.push(x), ...r.flush()];
    expect(b).toEqual(a);
  });

  it('does not mutate its input', () => {
    const x = testSignal(4410);
    const copy = x.slice();
    resample(x, 44100, OUT);
    expect(x).toEqual(copy);
  });
});
