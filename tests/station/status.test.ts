import { describe, expect, it } from 'vitest';
import { STATION_PILLS, pillFor } from '../../src/station/status';

describe('station status pill looks (band-ble-protocol R6.6)', () => {
  it('has a filled dot in the accent tint for Band connected', () => {
    expect(STATION_PILLS['band-on']).toMatchObject({ text: 'Band connected', tint: 'accent', glyph: 'dot', line: false });
    expect(STATION_PILLS['band-off']).toMatchObject({ text: 'Band not connected', tint: 'neutral', glyph: 'circle' });
    expect(STATION_PILLS.fallback).toMatchObject({ text: 'Phone vibration fallback', glyph: 'triangle' });
  });

  it('follows the effective output', () => {
    expect(pillFor('band')).toBe('band-on');
    expect(pillFor('phone')).toBe('fallback');
    expect(pillFor('simulator')).toBe('band-off');
  });
});
