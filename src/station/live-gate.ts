import type { SoundClass } from '../events';

/** After a live event of a class, no event of the same class for this long (ms of the injected clock). */
export const LIVE_COOLDOWN_MS = 3000;

/** Which live windows become events. */
export interface LiveGate {
  /** True when `cls` is not `other` and has not been accepted in the last `cooldownMs`; then remembers `nowMs`. */
  accept(cls: SoundClass, nowMs: number): boolean;
}

/**
 * The live gate: `other` never passes and starts no cooldown; each other class passes at most once per
 * `cooldownMs` (default 3000), classes do not block each other, and a negative or `NaN` time never passes. Pure.
 */
export function createLiveGate(options: { cooldownMs?: number } = {}): LiveGate {
  const cooldown = options.cooldownMs ?? LIVE_COOLDOWN_MS;
  const last = new Map<SoundClass, number>();
  return {
    accept(cls, nowMs) {
      if (cls === 'other' || !(nowMs >= 0)) return false;
      const prev = last.get(cls);
      if (prev !== undefined && !(nowMs - prev >= cooldown)) return false;
      last.set(cls, nowMs);
      return true;
    },
  };
}
