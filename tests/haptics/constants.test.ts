import { describe, expect, it } from 'vitest';
import { SOUND_CLASSES } from '../../src/events';
import * as haptics from '../../src/haptics';
import {
  CENTRE_DEG,
  CLASS_WEIGHT,
  DEFAULT_MIN_LOUDNESS_DB,
  DISTINCT_TIMING_MS,
  MAX_PATTERN_MS,
  MAX_TOTAL_MS,
  MIN_GAP_MS,
  MIN_PULSE_MS,
  MIN_REPEAT_PAUSE_MS,
  OTHER_MOTOR_FACTOR,
  PATTERN_CLASSES,
  RATE_LIMIT_MS,
  UNCERTAIN_CONFIDENCE,
  URGENCY_BASE_LEVEL,
  URGENCY_RANK,
} from '../../src/haptics/constants';

describe('haptics constants (R2)', () => {
  it('has the nine limits of R2.1', () => {
    expect(MIN_PULSE_MS).toBe(40);
    expect(MIN_GAP_MS).toBe(80);
    expect(MAX_PATTERN_MS).toBe(1500);
    expect(MAX_TOTAL_MS).toBe(4000);
    expect(MIN_REPEAT_PAUSE_MS).toBe(300);
    expect(DISTINCT_TIMING_MS).toBe(150);
    expect(UNCERTAIN_CONFIDENCE).toBe(0.8);
    expect(CENTRE_DEG).toBe(15);
    expect(RATE_LIMIT_MS).toBe(3000);
  });

  it('has the levels, ranks, weights and loudness default of R2.2', () => {
    expect(OTHER_MOTOR_FACTOR).toBe(0.3);
    expect(DEFAULT_MIN_LOUDNESS_DB).toBe(-50);
    expect(URGENCY_BASE_LEVEL).toEqual({ low: 0.5, medium: 0.75, high: 1 });
    expect(URGENCY_RANK).toEqual({ low: 1, medium: 2, high: 3 });
    expect(CLASS_WEIGHT).toEqual({ alarm: 6, baby: 5, vehicle: 4, doorbell: 3, knock: 2, voice: 1 });
  });

  it('PATTERN_CLASSES plus other is SOUND_CLASSES', () => {
    expect(PATTERN_CLASSES).toEqual(['knock', 'doorbell', 'alarm', 'baby', 'vehicle', 'voice']);
    expect(new Set([...PATTERN_CLASSES, 'other'])).toEqual(new Set(SOUND_CLASSES));
    expect(PATTERN_CLASSES).toHaveLength(SOUND_CLASSES.length - 1);
  });

  it('exports the constants from index.ts', () => {
    expect(haptics.MIN_GAP_MS).toBe(80);
    expect(haptics.PATTERN_CLASSES).toBe(PATTERN_CLASSES);
  });

  it('exports the public API from index.ts (R1.1)', () => {
    for (const name of [
      'createHapticEngine',
      'sideOf',
      'priorityOf',
      'buildCommand',
      'validatePatternData',
      'loadPatterns',
      'checkDistinctiveness',
      'patternDistance',
      'resolveHapticSettings',
    ] as const) {
      expect(typeof haptics[name], name).toBe('function');
    }
    expect(Object.isFrozen(haptics.DEFAULT_HAPTIC_SETTINGS)).toBe(true);
  });
});
