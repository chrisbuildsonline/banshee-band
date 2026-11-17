import { describe, expect, it } from 'vitest';
import { waveformPeaks } from '../../src/station/waveform';

const f32 = (xs: number[]) => xs.map(Math.fround);

describe('waveformPeaks (R13.9)', () => {
  it('largest absolute sample of each slice', () => {
    expect(waveformPeaks(Float32Array.of(0.5, -1, 0.25, 0), 2)).toEqual([1, 0.25]);
  });

  it('empty slices give 0', () => {
    expect(waveformPeaks(Float32Array.of(0.2, -0.4, 0.6), 6)).toEqual(f32([0, 0.2, 0, 0.4, 0, 0.6]));
  });

  it('NaN counts as 0 and peaks clamp to 1', () => {
    expect(waveformPeaks(Float32Array.of(Number.NaN, 0.3, 2, -5), 2)).toEqual(f32([0.3, 1]));
  });

  it('an empty input gives zeros', () => {
    expect(waveformPeaks(new Float32Array(0), 4)).toEqual([0, 0, 0, 0]);
  });

  it('throws a RangeError for buckets that are not a positive integer', () => {
    for (const b of [0, 1.5, -3]) expect(() => waveformPeaks(Float32Array.of(1), b), String(b)).toThrow(RangeError);
  });
});
