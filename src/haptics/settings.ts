import { DEFAULT_MIN_LOUDNESS_DB, PATTERN_CLASSES, RATE_LIMIT_MS } from './constants';
import type { HapticClass, HapticSettings } from './types';

const allOn = (): Record<HapticClass, boolean> =>
  Object.fromEntries(PATTERN_CLASSES.map((c) => [c, true])) as Record<HapticClass, boolean>;

/** The default settings: all six classes on, `minLoudnessDb` -50, `intensity` 1, `rateLimitMs` 3000. Frozen. */
export const DEFAULT_HAPTIC_SETTINGS: Readonly<HapticSettings> = Object.freeze({
  enabledClasses: Object.freeze(allOn()),
  minLoudnessDb: DEFAULT_MIN_LOUDNESS_DB,
  intensity: 1,
  rateLimitMs: RATE_LIMIT_MS,
});

type Obj = Record<string, unknown>;

/** `input` itself when it is a plain (non-null, non-array) object, else null. */
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

const isNumber = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);

/**
 * Complete, valid settings from any input, as a new object. Each field that is missing or not valid
 * (`minLoudnessDb` finite and <= 0, `intensity` finite in [0, 1], `rateLimitMs` finite and >= 0, each
 * class switch a boolean) takes its default alone. Keys of `enabledClasses` that are not pattern
 * classes are ignored. Never throws.
 */
export function resolveHapticSettings(input: unknown): HapticSettings {
  const d = DEFAULT_HAPTIC_SETTINGS;
  const obj = asObject(input);
  const minLoudnessDb = read(obj, 'minLoudnessDb');
  const intensity = read(obj, 'intensity');
  const rateLimitMs = read(obj, 'rateLimitMs');
  const classes = asObject(read(obj, 'enabledClasses'));
  const enabledClasses = allOn();
  for (const c of PATTERN_CLASSES) {
    const v = read(classes, c);
    enabledClasses[c] = typeof v === 'boolean' ? v : d.enabledClasses[c];
  }
  return {
    enabledClasses,
    minLoudnessDb: isNumber(minLoudnessDb) && minLoudnessDb <= 0 ? minLoudnessDb : d.minLoudnessDb,
    intensity: isNumber(intensity) && intensity >= 0 && intensity <= 1 ? intensity : d.intensity,
    rateLimitMs: isNumber(rateLimitMs) && rateLimitMs >= 0 ? rateLimitMs : d.rateLimitMs,
  };
}
