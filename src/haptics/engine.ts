import { buildCommand } from './command';
import { loadPatterns } from './patterns';
import { priorityOf } from './priority';
import { resolveHapticSettings } from './settings';
import { sideOf } from './side';
import type { Decision, DropReason, HapticClass, HapticEngine, Pattern } from './types';

const drop = (reason: DropReason): Decision => ({ action: 'drop', reason });

/**
 * Creates a haptic engine. Settings are resolved with `resolveHapticSettings` and read once, so junk
 * gives the defaults and a later change of the passed object has no effect. The engine keeps one
 * current command (no queue) and the last played start per class and side. `decide` checks, in order:
 * no pattern (`'other'`), class switched off, too quiet, rate limit for the same class and side, and a
 * playing command of equal or higher priority. Only a played event changes the state. `decide` throws
 * a `RangeError` for a non-finite `nowMs` and for nothing else.
 */
export function createHapticEngine(settingsInput?: unknown): HapticEngine {
  const settings = resolveHapticSettings(settingsInput);
  const patterns = new Map<string, Pattern>(loadPatterns().map((p) => [p.class, p]));
  let current: { endMs: number; priority: number } | null = null;
  const lastStart = new Map<string, number>();

  return {
    decide(input, nowMs) {
      if (typeof nowMs !== 'number' || !Number.isFinite(nowMs)) throw new RangeError(`nowMs must be a finite number, got ${String(nowMs)}`);
      const ev = input.event;
      const pattern = patterns.get(ev.class);
      if (pattern === undefined) return drop('no-pattern');
      const cls = ev.class as HapticClass;
      if (!settings.enabledClasses[cls]) return drop('disabled-class');
      if (ev.loudnessDb < settings.minLoudnessDb) return drop('too-quiet');
      const side = sideOf(ev, input.bearingConfidence);
      const key = `${cls}|${side}`;
      const last = lastStart.get(key);
      // Written as a negation so that a clock that went back (or NaN) counts as inside the limit.
      if (last !== undefined && !(nowMs - last >= settings.rateLimitMs)) return drop('rate-limited');
      const priority = priorityOf(ev.urgency, cls);
      if (current !== null && nowMs < current.endMs && priority <= current.priority) return drop('lower-priority');
      const command = buildCommand(pattern, side, ev.urgency, settings.intensity, ev.id, priority);
      current = { endMs: nowMs + command.totalMs, priority };
      lastStart.set(key, nowMs);
      return { action: 'play', command };
    },
  };
}
