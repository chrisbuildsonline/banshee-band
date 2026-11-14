import { beforeAll, describe, expect, it } from 'vitest';
import {
  DEFAULT_MIC_SPACING_M,
  DEFAULT_REGULARIZATION,
  ILD_DEAD_ZONE_DB,
  ILD_SATURATION_DB,
  MIN_CONFIDENCE,
  SILENCE_RMS,
  SPEED_OF_SOUND,
} from '../../src/bearing/constants';
import { bearingToLagSec, lagToBearingDeg, maxLagSamples, resolveBearingConfig } from '../../src/bearing/geometry';
import type { BearingConfig } from '../../src/bearing/types';

let cfg: BearingConfig;
beforeAll(() => {
  cfg = resolveBearingConfig();
});

describe('resolveBearingConfig', () => {
  it('fills the defaults', () => {
    expect(resolveBearingConfig()).toEqual({
      micSpacingM: 0.08,
      speedOfSound: 343,
      silenceRms: SILENCE_RMS,
      minConfidence: 0.3,
      regularization: DEFAULT_REGULARIZATION,
      ildSaturationDb: 12,
      ildDeadZoneDb: 1,
    });
    expect(DEFAULT_MIC_SPACING_M).toBe(0.08);
    expect(SPEED_OF_SOUND).toBe(343);
    expect(MIN_CONFIDENCE).toBe(0.3);
    expect(ILD_SATURATION_DB).toBe(12);
    expect(ILD_DEAD_ZONE_DB).toBe(1);
    expect(SILENCE_RMS).toBeCloseTo(3.162e-4, 6);
  });

  it('keeps given values and ignores undefined ones', () => {
    const c = resolveBearingConfig({ micSpacingM: 0.15, minConfidence: 0.5, regularization: undefined });
    expect(c.micSpacingM).toBe(0.15);
    expect(c.minConfidence).toBe(0.5);
    expect(c.regularization).toBe(DEFAULT_REGULARIZATION);
  });

  const fields = ['micSpacingM', 'speedOfSound', 'silenceRms', 'minConfidence', 'regularization', 'ildSaturationDb'] as const;
  for (const field of fields) {
    for (const bad of [0, -1, NaN, Infinity, -Infinity]) {
      it(`throws a RangeError naming ${field} for ${bad}`, () => {
        expect(() => resolveBearingConfig({ [field]: bad })).toThrow(RangeError);
        expect(() => resolveBearingConfig({ [field]: bad })).toThrow(field);
      });
    }
  }

  it('allows ildDeadZoneDb = 0 but not below or non-finite', () => {
    expect(resolveBearingConfig({ ildDeadZoneDb: 0 }).ildDeadZoneDb).toBe(0);
    for (const bad of [-0.1, NaN, Infinity]) {
      expect(() => resolveBearingConfig({ ildDeadZoneDb: bad })).toThrow(RangeError);
      expect(() => resolveBearingConfig({ ildDeadZoneDb: bad })).toThrow('ildDeadZoneDb');
    }
  });

  it('rejects a value that is not a number', () => {
    expect(() => resolveBearingConfig({ micSpacingM: '0.08' as unknown as number })).toThrow(RangeError);
  });
});

describe('maxLagSamples', () => {
  it('is 3, 10 and 11 at 16, 44.1 and 48 kHz with the default spacing', () => {
    expect(maxLagSamples(16000, cfg)).toBe(3);
    expect(maxLagSamples(44100, cfg)).toBe(10);
    expect(maxLagSamples(48000, cfg)).toBe(11);
  });

  it('is at least 1', () => {
    expect(maxLagSamples(100, cfg)).toBe(1);
    expect(maxLagSamples(48000, resolveBearingConfig({ micSpacingM: 0.001 }))).toBe(1);
  });

  it('scales with the spacing', () => {
    expect(maxLagSamples(48000, resolveBearingConfig({ micSpacingM: 0.16 }))).toBe(22);
  });
});

describe('lagToBearingDeg and bearingToLagSec', () => {
  const maxLagSec = 0.08 / 343;

  it('maps 0, the maximum lag and half of it', () => {
    expect(lagToBearingDeg(0, cfg)).toBe(0);
    expect(lagToBearingDeg(maxLagSec, cfg)).toBeCloseTo(90, 9);
    expect(lagToBearingDeg(-maxLagSec, cfg)).toBeCloseTo(-90, 9);
    expect(lagToBearingDeg(maxLagSec / 2, cfg)).toBeCloseTo(30, 9);
    expect(lagToBearingDeg(maxLagSec * Math.SQRT1_2, cfg)).toBeCloseTo(45, 9);
  });

  it('gives a positive bearing for a positive lag (left delayed, sound on the right)', () => {
    expect(lagToBearingDeg(1e-5, cfg)).toBeGreaterThan(0);
    expect(bearingToLagSec(30, cfg)).toBeGreaterThan(0);
  });

  it('clamps lags beyond the physical maximum to ±90 without throwing', () => {
    expect(lagToBearingDeg(maxLagSec * 3, cfg)).toBe(90);
    expect(lagToBearingDeg(-1, cfg)).toBe(-90);
    expect(lagToBearingDeg(Number.MAX_VALUE, cfg)).toBe(90);
  });

  it('is odd and monotonic', () => {
    let prev = -Infinity;
    for (let i = -200; i <= 200; i++) {
      const lag = (i / 150) * maxLagSec;
      const b = lagToBearingDeg(lag, cfg);
      expect(b).toBeGreaterThanOrEqual(-90);
      expect(b).toBeLessThanOrEqual(90);
      expect(b).toBeGreaterThanOrEqual(prev);
      expect(lagToBearingDeg(-lag, cfg)).toBe(-b);
      prev = b;
    }
  });

  it('round-trips bearing -> lag -> bearing within 1e-9 degrees', () => {
    for (let b = -90; b <= 90; b += 0.5) {
      expect(Math.abs(lagToBearingDeg(bearingToLagSec(b, cfg), cfg) - b)).toBeLessThan(1e-9);
    }
  });

  it('uses the configured spacing and speed', () => {
    const wide = resolveBearingConfig({ micSpacingM: 0.16 });
    expect(bearingToLagSec(90, wide)).toBeCloseTo(0.16 / 343, 15);
    const slow = resolveBearingConfig({ speedOfSound: 171.5 });
    expect(bearingToLagSec(90, slow)).toBeCloseTo(0.08 / 171.5, 15);
  });
});
