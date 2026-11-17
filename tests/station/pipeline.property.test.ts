import fc from 'fast-check';
import { describe, expect, it, vi } from 'vitest';
import type { BearingResult } from '../../src/bearing';
import { SOUND_CLASSES, validateSoundEvent } from '../../src/events';
import type { HapticEngine } from '../../src/haptics';
import { buildEvent, processEvent, URGENCY_BY_CLASS, type EventInput } from '../../src/station/pipeline';

const RUNS = { seed: 20261117, numRuns: 200 };

const unit = fc.double({ min: 0, max: 1, noNaN: true });
const cls = fc.constantFrom(...SOUND_CLASSES);
const label = fc.string({ minLength: 1 }).filter((s) => s.trim().length > 0);
const bearing: fc.Arbitrary<BearingResult> = fc
  .tuple(
    fc.oneof(
      fc.record({ source: fc.constantFrom('gcc-phat' as const, 'loudness' as const), bearingDeg: fc.double({ min: -90, max: 90, noNaN: true }) }),
      fc.constant({ source: 'none' as const, bearingDeg: null }),
    ),
    unit,
  )
  .map(([b, confidence]) => ({ ...b, confidence, lagSec: null, ildDb: null, usedFrames: 1, skippedFrames: 0 }));
const loudness = fc.double({ min: -120, max: 0, noNaN: true });

const validInput: fc.Arbitrary<EventInput> = fc.record({
  classification: fc.record({ class: cls, label, confidence: unit }),
  bearing,
  loudnessDb: loudness,
  nowMs: fc.double({ min: 0, max: 1e9, noNaN: true }),
  id: fc.string({ minLength: 1 }),
});

const junk = <T>(arb: fc.Arbitrary<T>) => fc.oneof(arb, fc.anything(), fc.constantFrom(Number.NaN, Infinity, -Infinity, undefined, null));
const junkInput = fc.oneof(
  fc.anything(),
  fc.record({
    classification: junk(fc.record({ class: junk(cls), label: junk(label), confidence: junk(unit) })),
    bearing: junk(bearing.map((b) => ({ ...b, bearingDeg: b.bearingDeg as unknown, source: b.source as unknown }))),
    loudnessDb: junk(loudness),
    nowMs: junk(fc.double({ noNaN: true })),
    id: junk(fc.string()),
  }),
);

const spyEngine = () => ({ decide: vi.fn<HapticEngine['decide']>(() => ({ action: 'drop', reason: 'too-quiet' })) });

/** The validator's verdict on the event the spec builds from an input; false when the input cannot be read. */
function verdict(input: unknown): boolean {
  try {
    const { classification: c, bearing: b, loudnessDb, nowMs, id } = input as EventInput;
    return validateSoundEvent({ id, t: nowMs, class: c.class, label: c.label, confidence: c.confidence, bearingDeg: b.bearingDeg, bearingSource: b.source, loudnessDb, urgency: URGENCY_BY_CLASS[c.class] }).ok;
  } catch {
    return false;
  }
}

describe('pipeline properties (R9.7)', () => {
  it('any valid input gives a valid event with the urgency of its class, and decide is called once', () => {
    fc.assert(
      fc.property(validInput, (input) => {
        const engine = spyEngine();
        const r = processEvent(input, engine);
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(validateSoundEvent(r.event)).toEqual({ ok: true, event: r.event });
        expect(r.event.urgency).toBe(URGENCY_BY_CLASS[input.classification.class]);
        expect(r.bearingConfidence).toBe(input.bearing.confidence);
        expect(engine.decide).toHaveBeenCalledTimes(1);
        expect(engine.decide).toHaveBeenCalledWith({ event: r.event, bearingConfidence: input.bearing.confidence }, input.nowMs);
      }),
      RUNS,
    );
  });

  it('a non-finite or positive loudness never reaches the engine', () => {
    const bad = fc.oneof(fc.constantFrom(Number.NaN, Infinity, -Infinity), fc.double({ min: Number.MIN_VALUE, noNaN: true }));
    fc.assert(
      fc.property(validInput, bad, (input, loudnessDb) => {
        const engine = spyEngine();
        expect(processEvent({ ...input, loudnessDb }, engine).ok).toBe(false);
        expect(engine.decide).not.toHaveBeenCalled();
      }),
      RUNS,
    );
  });

  it('any input at all never throws, and ok is the validator verdict on the built event', () => {
    fc.assert(
      fc.property(junkInput, (input) => {
        const engine = spyEngine();
        const built = buildEvent(input as EventInput);
        const processed = processEvent(input as EventInput, engine);
        expect(built.ok).toBe(verdict(input));
        expect(processed.ok).toBe(built.ok);
        expect(engine.decide).toHaveBeenCalledTimes(built.ok ? 1 : 0);
      }),
      RUNS,
    );
  });

  it('urgency depends on the class only', () => {
    fc.assert(
      fc.property(validInput, bearing, loudness, (input, b2, l2) => {
        const a = buildEvent(input);
        const b = buildEvent({ ...input, bearing: b2, loudnessDb: l2 });
        expect(a.ok && b.ok && a.event.urgency === b.event.urgency).toBe(true);
      }),
      RUNS,
    );
  });
});
