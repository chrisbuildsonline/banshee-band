import { describe, expect, it } from 'vitest';
import {
  clapSource,
  evaluate,
  FRAME_LEN,
  humSource,
  makeStereo,
  mulberry32,
  noise,
  power,
  render,
  SOURCE_RMS,
  tonesSource,
  whiteNoiseSource,
} from './synth';

describe('test signal helper', () => {
  it('mulberry32 is deterministic and in [0, 1)', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    for (let i = 0; i < 1000; i++) {
      const x = a();
      expect(x).toBe(b());
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
    expect(mulberry32(1)()).not.toBe(mulberry32(2)());
  });

  it('makeStereo is deterministic for a seed and differs between seeds', () => {
    const spec = { signal: 'white' as const, sampleRate: 48000, snrDb: 10, lagSec: 3.5 / 48000, seed: 7 };
    const a = makeStereo(spec);
    const b = makeStereo(spec);
    expect(Array.from(a.left)).toEqual(Array.from(b.left));
    expect(Array.from(a.right)).toEqual(Array.from(b.right));
    expect(makeStereo({ ...spec, seed: 8 }).left[100]).not.toBe(a.left[100]);
  });

  it('white noise covers 40 Hz to 0.45·fs in 40 Hz steps', () => {
    const src = whiteNoiseSource(48000, 1);
    expect(src.components).toHaveLength(540);
    expect(src.components[0].freq).toBe(40);
    expect(src.components.at(-1)!.freq).toBe(21600);
  });

  it('render matches direct evaluation at fractional delays (analytic delay, no interpolation)', () => {
    const fs = 48000;
    for (const src of [whiteNoiseSource(fs, 3), tonesSource(3), clapSource(fs, 3), humSource(3)]) {
      for (const lagSamples of [0, 1, -2, 0.5, -3.5, 7.25]) {
        const x = render(src, 8192, fs, lagSamples / fs);
        let peak = 0;
        for (const v of x) peak = Math.max(peak, Math.abs(v));
        for (const i of [0, 1, 255, 256, 1000, 3333, 3584, 4097, 8191]) {
          expect(Math.abs(x[i] - evaluate(src, i / fs - lagSamples / fs))).toBeLessThan(1e-9 * Math.max(1, peak));
        }
      }
    }
  });

  it('an integer delay is an exact shift', () => {
    const fs = 44100;
    const src = whiteNoiseSource(fs, 5);
    const right = render(src, 4096, fs, 0);
    const left = render(src, 4096, fs, 6 / fs);
    for (let i = 6; i < 4096; i += 7) expect(left[i]).toBeCloseTo(right[i - 6], 9);
  });

  it('clap is zero before its onset in Frame 3 and has almost all its energy in that Frame', () => {
    const fs = 48000;
    const x = render(clapSource(fs, 9), 8 * FRAME_LEN, fs, 0);
    for (let i = 0; i < 3 * FRAME_LEN + 256; i++) expect(x[i]).toBe(0);
    const inFrame = power(x.subarray(3 * FRAME_LEN, 4 * FRAME_LEN)) * FRAME_LEN;
    expect(inFrame / (power(x) * x.length)).toBeGreaterThan(0.9999);
  });

  it('noise has exactly the requested power', () => {
    const n = noise(8192, 0.25, mulberry32(1));
    expect(power(n)).toBeCloseTo(0.25, 12);
  });

  for (const signal of ['white', 'tones', 'clap', 'hum'] as const) {
    for (const snrDb of [-10, 0, 10, 20, 40]) {
      it(`${signal} at ${snrDb} dB: measured SNR within 0.1 dB`, () => {
        const spec = { signal, sampleRate: 48000, snrDb, lagSec: 2.5 / 48000, seed: 11 };
        const noisy = makeStereo(spec);
        const clean = makeStereo({ ...spec, snrDb: Infinity });
        for (const ch of ['left', 'right'] as const) {
          const sig = clean[ch];
          const diff = noisy[ch].map((v, i) => v - sig[i]);
          let ps = power(sig);
          if (signal === 'hum') {
            // The SNR refers to the delayed source only; the common hum is not signal or noise.
            const src = makeStereo({ ...spec, signal: 'white', snrDb: Infinity })[ch];
            ps = power(src);
          }
          expect(Math.abs(10 * Math.log10(ps / power(diff)) - snrDb)).toBeLessThan(0.1);
        }
      });
    }
  }

  it('the source RMS is SOURCE_RMS and the hum is 20 dB above it, the same in both channels', () => {
    const fs = 48000;
    const white = makeStereo({ signal: 'white', sampleRate: fs, snrDb: Infinity, lagSec: 3 / fs, seed: 4 });
    expect(Math.sqrt(power(white.right))).toBeCloseTo(SOURCE_RMS, 12);
    const hum = makeStereo({ signal: 'hum', sampleRate: fs, snrDb: Infinity, lagSec: 3 / fs, seed: 4 });
    const humL = hum.left.map((v, i) => v - white.left[i]);
    const humR = hum.right.map((v, i) => v - white.right[i]);
    expect(10 * Math.log10(power(humR) / power(white.right))).toBeCloseTo(20, 6);
    for (let i = 0; i < humL.length; i += 97) expect(humL[i]).toBeCloseTo(humR[i], 12);
  });

  it('frames are Float32 StereoFrames of 1024 samples with consecutive start times', () => {
    const { frames } = makeStereo({ signal: 'tones', sampleRate: 44100, snrDb: 10, lagSec: 0, seed: 2 });
    expect(frames).toHaveLength(8);
    frames.forEach((f, i) => {
      expect(f.left).toBeInstanceOf(Float32Array);
      expect(f.left.length).toBe(1024);
      expect(f.right.length).toBe(1024);
      expect(f.sampleRate).toBe(44100);
      expect(f.startSample).toBe(i * 1024);
      expect(f.startSec).toBeCloseTo((i * 1024) / 44100, 12);
    });
  });
});
