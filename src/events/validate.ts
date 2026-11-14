import { BEARING_DEG_MAX, BEARING_DEG_MIN, BEARING_SOURCES, SOUND_CLASSES, URGENCY_LEVELS } from './constants';
import type { BearingSource, SoundClass, SoundEvent, Urgency } from './types';

export type ValidationResult = { ok: true; event: SoundEvent } | { ok: false; errors: string[] };

const isNumber = (v: unknown): v is number => Number.isFinite(v);
const isOneOf = <T extends string>(list: readonly T[], v: unknown): v is T => typeof v === 'string' && (list as readonly string[]).includes(v);

/** Checks an untrusted value against the SoundEvent contract. Never throws; errors name the field and rule, never the value. */
export function validateSoundEvent(input: unknown): ValidationResult {
  try {
    if (typeof input !== 'object' || input === null || Array.isArray(input)) return { ok: false, errors: ['input must be an object'] };
    // Read each field once: a getter may return a different value on every read.
    const { id, t, class: cls, label, confidence, bearingDeg, bearingSource, loudnessDb, urgency } = input as Record<string, unknown>;
    const errors: string[] = [];
    const check = (pass: boolean, message: string) => {
      if (!pass) errors.push(message);
      return pass;
    };

    check(typeof id === 'string' && id.length > 0, 'id: must be a non-empty string');
    check(isNumber(t) && t >= 0, 't: must be a finite number >= 0');
    check(isOneOf(SOUND_CLASSES, cls), `class: must be one of ${SOUND_CLASSES.join(', ')}`);
    check(typeof label === 'string' && label.trim().length > 0, 'label: must be non-empty text');
    check(isNumber(confidence) && confidence >= 0 && confidence <= 1, 'confidence: must be a number from 0 to 1');
    const bearingOk = check(bearingDeg === null || (isNumber(bearingDeg) && bearingDeg >= BEARING_DEG_MIN && bearingDeg <= BEARING_DEG_MAX), `bearingDeg: must be null or a number from ${BEARING_DEG_MIN} to ${BEARING_DEG_MAX}`);
    const sourceOk = check(isOneOf(BEARING_SOURCES, bearingSource), `bearingSource: must be one of ${BEARING_SOURCES.join(', ')}`);
    check(isNumber(loudnessDb) && loudnessDb <= 0, 'loudnessDb: must be a finite number <= 0');
    check(isOneOf(URGENCY_LEVELS, urgency), `urgency: must be one of ${URGENCY_LEVELS.join(', ')}`);
    if (bearingOk && sourceOk) check((bearingDeg === null) === (bearingSource === 'none'), "bearingDeg, bearingSource: bearingSource must be 'none' exactly when bearingDeg is null");

    if (errors.length > 0) return { ok: false, errors };
    return {
      ok: true,
      event: {
        id: id as string,
        t: t as number,
        class: cls as SoundClass,
        label: label as string,
        confidence: confidence as number,
        bearingDeg: bearingDeg as number | null,
        bearingSource: bearingSource as BearingSource,
        loudnessDb: loudnessDb as number,
        urgency: urgency as Urgency,
      },
    };
  } catch {
    return { ok: false, errors: ['input could not be read'] };
  }
}
