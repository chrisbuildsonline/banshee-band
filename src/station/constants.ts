import type { StageName } from './types';

/** Bars of the waveform drawing in the pipeline view. */
export const PEAK_BUCKETS = 64;
/** Rows kept in the Recent sounds list. */
export const MAX_ROWS = 10;
/** The five stages of a run, in order. */
export const STAGES: readonly StageName[] = Object.freeze(['waveform', 'label', 'bearing', 'pattern', 'band']);
