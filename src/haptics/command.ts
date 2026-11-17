import type { Urgency } from '../events';
import { OTHER_MOTOR_FACTOR, URGENCY_BASE_LEVEL } from './constants';
import type { HapticCommand, Pattern, Segment, Side } from './types';

/** Motor levels for a pulse: the side of the sound gets the level, the other motor a fraction of it. */
function levels(side: Side, urgency: Urgency, intensity: number): { left: number; right: number } {
  const level = URGENCY_BASE_LEVEL[urgency] * intensity;
  const far = level * OTHER_MOTOR_FACTOR;
  if (side === 'left') return { left: level, right: far };
  if (side === 'right') return { left: far, right: level };
  return { left: level, right: level };
}

/**
 * Expands a validated pattern into a `HapticCommand`. The rhythm (every repeat and pause, the last
 * zero gap dropped) depends on the pattern only; `side`, `urgency` and `intensity` (in [0, 1]) only set
 * the motor levels of the pulses. `segments` and `vibrate` come from one list of steps, so they match.
 * Returns new arrays; the pattern is not changed.
 */
export function buildCommand(pattern: Pattern, side: Side, urgency: Urgency, intensity: number, eventId: string, priority: number): HapticCommand {
  const repeatCount = pattern.repeat ? pattern.repeat.count : 0;
  const steps: { ms: number; on: boolean }[] = [];
  for (let r = 0; r <= repeatCount; r++) {
    for (const p of pattern.pulses) steps.push({ ms: p.onMs, on: true }, { ms: p.gapMs, on: false });
    if (r < repeatCount) steps[steps.length - 1].ms += pattern.repeat!.pauseMs;
  }
  const pulse = levels(side, urgency, intensity);
  const segments: Segment[] = steps
    .filter((s) => s.ms > 0)
    .map((s) => (s.on ? { ms: s.ms, left: pulse.left, right: pulse.right } : { ms: s.ms, left: 0, right: 0 }));
  const vibrate = segments.map((s) => s.ms);
  const totalMs = vibrate.reduce((a, b) => a + b, 0);
  return { eventId, class: pattern.class, side, sideKnown: side !== 'unknown', priority, segments, vibrate, totalMs };
}
