import type { BearingResult } from '../bearing';
import type { Classification } from '../classify';
import { validateSoundEvent, type SoundClass, type SoundEvent, type Urgency } from '../events';
import type { Decision, HapticEngine } from '../haptics';

/** Urgency of each sound class. It depends on the class only. */
export const URGENCY_BY_CLASS: Readonly<Record<SoundClass, Urgency>> = Object.freeze({
  alarm: 'high',
  baby: 'high',
  doorbell: 'medium',
  knock: 'medium',
  vehicle: 'medium',
  voice: 'low',
  other: 'low',
});

/** What `buildEvent` reads: the clip's summary, the bearing, the loudness, the clock at the pattern stage and the id. */
export interface EventInput {
  classification: Classification;
  bearing: BearingResult;
  loudnessDb: number;
  nowMs: number;
  id: string;
}

/** A validated event with the bearing confidence, or the validator's errors. */
export type BuiltEvent = { ok: true; event: SoundEvent; bearingConfidence: number } | { ok: false; errors: string[] };

/** A validated event with the engine's decision, or the validator's errors. */
export type Processed = { ok: true; event: SoundEvent; bearingConfidence: number; decision: Decision } | { ok: false; errors: string[] };

/**
 * Turns a classification and a bearing into a `SoundEvent` checked by `validateSoundEvent`. Reads each field once,
 * repairs nothing, and never throws (junk input or a throwing getter gives `ok: false`). `bearingConfidence` is
 * `bearing.confidence`, unchanged. Pure.
 */
export function buildEvent(input: EventInput): BuiltEvent {
  let candidate: unknown;
  let bearingConfidence: number;
  try {
    const { classification, bearing, loudnessDb, nowMs, id } = input;
    const { class: cls, label, confidence } = classification;
    const { bearingDeg, source, confidence: bc } = bearing;
    bearingConfidence = bc;
    candidate = { id, t: nowMs, class: cls, label, confidence, bearingDeg, bearingSource: source, loudnessDb, urgency: URGENCY_BY_CLASS[cls] };
  } catch {
    return { ok: false, errors: ['input could not be read'] };
  }
  const v = validateSoundEvent(candidate);
  return v.ok ? { ok: true, event: v.event, bearingConfidence } : v;
}

/**
 * `buildEvent`, then `engine.decide({ event, bearingConfidence }, nowMs)` exactly once when the event is valid;
 * the engine is never called for an invalid event.
 */
export function processEvent(input: EventInput, engine: Pick<HapticEngine, 'decide'>): Processed {
  const built = buildEvent(input);
  if (!built.ok) return built;
  const { event, bearingConfidence } = built;
  return { ok: true, event, bearingConfidence, decision: engine.decide({ event, bearingConfidence }, event.t) };
}
