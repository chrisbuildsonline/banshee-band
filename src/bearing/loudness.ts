import { BEARING_LIMIT_DEG } from './constants';
import type { BearingConfig } from './types';

/**
 * ILD in dB, 20·log10(rmsRight / rmsLeft), from the two channels' sums of squares over the same
 * samples. Taken as a difference of logarithms, so extreme sums neither overflow nor underflow.
 * Both sums must be > 0 (the caller has already ruled out a Silent channel).
 */
export function levelDifferenceDb(sumSqLeft: number, sumSqRight: number): number {
  return 10 * (Math.log10(sumSqRight) - Math.log10(sumSqLeft));
}

/** Coarse bearing from ILD: 0 inside the dead zone, else 90 · clamp(ild / saturation, -1, 1). Right louder is positive. */
export function ildToBearingDeg(ildDb: number, config: BearingConfig): number {
  if (Math.abs(ildDb) <= config.ildDeadZoneDb) return 0;
  const x = ildDb / config.ildSaturationDb;
  return BEARING_LIMIT_DEG * (x > 1 ? 1 : x < -1 ? -1 : x);
}

/** Confidence of a loudness bearing: min(0.5, |ild| / saturation). Never more than a coarse guess. */
export function loudnessConfidence(ildDb: number, config: BearingConfig): number {
  return Math.min(0.5, Math.abs(ildDb) / config.ildSaturationDb);
}
