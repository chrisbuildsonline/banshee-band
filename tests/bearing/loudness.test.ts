import { describe, expect, it } from 'vitest';
import { resolveBearingConfig } from '../../src/bearing/geometry';
import { ildToBearingDeg, levelDifferenceDb, loudnessConfidence } from '../../src/bearing/loudness';

const cfg = resolveBearingConfig();

describe('levelDifferenceDb', () => {
  it('is 20·log10(rmsRight / rmsLeft), positive when the right channel is louder', () => {
    expect(levelDifferenceDb(1, 1)).toBe(0);
    expect(levelDifferenceDb(1, 4)).toBeCloseTo(20 * Math.log10(2), 12);
    expect(levelDifferenceDb(100, 1)).toBeCloseTo(-20, 12);
  });

  it('does not overflow or underflow for extreme sums', () => {
    expect(levelDifferenceDb(Number.MAX_VALUE, Number.MAX_VALUE)).toBe(0);
    expect(levelDifferenceDb(1e300, 1e-300)).toBeCloseTo(-6000, 6);
    expect(levelDifferenceDb(Number.MIN_VALUE, Number.MAX_VALUE)).toBeGreaterThan(6000);
    expect(Number.isFinite(levelDifferenceDb(Number.MIN_VALUE, Number.MAX_VALUE))).toBe(true);
  });
});

describe('ildToBearingDeg', () => {
  it('is 0 inside the dead zone, inclusive', () => {
    for (const ild of [0, 0.5, -0.5, 1, -1]) expect(ildToBearingDeg(ild, cfg)).toBe(0);
    expect(ildToBearingDeg(2, resolveBearingConfig({ ildDeadZoneDb: 3 }))).toBe(0);
  });

  it('maps linearly to ±90 at the saturation and keeps the sign of the ILD', () => {
    expect(ildToBearingDeg(6, cfg)).toBeCloseTo(45, 12);
    expect(ildToBearingDeg(-3, cfg)).toBeCloseTo(-22.5, 12);
    expect(ildToBearingDeg(1.5, cfg)).toBeCloseTo(11.25, 12);
    expect(ildToBearingDeg(12, cfg)).toBe(90);
    expect(ildToBearingDeg(40, cfg)).toBe(90);
    expect(ildToBearingDeg(-1e6, cfg)).toBe(-90);
    expect(ildToBearingDeg(5, resolveBearingConfig({ ildSaturationDb: 5 }))).toBe(90);
  });
});

describe('loudnessConfidence', () => {
  it('is |ild| / saturation, capped at 0.5', () => {
    expect(loudnessConfidence(0, cfg)).toBe(0);
    expect(loudnessConfidence(3, cfg)).toBeCloseTo(0.25, 12);
    expect(loudnessConfidence(-3, cfg)).toBeCloseTo(0.25, 12);
    expect(loudnessConfidence(6, cfg)).toBe(0.5);
    expect(loudnessConfidence(-100, cfg)).toBe(0.5);
  });
});
