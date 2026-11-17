import { describe, expect, it } from 'vitest';
import { DEFAULT_HAPTIC_SETTINGS, resolveHapticSettings } from '../../src/haptics/settings';

const ALL_ON = { knock: true, doorbell: true, alarm: true, baby: true, vehicle: true, voice: true };
const DEFAULTS = { enabledClasses: ALL_ON, minLoudnessDb: -50, intensity: 1, rateLimitMs: 3000 };
const GOOD = { minLoudnessDb: -30, intensity: 0.5, rateLimitMs: 1000 };

describe('DEFAULT_HAPTIC_SETTINGS (R10.2)', () => {
  it('has all six classes on, -50 dB, intensity 1 and 3000 ms', () => {
    expect(DEFAULT_HAPTIC_SETTINGS).toEqual(DEFAULTS);
  });

  it('is frozen, including enabledClasses', () => {
    expect(Object.isFrozen(DEFAULT_HAPTIC_SETTINGS)).toBe(true);
    expect(Object.isFrozen(DEFAULT_HAPTIC_SETTINGS.enabledClasses)).toBe(true);
  });
});

describe('resolveHapticSettings (R10.3-R10.5)', () => {
  it('returns the defaults for a missing input, as a new object each time', () => {
    const a = resolveHapticSettings(undefined);
    const b = resolveHapticSettings(undefined);
    expect(a).toEqual(DEFAULTS);
    expect(a).not.toBe(b);
    expect(a).not.toBe(DEFAULT_HAPTIC_SETTINGS);
    expect(a.enabledClasses).not.toBe(b.enabledClasses);
    expect(a.enabledClasses).not.toBe(DEFAULT_HAPTIC_SETTINGS.enabledClasses);
    a.enabledClasses.knock = false;
    a.intensity = 0;
    expect(resolveHapticSettings(undefined)).toEqual(DEFAULTS);
    expect(DEFAULT_HAPTIC_SETTINGS).toEqual(DEFAULTS);
  });

  it('keeps valid values, including the edges', () => {
    expect(resolveHapticSettings(GOOD)).toEqual({ ...DEFAULTS, ...GOOD });
    expect(resolveHapticSettings({ minLoudnessDb: 0, intensity: 0, rateLimitMs: 0 })).toEqual({ ...DEFAULTS, minLoudnessDb: 0, intensity: 0, rateLimitMs: 0 });
    expect(resolveHapticSettings({ minLoudnessDb: -120, intensity: 1, rateLimitMs: 60000 })).toEqual({ ...DEFAULTS, minLoudnessDb: -120, rateLimitMs: 60000 });
  });

  it('falls back field by field: a bad value changes no other field', () => {
    const junk: unknown[] = [NaN, Infinity, -Infinity, '5', '-30', null, true, {}, [], undefined];
    for (const bad of junk) {
      expect(resolveHapticSettings({ ...GOOD, minLoudnessDb: bad }), `minLoudnessDb ${String(bad)}`).toEqual({ ...DEFAULTS, ...GOOD, minLoudnessDb: -50 });
      expect(resolveHapticSettings({ ...GOOD, intensity: bad }), `intensity ${String(bad)}`).toEqual({ ...DEFAULTS, ...GOOD, intensity: 1 });
      expect(resolveHapticSettings({ ...GOOD, rateLimitMs: bad }), `rateLimitMs ${String(bad)}`).toEqual({ ...DEFAULTS, ...GOOD, rateLimitMs: 3000 });
    }
  });

  it('rejects out-of-range numbers: intensity -1, -0.01, 1.01 and 2; minLoudnessDb 5 and 0.01; rateLimitMs -1', () => {
    for (const v of [-1, -0.01, 1.01, 2]) expect(resolveHapticSettings({ ...GOOD, intensity: v }).intensity).toBe(1);
    for (const v of [5, 0.01]) expect(resolveHapticSettings({ ...GOOD, minLoudnessDb: v }).minLoudnessDb).toBe(-50);
    expect(resolveHapticSettings({ ...GOOD, rateLimitMs: -1 }).rateLimitMs).toBe(3000);
    expect(resolveHapticSettings({ ...GOOD, rateLimitMs: -1 }).intensity).toBe(0.5);
  });

  it('takes boolean class switches, falls back to true for anything else, and ignores unknown keys', () => {
    const s = resolveHapticSettings({
      enabledClasses: { knock: false, doorbell: 'yes', alarm: 1, baby: null, vehicle: 0, voice: false, other: false, siren: false },
    });
    expect(s.enabledClasses).toEqual({ knock: false, doorbell: true, alarm: true, baby: true, vehicle: true, voice: false });
    expect(Object.keys(s.enabledClasses).sort()).toEqual(['alarm', 'baby', 'doorbell', 'knock', 'vehicle', 'voice']);
    expect(resolveHapticSettings({ enabledClasses: { alarm: false } }).enabledClasses).toEqual({ ...ALL_ON, alarm: false });
  });

  it('a bad enabledClasses leaves all classes on and the other fields as given', () => {
    for (const bad of ['all', 42, null, [false, false], true]) {
      expect(resolveHapticSettings({ ...GOOD, enabledClasses: bad })).toEqual({ ...DEFAULTS, ...GOOD });
    }
  });

  it('gives the defaults and does not throw for junk input', () => {
    const throwing = Object.defineProperty({}, 'intensity', {
      get() {
        throw new Error('boom');
      },
      enumerable: true,
    });
    const hostile = new Proxy({}, {
      get() {
        throw new Error('boom');
      },
      has() {
        throw new Error('boom');
      },
      ownKeys() {
        throw new Error('boom');
      },
    });
    for (const junk of [undefined, null, 'junk', '', 42, NaN, true, [], [1, 2], () => 1, Symbol('x'), throwing, hostile]) {
      let s: ReturnType<typeof resolveHapticSettings> | undefined;
      expect(() => (s = resolveHapticSettings(junk)), String(typeof junk)).not.toThrow();
      expect(s).toEqual(DEFAULTS);
    }
  });

  it('a throwing getter only resets its own field', () => {
    const input = { ...GOOD, enabledClasses: { knock: false } };
    Object.defineProperty(input, 'intensity', {
      get() {
        throw new Error('boom');
      },
    });
    Object.defineProperty(input.enabledClasses, 'voice', {
      get() {
        throw new Error('boom');
      },
    });
    expect(resolveHapticSettings(input)).toEqual({ ...DEFAULTS, ...GOOD, intensity: 1, enabledClasses: { ...ALL_ON, knock: false } });
  });

  it('copies: changing the input later does not change the result', () => {
    const input = { ...GOOD, enabledClasses: { knock: false } };
    const s = resolveHapticSettings(input);
    input.intensity = 0;
    input.enabledClasses.knock = true;
    expect(s.intensity).toBe(0.5);
    expect(s.enabledClasses.knock).toBe(false);
  });
});
