import type { HapticClass, HapticCommand, Segment, Side } from '../haptics';

const SIDE_TEXT: Readonly<Record<Side, string>> = Object.freeze({
  left: 'left stronger',
  right: 'right stronger',
  centre: 'both motors, centre',
  unknown: 'Side unknown, both motors equal',
});

/** The class name with a capital first letter: `'knock'` gives `'Knock'`. */
export function classLabel(cls: HapticClass): string {
  return cls.charAt(0).toUpperCase() + cls.slice(1);
}

/** The plain words for a side: "left stronger", "right stronger", "both motors, centre" or "Side unknown, both motors equal". */
export function sideText(side: Side): string {
  return SIDE_TEXT[side];
}

/**
 * A motor level as a whole percent: `level * 100`, rounded. A display guard only: `NaN` gives 0 and the
 * result is clamped to 0..100, though the engine already keeps levels in [0, 1].
 */
export function percentOf(level: number): number {
  if (Number.isNaN(level)) return 0;
  return Math.min(100, Math.max(0, Math.round(level * 100)));
}

/**
 * The pattern in words: "Knock, left stronger". For an unknown side the two parts are two sentences,
 * "Knock. Side unknown, both motors equal", because the side text starts with a capital there.
 */
export function patternName(command: Pick<HapticCommand, 'class' | 'side'>): string {
  const sep = command.side === 'unknown' ? '. ' : ', ';
  return `${classLabel(command.class)}${sep}${sideText(command.side)}`;
}

/**
 * The number of pulses: segments with a level above 0 in either motor. When every level is 0 (strength
 * set to 0), the segments at even index, which are the pulses by the alternation rule of `haptics`.
 */
export function pulseCount(segments: readonly Segment[]): number {
  const on = segments.filter((s) => s.left > 0 || s.right > 0).length;
  return on > 0 ? on : Math.ceil(segments.length / 2);
}
