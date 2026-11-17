import { describe, expect, it } from 'vitest';
import { SOUND_CLASSES } from '../../src/events';
import { URGENCY_STYLE } from '../../src/ghosts/constants';
import { dashFor, pathLength, shapeParts } from '../../src/ghosts/outline';
import { SHAPES } from '../../src/ghosts/shapes';

const SQUARE = 'M 2 2 H 12 V 12 H 2 Z';
const EYE_L = 'M 4 4 H 5 V 5 H 4 Z';
const EYE_R = 'M 7 4 H 8 V 5 H 7 Z';
const MOUTH = 'M 4 8 H 9 V 9 H 4 Z';

/** A circle of radius `r` around (cx, cy) from four `C` curves, kappa 0.5523. */
function circle(cx: number, cy: number, r: number): string {
  const k = 0.5523 * r;
  return [
    `M ${cx} ${cy - r}`,
    `C ${cx + k} ${cy - r} ${cx + r} ${cy - k} ${cx + r} ${cy}`,
    `C ${cx + r} ${cy + k} ${cx + k} ${cy + r} ${cx} ${cy + r}`,
    `C ${cx - k} ${cy + r} ${cx - r} ${cy + k} ${cx - r} ${cy}`,
    `C ${cx - r} ${cy - k} ${cx - k} ${cy - r} ${cx} ${cy - r} Z`,
  ].join(' ');
}

describe('shapeParts (R14.2)', () => {
  it('splits outer, no detail and two eyes from three subpaths', () => {
    expect(shapeParts(`${SQUARE} ${EYE_L} ${EYE_R}`)).toEqual({ outer: SQUARE, details: [], eyes: [EYE_L, EYE_R] });
  });

  it('keeps the subpaths between the outer and the eyes as details', () => {
    expect(shapeParts(`${SQUARE} ${MOUTH} ${EYE_L} ${EYE_R}`)).toEqual({ outer: SQUARE, details: [MOUTH], eyes: [EYE_L, EYE_R] });
  });

  it('gives no eyes and no details for one or two subpaths', () => {
    expect(shapeParts(SQUARE)).toEqual({ outer: SQUARE, details: [], eyes: [] });
    const two = `${SQUARE} ${MOUTH}`;
    expect(shapeParts(two)).toEqual({ outer: two, details: [], eyes: [] });
  });

  it('does not throw on the empty string', () => {
    expect(() => shapeParts('')).not.toThrow();
    expect(shapeParts('')).toEqual({ outer: '', details: [], eyes: [] });
  });
});

describe('pathLength (R15.1)', () => {
  it('measures a square with its closing segment: 40', () => {
    expect(pathLength(SQUARE)).toBeCloseTo(40, 6);
  });

  it('measures a circle of four C curves of radius 5 within 0.3 of 10 pi', () => {
    expect(Math.abs(pathLength(circle(12, 12, 5)) - 10 * Math.PI)).toBeLessThanOrEqual(0.3);
  });

  it('adds the lengths of all subpaths', () => {
    expect(pathLength(`${SQUARE} ${EYE_L}`)).toBeCloseTo(44, 6);
  });
});

describe('dashFor (R15.2)', () => {
  const expectPair = (got: [number, number], want: [number, number]) => {
    expect(got).toHaveLength(2);
    expect(got[0]).toBeCloseTo(want[0], 3);
    expect(got[1]).toBeCloseTo(want[1], 3);
  };

  it('fits four periods around a 40 unit square at width 1.5', () => {
    expectPair(dashFor(1.5, 40), [6.667, 3.333]);
  });

  it('keeps the minimum of three periods at width 3.5', () => {
    expectPair(dashFor(3.5, 40), [8.889, 4.444]);
  });

  it('gives a solid line, [0, 0], for a width or length that is not a positive finite number', () => {
    for (const w of [0, -1, Number.NaN]) expect(dashFor(w, 40), `width ${w}`).toEqual([0, 0]);
    expect(dashFor(1.5, 0)).toEqual([0, 0]);
    expect(dashFor(1.5, Number.NaN)).toEqual([0, 0]);
    expect(() => dashFor(Number.POSITIVE_INFINITY, 40)).not.toThrow();
    expect(() => dashFor(1.5, Number.POSITIVE_INFINITY)).not.toThrow();
  });
});

describe('dashes of the real shapes (R15.4)', () => {
  const widths = [URGENCY_STYLE.low.outlineWidth, URGENCY_STYLE.medium.outlineWidth, URGENCY_STYLE.high.outlineWidth];

  it('uses the three urgency widths 1.5, 2.5 and 3.5', () => {
    expect(widths).toEqual([1.5, 2.5, 3.5]);
  });

  for (const c of SOUND_CLASSES) {
    it(`${c}: long gaps, 3 to 8 dashes, fewer as the outline gets heavier, at most 4 when urgent`, () => {
      const length = pathLength(shapeParts(SHAPES[c]).outer);
      const counts = widths.map((w) => {
        const [on, off] = dashFor(w, length);
        expect(off, `${c} gap at width ${w}`).toBeGreaterThanOrEqual(1.5 * w);
        const count = length / (on + off);
        expect(Math.abs(count - Math.round(count)), `${c} whole periods at width ${w}`).toBeLessThan(1e-9);
        return Math.round(count);
      });
      for (const n of counts) {
        expect(n, `${c} counts ${counts}`).toBeGreaterThanOrEqual(3);
        expect(n, `${c} counts ${counts}`).toBeLessThanOrEqual(8);
      }
      expect(counts[0], `${c} counts ${counts}`).toBeGreaterThanOrEqual(counts[1]);
      expect(counts[1], `${c} counts ${counts}`).toBeGreaterThanOrEqual(counts[2]);
      expect(counts[2], `${c} counts ${counts}`).toBeLessThanOrEqual(4);
    });
  }
});
