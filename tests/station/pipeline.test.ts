import { describe, expect, it, vi } from 'vitest';
import type { BearingResult } from '../../src/bearing';
import { SOUND_CLASSES, type SoundClass } from '../../src/events';
import { createHapticEngine, type Decision, type HapticEngine } from '../../src/haptics';
import { buildEvent, processEvent, URGENCY_BY_CLASS, type EventInput } from '../../src/station/pipeline';

const BEARING: BearingResult = { bearingDeg: -53.5, source: 'gcc-phat', confidence: 0.93, lagSec: -0.0001875, ildDb: 0, usedFrames: 7, skippedFrames: 0 };
const KNOCK: EventInput = { classification: { class: 'knock', label: 'Knock', confidence: 0.67 }, bearing: BEARING, loudnessDb: -20, nowMs: 1234.5, id: 'station-1' };

const withClass = (cls: string): EventInput => ({ ...KNOCK, classification: { ...KNOCK.classification, class: cls as SoundClass } });
const withBearing = (b: Partial<BearingResult>): EventInput => ({ ...KNOCK, bearing: { ...BEARING, ...b } });

const throwingGetter = Object.defineProperty({ ...KNOCK }, 'bearing', {
  get() {
    throw new Error('boom');
  },
}) as EventInput;

/** Invalid inputs and the field their error must name ('' when any error will do). */
const INVALID: [string, EventInput, string][] = [
  ['loudness NaN', { ...KNOCK, loudnessDb: Number.NaN }, 'loudnessDb'],
  ['loudness 3', { ...KNOCK, loudnessDb: 3 }, 'loudnessDb'],
  ['loudness Infinity', { ...KNOCK, loudnessDb: Infinity }, 'loudnessDb'],
  ["label ''", { ...KNOCK, classification: { ...KNOCK.classification, label: '' } }, 'label'],
  ["label '   '", { ...KNOCK, classification: { ...KNOCK.classification, label: '   ' } }, 'label'],
  ['confidence 1.2', { ...KNOCK, classification: { ...KNOCK.classification, confidence: 1.2 } }, 'confidence'],
  ['confidence NaN', { ...KNOCK, classification: { ...KNOCK.classification, confidence: Number.NaN } }, 'confidence'],
  ['bearing 200', withBearing({ bearingDeg: 200 }), 'bearingDeg'],
  ["source 'none' with 10", withBearing({ source: 'none', bearingDeg: 10 }), 'bearingSource'],
  ["source 'gcc-phat' with null", withBearing({ source: 'gcc-phat', bearingDeg: null }), 'bearingSource'],
  ["class 'cat'", withClass('cat'), 'class'],
  ['nowMs -1', { ...KNOCK, nowMs: -1 }, 't'],
  ['nowMs NaN', { ...KNOCK, nowMs: Number.NaN }, 't'],
  ["id ''", { ...KNOCK, id: '' }, 'id'],
  ['undefined input', undefined as unknown as EventInput, ''],
  ['a getter that throws', throwingGetter, ''],
];

const spyEngine = (decision: Decision = { action: 'drop', reason: 'no-pattern' }) => ({ decide: vi.fn<HapticEngine['decide']>(() => decision) });

describe('URGENCY_BY_CLASS (R9.2)', () => {
  it('is frozen and has exactly the seven literals', () => {
    expect(Object.isFrozen(URGENCY_BY_CLASS)).toBe(true);
    expect(URGENCY_BY_CLASS).toEqual({ alarm: 'high', baby: 'high', doorbell: 'medium', knock: 'medium', vehicle: 'medium', voice: 'low', other: 'low' });
    for (const c of SOUND_CLASSES) expect(URGENCY_BY_CLASS[c], c).toBeDefined();
  });
});

describe('buildEvent (R9.3, R9.4)', () => {
  it('builds the literal Knock event', () => {
    expect(buildEvent(KNOCK)).toEqual({
      ok: true,
      event: { id: 'station-1', t: 1234.5, class: 'knock', label: 'Knock', confidence: 0.67, bearingDeg: -53.5, bearingSource: 'gcc-phat', loudnessDb: -20, urgency: 'medium' },
      bearingConfidence: 0.93,
    });
  });

  it('takes the urgency from the class', () => {
    const expected: Record<SoundClass, string> = { alarm: 'high', baby: 'high', doorbell: 'medium', knock: 'medium', vehicle: 'medium', voice: 'low', other: 'low' };
    for (const c of SOUND_CLASSES) {
      const r = buildEvent(withClass(c));
      expect(r.ok && r.event.urgency, c).toBe(expected[c]);
    }
  });

  it('passes the bearing confidence on unchanged', () => {
    for (const confidence of [0.93, 0]) {
      const r = buildEvent(withBearing({ confidence }));
      expect(r.ok && r.bearingConfidence).toBe(confidence);
    }
  });

  it("accepts source 'none' with a null bearing", () => {
    const r = buildEvent(withBearing({ source: 'none', bearingDeg: null, confidence: 0 }));
    expect(r.ok && [r.event.bearingDeg, r.event.bearingSource]).toEqual([null, 'none']);
  });

  it.each(INVALID)('%s gives ok: false with an error that names the field', (_name, input, field) => {
    let r: ReturnType<typeof buildEvent> | undefined;
    expect(() => (r = buildEvent(input))).not.toThrow();
    expect(r?.ok).toBe(false);
    if (r && !r.ok) {
      expect(r.errors.length).toBeGreaterThan(0);
      if (field) expect(r.errors.some((e) => e.split(':')[0].split(', ').includes(field)), r.errors.join('; ')).toBe(true);
    }
  });
});

describe('processEvent (R9.5)', () => {
  it('calls decide once with the event, the bearing confidence and nowMs', () => {
    const engine = spyEngine();
    const r = processEvent(KNOCK, engine);
    const built = buildEvent(KNOCK);
    if (!built.ok) throw new Error('KNOCK must be valid');
    expect(engine.decide).toHaveBeenCalledTimes(1);
    expect(engine.decide).toHaveBeenCalledWith({ event: built.event, bearingConfidence: 0.93 }, 1234.5);
    expect(r).toEqual({ ok: true, event: built.event, bearingConfidence: 0.93, decision: { action: 'drop', reason: 'no-pattern' } });
  });

  it.each(INVALID)('%s: decide is never called', (_name, input) => {
    const engine = spyEngine();
    const r = processEvent(input, engine);
    expect(r.ok).toBe(false);
    expect(engine.decide).not.toHaveBeenCalled();
  });

  it('with the real engine: Knock plays, other has no pattern, -60 dBFS is too quiet', () => {
    const decide = (input: EventInput) => {
      const r = processEvent(input, createHapticEngine());
      return r.ok ? r.decision : null;
    };
    const knock = decide(KNOCK);
    expect(knock?.action).toBe('play');
    expect(knock?.action === 'play' && [knock.command.class, knock.command.side, knock.command.eventId]).toEqual(['knock', 'left', 'station-1']);
    expect(decide(withClass('other'))).toEqual({ action: 'drop', reason: 'no-pattern' });
    expect(decide({ ...KNOCK, loudnessDb: -60 })).toEqual({ action: 'drop', reason: 'too-quiet' });
  });
});
