import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SETTINGS,
  MIN_DB_CEILING,
  MIN_DB_FLOOR,
  OUTPUT_CHOICES,
  SETTINGS_STORAGE_KEY,
  loadSettings,
  parseSettings,
  resolveSettings,
  saveSettings,
  serializeSettings,
  type StationSettings,
} from '../../src/station/settings';

const CLASSES = ['knock', 'doorbell', 'alarm', 'baby', 'vehicle', 'voice', 'other'] as const;
const on50 = () => ({ on: true, minDb: -50 });
const DEFAULTS: StationSettings = {
  sounds: { knock: on50(), doorbell: on50(), alarm: on50(), baby: on50(), vehicle: on50(), voice: on50(), other: on50() },
  output: 'phone',
};
/** The defaults with one class changed. */
const withClass = (cls: (typeof CLASSES)[number], value: { on: boolean; minDb: number }): StationSettings => ({ ...DEFAULTS, sounds: { ...DEFAULTS.sounds, [cls]: value } });

/** A storage double over a Map. */
function memoryStorage() {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
  };
}

describe('settings constants (R2.1, R2.2)', () => {
  it('has the key, the output choices and the range', () => {
    expect(SETTINGS_STORAGE_KEY).toBe('banshee-band.settings.v1');
    expect(OUTPUT_CHOICES).toEqual(['phone', 'simulator', 'band']);
    expect(MIN_DB_FLOOR).toBe(-80);
    expect(MIN_DB_CEILING).toBe(-10);
  });

  it('defaults to every class on at -50 dB and the phone, deeply frozen', () => {
    expect(DEFAULT_SETTINGS).toEqual(DEFAULTS);
    expect(Object.isFrozen(DEFAULT_SETTINGS)).toBe(true);
    expect(Object.isFrozen(DEFAULT_SETTINGS.sounds)).toBe(true);
    for (const c of CLASSES) expect(Object.isFrozen(DEFAULT_SETTINGS.sounds[c]), c).toBe(true);
  });
});

describe('resolveSettings (R2.3-R2.5)', () => {
  it('gives the defaults as a new object that shares nothing with DEFAULT_SETTINGS', () => {
    const a = resolveSettings(undefined);
    expect(a).toEqual(DEFAULTS);
    expect(a).not.toBe(DEFAULT_SETTINGS);
    expect(a.sounds).not.toBe(DEFAULT_SETTINGS.sounds);
    expect(a.sounds.knock).not.toBe(DEFAULT_SETTINGS.sounds.knock);
    a.sounds.knock.on = false;
    expect(resolveSettings(undefined)).toEqual(DEFAULTS);
  });

  it('keeps valid values, including both range edges and every output', () => {
    expect(resolveSettings(withClass('voice', { on: false, minDb: -80 }))).toEqual(withClass('voice', { on: false, minDb: -80 }));
    expect(resolveSettings(withClass('alarm', { on: true, minDb: -10 }))).toEqual(withClass('alarm', { on: true, minDb: -10 }));
    for (const output of ['phone', 'simulator', 'band'] as const) expect(resolveSettings({ ...DEFAULTS, output }).output).toBe(output);
  });

  it('rounds a valid level to a whole dB, after the range check', () => {
    expect(resolveSettings(withClass('knock', { on: true, minDb: -49.4 })).sounds.knock.minDb).toBe(-49);
    expect(resolveSettings(withClass('knock', { on: true, minDb: -49.6 })).sounds.knock.minDb).toBe(-50);
    expect(resolveSettings(withClass('knock', { on: true, minDb: -80.4 })).sounds.knock.minDb).toBe(-50);
    expect(resolveSettings(withClass('knock', { on: true, minDb: -9.9 })).sounds.knock.minDb).toBe(-50);
  });

  it('gives -50 for an out-of-range or non-number level', () => {
    for (const minDb of [-81, 0, -5, 3, '-30', Number.NaN, Infinity, -Infinity, null, true, {}, []]) {
      expect(resolveSettings({ sounds: { knock: { on: false, minDb } } }).sounds.knock, String(minDb)).toEqual({ on: false, minDb: -50 });
    }
  });

  it('gives on for a non-boolean switch', () => {
    for (const on of ['yes', 'false', 0, 1, null, {}]) {
      expect(resolveSettings({ sounds: { baby: { on, minDb: -30 } } }).sounds.baby, String(on)).toEqual({ on: true, minDb: -30 });
    }
  });

  it('gives phone for an unknown output', () => {
    for (const output of ['wristband', 'Phone', '', 1, null, ['phone']]) expect(resolveSettings({ output }).output, String(output)).toBe('phone');
  });

  it('falls back field by field: a bad value changes no neighbour', () => {
    const input = { sounds: { knock: { on: false, minDb: 'loud' }, doorbell: 'off', alarm: { on: 'no', minDb: -20 }, voice: { on: false, minDb: -70 } }, output: 'simulator' };
    expect(resolveSettings(input)).toEqual({
      sounds: { ...DEFAULTS.sounds, knock: { on: false, minDb: -50 }, alarm: { on: true, minDb: -20 }, voice: { on: false, minDb: -70 } },
      output: 'simulator',
    });
  });

  it('gives the defaults for junk', () => {
    for (const junk of [null, 42, 'x', true, [], [DEFAULTS], () => DEFAULTS, { sounds: [] }, { sounds: null }]) expect(resolveSettings(junk), String(junk)).toEqual(DEFAULTS);
  });

  it('ignores unknown keys, at both levels', () => {
    const out = resolveSettings({ ...withClass('knock', { on: false, minDb: -40 }), extra: 1, sounds: { ...withClass('knock', { on: false, minDb: -40 }).sounds, siren: { on: false, minDb: -20 } } });
    expect(out).toEqual(withClass('knock', { on: false, minDb: -40 }));
    expect(Object.keys(out)).toEqual(['sounds', 'output']);
    expect(Object.keys(out.sounds)).toEqual([...CLASSES]);
  });

  it('reads a throwing getter or proxy as missing', () => {
    const hostile = { get output(): string { throw new Error('no'); }, sounds: { get knock(): unknown { throw new Error('no'); }, voice: { on: false, get minDb(): number { throw new Error('no'); } } } };
    expect(resolveSettings(hostile)).toEqual({ sounds: { ...DEFAULTS.sounds, voice: { on: false, minDb: -50 } }, output: 'phone' });
    const proxy = new Proxy({}, { get() { throw new Error('trap'); }, has() { throw new Error('trap'); }, ownKeys() { throw new Error('trap'); } });
    expect(resolveSettings(proxy)).toEqual(DEFAULTS);
    expect(resolveSettings({ sounds: proxy })).toEqual(DEFAULTS);
  });
});

describe('parseSettings and serializeSettings (R2.6, R2.7)', () => {
  it('gives the defaults for null, non-JSON and the wrong shapes', () => {
    for (const text of [null, '', '{', '{not json', 'null', '[]', '42', '"phone"', 'true']) expect(parseSettings(text), String(text)).toEqual(DEFAULTS);
  });

  it('parses saved settings field by field', () => {
    expect(parseSettings('{"sounds":{"knock":{"on":false,"minDb":-40}},"output":"simulator"}')).toEqual({ ...withClass('knock', { on: false, minDb: -40 }), output: 'simulator' });
    expect(parseSettings('{"sounds":{"knock":{"on":"false","minDb":"-40"}},"output":7}')).toEqual(DEFAULTS);
  });

  it('round-trips through JSON, classes in order and then the output', () => {
    const s: StationSettings = { sounds: { ...DEFAULTS.sounds, knock: { on: false, minDb: -80 }, other: { on: true, minDb: -10 } }, output: 'simulator' };
    const text = serializeSettings(s);
    expect(JSON.parse(text)).toEqual(s);
    expect(Object.keys(JSON.parse(text).sounds)).toEqual([...CLASSES]);
    expect(parseSettings(text)).toEqual(s);
  });
});

describe('loadSettings and saveSettings (R3.1, R3.2)', () => {
  it('saves under the key and loads it back', () => {
    const storage = memoryStorage();
    const s = { ...withClass('baby', { on: false, minDb: -33 }), output: 'simulator' as const };
    expect(saveSettings(storage, s)).toBe(true);
    expect(storage.map.get('banshee-band.settings.v1')).toBe(serializeSettings(s));
    expect(loadSettings(storage)).toEqual(s);
  });

  it('loads the defaults from empty, corrupt, null or throwing storage', () => {
    expect(loadSettings(memoryStorage())).toEqual(DEFAULTS);
    const corrupt = memoryStorage();
    corrupt.map.set('banshee-band.settings.v1', '{not json');
    expect(loadSettings(corrupt)).toEqual(DEFAULTS);
    expect(loadSettings(null)).toEqual(DEFAULTS);
    expect(loadSettings({ getItem: () => { throw new DOMException('denied', 'SecurityError'); }, setItem: () => undefined })).toEqual(DEFAULTS);
  });

  it('returns false for null or throwing storage, and never throws', () => {
    expect(saveSettings(null, DEFAULTS)).toBe(false);
    expect(saveSettings({ getItem: () => null, setItem: () => { throw new DOMException('full', 'QuotaExceededError'); } }, DEFAULTS)).toBe(false);
  });
});
