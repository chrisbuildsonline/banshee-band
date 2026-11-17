import { describe, expect, it } from 'vitest';
import type { Classification } from '../../src/classify';
import type { SoundClass } from '../../src/events';
import { loudestRmsDb, rmsDb, summariseClassifications } from '../../src/station/summary';

const c = (cls: SoundClass, label: string, confidence: number): Classification => ({ class: cls, label, confidence });
const times = (n: number, x: Classification) => Array.from({ length: n }, () => x);

describe('summariseClassifications (R6.2, R6.3)', () => {
  it('takes the most frequent class, the mode of its labels and the mean of its confidences', () => {
    const s = summariseClassifications([c('knock', 'Knock', 0.5), c('knock', 'Knock', 0.7), c('other', 'Silence', 0.9)]);
    expect(s).toEqual({ class: 'knock', label: 'Knock', confidence: expect.closeTo(0.6, 10) });
  });

  it('a tie for the most gives other, from the other frames when there are some', () => {
    expect(summariseClassifications([c('knock', 'Knock', 0.4), c('other', 'Silence', 0.8)])).toEqual(c('other', 'Silence', 0.8));
  });

  it('a tie with no other frame takes the label and confidence from all frames', () => {
    expect(summariseClassifications([c('knock', 'Knock', 0.4), c('voice', 'Speech', 0.6)])).toEqual({ class: 'other', label: 'Knock', confidence: expect.closeTo(0.5, 10) });
  });

  it('alarm x5, voice x4, other x2 gives alarm', () => {
    const s = summariseClassifications([...times(5, c('alarm', 'Smoke detector', 0.6)), ...times(4, c('voice', 'Speech', 0.9)), ...times(2, c('other', 'Silence', 0.9))]);
    expect(s).toEqual({ class: 'alarm', label: 'Smoke detector', confidence: expect.closeTo(0.6, 10) });
  });

  it('the label is the most frequent of the winners, the first one on a tie', () => {
    expect(summariseClassifications([c('knock', 'Knock', 1), c('knock', 'Tap', 1), c('knock', 'Tap', 1)])?.label).toBe('Tap');
    expect(summariseClassifications([c('knock', 'Tap', 1), c('knock', 'Knock', 1)])?.label).toBe('Tap');
  });

  it('null for an empty list', () => {
    expect(summariseClassifications([])).toBeNull();
  });
});

describe('rmsDb and loudestRmsDb (R6.4)', () => {
  const fill = (n: number, v: number) => new Float32Array(n).fill(v);

  it('rmsDb literals', () => {
    expect(rmsDb(fill(15600, 0))).toBe(-120);
    expect(rmsDb(fill(15600, 0.1))).toBeCloseTo(-20, 4);
    expect(rmsDb(fill(15600, 2))).toBe(0);
    expect(rmsDb(fill(10, 1e-9))).toBe(-120);
    expect(rmsDb(Float32Array.of(0.1, Number.NaN))).toBeNaN();
  });

  it('loudestRmsDb takes the loudest window of 15600 every 7800 that ends inside the clip', () => {
    const x = new Float32Array(31200);
    x.fill(0.1, 15600);
    expect(rmsDb(x.subarray(7800, 23400))).toBeCloseTo(-23.0103, 3);
    expect(loudestRmsDb(x)).toBeCloseTo(-20, 4);
  });

  it('a window that would run past the end is not used', () => {
    const x = new Float32Array(20000);
    x.fill(0.5, 15600);
    // Windows start at 0 only (7800 + 15600 > 20000), so the loud tail is diluted.
    expect(loudestRmsDb(x)).toBeCloseTo(rmsDb(x.subarray(0, 15600)), 6);
  });

  it('a clip shorter than a window is one window of everything', () => {
    expect(loudestRmsDb(fill(100, 0.1))).toBeCloseTo(-20, 4);
  });
});
