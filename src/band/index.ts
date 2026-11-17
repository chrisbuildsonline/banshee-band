/**
 * Haptic outputs (F7). An output plays a `HapticCommand` that `haptics` has already decided on: it does
 * not choose what to play, compare priorities or drop events. Outputs here are the on-screen band
 * simulator and the phone's `navigator.vibrate`; the Bluetooth band joins later through the same
 * `HapticOutput` interface. The band is an aid, one of several forms of an alert, and not a safety device.
 */
export type * from './types';
export { browserScheduler, createSegmentPlayer, type Levels, type Scheduler, type SegmentPlayer } from './segment-player';
export { createPhoneOutput } from './phone-output';
export { classLabel, patternName, percentOf, pulseCount, sideText } from './labels';
export { mountBandSimulator, type BandSimulator } from './simulator';
