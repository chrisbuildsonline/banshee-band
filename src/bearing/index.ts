/**
 * Stereo bearing by GCC-PHAT, with a loudness fallback.
 *
 * Sign convention: bearing 0 is the centre line, negative is the left side, positive the right side.
 * A positive lag means the left channel is delayed, i.e. the sound reached the right microphone
 * first, so the bearing is positive. (To be confirmed with the ghost renderer: position = bearing.)
 *
 * Limit: two microphones tell left from right only. A sound and its mirror image across the
 * microphone axis give the same delay, so the output is a coarse side estimate in [-90, 90]
 * with a confidence, never a full direction.
 */
export * from './constants';
export type { BearingConfig, BearingResult, BearingWindow } from './types';
export { createBearingWindow, estimateBearing } from './estimate';
export { bearingToLagSec, lagToBearingDeg, maxLagSamples, resolveBearingConfig } from './geometry';
export { parabolicOffset } from './gcc-phat';
