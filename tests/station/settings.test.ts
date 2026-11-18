import { describe, expect, it } from 'vitest';
import type { Decision, DropReason } from '../../src/haptics';
import {
  DEFAULT_SETTINGS,
  MIN_DB_CEILING,
  MIN_DB_FLOOR,
  OUTPUT_CHOICES,
  SETTINGS_STORAGE_KEY,
  createSettingsEngine,
  effectiveOutput,
  isMuted,
  loadSettings,
  outputsFor,
  parseSettings,
  resolveSettings,
  saveSettings,
  serializeSettings,
  settingsVerdict,
  type OutputChoice,
  type StationSettings,
} from '../../src/station/settings';
import { makeInput } from '../haptics/helpers/events';

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

describe('settingsVerdict (R4.1)', () => {
  it('alerts at the level, is too quiet one dB below, and off wins', () => {
    const s = withClass('knock', { on: true, minDb: -40 });
    expect(settingsVerdict(s, { class: 'knock', loudnessDb: -40 })).toBe('alert');
    expect(settingsVerdict(s, { class: 'knock', loudnessDb: -12 })).toBe('alert');
    expect(settingsVerdict(s, { class: 'knock', loudnessDb: -41 })).toBe('too-quiet');
    expect(settingsVerdict(withClass('knock', { on: false, minDb: -40 }), { class: 'knock', loudnessDb: -60 })).toBe('off');
    expect(settingsVerdict(withClass('knock', { on: false, minDb: -40 }), { class: 'knock', loudnessDb: 0 })).toBe('off');
  });

  it('reads each class alone, all seven', () => {
    for (const cls of CLASSES) {
      const s = withClass(cls, { on: false, minDb: -50 });
      for (const other of CLASSES) expect(settingsVerdict(s, { class: other, loudnessDb: -20 }), `${cls} off, ${other}`).toBe(other === cls ? 'off' : 'alert');
    }
  });
});

describe('createSettingsEngine (R4.2, R4.3)', () => {
  const play = (d: Decision) => d.action === 'play';

  it('plays what the settings allow, as the haptic engine does', () => {
    const e = createSettingsEngine(resolveSettings(undefined), { rateLimitMs: 0 });
    const d = e.decide(makeInput({ class: 'knock', loudnessDb: -45 }), 0);
    expect(d.action).toBe('play');
    if (d.action === 'play') expect(d.command.class).toBe('knock');
  });

  it('drops a switched-off class and a too-quiet sound without touching the inner engine', () => {
    const base = withClass('knock', { on: false, minDb: -50 });
    const e = createSettingsEngine({ ...base, sounds: { ...base.sounds, alarm: { on: true, minDb: -20 } } });
    expect(e.decide(makeInput({ class: 'knock', loudnessDb: -10 }), 0)).toEqual({ action: 'drop', reason: 'disabled-class' });
    expect(e.decide(makeInput({ class: 'alarm', loudnessDb: -21 }), 0)).toEqual({ action: 'drop', reason: 'too-quiet' });
    // The inner engine saw neither: an alarm at the same moment still plays (no rate limit, nothing playing).
    expect(play(e.decide(makeInput({ class: 'alarm', loudnessDb: -20 }), 0))).toBe(true);
  });

  it('gives the inner engine the lowest level, so a quiet sound the settings allow still buzzes', () => {
    const e = createSettingsEngine(withClass('voice', { on: true, minDb: -75 }), { rateLimitMs: 0 });
    expect(play(e.decide(makeInput({ class: 'voice', urgency: 'low', loudnessDb: -70 }), 0))).toBe(true);
    // Another class keeps its own -50 level.
    expect(e.decide(makeInput({ class: 'knock', loudnessDb: -70 }), 10_000)).toEqual({ action: 'drop', reason: 'too-quiet' });
  });

  it('keeps the inner rate limit: 3000 ms by default, none with rateLimitMs 0', () => {
    const live = createSettingsEngine(resolveSettings(undefined));
    expect(play(live.decide(makeInput({ class: 'knock' }), 0))).toBe(true);
    expect(live.decide(makeInput({ class: 'knock' }), 2999)).toEqual({ action: 'drop', reason: 'rate-limited' });
    expect(play(live.decide(makeInput({ class: 'knock' }), 3000))).toBe(true);
    const tryEngine = createSettingsEngine(resolveSettings(undefined), { rateLimitMs: 0 });
    expect(play(tryEngine.decide(makeInput({ class: 'knock' }), 0))).toBe(true);
    expect(play(tryEngine.decide(makeInput({ class: 'knock' }), 5000))).toBe(true);
  });

  it('drops other as off, too quiet, or as having no pattern', () => {
    expect(createSettingsEngine(withClass('other', { on: false, minDb: -50 })).decide(makeInput({ class: 'other' }), 0)).toEqual({ action: 'drop', reason: 'disabled-class' });
    expect(createSettingsEngine(withClass('other', { on: true, minDb: -10 })).decide(makeInput({ class: 'other', loudnessDb: -20 }), 0)).toEqual({ action: 'drop', reason: 'too-quiet' });
    expect(createSettingsEngine(resolveSettings(undefined)).decide(makeInput({ class: 'other' }), 0)).toEqual({ action: 'drop', reason: 'no-pattern' });
  });

  it('throws RangeError for a non-finite time first, even for a switched-off class', () => {
    const e = createSettingsEngine(withClass('knock', { on: false, minDb: -50 }));
    for (const t of [Number.NaN, Infinity, -Infinity]) expect(() => e.decide(makeInput({ class: 'knock' }), t), String(t)).toThrow(RangeError);
  });

  it('reads the settings once: a later change of the passed object has no effect', () => {
    const s = resolveSettings(undefined);
    const e = createSettingsEngine(s, { rateLimitMs: 0 });
    s.sounds.knock.on = false;
    expect(play(e.decide(makeInput({ class: 'knock' }), 0))).toBe(true);
  });
});

describe('isMuted (R4.4)', () => {
  it('is true exactly for disabled-class and too-quiet', () => {
    const reasons: DropReason[] = ['disabled-class', 'no-pattern', 'too-quiet', 'rate-limited', 'lower-priority'];
    expect(reasons.filter((reason) => isMuted({ action: 'drop', reason }))).toEqual(['disabled-class', 'too-quiet']);
    const d = createSettingsEngine(resolveSettings(undefined)).decide(makeInput(), 0);
    expect(d.action).toBe('play');
    expect(isMuted(d)).toBe(false);
  });
});

describe('effectiveOutput and outputsFor (R5.1, R5.2)', () => {
  it('keeps an available choice and falls back to the simulator', () => {
    const table: [OutputChoice, boolean, boolean, OutputChoice][] = [
      ['phone', true, false, 'phone'], ['phone', false, false, 'simulator'], ['phone', true, true, 'phone'],
      ['simulator', true, true, 'simulator'], ['simulator', false, false, 'simulator'], ['simulator', true, false, 'simulator'],
      ['band', true, false, 'simulator'], ['band', false, false, 'simulator'], ['band', false, true, 'band'],
    ];
    for (const [choice, phone, band, want] of table) expect(effectiveOutput(choice, { phone, band }), `${choice} ${phone} ${band}`).toBe(want);
  });

  it('always gives the simulator first, and the phone only for phone', () => {
    const simulator = { kind: 'simulator' as const, available: () => true, play: () => undefined, stop: () => undefined };
    const phone = { ...simulator, kind: 'phone' as const };
    expect(outputsFor('phone', { simulator, phone })).toEqual([simulator, phone]);
    expect(outputsFor('simulator', { simulator, phone })).toEqual([simulator]);
    expect(outputsFor('band', { simulator, phone })).toEqual([simulator]);
    expect(outputsFor('phone', { simulator, phone })).not.toBe(outputsFor('phone', { simulator, phone }));
  });

  it('gives the simulator and the band for band, so the screen mirrors the wristband', () => {
    const simulator = { kind: 'simulator' as const, available: () => true, play: () => undefined, stop: () => undefined };
    const phone = { ...simulator, kind: 'phone' as const };
    const band = { ...simulator, kind: 'band' as const };
    expect(outputsFor('band', { simulator, phone, band })).toEqual([simulator, band]);
    expect(outputsFor('phone', { simulator, phone, band })).toEqual([simulator, phone]);
    expect(outputsFor('simulator', { simulator, phone, band })).toEqual([simulator]);
  });
});
