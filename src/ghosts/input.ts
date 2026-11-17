import { validateSoundEvent } from '../events';
import type { GhostInput } from './types';

/**
 * Accepts an untrusted value as a `GhostInput`: a non-null object with an `event` that passes
 * `validateSoundEvent`. Returns a new input with the validated event, or `null`. A bearing confidence that
 * is not a number becomes `NaN`, which makes the ghost uncertain. Never throws and never modifies `value`.
 */
export function acceptInput(value: unknown): GhostInput | null {
  try {
    if (typeof value !== 'object' || value === null || Array.isArray(value) || !('event' in value)) return null;
    const { event, bearingConfidence } = value as { event: unknown; bearingConfidence?: unknown };
    const result = validateSoundEvent(event);
    if (!result.ok) return null;
    return { event: result.event, bearingConfidence: typeof bearingConfidence === 'number' ? bearingConfidence : Number.NaN };
  } catch {
    return null;
  }
}
