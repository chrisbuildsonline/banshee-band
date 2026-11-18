import type { HapticClass, HapticCommand, Segment, Side } from '../haptics';
import type { BandProblem, BandState } from './types';

const PROBLEM_TEXT: Readonly<Record<BandProblem, string>> = Object.freeze({
  cancelled: 'No band was chosen.',
  failed: 'Could not connect. Check the band is on and close, then try again.',
  lost: 'The band disconnected. Alerts use the phone or the screen until it is back.',
});

/** The status line of the wristband: what the link is doing, and which fallback is in use when there is no band. */
export function bandStatusText(state: BandState, problem: BandProblem | null, name: string | null): string {
  switch (state) {
    case 'unsupported':
      return 'This browser has no Bluetooth link (Safari and Firefox do not have Web Bluetooth). Alerts use the phone or the screen. Chrome or Edge can connect the band.';
    case 'connecting':
      return 'Connecting…';
    case 'connected':
      return `Connected to ${name ?? 'Banshee Band'}.`;
    default:
      return problem === null ? 'No band connected.' : PROBLEM_TEXT[problem];
  }
}

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
