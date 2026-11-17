import type { SoundEvent, Urgency } from '../../../src/events';
import { createHapticEngine, type HapticClass, type HapticCommand, type Side } from '../../../src/haptics';

const BEARING: Record<Side, { bearingDeg: number | null; bearingSource: SoundEvent['bearingSource']; confidence: number }> = {
  left: { bearingDeg: -45, bearingSource: 'gcc-phat', confidence: 0.9 },
  centre: { bearingDeg: 0, bearingSource: 'gcc-phat', confidence: 0.9 },
  right: { bearingDeg: 45, bearingSource: 'gcc-phat', confidence: 0.9 },
  unknown: { bearingDeg: null, bearingSource: 'none', confidence: 0 },
};

/** Builds a command with the real engine (fresh, so nothing drops it) for a class, side, urgency and intensity. */
export function engineCommand(cls: HapticClass, side: Side, urgency: Urgency, intensity = 1): HapticCommand {
  const b = BEARING[side];
  const event: SoundEvent = { id: `t-${cls}-${side}`, t: 0, class: cls, label: 'filler', confidence: 1, bearingDeg: b.bearingDeg, bearingSource: b.bearingSource, loudnessDb: -20, urgency };
  const d = createHapticEngine({ intensity }).decide({ event, bearingConfidence: b.confidence }, 0);
  if (d.action !== 'play') throw new Error(`expected play, got ${d.reason}`);
  return d.command;
}

/** A knock from the left at high urgency, written out (pattern 70 on, 100 off, 70 on). */
export const KNOCK_LEFT_HIGH: HapticCommand = {
  eventId: 'knock-left',
  class: 'knock',
  side: 'left',
  sideKnown: true,
  priority: 32,
  segments: [
    { ms: 70, left: 1, right: 0.3 },
    { ms: 100, left: 0, right: 0 },
    { ms: 70, left: 1, right: 0.3 },
  ],
  vibrate: [70, 100, 70],
  totalMs: 240,
};

const ALARM_CYCLE = [
  { ms: 150, left: 1, right: 1 },
  { ms: 100, left: 0, right: 0 },
  { ms: 150, left: 1, right: 1 },
  { ms: 100, left: 0, right: 0 },
  { ms: 150, left: 1, right: 1 },
];
const ALARM_PAUSE = { ms: 400, left: 0, right: 0 };

/** An alarm at the centre, high urgency: three pulses, repeated three more times with 400 ms pauses. */
export const ALARM_CENTRE_HIGH: HapticCommand = {
  eventId: 'alarm-centre',
  class: 'alarm',
  side: 'centre',
  sideKnown: true,
  priority: 36,
  segments: [...ALARM_CYCLE, ALARM_PAUSE, ...ALARM_CYCLE, ALARM_PAUSE, ...ALARM_CYCLE, ALARM_PAUSE, ...ALARM_CYCLE].map((s) => ({ ...s })),
  vibrate: [150, 100, 150, 100, 150, 400, 150, 100, 150, 100, 150, 400, 150, 100, 150, 100, 150, 400, 150, 100, 150, 100, 150],
  totalMs: 3800,
};
