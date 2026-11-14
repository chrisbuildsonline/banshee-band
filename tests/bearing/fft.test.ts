import { describe, expect, it } from 'vitest';
import { createFftPlan, fft, ifft } from '../../src/bearing/fft';
import { mulberry32 } from './helpers/rng';

/** Direct O(n²) DFT, the reference. */
function dft(re: Float64Array, im: Float64Array, sign: -1 | 1): [Float64Array, Float64Array] {
  const n = re.length;
  const outRe = new Float64Array(n);
  const outIm = new Float64Array(n);
  for (let k = 0; k < n; k++) {
    let sr = 0;
    let si = 0;
    for (let t = 0; t < n; t++) {
      const a = (sign * 2 * Math.PI * ((k * t) % n)) / n;
      const c = Math.cos(a);
      const s = Math.sin(a);
      sr += re[t] * c - im[t] * s;
      si += re[t] * s + im[t] * c;
    }
    outRe[k] = sr;
    outIm[k] = si;
  }
  return [outRe, outIm];
}

function randomComplex(n: number, seed: number): [Float64Array, Float64Array] {
  const rng = mulberry32(seed);
  const re = new Float64Array(n);
  const im = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    re[i] = rng() * 2 - 1;
    im[i] = rng() * 2 - 1;
  }
  return [re, im];
}

/** Largest |a - b| over both parts, relative to the largest |b|. */
function relErr(aRe: Float64Array, aIm: Float64Array, bRe: Float64Array, bIm: Float64Array): number {
  let err = 0;
  let scale = 0;
  for (let i = 0; i < aRe.length; i++) {
    err = Math.max(err, Math.hypot(aRe[i] - bRe[i], aIm[i] - bIm[i]));
    scale = Math.max(scale, Math.hypot(bRe[i], bIm[i]));
  }
  return err / scale;
}

const SIZES = [2, 4, 8, 16, 32, 64, 128, 256];

describe('fft', () => {
  for (const n of SIZES) {
    it(`matches the direct DFT for n = ${n}`, () => {
      const [re, im] = randomComplex(n, n);
      const [refRe, refIm] = dft(re, im, -1);
      const plan = createFftPlan(n);
      fft(plan, re, im);
      expect(relErr(re, im, refRe, refIm)).toBeLessThan(1e-9);
    });

    it(`ifft matches the scaled inverse DFT and ifft(fft(x)) = x for n = ${n}`, () => {
      const [re, im] = randomComplex(n, 1000 + n);
      const [refRe, refIm] = dft(re, im, 1);
      for (let i = 0; i < n; i++) {
        refRe[i] /= n;
        refIm[i] /= n;
      }
      const plan = createFftPlan(n);
      const xRe = re.slice();
      const xIm = im.slice();
      ifft(plan, re, im);
      expect(relErr(re, im, refRe, refIm)).toBeLessThan(1e-9);
      fft(plan, xRe, xIm);
      ifft(plan, xRe, xIm);
      const [origRe, origIm] = randomComplex(n, 1000 + n);
      expect(relErr(xRe, xIm, origRe, origIm)).toBeLessThan(1e-9);
    });
  }

  it('keeps Parseval: sum |x|² = sum |X|² / n for n = 2048', () => {
    const n = 2048;
    const [re, im] = randomComplex(n, 7);
    let timeEnergy = 0;
    for (let i = 0; i < n; i++) timeEnergy += re[i] ** 2 + im[i] ** 2;
    fft(createFftPlan(n), re, im);
    let freqEnergy = 0;
    for (let i = 0; i < n; i++) freqEnergy += re[i] ** 2 + im[i] ** 2;
    expect(Math.abs(freqEnergy / n - timeEnergy) / timeEnergy).toBeLessThan(1e-12);
  });

  it('turns an impulse at t0 into a pure phase ramp', () => {
    const n = 64;
    const t0 = 5;
    const re = new Float64Array(n);
    const im = new Float64Array(n);
    re[t0] = 1;
    fft(createFftPlan(n), re, im);
    for (let k = 0; k < n; k++) {
      expect(re[k]).toBeCloseTo(Math.cos((-2 * Math.PI * k * t0) / n), 12);
      expect(im[k]).toBeCloseTo(Math.sin((-2 * Math.PI * k * t0) / n), 12);
    }
  });

  it('puts a complex exponential at bin k0 into that bin only', () => {
    const n = 128;
    const k0 = 9;
    const re = new Float64Array(n);
    const im = new Float64Array(n);
    for (let t = 0; t < n; t++) {
      re[t] = Math.cos((2 * Math.PI * k0 * t) / n);
      im[t] = Math.sin((2 * Math.PI * k0 * t) / n);
    }
    fft(createFftPlan(n), re, im);
    for (let k = 0; k < n; k++) {
      expect(re[k]).toBeCloseTo(k === k0 ? n : 0, 9);
      expect(im[k]).toBeCloseTo(0, 9);
    }
  });

  it('one plan can be reused and gives the same output every time', () => {
    const plan = createFftPlan(256);
    const [re1, im1] = randomComplex(256, 3);
    const [re2, im2] = randomComplex(256, 3);
    fft(plan, re1, im1);
    fft(plan, re2, im2);
    expect(Array.from(re2)).toEqual(Array.from(re1));
    expect(Array.from(im2)).toEqual(Array.from(im1));
  });

  for (const bad of [0, 1, 3, 6, 100, -4, 2.5, NaN, Infinity]) {
    it(`createFftPlan(${bad}) throws a RangeError`, () => {
      expect(() => createFftPlan(bad)).toThrow(RangeError);
    });
  }

  it('fft and ifft throw a RangeError for arrays that do not match the plan', () => {
    const plan = createFftPlan(8);
    expect(() => fft(plan, new Float64Array(4), new Float64Array(4))).toThrow(RangeError);
    expect(() => ifft(plan, new Float64Array(8), new Float64Array(6))).toThrow(RangeError);
  });
});
