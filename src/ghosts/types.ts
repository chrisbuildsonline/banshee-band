import type { SoundEvent } from '../events';
import type { Side } from '../haptics';

/** What the field draws for one sound: the event and the bearing confidence. The same shape the haptic engine takes. */
export interface GhostInput {
  event: SoundEvent;
  /** The bearing estimate's confidence (not the classifier's), 0..1. Anything else makes the ghost uncertain. */
  bearingConfidence: number;
}

/** The drawing area in CSS pixels. */
export interface FieldSize {
  width: number;
  height: number;
}

/** The row of a ghost (0 is the top, the newest) out of `rows` equal slots. */
export interface Slot {
  row: number;
  rows: number;
}

/** Where and how one ghost is drawn. Plain data, the result of `layoutGhost`. */
export interface GhostLayout {
  /** Centre of the ghost body, CSS px. Follows the bearing, or the field centre when uncertain. */
  x: number;
  /** Centre of the ghost body, CSS px. Follows the row. */
  y: number;
  /** Edge of the drawn 24-unit box, CSS px: the layout's base size times `scale`. */
  boxPx: number;
  /** Size factor of the urgency: 1, 1.25 or 1.5. */
  scale: number;
  /** Outline width in units of the 24-unit box. */
  outlineWidth: number;
  /** Glow blur in CSS px. */
  glowBlur: number;
  /** Name of the CSS custom property that colours the glow. */
  glowToken: string;
  /** SVG path of the class silhouette, from `SHAPES`. */
  shape: string;
  /** True exactly when the side is unknown: drawn dashed, centred, with the arc. */
  uncertain: boolean;
  /** The side from `sideOf`. */
  side: Side;
  /** "Left", "Centre", "Right" or "Side unknown". */
  sideText: string;
  /** "Low", "Medium" or "Urgent". */
  urgencyWord: string;
  /** The canvas label: "<event label> · <side text> · <urgency word>". */
  labelText: string;
}

/** The vertical extent of a ghost body, its glow gap and its label, CSS px. */
export interface Block {
  top: number;
  bottom: number;
}

/** Options of `mountGhostField`. */
export interface GhostFieldOptions {
  /** Life of a ghost in ms. Default 8000. `Infinity` keeps ghosts until `clear`. A non-positive or non-number value gives the default. */
  ttlMs?: number;
}

/** The mounted ghost field. */
export interface GhostField {
  /** Adds a ghost for a `GhostInput`. Returns false, and changes nothing, for an invalid input or after `destroy`. */
  show(input: unknown): boolean;
  /** Removes every live ghost and redraws an empty field. */
  clear(): void;
  /** Stops every timer, frame and observer and removes the field's elements. Safe to call twice. */
  destroy(): void;
  /** Copies of the layouts of the live ghosts, newest first. */
  ghosts(): GhostLayout[];
}
