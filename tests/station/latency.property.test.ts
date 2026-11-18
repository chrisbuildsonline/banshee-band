import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { latencyMs } from '../../src/station/latency';

const RUNS = { seed: 20261118, numRuns: 200 };

describe('latencyMs properties (latency R3.4)', () => {
  it('never throws and gives null or a finite number >= 0, for any two values', () => {
    fc.assert(
      fc.property(fc.anything(), fc.anything(), (a, b) => {
        const r = latencyMs(a, b);
        expect(r === null || (Number.isFinite(r) && r >= 0)).toBe(true);
      }),
      RUNS,
    );
  });

  it('is b - a for two finite numbers a <= b, and null when b < a', () => {
    const finite = fc.double({ noNaN: true, noDefaultInfinity: true, min: -1e9, max: 1e9 });
    fc.assert(
      fc.property(finite, finite, (x, y) => {
        const [a, b] = x <= y ? [x, y] : [y, x];
        expect(latencyMs(a, b)).toBe(b - a);
        if (a < b) expect(latencyMs(b, a)).toBeNull();
      }),
      RUNS,
    );
  });
});
