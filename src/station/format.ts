import type { SoundClass, Urgency } from '../events';
import { CLASS_NAMES, URGENCY_STYLE } from '../ghosts';
import type { DropReason, Side } from '../haptics';
import type { RunFailure } from './types';

/** A stage time: one decimal below 10 ("3.5 ms"), whole from 10 ("13 ms"), "—" for a non-finite or negative value. */
export function formatMs(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '—';
  const r = Math.round(ms * 10) / 10;
  return r >= 10 ? `${Math.round(r)} ms` : `${r.toFixed(1)} ms`;
}

/** Local wall-clock time as 24-hour "HH:MM". The one use of `Date` in the pure files. */
export function formatClock(epochMs: number): string {
  const d = new Date(epochMs);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

const SIDE_WORD: Readonly<Record<Side, string>> = { left: 'Left side', right: 'Right side', centre: 'Centre', unknown: 'Side unknown' };

/** "Left side", "Right side", "Centre" or "Side unknown". */
export function sideWord(side: Side): string {
  return SIDE_WORD[side];
}

/** The text alert: "Knock, left side, urgent", "Voice, centre, low", "Baby, side unknown, urgent". */
export function alertText(cls: SoundClass, side: Side, urgency: Urgency): string {
  return `${CLASS_NAMES[cls]}, ${sideWord(side).toLowerCase()}, ${URGENCY_STYLE[urgency].word.toLowerCase()}`;
}

const DROP_TEXT: Readonly<Record<DropReason, string>> = {
  'no-pattern': 'This sound has no vibration pattern',
  'too-quiet': 'Too quiet to buzz',
  'lower-priority': 'A stronger alert is still playing',
  'disabled-class': 'This sound is switched off',
  'rate-limited': 'Played a moment ago',
};

/** Why the engine did not buzz, in plain words. */
export function dropText(reason: DropReason): string {
  return DROP_TEXT[reason];
}

const FAILURE_TEXT: Readonly<Record<RunFailure, string>> = {
  'clip-load-failed': 'The clip could not be loaded.',
  'clip-unreadable': 'The clip could not be read.',
  'classify-failed': 'The sound could not be classified.',
  'event-invalid': 'The sound could not be turned into an alert.',
};

/** Why a run failed, in plain words, with no URL, stack or raw error. */
export function failureText(code: RunFailure): string {
  return FAILURE_TEXT[code];
}
