import type { SoundEvent } from '../../../src/events';
import type { GhostInput } from '../../../src/ghosts/types';
import { makeEvent } from '../../haptics/helpers/events';

export { makeEvent };

/** A GhostInput: `makeEvent(overrides)` (a high-urgency knock at +40 from `gcc-phat`) with a bearing confidence (default 1). */
export function ghostInput(overrides: Partial<SoundEvent> = {}, bearingConfidence = 1): GhostInput {
  return { event: makeEvent(overrides), bearingConfidence };
}

/** A certain ghost at a bearing. */
export const at = (bearingDeg: number, overrides: Partial<SoundEvent> = {}, bearingConfidence = 1) => ghostInput({ bearingDeg, bearingSource: 'gcc-phat', ...overrides }, bearingConfidence);
