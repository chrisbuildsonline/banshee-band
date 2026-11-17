/**
 * Haptic outputs (F7). An output plays a `HapticCommand` that `haptics` has already decided on: it does
 * not choose what to play, compare priorities or drop events. Outputs here are the on-screen band
 * simulator and the phone's `navigator.vibrate`; the Bluetooth band joins later through the same
 * `HapticOutput` interface. The band is an aid, one of several forms of an alert, and not a safety device.
 */
export type * from './types';
