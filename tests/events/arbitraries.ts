import fc from 'fast-check';
import { BEARING_SOURCES, SOUND_CLASSES, URGENCY_LEVELS, type SoundEvent } from '../../src/events';

export const FIELDS = ['id', 't', 'class', 'label', 'confidence', 'bearingDeg', 'bearingSource', 'loudnessDb', 'urgency'] as const;
export type Field = (typeof FIELDS)[number];

export const validEvent: fc.Arbitrary<SoundEvent> = fc
  .record({
    id: fc.string({ minLength: 1 }),
    t: fc.double({ min: 0, noNaN: true, noDefaultInfinity: true }),
    class: fc.constantFrom(...SOUND_CLASSES),
    label: fc.string({ minLength: 1 }).filter((s) => s.trim().length > 0),
    confidence: fc.double({ min: 0, max: 1, noNaN: true }),
    loudnessDb: fc.double({ min: -200, max: 0, noNaN: true }),
    urgency: fc.constantFrom(...URGENCY_LEVELS),
    bearing: fc.oneof(
      fc.constant({ bearingDeg: null, bearingSource: 'none' as const }),
      fc.record({ bearingDeg: fc.double({ min: -180, max: 180, noNaN: true }), bearingSource: fc.constantFrom('gcc-phat' as const, 'loudness' as const) }),
    ),
  })
  .map(({ bearing, ...rest }) => ({ ...rest, ...bearing }));

const nonFinite = fc.constantFrom(NaN, Infinity, -Infinity);
const notString = fc.oneof(fc.integer(), fc.boolean(), fc.constant(null), fc.constant(undefined), fc.object(), fc.array(fc.string()));
const notNumber = fc.oneof(fc.string(), fc.boolean(), fc.constant(null), fc.constant(undefined), fc.object(), fc.bigInt());
const unknownString = (known: readonly string[]) => fc.string().filter((s) => !known.includes(s));

/** Values that are invalid for a field on their own, whatever the other fields hold. */
export const invalidValue: Record<Field, fc.Arbitrary<unknown>> = {
  id: fc.oneof(fc.constant(''), notString),
  t: fc.oneof(fc.double({ max: -Number.MIN_VALUE, noNaN: true }), nonFinite, notNumber),
  class: fc.oneof(unknownString(SOUND_CLASSES), fc.constant(''), notString),
  label: fc.oneof(fc.constantFrom('', '   ', '\n\t', '  '), notString),
  confidence: fc.oneof(fc.double({ max: -Number.MIN_VALUE, noNaN: true }), fc.double({ min: 1.000001, noNaN: true }), nonFinite, notNumber),
  // null is valid for bearingDeg (with 'none'), so it is left to the coupling cases.
  bearingDeg: fc.oneof(fc.double({ max: -180.000001, noNaN: true }), fc.double({ min: 180.000001, noNaN: true }), nonFinite, notNumber.filter((v) => v !== null)),
  bearingSource: fc.oneof(unknownString(BEARING_SOURCES), fc.constant(''), notString),
  loudnessDb: fc.oneof(fc.double({ min: Number.MIN_VALUE, noNaN: true }), nonFinite, notNumber),
  urgency: fc.oneof(unknownString(URGENCY_LEVELS), fc.constant(''), notString),
};

/** A bearing pair where each field is valid alone but the two disagree. */
export const mismatchedBearing = fc.oneof(
  fc.record({ bearingDeg: fc.constant(null), bearingSource: fc.constantFrom('gcc-phat', 'loudness') }),
  fc.record({ bearingDeg: fc.double({ min: -180, max: 180, noNaN: true }), bearingSource: fc.constant('none') }),
);
