import type { CaptureError, CaptureErrorCode } from './types';

export interface CaptureEnv {
  hasMediaDevices: boolean;
  isSecureContext: boolean;
}

/** Fixed plain-language messages. They never include the thrown value's own text. */
export const CAPTURE_MESSAGES: Record<CaptureErrorCode, string> = {
  'permission-denied': 'Microphone access was blocked. Allow the microphone in your browser settings, or try a recorded sound instead.',
  'no-device': 'No microphone was found. Connect one, or try a recorded sound instead.',
  'device-busy': 'The microphone is in use by another app or could not be opened. Close the other app and try again.',
  'insecure-context': 'The microphone needs a secure page (https or localhost). You can still try a recorded sound.',
  unsupported: 'This browser cannot capture audio here. Try a recent Chrome or Edge.',
  'clip-not-found': 'That recorded sound is not in the list. Pick another recorded sound.',
  'clip-load-failed': 'The recorded sound could not be loaded. Reload the page and try again.',
  'worklet-failed': 'The audio processor could not start. Reload the page and try again.',
  unknown: 'Audio could not start because of an unexpected problem. Reload the page and try again.',
};

const NAME_TO_CODE: Record<string, CaptureErrorCode> = {
  NotAllowedError: 'permission-denied',
  SecurityError: 'permission-denied',
  NotFoundError: 'no-device',
  OverconstrainedError: 'no-device',
  DevicesNotFoundError: 'no-device',
  NotReadableError: 'device-busy',
  AbortError: 'device-busy',
  TrackStartError: 'device-busy',
};

/** Used when the microphone stops by itself while listening (unplugged, permission revoked). */
export const MIC_STOPPED_MESSAGE = 'The microphone stopped. Check that it is connected and allowed, then start again.';
/** Used when a stereo block is missing, so the stream time would be wrong. */
export const LOST_AUDIO_MESSAGE = 'Some audio was lost, so listening stopped. Start again.';

export function captureError(code: CaptureErrorCode, message = CAPTURE_MESSAGES[code]): CaptureError {
  return { code, message };
}

/** Carries an expected capture failure from the Web Audio code to the Capture state machine. */
export class CaptureFailure extends Error {
  readonly error: CaptureError;
  constructor(error: CaptureError) {
    super(error.code);
    this.name = 'CaptureFailure';
    this.error = error;
  }
}

function errorName(thrown: unknown): string | undefined {
  if (typeof thrown !== 'object' || thrown === null) return undefined;
  try {
    const name = (thrown as { name?: unknown }).name;
    return typeof name === 'string' ? name : undefined;
  } catch {
    return undefined;
  }
}

/** Maps a value thrown by `getUserMedia` (or a missing API) to a capture error. Pure. */
export function toCaptureError(thrown: unknown, env: CaptureEnv): CaptureError {
  if (!env.hasMediaDevices) return captureError(env.isSecureContext ? 'unsupported' : 'insecure-context');
  const name = errorName(thrown);
  const code = name !== undefined && Object.hasOwn(NAME_TO_CODE, name) ? NAME_TO_CODE[name] : 'unknown';
  return captureError(code);
}
