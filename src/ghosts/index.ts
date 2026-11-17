/**
 * Ghost renderer (F8). Each sound is drawn as a ghost on a canvas. The mapping is fixed:
 * shape = sound class, position = bearing, glow = urgency. Nothing else carries meaning.
 * A ghost whose side is not known is drawn at the centre with a dashed outline, an arc and the words
 * "Side unknown". Every ghost also has a text equivalent in a list under the canvas.
 * The ghost field is an aid, one of three forms of an alert, and not a safety device.
 */
export type * from './types';
export * from './constants';
