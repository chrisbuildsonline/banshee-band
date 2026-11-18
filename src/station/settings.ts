import type { HapticOutput } from '../band';
import { SOUND_CLASSES, type SoundClass, type SoundEvent } from '../events';
import { createHapticEngine, DEFAULT_MIN_LOUDNESS_DB, PATTERN_CLASSES, type Decision, type HapticEngine } from '../haptics';

/** The one `localStorage` key the page writes: the settings JSON. */
export const SETTINGS_STORAGE_KEY = 'banshee-band.settings.v1';

/** Where the buzz goes: the phone's motor, the on-screen band simulator only, or the wristband (from F11). */
export const OUTPUT_CHOICES = ['phone', 'simulator', 'band'] as const;

/** One of `OUTPUT_CHOICES`. */
export type OutputChoice = (typeof OUTPUT_CHOICES)[number];

/** The quietest level a class can be set to, dBFS. */
export const MIN_DB_FLOOR = -80;

/** The loudest level a class can be set to, dBFS. */
export const MIN_DB_CEILING = -10;

/** The switch and the level of one sound class. */
export interface ClassSetting {
  on: boolean;
  /** The quietest loudness (dBFS) that alerts: a whole dB from -80 to -10. */
  minDb: number;
}

/** Everything the user can set on the station. */
export interface StationSettings {
  sounds: Record<SoundClass, ClassSetting>;
  output: OutputChoice;
}

/** The part of `Storage` the settings use; injected so this file stays pure. */
export type SettingsStorage = Pick<Storage, 'getItem' | 'setItem'>;

const defaultClass = (): ClassSetting => ({ on: true, minDb: DEFAULT_MIN_LOUDNESS_DB });

/** Every class on at -50 dB, output `phone`. Deeply frozen. */
export const DEFAULT_SETTINGS: Readonly<StationSettings> = Object.freeze({
  sounds: Object.freeze(Object.fromEntries(SOUND_CLASSES.map((c) => [c, Object.freeze(defaultClass())])) as Record<SoundClass, ClassSetting>),
  output: 'phone',
});

type Obj = Record<string, unknown>;

/** `input` when it is a plain (non-null, non-array) object, else null. */
const asObject = (input: unknown): Obj | null => (typeof input === 'object' && input !== null && !Array.isArray(input) ? (input as Obj) : null);

/** Reads `obj[key]`; undefined when reading throws (a hostile getter or proxy). */
function read(obj: Obj | null, key: string): unknown {
  if (obj === null) return undefined;
  try {
    return obj[key];
  } catch {
    return undefined;
  }
}

const isLevel = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= MIN_DB_FLOOR && v <= MIN_DB_CEILING;
const isOutput = (v: unknown): v is OutputChoice => typeof v === 'string' && (OUTPUT_CHOICES as readonly string[]).includes(v);

/**
 * Complete, valid settings from any input, as a new object. Each field that is missing or not valid takes its
 * default alone: `on` must be a boolean, `minDb` a finite number from -80 to -10 (then rounded to a whole dB),
 * `output` one of `OUTPUT_CHOICES`. Unknown keys are ignored; a throwing getter reads as missing. Never throws.
 */
export function resolveSettings(input: unknown): StationSettings {
  const obj = asObject(input);
  const sounds = asObject(read(obj, 'sounds'));
  const out = {} as Record<SoundClass, ClassSetting>;
  for (const c of SOUND_CLASSES) {
    const entry = asObject(read(sounds, c));
    const on = read(entry, 'on');
    const minDb = read(entry, 'minDb');
    const d = DEFAULT_SETTINGS.sounds[c];
    out[c] = { on: typeof on === 'boolean' ? on : d.on, minDb: isLevel(minDb) ? Math.round(minDb) : d.minDb };
  }
  const output = read(obj, 'output');
  return { sounds: out, output: isOutput(output) ? output : DEFAULT_SETTINGS.output };
}

/** Settings from saved text: `null`, text that is not JSON and JSON of the wrong shape give defaults, per field. Never throws. */
export function parseSettings(text: string | null): StationSettings {
  if (text === null) return resolveSettings(undefined);
  try {
    return resolveSettings(JSON.parse(text));
  } catch {
    return resolveSettings(undefined);
  }
}

/** The settings as JSON text: the classes in `SOUND_CLASSES` order, then the output. */
export function serializeSettings(s: StationSettings): string {
  return JSON.stringify(resolveSettings(s));
}

/** The saved settings, or the defaults when `storage` is null, empty, corrupt or throws. Never throws. */
export function loadSettings(storage: SettingsStorage | null): StationSettings {
  if (storage === null) return resolveSettings(undefined);
  try {
    return parseSettings(storage.getItem(SETTINGS_STORAGE_KEY));
  } catch {
    return resolveSettings(undefined);
  }
}

/** Saves the settings; false when `storage` is null or `setItem` throws (private mode, quota). Never throws. */
export function saveSettings(storage: SettingsStorage | null, s: StationSettings): boolean {
  if (storage === null) return false;
  try {
    storage.setItem(SETTINGS_STORAGE_KEY, serializeSettings(s));
    return true;
  } catch {
    return false;
  }
}

/** What the settings say about one event: alert, its class is off, or it is under its class level. */
export type Verdict = 'alert' | 'off' | 'too-quiet';

/** `'off'` when the class is off, else `'too-quiet'` below the class level, else `'alert'` (equal to the level alerts). */
export function settingsVerdict(s: StationSettings, event: Pick<SoundEvent, 'class' | 'loudnessDb'>): Verdict {
  const c = s.sounds[event.class];
  if (!c.on) return 'off';
  return event.loudnessDb < c.minDb ? 'too-quiet' : 'alert';
}

/**
 * A haptic engine that obeys the settings. It wraps `createHapticEngine`, which reads its settings once, so a
 * change of settings needs a new engine. The settings are copied here too. `decide` throws `RangeError` for a
 * non-finite `nowMs` first, then drops a switched-off class (`disabled-class`) or a sound under its class level
 * (`too-quiet`) without calling the inner engine, so its state does not change; anything else goes to the inner
 * engine, which has every pattern class on, the lowest class level and `options.rateLimitMs` (default 3000).
 */
export function createSettingsEngine(s: StationSettings, options: { rateLimitMs?: number } = {}): HapticEngine {
  const settings = resolveSettings(s);
  const inner = createHapticEngine({
    enabledClasses: Object.fromEntries(PATTERN_CLASSES.map((c) => [c, true])),
    minLoudnessDb: Math.min(...SOUND_CLASSES.map((c) => settings.sounds[c].minDb)),
    rateLimitMs: options.rateLimitMs,
  });
  return {
    decide(input, nowMs) {
      if (typeof nowMs !== 'number' || !Number.isFinite(nowMs)) throw new RangeError(`nowMs must be a finite number, got ${String(nowMs)}`);
      const verdict = settingsVerdict(settings, input.event);
      if (verdict === 'off') return { action: 'drop', reason: 'disabled-class' };
      if (verdict === 'too-quiet') return { action: 'drop', reason: 'too-quiet' };
      return inner.decide(input, nowMs);
    },
  };
}

/** True exactly when the settings stopped the event: a drop for `disabled-class` or `too-quiet`. Such a run shows no alert. */
export function isMuted(decision: Decision): boolean {
  return decision.action === 'drop' && (decision.reason === 'disabled-class' || decision.reason === 'too-quiet');
}

/** The output in use: the choice when this device has it, else `simulator` (always there). */
export function effectiveOutput(choice: OutputChoice, available: { phone: boolean; band: boolean }): OutputChoice {
  return choice === 'simulator' || available[choice] ? choice : 'simulator';
}

/**
 * The outputs to play on, as a new array: the simulator first, always (it mirrors the pattern on screen), then the
 * phone when the effective output is `phone`. `band` adds nothing until the Bluetooth link exists.
 */
export function outputsFor(effective: OutputChoice, outputs: { simulator: HapticOutput; phone: HapticOutput }): HapticOutput[] {
  return effective === 'phone' ? [outputs.simulator, outputs.phone] : [outputs.simulator];
}
