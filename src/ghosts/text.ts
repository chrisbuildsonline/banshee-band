import type { SoundClass, Urgency } from '../events';
import type { Side } from '../haptics';
import { CLASS_NAMES } from './constants';

/** The text of an empty field, in the list and in the canvas label. */
export const EMPTY_TEXT = 'No sounds yet';

const SIDE_WORD: Readonly<Record<Side, string>> = { left: 'left', centre: 'centre', right: 'right', unknown: 'side unknown' };
const URGENCY_WORD: Readonly<Record<Urgency, string>> = { low: 'low', medium: 'medium', high: 'urgent' };

/** What one list item and one part of the canvas label name: the class, the side and the urgency. */
export interface GhostText {
  cls: SoundClass;
  side: Side;
  urgency: Urgency;
}

/** "Knock, left, urgent" or "Baby, side unknown, urgent". */
export function listItemText(cls: SoundClass, side: Side, urgency: Urgency): string {
  return `${CLASS_NAMES[cls]}, ${SIDE_WORD[side]}, ${URGENCY_WORD[urgency]}`;
}

/** The canvas label: "Sound field. Now: Alarm, right, urgent; Knock, left, medium", or "No sounds yet". */
export function canvasSummary(items: readonly GhostText[], heading = 'Now:'): string {
  if (items.length === 0) return EMPTY_TEXT;
  return `Sound field. ${heading} ${items.map((i) => listItemText(i.cls, i.side, i.urgency)).join('; ')}`;
}

/** `x / width` as a decimal with at most four decimals and no trailing zeros. */
export function dataX(x: number, width: number): string {
  return String(Number((x / width).toFixed(4)));
}
