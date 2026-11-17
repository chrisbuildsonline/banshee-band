import { describe, expect, it } from 'vitest';
import { classLabel, patternName, percentOf, pulseCount, sideText } from '../../src/band/labels';
import { ALARM_CENTRE_HIGH, KNOCK_LEFT_HIGH, engineCommand } from './helpers/commands';

describe('sideText (R5.2)', () => {
  it('gives the exact words for each side', () => {
    expect(sideText('left')).toBe('left stronger');
    expect(sideText('right')).toBe('right stronger');
    expect(sideText('centre')).toBe('both motors, centre');
    expect(sideText('unknown')).toBe('Side unknown, both motors equal');
  });
});

describe('classLabel (R5.3)', () => {
  it('capitalises each class name', () => {
    expect(classLabel('knock')).toBe('Knock');
    expect(classLabel('doorbell')).toBe('Doorbell');
    expect(classLabel('alarm')).toBe('Alarm');
    expect(classLabel('baby')).toBe('Baby');
    expect(classLabel('vehicle')).toBe('Vehicle');
    expect(classLabel('voice')).toBe('Voice');
  });
});

describe('percentOf (R4.3)', () => {
  it('rounds level times 100 to the nearest integer', () => {
    expect(percentOf(0)).toBe(0);
    expect(percentOf(0.3)).toBe(30);
    expect(percentOf(0.15)).toBe(15);
    expect(percentOf(0.5)).toBe(50);
    expect(percentOf(0.75)).toBe(75);
    expect(percentOf(1)).toBe(100);
    expect(percentOf(0.005)).toBe(1);
    expect(percentOf(0.225)).toBe(23);
  });

  it('guards the display: NaN gives 0, and values outside [0, 1] are clamped', () => {
    expect(percentOf(NaN)).toBe(0);
    expect(percentOf(-0.2)).toBe(0);
    expect(percentOf(1.4)).toBe(100);
    expect(percentOf(Infinity)).toBe(100);
    expect(percentOf(-Infinity)).toBe(0);
  });
});

describe('patternName (R5.1, R6.1)', () => {
  it('names a knock from the left', () => {
    expect(patternName(KNOCK_LEFT_HIGH)).toBe('Knock, left stronger');
  });

  it('names the other known sides with a comma', () => {
    expect(patternName({ class: 'alarm', side: 'centre' })).toBe('Alarm, both motors, centre');
    expect(patternName({ class: 'voice', side: 'right' })).toBe('Voice, right stronger');
  });

  it('uses the sentence form for an unknown side', () => {
    expect(patternName({ class: 'knock', side: 'unknown' })).toBe('Knock. Side unknown, both motors equal');
  });
});

describe('pulseCount (R5.6)', () => {
  it('counts the knock as 2 and the alarm as 12', () => {
    expect(pulseCount(KNOCK_LEFT_HIGH.segments)).toBe(2);
    expect(pulseCount(ALARM_CENTRE_HIGH.segments)).toBe(12);
  });

  it('counts the segments at even index when every level is 0', () => {
    expect(pulseCount(engineCommand('knock', 'left', 'high', 0).segments)).toBe(2);
    expect(pulseCount(engineCommand('alarm', 'centre', 'high', 0).segments)).toBe(12);
    expect(pulseCount(engineCommand('baby', 'right', 'high', 0).segments)).toBe(4);
    expect(pulseCount(engineCommand('voice', 'unknown', 'low', 0).segments)).toBe(1);
  });

  it('counts a pulse when only one motor is on', () => {
    expect(
      pulseCount([
        { ms: 70, left: 0, right: 0.2 },
        { ms: 100, left: 0, right: 0 },
        { ms: 70, left: 0.4, right: 0 },
      ]),
    ).toBe(2);
  });

  it('is 0 for no segments', () => {
    expect(pulseCount([])).toBe(0);
  });
});
