import type { Urgency } from '../events';

/** Shortest pulse (motor on), ms. */
export const MIN_PULSE_MS = 40;
/** Shortest rest between two pulses, ms, so the motor spins down and pulses feel separate. */
export const MIN_GAP_MS = 80;
/** Longest cycle (one pass through the pulses and gaps), ms. */
export const MAX_PATTERN_MS = 1500;
/** Longest pattern including repeats and pauses, ms. */
export const MAX_TOTAL_MS = 4000;
/** Shortest rest between two repeats of a pattern, ms. */
export const MIN_REPEAT_PAUSE_MS = 300;
/** Smallest timing distance (ms) between two patterns with the same pulse count. */
export const DISTINCT_TIMING_MS = 150;
/** Bearing confidence below this gives side `'unknown'`. */
export const UNCERTAIN_CONFIDENCE = 0.8;
/** Half width of the centre zone, degrees. */
export const CENTRE_DEG = 15;
/** Default rate limit for the same class and side, ms. */
export const RATE_LIMIT_MS = 3000;
/** The motor on the side away from the sound gets this factor times the level. */
export const OTHER_MOTOR_FACTOR = 0.3;
/** Default loudness threshold, dBFS. Quieter events do not buzz. */
export const DEFAULT_MIN_LOUDNESS_DB = -50;

/** The sound classes that have a vibration pattern (every class except `'other'`). */
export const PATTERN_CLASSES = ['knock', 'doorbell', 'alarm', 'baby', 'vehicle', 'voice'] as const;

/** Motor level for each urgency before the intensity setting is applied. */
export const URGENCY_BASE_LEVEL: Readonly<Record<Urgency, number>> = Object.freeze({ low: 0.5, medium: 0.75, high: 1.0 });

/** Urgency rank for the priority. Any higher urgency outranks any lower one. */
export const URGENCY_RANK: Readonly<Record<Urgency, number>> = Object.freeze({ low: 1, medium: 2, high: 3 });

/** Step between two urgency ranks in the priority (`rank * step + weight`); larger than every class weight. */
export const URGENCY_RANK_STEP = 10;

/** Class weight for the priority at one urgency. Higher wins. */
export const CLASS_WEIGHT: Readonly<Record<(typeof PATTERN_CLASSES)[number], number>> = Object.freeze({
  alarm: 6, baby: 5, vehicle: 4, doorbell: 3, knock: 2, voice: 1,
});
