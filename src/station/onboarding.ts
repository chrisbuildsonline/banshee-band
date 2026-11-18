import { LISTEN_STATES, type ListenGlyph } from './listen-status';
import type { SettingsStorage } from './settings';
import type { ListenState } from './types';

/** The one key the intro writes, separate from the settings so neither can break the other. */
export const ONBOARDED_STORAGE_KEY = 'banshee-band.onboarded.v1';

/** The stored text that means the intro was finished, skipped or closed. */
export const ONBOARDED_VALUE = 'done';

/** The intro's three steps, in order. */
export const INTRO_STEPS = ['welcome', 'microphone', 'output'] as const;

/** One of `INTRO_STEPS`. */
export type IntroStep = (typeof INTRO_STEPS)[number];

/** Whether this page can ask for the microphone at all. */
export type MicSupport = 'ok' | 'unsupported' | 'insecure';

/** True exactly when `text` is `'done'`; anything else, corrupt or not, is false. Never throws. */
export function isOnboarded(text: string | null): boolean {
  return text === ONBOARDED_VALUE;
}

/**
 * Whether to open the intro on load: when the store can be read and the flag is not set (a corrupt flag counts as
 * not set). False when the store is null or `getItem` throws: a blocked store cannot remember a dismissal, so the
 * intro would cover the station on every visit. Reads only `ONBOARDED_STORAGE_KEY`. Never throws.
 */
export function shouldShowIntro(storage: SettingsStorage | null): boolean {
  if (storage === null) return false;
  try {
    return !isOnboarded(storage.getItem(ONBOARDED_STORAGE_KEY));
  } catch {
    return false;
  }
}

/** Saves the flag; false when the store is null or `setItem` throws. Writes only `ONBOARDED_STORAGE_KEY`. Never throws. */
export function markOnboarded(storage: SettingsStorage | null): boolean {
  if (storage === null) return false;
  try {
    storage.setItem(ONBOARDED_STORAGE_KEY, ONBOARDED_VALUE);
    return true;
  } catch {
    return false;
  }
}

/**
 * `insecure` on a page that is not a secure context (as `src/audio` reports it), else `ok` with `getUserMedia` and
 * `unsupported` without it.
 */
export function micSupport(env: { hasGetUserMedia: boolean; isSecureContext: boolean }): MicSupport {
  if (!env.isSecureContext) return 'insecure';
  return env.hasGetUserMedia ? 'ok' : 'unsupported';
}

/** What the microphone step shows. */
export interface MicStepView {
  /** The Listen pill word, or null to hide the pill (idle). */
  word: string | null;
  /** The Listen pill glyph shape, or null. */
  glyph: ListenGlyph | null;
  /** The Listen pill tint, or null. */
  tint: 'neutral' | 'accent' | 'strong' | null;
  /** One plain sentence: why, what is happening, or what still works. */
  sentence: string;
  /** Allow microphone can be pressed (idle with a microphone). */
  canAllow: boolean;
  /** Next replaces Allow and Not now: there is an outcome, or no microphone here. */
  showNext: boolean;
}

/** The step's sentences: one per Listen state, and two for a page without a microphone. */
export const MIC_SENTENCES = Object.freeze({
  idle: 'Banshee Band asks for the microphone only after you press Allow microphone. The sound is processed on this device and never recorded or sent.',
  starting: 'Getting ready. Your browser may ask you to allow the microphone.',
  listening: 'The microphone is on. Sounds will show on the station as ghosts.',
  stopped: 'The microphone is off. Press Start listening on the station when you want it on.',
  blocked: "The microphone is blocked. That is fine: the sample clips work without it, and you can allow it later in your browser's site settings.",
  problem: 'The microphone could not start. The sample clips still work.',
  unsupported: 'This browser cannot use a microphone here. The sample clips still work.',
  insecure: 'The microphone needs a secure page (https or localhost). The sample clips still work.',
});

/**
 * The microphone step for a Listen state and the page's microphone support. Idle follows the support: Allow with a
 * microphone, else no pill, Next and why. Any other state is what happened, whatever the support: the Listen
 * card's word, glyph and tint; starting keeps Allow shown but not pressable; every other state shows Next. Pure.
 */
export function micStepView(state: ListenState, support: MicSupport): MicStepView {
  if (state === 'idle') {
    const ok = support === 'ok';
    return { word: null, glyph: null, tint: null, sentence: MIC_SENTENCES[ok ? 'idle' : support], canAllow: ok, showNext: !ok };
  }
  const look = LISTEN_STATES[state];
  return { word: look.word, glyph: look.glyph, tint: look.tint, sentence: MIC_SENTENCES[state], canAllow: false, showNext: state !== 'starting' };
}
