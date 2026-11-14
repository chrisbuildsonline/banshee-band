import type { StereoFrame } from '../audio/types';
import type { BearingSource } from '../events';

/** Settings of the bearing estimator. Every field is a finite number > 0 (`ildDeadZoneDb` may be 0). */
export interface BearingConfig {
  /** Distance between the microphones, metres. Default 0.08. */
  micSpacingM: number;
  /** m/s. Default 343. */
  speedOfSound: number;
  /** RMS below which a channel is Silent. Default 10^(-70/20). */
  silenceRms: number;
  /** GCC-PHAT Confidence needed to report `'gcc-phat'`. Default 0.3. */
  minConfidence: number;
  /** PHAT regulariser relative to the largest bin of a chunk. */
  regularization: number;
  /** ILD (dB) that maps to ±90°. Default 12. */
  ildSaturationDb: number;
  /** |ILD| (dB) that maps to 0°. Default 1. */
  ildDeadZoneDb: number;
}

/** Bearing of one Window. Holds only numbers and the source label, never samples or spectra. */
export interface BearingResult {
  /** Degrees in [-90, 90], negative left, positive right. null exactly when `source` is `'none'`. */
  bearingDeg: number | null;
  source: BearingSource;
  /** Bearing confidence in [0, 1] (not the classifier's confidence). */
  confidence: number;
  /** Delay of left relative to right in seconds; null unless `source` is `'gcc-phat'`. */
  lagSec: number | null;
  /** 20·log10(rmsRight / rmsLeft); null when it cannot be computed (silence). */
  ildDb: number | null;
  /** Frames accepted into the Window. */
  usedFrames: number;
  /** Frames skipped (bad length, rate or non-finite samples). */
  skippedFrames: number;
}

/** Streaming estimator for one sound event. */
export interface BearingWindow {
  /** Adds a Frame. Copies what it needs; never keeps or modifies the Frame's arrays. */
  push(frame: StereoFrame): void;
  /** Bearing of everything pushed so far. Does not change the state. */
  result(): BearingResult;
  /** Empties the Window for the next event. */
  reset(): void;
}
