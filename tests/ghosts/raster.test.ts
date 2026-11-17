import { describe, expect, it } from 'vitest';
import { areaRatio, differenceRatio, pathPoints, rasterize } from './helpers/raster';

// A circle of radius r around (12, 12) from four cubic arcs (k = 0.5523 r).
const circle = (r: number) => {
  const k = 0.5522847498 * r;
  return `M ${12 - r} 12 C ${12 - r} ${12 - k} ${12 - k} ${12 - r} 12 ${12 - r} C ${12 + k} ${12 - r} ${12 + r} ${12 - k} ${12 + r} 12 C ${12 + r} ${12 + k} ${12 + k} ${12 + r} 12 ${12 + r} C ${12 - k} ${12 + r} ${12 - r} ${12 + k} ${12 - r} 12 Z`;
};

describe('test rasteriser', () => {
  it('fills a 12 x 12 square as a quarter of the box', () => {
    const mask = rasterize('M 6 6 H 18 V 18 H 6 Z');
    expect(mask).toHaveLength(2304);
    expect(areaRatio(mask)).toBe(576 / 2304);
  });

  it('leaves a square hole open with the even-odd rule', () => {
    const mask = rasterize('M 4 4 H 20 V 20 H 4 Z M 8 8 L 16 8 L 16 16 L 8 16 Z');
    // 32 x 32 pixels minus 16 x 16 pixels.
    expect(areaRatio(mask)).toBe((1024 - 256) / 2304);
  });

  it('fills a circle of C curves within 1% of pi r^2', () => {
    const r = 9;
    const pixels = areaRatio(rasterize(circle(r))) * 2304;
    const expected = Math.PI * (r * 2) ** 2;
    expect(Math.abs(pixels - expected) / expected).toBeLessThan(0.01);
  });

  it('fills a Q curve shape', () => {
    expect(areaRatio(rasterize('M 4 20 Q 12 2 20 20 Z'))).toBeGreaterThan(0.1);
  });

  it('throws on a command that is not allowed', () => {
    expect(() => rasterize('M 4 4 A 2 2 0 0 1 8 8 Z')).toThrow(/"A" is not allowed/);
    expect(() => rasterize('m 4 4 l 2 2 z')).toThrow(/not allowed/);
  });

  it('counts the differing pixels of two masks', () => {
    const a = rasterize('M 0 0 H 12 V 24 H 0 Z');
    const b = rasterize('M 12 0 H 24 V 24 H 12 Z');
    expect(differenceRatio(a, a)).toBe(0);
    expect(differenceRatio(a, b)).toBe(1);
  });

  it('lists every point, control points included', () => {
    expect(pathPoints('M 2 3 C 4 5 6 7 8 9 H 10 V 11 Z')).toEqual([[2, 3], [4, 5], [6, 7], [8, 9], [10, Number.NaN], [Number.NaN, 11]]);
  });
});
