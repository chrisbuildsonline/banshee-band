import type { SoundEvent } from '../../../src/events';
import type { HapticInput } from '../../../src/haptics/types';

let next = 0;

/** A valid SoundEvent: a loud, confident, high-urgency knock from the right. Id, label and times are filler. */
export function makeEvent(overrides: Partial<SoundEvent> = {}): SoundEvent {
  next++;
  return {
    id: `ev-${next}`,
    t: 1000,
    class: 'knock',
    label: 'Knock',
    confidence: 0.9,
    bearingDeg: 40,
    bearingSource: 'gcc-phat',
    loudnessDb: -20,
    urgency: 'high',
    ...overrides,
  };
}

/** A HapticInput: `makeEvent(overrides)` with a bearing confidence (default 1). */
export function makeInput(overrides: Partial<SoundEvent> = {}, bearingConfidence = 1): HapticInput {
  return { event: makeEvent(overrides), bearingConfidence };
}
