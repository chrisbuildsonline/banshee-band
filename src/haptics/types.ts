import type { SoundClass, SoundEvent } from '../events';

/** A sound class that has a vibration pattern: every `SoundClass` except `'other'`. */
export type HapticClass = Exclude<SoundClass, 'other'>;

/** Where the sound came from, as the band shows it. `'unknown'` when the bearing is not trusted. */
export type Side = 'left' | 'right' | 'centre' | 'unknown';

/** One pulse: the motor runs for `onMs`, then rests for `gapMs`. The last pulse of a pattern has `gapMs` 0. */
export interface Pulse {
  onMs: number;
  gapMs: number;
}

/** `count` extra passes through the pulse list, with `pauseMs` of rest between passes. */
export interface Repeat {
  count: number;
  pauseMs: number;
}

/** The rhythm of one class. Rhythm only: levels come from urgency, side and intensity. */
export interface Pattern {
  class: HapticClass;
  pulses: Pulse[];
  repeat?: Repeat;
}

/** A stretch of time with a fixed level (0..1) for each motor. A rest has both levels 0. */
export interface Segment {
  ms: number;
  left: number;
  right: number;
}

/** What to play for one event. Plain data; holds no audio, spectra or label. */
export interface HapticCommand {
  eventId: string;
  class: HapticClass;
  side: Side;
  /** false exactly when `side` is `'unknown'`. */
  sideKnown: boolean;
  priority: number;
  /** Pulses and rests, alternating, starting and ending with a pulse, repeats expanded. */
  segments: Segment[];
  /** The `navigator.vibrate` pattern: the `ms` of `segments`, on, off, on, ... */
  vibrate: number[];
  /** Sum of the `ms` of `segments` (and of `vibrate`). */
  totalMs: number;
}

/** Input of `decide`: the event and the bearing confidence (`BearingResult.confidence`, not the classifier's). */
export interface HapticInput {
  event: SoundEvent;
  bearingConfidence: number;
}

/** User settings of the engine. */
export interface HapticSettings {
  /** Which classes may buzz. */
  enabledClasses: Record<HapticClass, boolean>;
  /** Quieter events (dBFS) are dropped. Default -50. */
  minLoudnessDb: number;
  /** Strength factor in [0, 1]. Default 1. */
  intensity: number;
  /** Rate limit for the same class and side, ms. */
  rateLimitMs: number;
}

/** Why an event does not buzz. */
export type DropReason = 'disabled-class' | 'no-pattern' | 'too-quiet' | 'rate-limited' | 'lower-priority';

/** Result of `decide`: play a command or drop the event with a reason. */
export type Decision = { action: 'play'; command: HapticCommand } | { action: 'drop'; reason: DropReason };

/** A broken rule of the pattern language, found by `checkDistinctiveness`. */
export interface Violation {
  kind: 'not-distinct' | 'pulse-too-short' | 'gap-too-short' | 'cycle-too-long' | 'total-too-long' | 'pause-too-short';
  /** The class names involved. */
  classes: string[];
  /** Short human-readable text. */
  detail: string;
}

/** The stateful decision maker. The caller passes the time in. */
export interface HapticEngine {
  /** Decides whether to play the event now. Throws `RangeError` only for a non-finite `nowMs`. */
  decide(input: HapticInput, nowMs: number): Decision;
}
