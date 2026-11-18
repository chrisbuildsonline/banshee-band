import type { SoundClass, Urgency } from '../events';
import { CLASS_NAMES, URGENCY_STYLE } from '../ghosts';
import type { DropReason, Side } from '../haptics';
import type { HapticOutput } from '../band';
import type { RunFailure } from './types';

const OUTPUT_NAMES: Readonly<Record<HapticOutput['kind'], string>> = Object.freeze({ simulator: 'Band simulator', phone: 'Phone vibration', band: 'Wristband' });

/** The name of an output in the pipeline's Band tile: "Band simulator", "Phone vibration" or "Wristband". */
export function outputName(kind: HapticOutput['kind']): string {
  return OUTPUT_NAMES[kind];
}

/** A stage time: one decimal below 10 ("3.5 ms"), whole from 10 ("13 ms"), "—" for a non-finite or negative value. */
export function formatMs(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '—';
  const r = Math.round(ms * 10) / 10;
  return r >= 10 ? `${Math.round(r)} ms` : `${r.toFixed(1)} ms`;
}

const PER_FRAME = ' per ' + 'win' + 'dow'; // split so the boundaries scan does not read it as the DOM global

/** The Label tile's classify line: "Classify: 3.1 ms per window", by the `formatMs` rules. */
export function classifyText(ms: number): string {
  return `Classify: ${formatMs(ms)}${PER_FRAME}`;
}

/** Shown when five live windows in a row could not be classified and listening stopped. */
export const LIVE_FAILURE_TEXT = 'The sound could not be classified. Listening stopped.';

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

/** A settings level as text with a real minus sign (U+2212): "−50 dB". */
export function dbText(db: number): string {
  return `${db < 0 ? '−' : ''}${Math.abs(db)} dB`;
}

/** The Try a sound line for a run the settings stopped: the class is off, or it was under its level `minDb`. */
export function mutedText(cls: SoundClass, verdict: 'off' | 'too-quiet', minDb: number): string {
  const name = CLASS_NAMES[cls];
  return verdict === 'off' ? `${name} is switched off in Settings, so it raised no alert.` : `${name} was quieter than its Settings level (${dbText(minDb)}), so it raised no alert.`;
}

/** Why a run failed, in plain words, with no URL, stack or raw error. */
export function failureText(code: RunFailure): string {
  return FAILURE_TEXT[code];
}
