/** Speed of sound in air, m/s. */
export const SPEED_OF_SOUND = 343;
/** Default distance between the two microphones, metres (a laptop pair). */
export const DEFAULT_MIC_SPACING_M = 0.08;
/** A channel whose RMS over the Window is below this is Silent (-70 dBFS). */
export const SILENCE_RMS = 10 ** (-70 / 20);
/** GCC-PHAT results below this Confidence fall back to the loudness bearing. */
export const MIN_CONFIDENCE = 0.3;
/** PHAT regulariser, relative to the largest cross-spectrum bin of a chunk. Measured: 0.03 (docs/bearing.md). */
export const DEFAULT_REGULARIZATION = 0.03;
/** ILD in dB that maps to a full ±90° loudness bearing. */
export const ILD_SATURATION_DB = 12;
/** |ILD| at or below this (dB) gives a loudness bearing of 0. */
export const ILD_DEAD_ZONE_DB = 1;
/** Peak-to-sidelobe ratio that gives Confidence 0. */
export const Q_LOW = 3;
/** Peak-to-sidelobe ratio that gives Confidence 1. Measured: 12 (docs/bearing.md). */
export const Q_HIGH = 12;
/** Samples per GCC-PHAT chunk. */
export const CHUNK = 1024;
/** FFT size: twice the chunk, so circular wrap-around cannot alias the lag search. */
export const NFFT = 2 * CHUNK;
/** Frames with a sample magnitude above this are skipped: not audio, and squaring could overflow. */
export const MAX_SAMPLE_ABS = 1e100;
/** Channels are identical (mono) when every sample pair differs by at most this times the channel RMS. */
export const IDENTICAL_TOLERANCE = 1e-6;
/** Largest |bearing| in degrees this module produces. */
export const BEARING_LIMIT_DEG = 90;
