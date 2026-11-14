import { describe, expect, it } from 'vitest';
import { dominantFrequency, rms, sine, toneAmplitude } from './spectrum';

describe('spectrum helpers', () => {
  it('sine makes the right length and peak', () => {
    const x = sine(1000, 16000, 0.5, 0.7);
    expect(x.length).toBe(8000);
    expect(Math.max(...x)).toBeCloseTo(0.7, 3);
  });

  it('toneAmplitude reads a known sine within 1%', () => {
    for (const [freq, amp] of [[1000, 1], [440, 0.3], [6123, 0.8]] as const) {
      const x = sine(freq, 16000, 1, amp);
      expect(Math.abs(toneAmplitude(x, 16000, freq, 0) - amp) / amp).toBeLessThan(0.01);
    }
  });

  it('toneAmplitude reads near zero for a tone 500 Hz away', () => {
    const x = sine(1000, 16000, 1);
    expect(toneAmplitude(x, 16000, 1500, 0)).toBeLessThan(1e-3);
  });

  it('toneAmplitude ignores the skipped edges', () => {
    const x = sine(1000, 16000, 1);
    x.fill(5, 0, 100);
    x.fill(5, x.length - 100);
    expect(Math.abs(toneAmplitude(x, 16000, 1000, 100) - 1)).toBeLessThan(0.01);
  });

  it('dominantFrequency finds a known sine within 10 Hz and its amplitude', () => {
    const x = sine(2730, 16000, 1, 0.5);
    const { freq, amp } = dominantFrequency(x, 16000, 0);
    expect(Math.abs(freq - 2730)).toBeLessThanOrEqual(10);
    expect(Math.abs(amp - 0.5)).toBeLessThan(0.02);
  });

  it('dominantFrequency finds a tone between grid points with its amplitude', () => {
    const x = sine(2735.4, 16000, 0.8, 0.9);
    const { freq, amp } = dominantFrequency(x, 16000, 0);
    expect(Math.abs(freq - 2735.4)).toBeLessThan(1);
    expect(Math.abs(amp - 0.9) / 0.9).toBeLessThan(0.01);
  });

  it('rms of a unit sine is 1/sqrt(2)', () => {
    expect(rms(sine(1000, 16000, 1), 0)).toBeCloseTo(Math.SQRT1_2, 3);
  });
});
