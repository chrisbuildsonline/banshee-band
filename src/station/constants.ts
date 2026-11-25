import type { StageName } from './types';

/** Bars of the waveform drawing in the pipeline view. */
export const PEAK_BUCKETS = 64;
/** Rows kept in the Recent sounds list. */
export const MAX_ROWS = 10;
/** The five stages of a run, in order. */
export const STAGES: readonly StageName[] = Object.freeze(['waveform', 'label', 'bearing', 'pattern', 'band']);
/** How long an older ghost stays on the station's field after it appeared; the latest stays until a newer one. */
export const GHOST_TRAIL_MS = 30_000;
/** The caption under the urgency key that says why a ghost can be "Side unknown". */
export const SIDE_UNKNOWN_NOTE =
  'Side unknown means both microphones heard the sound alike: steady tones such as an alarm, or a device that records the same sound on both channels.';
