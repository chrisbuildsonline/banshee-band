import { describe, expect, it } from 'vitest';
import { BEARING_SOURCES, SOUND_CLASSES, URGENCY_LEVELS, type SoundEvent } from '../../src/events';

// The real checks here run in `bun run typecheck`: each @ts-expect-error must hit an error.
const sample: SoundEvent = {
  id: 'e1',
  t: 0,
  class: 'knock',
  label: 'Knock',
  confidence: 0.9,
  bearingDeg: -30,
  bearingSource: 'gcc-phat',
  loudnessDb: -20,
  urgency: 'medium',
};

// @ts-expect-error unknown class
const badClass: SoundEvent = { ...sample, class: 'dog' };
// @ts-expect-error unknown urgency
const badUrgency: SoundEvent = { ...sample, urgency: 'urgent' };
// @ts-expect-error missing field
const missing: SoundEvent = { id: 'e1', t: 0, class: 'knock', label: 'Knock', confidence: 1, bearingDeg: null, bearingSource: 'none', urgency: 'low' };

describe('SoundEvent constants', () => {
  it('lists the classes, bearing sources and urgency levels', () => {
    expect(SOUND_CLASSES).toEqual(['knock', 'doorbell', 'alarm', 'baby', 'vehicle', 'voice', 'other']);
    expect(BEARING_SOURCES).toEqual(['gcc-phat', 'loudness', 'none']);
    expect(URGENCY_LEVELS).toEqual(['low', 'medium', 'high']);
  });

  it('types a sample event with exactly the contract fields', () => {
    expect(Object.keys(sample).sort()).toEqual(['bearingDeg', 'bearingSource', 'class', 'confidence', 'id', 'label', 'loudnessDb', 't', 'urgency']);
    expect([badClass, badUrgency, missing]).toHaveLength(3);
  });
});
