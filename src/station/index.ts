/**
 * Listening station (round 1): one click on a recorded sample clip drives the real modules in order
 * (classify, bearing from a simulated stereo pair, haptic engine, band outputs, ghost). The station is
 * an aid and not a safety device: it can miss or misread sounds, and every alert has three forms
 * (ghost, haptic pattern, text) so no form is the only one.
 */
export * from './constants';
export type * from './types';
export { buildEvent, processEvent, URGENCY_BY_CLASS, type BuiltEvent, type EventInput, type Processed } from './pipeline';
