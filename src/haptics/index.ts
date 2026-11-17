/**
 * Haptic priority engine (F6). This module decides what to play and on which side, not how: an output
 * driver (band, simulator or `navigator.vibrate`) plays the returned command. Rhythm identifies the
 * sound class, so the rhythm alone still tells the class on a phone with one motor. Intensity encodes
 * urgency and side only. The band is an aid, one of several forms of an alert, and not a safety device.
 */
export * from './constants';
export type * from './types';
export { buildCommand } from './command';
export { checkDistinctiveness, cycleMs, patternDistance, totalMs } from './distinct';
export { createHapticEngine } from './engine';
export { loadPatterns, validatePatternData } from './patterns';
export { priorityOf } from './priority';
export { DEFAULT_HAPTIC_SETTINGS, resolveHapticSettings } from './settings';
export { sideOf } from './side';
