import { describe, expect, it } from 'vitest';
import { BAND_OFF, OUTPUT_OPTIONS, PHONE_OFF, shownOutput } from '../../src/station/output-options';
import type { OutputChoice } from '../../src/station/settings';

describe('shownOutput (onboarding R4.2)', () => {
  const cases: [OutputChoice, boolean, boolean, OutputChoice][] = [
    // choice, phone can vibrate, Web Bluetooth, shown
    ['phone', true, true, 'phone'],
    ['phone', true, false, 'phone'],
    ['phone', false, true, 'simulator'],
    ['phone', false, false, 'simulator'],
    ['simulator', true, true, 'simulator'],
    ['simulator', true, false, 'simulator'],
    ['simulator', false, true, 'simulator'],
    ['simulator', false, false, 'simulator'],
    // A chosen Wristband stays shown where Bluetooth exists, even with no band connected.
    ['band', true, true, 'band'],
    ['band', false, true, 'band'],
    ['band', true, false, 'simulator'],
    ['band', false, false, 'simulator'],
  ];

  it.each(cases)('%s with phone %s and Bluetooth %s shows %s', (choice, phone, band, shown) => {
    expect(shownOutput(choice, phone, band)).toBe(shown);
  });
});

describe('the shared option words (onboarding R4.1)', () => {
  it('keep the Settings sheet words', () => {
    expect(OUTPUT_OPTIONS.map((o) => [o.value, o.name])).toEqual([
      ['phone', 'Phone vibration'],
      ['simulator', 'Screen only'],
      ['band', 'Wristband'],
    ]);
    expect(PHONE_OFF).toBe('This browser cannot vibrate.');
    expect(BAND_OFF).toBe('This browser has no Bluetooth. Use Chrome or Edge to connect the band.');
  });
});
