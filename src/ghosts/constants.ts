import type { SoundClass, Urgency } from '../events';

/** How one urgency is drawn: its word, size factor, outline (24-unit box units), glow blur (px) and glow token. */
export interface UrgencyStyle {
  word: string;
  scale: number;
  outlineWidth: number;
  glowBlur: number;
  glowToken: string;
}

/** Urgency to drawing style. Size, outline, glow and word all grow together, so glow is never the only cue. */
export const URGENCY_STYLE: Readonly<Record<Urgency, Readonly<UrgencyStyle>>> = Object.freeze({
  low: Object.freeze({ word: 'Low', scale: 1, outlineWidth: 1.5, glowBlur: 4, glowToken: '--bb-ghost-glow-1' }),
  medium: Object.freeze({ word: 'Medium', scale: 1.25, outlineWidth: 2.5, glowBlur: 8, glowToken: '--bb-ghost-glow-2' }),
  high: Object.freeze({ word: 'Urgent', scale: 1.5, outlineWidth: 3.5, glowBlur: 12, glowToken: '--bb-ghost-glow-3' }),
});

/** Smallest base box edge in px (`basePx` at scale 1). */
export const GHOST_BOX_MIN_PX = 32;
/** Largest base box edge in px (an urgent ghost is 1.5 times this). */
export const GHOST_BOX_MAX_PX = 72;
/** Space between the glow edge and the label, px. */
export const GLOW_GAP_PX = 2;
/** Height of the label line (13 px text), px. */
export const LABEL_HEIGHT_PX = 16;
/** Largest glow blur plus the glow gap plus the label line: the part of a block below the urgent body. */
export const LABEL_BLOCK_PX = URGENCY_STYLE.high.glowBlur + GLOW_GAP_PX + LABEL_HEIGHT_PX;
/** Most ghosts (and rows) the field shows at once. */
export const MAX_GHOSTS = 4;
/** Life of a ghost, ms. */
export const DEFAULT_TTL_MS = 8000;
/** Trail mode: alpha of a ghost's body, glow and outline by rank, newest first (the label stays at full strength). */
export const TRAIL_ALPHA: readonly number[] = Object.freeze([1, 0.8, 0.65, 0.55]);
/** Fade in and fade out, ms (the value of `--bb-motion-slow`). */
export const FADE_MS = 400;
/** Vertical drift amplitude, px. */
export const DRIFT_PX = 4;
/** Horizontal padding of the bearing map, px: half the largest box (54) plus the largest glow (12) fits in it. */
export const FIELD_PADDING_X = 72;
/** Top margin of the field, px. */
export const FIELD_TOP_PX = 8;
/** Bottom margin of the field, px; holds the listener mark. */
export const FIELD_BOTTOM_PX = 40;
/** Narrowest field the layout promises to handle, px. */
export const FIELD_MIN_WIDTH_PX = 200;
/** Lowest field the layout promises to handle, px. */
export const FIELD_MIN_HEIGHT_PX = 360;
/** Bearing (degrees) mapped to the field edge; anything beyond clamps. */
export const BEARING_RANGE_DEG = 90;
/** Inset of the uncertain arc ends from each field edge, px. */
export const ARC_INSET_PX = 24;
/** Uncertain outline: one dash period per this many outline widths, so the gap (a third of it) is about 2 widths. */
export const DASH_PERIODS_PER_WIDTH = 6;
/** Uncertain outline: fewest dashes around the outer outline. */
export const DASH_MIN_COUNT = 3;

/** Plain class names for the list and the canvas label. */
export const CLASS_NAMES: Readonly<Record<SoundClass, string>> = Object.freeze({
  knock: 'Knock',
  doorbell: 'Doorbell',
  alarm: 'Alarm',
  baby: 'Baby',
  vehicle: 'Vehicle',
  voice: 'Voice',
  other: 'Other',
});
