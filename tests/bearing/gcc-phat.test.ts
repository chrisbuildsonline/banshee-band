import { describe, expect, it } from 'vitest';
import { CHUNK, DEFAULT_REGULARIZATION, NFFT } from '../../src/bearing/constants';
import { correlationPeak, createPhatWorkspace, parabolicOffset, phatSpectrum } from '../../src/bearing/gcc-phat';
import { bearingToLagSec, lagToBearingDeg, maxLagSamples, resolveBearingConfig } from '../../src/bearing/geometry';
import { makeStereo, type SignalKind } from './helpers/synth';

const cfg = resolveBearingConfig();

/** Runs a whole Window through the chunked GCC-PHAT path the estimator uses. */
function gccWindow(left: Float64Array, right: Float64Array, fs: number, regularization = DEFAULT_REGULARIZATION) {
  const ws = createPhatWorkspace();
  const accRe = new Float64Array(NFFT);
  const accIm = new Float64Array(NFFT);
  let chunks = 0;
  for (let s = 0; s < left.length; s += CHUNK) {
    const len = Math.min(CHUNK, left.length - s);
    if (phatSpectrum(ws, left.subarray(s, s + len), right.subarray(s, s + len), len, regularization, accRe, accIm)) chunks++;
  }
  const limit = (cfg.micSpacingM / cfg.speedOfSound) * fs;
  const peak = correlationPeak(ws, accRe, accIm, maxLagSamples(fs, cfg), limit);
  return { ...peak, chunks, corr: accRe };
}

function lagOf(signal: SignalKind, lagSamples: number, snrDb: number, seed: number, fs = 48000) {
  const { left, right } = makeStereo({ signal, sampleRate: fs, snrDb, lagSec: lagSamples / fs, seed });
  return gccWindow(left, right, fs).lagSamples;
}

describe('parabolicOffset', () => {
  it('finds the vertex of exact parabolas for offsets -0.4 to 0.4', () => {
    for (let d = -0.4; d <= 0.4 + 1e-9; d += 0.05) {
      for (const [a, c] of [[1, 0], [0.3, 5], [20, -2]]) {
        const y = (x: number) => c - a * (x - d) ** 2;
        expect(parabolicOffset(y(-1), y(0), y(1))).toBeCloseTo(d, 12);
      }
    }
  });

  it('limits the offset to ±0.5', () => {
    const y = (d: number) => (x: number) => -((x - d) ** 2);
    expect(parabolicOffset(y(0.7)(-1), y(0.7)(0), y(0.7)(1))).toBe(0.5);
    expect(parabolicOffset(y(-0.9)(-1), y(-0.9)(0), y(-0.9)(1))).toBe(-0.5);
    expect(parabolicOffset(y(0.5)(-1), y(0.5)(0), y(0.5)(1))).toBeCloseTo(0.5, 12);
  });

  it('returns 0 for flat, linear, convex and non-finite input', () => {
    expect(parabolicOffset(1, 1, 1)).toBe(0);
    expect(parabolicOffset(0, 1, 2)).toBe(0);
    expect(parabolicOffset(1, 0, 1)).toBe(0);
    expect(parabolicOffset(0, 0, 0)).toBe(0);
    expect(parabolicOffset(NaN, 1, 0)).toBe(0);
    expect(parabolicOffset(-Infinity, 1, 0)).toBe(0);
  });
});

describe('phatSpectrum and correlationPeak', () => {
  it('recovers every integer lag from -11 to 11 on white noise at 48 kHz', () => {
    for (let lag = -11; lag <= 11; lag++) {
      const est = lagOf('white', lag, 30, 100 + lag);
      expect(Math.round(est) - lag, `lag ${lag}`).toBeCloseTo(0, 12);
      expect(Math.abs(est - lag), `lag ${lag}`).toBeLessThan(0.05);
    }
  });

  it('recovers half-sample lags within 0.1 sample', () => {
    for (const lag of [-10.5, -4.5, -0.5, 0.5, 3.5, 9.5]) {
      expect(Math.abs(lagOf('white', lag, 30, 7) - lag), `lag ${lag}`).toBeLessThan(0.1);
    }
  });

  it('a source on the right (positive bearing) gives a positive lag and bearing', () => {
    const fs = 48000;
    const lagSec = bearingToLagSec(30, cfg);
    expect(lagSec).toBeGreaterThan(0);
    const { left, right } = makeStereo({ signal: 'white', sampleRate: fs, snrDb: 20, lagSec, seed: 3 });
    const est = gccWindow(left, right, fs).lagSamples;
    expect(est).toBeGreaterThan(0);
    expect(Math.abs(lagToBearingDeg(est / fs, cfg) - 30)).toBeLessThan(1.5);
    const mirrored = gccWindow(right, left, fs).lagSamples;
    expect(Math.abs(lagToBearingDeg(mirrored / fs, cfg) + 30)).toBeLessThan(1.5);
  });

  it('with a strong common hum, plain correlation says lag 0 but PHAT finds the source', () => {
    const fs = 48000;
    // The hum's correlation is almost flat over ±11 lags; it outweighs the source peak from about 6.5 samples on.
    for (const lag of [-7, 7.5, -9.5, 10]) {
      const { left, right } = makeStereo({ signal: 'hum', sampleRate: fs, snrDb: 20, lagSec: lag / fs, seed: 21 });
      let best = -Infinity;
      let bestLag = NaN;
      for (let k = -11; k <= 11; k++) {
        let s = 0;
        for (let t = Math.max(0, -k); t < left.length - Math.max(0, k); t++) s += left[t + k] * right[t];
        if (s > best) {
          best = s;
          bestLag = k;
        }
      }
      expect(bestLag, `plain correlation, lag ${lag}`).toBe(0);
      expect(Math.abs(gccWindow(left, right, fs).lagSamples - lag), `PHAT, lag ${lag}`).toBeLessThan(0.25);
    }
  });

  it('finds a clap in 1 Frame of 8 at 10 dB within 4° (noise-only chunks do not outvote it)', () => {
    for (const fs of [48000, 44100]) {
      for (const bearing of [-60, -45, -30, -15, 0, 10, 25, 45, 60]) {
        for (const seed of [1, 2, 3]) {
          const lagSec = bearingToLagSec(bearing, cfg);
          const { left, right } = makeStereo({ signal: 'clap', sampleRate: fs, snrDb: 10, lagSec, seed: seed * 1000 + bearing + 100 });
          const est = lagToBearingDeg(gccWindow(left, right, fs).lagSamples / fs, cfg);
          expect(Math.abs(est - bearing), `${fs} Hz, ${bearing}°, seed ${seed}`).toBeLessThanOrEqual(4);
        }
      }
    }
  });

  it('weights each chunk by its energy: a scaled copy of one chunk counts more', () => {
    const fs = 48000;
    const a = makeStereo({ signal: 'white', sampleRate: fs, snrDb: 40, lagSec: 3 / fs, seed: 31, frames: 1 });
    const b = makeStereo({ signal: 'white', sampleRate: fs, snrDb: 40, lagSec: -5 / fs, seed: 32, frames: 1 });
    const run = (gainB: number) => {
      const ws = createPhatWorkspace();
      const accRe = new Float64Array(NFFT);
      const accIm = new Float64Array(NFFT);
      phatSpectrum(ws, a.left, a.right, CHUNK, 0.01, accRe, accIm);
      phatSpectrum(ws, b.left.map((v) => v * gainB), b.right.map((v) => v * gainB), CHUNK, 0.01, accRe, accIm);
      return Math.round(correlationPeak(ws, accRe, accIm, 11, 11.2).lagSamples);
    };
    expect(run(3)).toBe(-5);
    expect(run(1 / 3)).toBe(3);
  });

  it('skips an all-zero chunk and leaves the accumulator unchanged', () => {
    const ws = createPhatWorkspace();
    const accRe = new Float64Array(NFFT).fill(0.25);
    const accIm = new Float64Array(NFFT).fill(-0.5);
    const zero = new Float64Array(CHUNK);
    expect(phatSpectrum(ws, zero, zero, CHUNK, 0.01, accRe, accIm)).toBe(false);
    expect(accRe.every((v) => v === 0.25) && accIm.every((v) => v === -0.5)).toBe(true);
  });

  it('does not modify its input and handles chunks shorter than CHUNK', () => {
    const fs = 48000;
    const { left, right } = makeStereo({ signal: 'white', sampleRate: fs, snrDb: 30, lagSec: 4 / fs, seed: 5 });
    const l = Float32Array.from(left.subarray(0, 700));
    const r = Float32Array.from(right.subarray(0, 700));
    const lCopy = Array.from(l);
    const ws = createPhatWorkspace();
    const accRe = new Float64Array(NFFT);
    const accIm = new Float64Array(NFFT);
    expect(phatSpectrum(ws, l, r, 700, 0.01, accRe, accIm)).toBe(true);
    expect(Array.from(l)).toEqual(lCopy);
    const p = correlationPeak(ws, accRe, accIm, 11, 11.2);
    expect(Math.round(p.lagSamples)).toBe(4);
  });

  it('clamps the refined lag to the physical limit', () => {
    const fs = 48000;
    // 11.4 samples is more than the 0.08 m spacing allows (11.195 samples at 48 kHz).
    const { left, right } = makeStereo({ signal: 'white', sampleRate: fs, snrDb: 40, lagSec: 11.4 / fs, seed: 9 });
    const limit = (cfg.micSpacingM / cfg.speedOfSound) * fs;
    const p = gccWindow(left, right, fs);
    expect(p.lagSamples).toBeLessThanOrEqual(limit);
    expect(lagToBearingDeg(p.lagSamples / fs, cfg)).toBeGreaterThan(80);
    expect(p.lagSamples).toBeGreaterThan(10.5);
  });

  it('the peak index is the lag modulo NFFT and the correlation stays in the workspace output', () => {
    const fs = 48000;
    const { left, right } = makeStereo({ signal: 'white', sampleRate: fs, snrDb: 30, lagSec: -6 / fs, seed: 12 });
    const p = gccWindow(left, right, fs);
    expect(p.peakIndex).toBe(NFFT - 6);
    expect(p.peak).toBe(p.corr[NFFT - 6]);
    expect(p.chunks).toBe(8);
  });
});
