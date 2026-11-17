import { describe, expect, it } from 'vitest';
import type { SoundEvent } from '../../src/events';
import { sideOf } from '../../src/haptics/side';
import { makeEvent } from './helpers/events';

const at = (bearingDeg: number | null, bearingSource: SoundEvent['bearingSource'] = 'gcc-phat') => makeEvent({ bearingDeg, bearingSource });

describe('sideOf (R5)', () => {
  it('confidence 0.79 is unknown, 0.8 gives a side', () => {
    expect(sideOf(at(40), 0.79)).toBe('unknown');
    expect(sideOf(at(-40), 0.79)).toBe('unknown');
    expect(sideOf(at(0), 0.79)).toBe('unknown');
    expect(sideOf(at(40), 0.799999)).toBe('unknown');
    expect(sideOf(at(40), 0.8)).toBe('right');
    expect(sideOf(at(-40), 0.8)).toBe('left');
    expect(sideOf(at(0), 0.8)).toBe('centre');
    expect(sideOf(at(40), 1)).toBe('right');
  });

  it('maps the centre zone edges: -15.01 left, -15 / 0 / 15 centre, 15.01 right', () => {
    expect(sideOf(at(-15.01), 1)).toBe('left');
    expect(sideOf(at(-15), 1)).toBe('centre');
    expect(sideOf(at(0), 1)).toBe('centre');
    expect(sideOf(at(15), 1)).toBe('centre');
    expect(sideOf(at(15.01), 1)).toBe('right');
  });

  it('negative is left and positive is right', () => {
    for (const d of [-180, -90, -45, -16]) expect(sideOf(at(d), 0.9)).toBe('left');
    for (const d of [16, 45, 90, 180]) expect(sideOf(at(d), 0.9)).toBe('right');
  });

  it("'loudness' and 'none' sources are unknown, even at confidence 1", () => {
    for (const d of [-60, 0, 60]) {
      expect(sideOf(at(d, 'loudness'), 1)).toBe('unknown');
      expect(sideOf(at(d, 'none'), 1)).toBe('unknown');
    }
    expect(sideOf(at(null, 'none'), 1)).toBe('unknown');
  });

  it('null or non-finite bearing, and bad confidence values, are unknown and do not throw', () => {
    expect(sideOf(at(null), 1)).toBe('unknown');
    expect(sideOf(at(NaN), 1)).toBe('unknown');
    expect(sideOf(at(Infinity), 1)).toBe('unknown');
    expect(sideOf(at(-Infinity), 1)).toBe('unknown');
    expect(sideOf(at(40), NaN)).toBe('unknown');
    expect(sideOf(at(40), -0.1)).toBe('unknown');
    expect(sideOf(at(40), 1.1)).toBe('unknown');
    expect(sideOf(at(40), Infinity)).toBe('unknown');
    expect(sideOf(at(40), '0.9' as unknown as number)).toBe('unknown');
    expect(sideOf(at(40), null as unknown as number)).toBe('unknown');
    expect(sideOf(at(40), undefined as unknown as number)).toBe('unknown');
    expect(sideOf(at('40' as unknown as number), 1)).toBe('unknown');
    expect(sideOf(makeEvent({ bearingSource: 'GCC-PHAT' as unknown as 'gcc-phat' }), 1)).toBe('unknown');
  });
});
