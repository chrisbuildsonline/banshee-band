import { sideOf, type Side } from '../haptics';
import {
  BEARING_RANGE_DEG,
  FIELD_BOTTOM_PX,
  FIELD_PADDING_X,
  FIELD_TOP_PX,
  GHOST_BOX_MAX_PX,
  GHOST_BOX_MIN_PX,
  GLOW_GAP_PX,
  LABEL_BLOCK_PX,
  LABEL_HEIGHT_PX,
  MAX_GHOSTS,
  URGENCY_STYLE,
} from './constants';
import { SHAPES } from './shapes';
import type { Block, FieldSize, GhostInput, GhostLayout, Slot } from './types';

const SIDE_TEXT: Readonly<Record<Side, string>> = { left: 'Left', centre: 'Centre', right: 'Right', unknown: 'Side unknown' };

const clamp = (min: number, v: number, max: number) => Math.min(max, Math.max(min, v));

/** Base box edge (px, scale 1) of every ghost in a field of `height` px with `rows` rows: the largest that fits an urgent block in a slot, in [32, 72]. */
export function ghostBasePx(height: number, rows: number): number {
  const slotH = (height - FIELD_TOP_PX - FIELD_BOTTOM_PX) / rows;
  return clamp(GHOST_BOX_MIN_PX, Math.floor((slotH - LABEL_BLOCK_PX) / 1.5), GHOST_BOX_MAX_PX);
}

/** Top of the label line of a ghost: below the body, its glow and the glow gap. */
export function labelTop(l: GhostLayout): number {
  return l.y + l.boxPx / 2 + l.glowBlur + GLOW_GAP_PX;
}

/** The vertical extent of a ghost body, glow gap and label. */
export function ghostBlock(l: GhostLayout): Block {
  const top = l.y - l.boxPx / 2;
  return { top, bottom: labelTop(l) + LABEL_HEIGHT_PX };
}

/**
 * Lays out one ghost. Pure: x follows the bearing (negative is left, clamped at 90 degrees, inside a
 * 72 px padding), or the centre when the side is unknown; y follows the row slot; size, outline and glow
 * follow the urgency. Nothing else of the event changes the result.
 */
export function layoutGhost(input: GhostInput, field: FieldSize, slot: Slot = { row: 0, rows: 1 }): GhostLayout {
  const { event } = input;
  const side = sideOf(event, input.bearingConfidence);
  const uncertain = side === 'unknown';
  const half = field.width / 2 - FIELD_PADDING_X;
  const bearing = uncertain || event.bearingDeg === null ? 0 : clamp(-BEARING_RANGE_DEG, event.bearingDeg, BEARING_RANGE_DEG);
  const x = uncertain ? field.width / 2 : field.width / 2 + (bearing / BEARING_RANGE_DEG) * half;

  const u = URGENCY_STYLE[event.urgency];
  const slotH = (field.height - FIELD_TOP_PX - FIELD_BOTTOM_PX) / slot.rows;
  const boxPx = ghostBasePx(field.height, slot.rows) * u.scale;
  const blockH = boxPx + u.glowBlur + GLOW_GAP_PX + LABEL_HEIGHT_PX;
  const y = FIELD_TOP_PX + slot.row * slotH + (slotH - blockH) / 2 + boxPx / 2;
  const sideText = SIDE_TEXT[side];

  return {
    x,
    y,
    boxPx,
    scale: u.scale,
    outlineWidth: u.outlineWidth,
    glowBlur: u.glowBlur,
    glowToken: u.glowToken,
    shape: SHAPES[event.class],
    uncertain,
    side,
    sideText,
    urgencyWord: u.word,
    labelText: `${event.label} · ${sideText} · ${u.word}`,
  };
}

/** Lays out up to four ghosts, newest first, one row each from the top. Drops the oldest (last) first. Returns a new array. */
export function layoutGhosts(inputs: readonly GhostInput[], field: FieldSize): GhostLayout[] {
  const shown = inputs.slice(0, MAX_GHOSTS);
  return shown.map((input, row) => layoutGhost(input, field, { row, rows: shown.length }));
}
