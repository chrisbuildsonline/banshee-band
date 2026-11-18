import { describe, expect, it } from 'vitest';
import { latencyMs } from '../../src/station/latency';

describe('latencyMs (latency R3.1 to R3.4)', () => {
  it('is the output read minus the onset read, unrounded', () => {
    expect(latencyMs(100, 141.5)).toBe(41.5);
    expect(latencyMs(0, 40.5)).toBe(40.5);
    expect(latencyMs(1000.25, 1003.3)).toBeCloseTo(3.05, 10);
  });

  it('gives 0 for equal times', () => {
    expect(latencyMs(250, 250)).toBe(0);
    expect(Object.is(latencyMs(-5, -5), 0)).toBe(true);
  });

  it('gives null for an output before the onset', () => {
    expect(latencyMs(141.5, 100)).toBeNull();
    expect(latencyMs(0, -0.001)).toBeNull();
  });

  it.each([
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['-Infinity', Number.NEGATIVE_INFINITY],
    ['undefined', undefined],
    ['null', null],
    ['a string', '12'],
    ['a boxed number', Object(12)],
  ])('gives null for %s in either place', (_name, bad) => {
    expect(latencyMs(bad, 100)).toBeNull();
    expect(latencyMs(100, bad)).toBeNull();
    expect(latencyMs(bad, bad)).toBeNull();
  });
});
