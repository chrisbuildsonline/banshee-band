import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { BEARING_SOURCES, URGENCY_LEVELS, type SoundEvent } from '../../src/events';
import { PATTERN_CLASSES } from '../../src/haptics/constants';
import { createHapticEngine } from '../../src/haptics/engine';
import { loadPatterns } from '../../src/haptics/patterns';
import { sideOf } from '../../src/haptics/side';
import type { HapticClass, HapticCommand, HapticInput, Pattern } from '../../src/haptics/types';

/** Fixed fast-check seed and run count (R11.5). */
const SEED = 20261117;
const RUNS = 100;
const params = { seed: SEED, numRuns: RUNS };

const byClass = Object.fromEntries(loadPatterns().map((p) => [p.class, p])) as Record<HapticClass, Pattern>;

/** The rhythm of a pattern, built independently of the module: one cycle without its final 0, then `pause, cycle` per repeat. */
function rhythmOf(p: Pattern): number[] {
  const cycle = p.pulses.flatMap((q) => [q.onMs, q.gapMs]).slice(0, -1);
  let out = [...cycle];
  for (let r = 0; r < (p.repeat?.count ?? 0); r++) out = [...out, p.repeat!.pauseMs, ...cycle];
  return out;
}

const hapticClass = fc.constantFrom(...PATTERN_CLASSES);
const urgency = fc.constantFrom(...URGENCY_LEVELS);
/** Any bearing, including null, NaN, infinities and values that disagree with the source. */
const bearingDeg = fc.oneof(fc.constant(null), fc.double({ min: -180, max: 180 }), fc.double());
/** Any bearing confidence, including NaN and values outside [0, 1]. */
const confidence = fc.oneof(fc.double({ min: 0, max: 1 }), fc.constantFrom(0.79, 0.8, 0.8000001, 0.7999999, NaN, -0.1, 1.1), fc.double());
const loudness = fc.double({ min: -100, max: 0, noNaN: true });
const intensity = fc.double({ min: 0, max: 1, noNaN: true });

/** An event arbitrary; `id` is filler and replaced where uniqueness matters. */
const event = (cls: fc.Arbitrary<SoundEvent['class']> = hapticClass): fc.Arbitrary<SoundEvent> =>
  fc.record({
    id: fc.constant('e'),
    t: fc.constant(0),
    class: cls,
    label: fc.constant('filler'),
    confidence: fc.double({ min: 0, max: 1, noNaN: true }),
    bearingDeg,
    bearingSource: fc.constantFrom(...BEARING_SOURCES),
    loudnessDb: loudness,
    urgency,
  });

const input = (cls?: fc.Arbitrary<SoundEvent['class']>): fc.Arbitrary<HapticInput> =>
  fc.record({ event: event(cls), bearingConfidence: confidence });

/** Settings that are valid, partly junk, or entirely junk. */
const settings = fc.oneof(
  fc.record(
    {
      enabledClasses: fc.dictionary(fc.constantFrom(...PATTERN_CLASSES, 'other', 'x'), fc.oneof(fc.boolean(), fc.anything())),
      minLoudnessDb: fc.oneof(fc.double({ min: -100, max: 0, noNaN: true }), fc.anything()),
      intensity: fc.oneof(intensity, fc.anything()),
      rateLimitMs: fc.oneof(fc.integer({ min: 0, max: 6000 }), fc.anything()),
    },
    { requiredKeys: [] },
  ),
  fc.anything(),
);

/** Plays one input on a fresh engine, where nothing can drop it (loud enough, all classes on). */
function freshPlay(inp: HapticInput, intens: number): HapticCommand {
  const d = createHapticEngine({ intensity: intens, minLoudnessDb: -100 }).decide(inp, 0);
  if (d.action !== 'play') throw new Error(`expected play, got ${d.reason}`);
  return d.command;
}

/** A sequence of inputs with unique ids and non-decreasing times. */
const sequence = fc
  .array(fc.record({ inp: input(fc.oneof({ weight: 9, arbitrary: hapticClass }, { weight: 1, arbitrary: fc.constant('other' as const) })), dt: fc.oneof(fc.constant(0), fc.integer({ min: 0, max: 5000 })) }), {
    maxLength: 40,
  })
  .map((steps) => {
    let t = 0;
    return steps.map((s, i) => {
      t += s.dt;
      return { input: { ...s.inp, event: { ...s.inp.event, id: `ev-${i}` } }, nowMs: t };
    });
  });

describe('haptics properties (R11.5)', () => {
  it('1: the rhythm is identical across side, urgency and intensity of one class', () => {
    fc.assert(
      fc.property(hapticClass, input(), input(), intensity, intensity, (cls, a, b, ia, ib) => {
        const ca = freshPlay({ ...a, event: { ...a.event, class: cls } }, ia);
        const cb = freshPlay({ ...b, event: { ...b.event, class: cls } }, ib);
        expect(ca.vibrate).toEqual(cb.vibrate);
        expect(ca.segments.map((s) => s.ms)).toEqual(cb.segments.map((s) => s.ms));
        expect(ca.vibrate).toEqual(rhythmOf(byClass[cls]));
      }),
      params,
    );
  });

  it("2: 'loudness' or 'none', or a bearing confidence below 0.8, never gives sideKnown", () => {
    const uncertain = fc.oneof(
      input().map((i) => ({ ...i, event: { ...i.event, bearingSource: 'loudness' as const } })),
      input().map((i) => ({ ...i, event: { ...i.event, bearingSource: 'none' as const } })),
      fc.tuple(input(), fc.oneof(fc.double({ max: 0.8, maxExcluded: true }), fc.constant(NaN))).map(([i, c]) => ({ ...i, bearingConfidence: c })),
    );
    fc.assert(
      fc.property(uncertain, intensity, (inp, intens) => {
        expect(sideOf(inp.event, inp.bearingConfidence)).toBe('unknown');
        const c = freshPlay(inp, intens);
        expect(c.sideKnown).toBe(false);
        expect(c.side).toBe('unknown');
        expect(c.segments[0].left).toBe(c.segments[0].right);
      }),
      params,
    );
  });

  it('3: totalMs is the sum of the segment ms and of vibrate', () => {
    fc.assert(
      fc.property(input(), intensity, (inp, intens) => {
        const c = freshPlay(inp, intens);
        const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
        expect(c.totalMs).toBe(sum(c.segments.map((s) => s.ms)));
        expect(c.totalMs).toBe(sum(c.vibrate));
        expect(c.totalMs).toBeLessThanOrEqual(4000);
      }),
      params,
    );
  });

  it('4: vibrate alternates on and off from on, has an odd length, and is the rhythm of the pattern', () => {
    fc.assert(
      fc.property(input(), intensity, (inp, intens) => {
        const c = freshPlay(inp, intens);
        expect(c.vibrate.length % 2).toBe(1);
        expect(c.vibrate).toEqual(c.segments.map((s) => s.ms));
        expect(c.vibrate).toEqual(rhythmOf(byClass[c.class]));
        c.vibrate.forEach((ms) => expect(Number.isInteger(ms) && ms > 0).toBe(true));
        // pulses at even indices, rests at odd indices
        c.segments.forEach((s, i) => {
          if (i % 2 === 1) expect([s.left, s.right]).toEqual([0, 0]);
          else if (intens > 0) expect(Math.max(s.left, s.right)).toBeGreaterThan(0);
        });
      }),
      params,
    );
  });

  it('5: every level is in [0, 1], and rests are 0 and 0', () => {
    fc.assert(
      fc.property(input(), settings, (inp, s) => {
        const d = createHapticEngine(s).decide(inp, 0);
        if (d.action !== 'play') return;
        d.command.segments.forEach((seg, i) => {
          for (const v of [seg.left, seg.right]) {
            expect(Number.isFinite(v)).toBe(true);
            expect(v).toBeGreaterThanOrEqual(0);
            expect(v).toBeLessThanOrEqual(1);
          }
          if (i % 2 === 1) expect([seg.left, seg.right]).toEqual([0, 0]);
        });
      }),
      params,
    );
  });

  it('6: decide never throws for a valid event and a finite nowMs, whatever the settings', () => {
    fc.assert(
      fc.property(settings, fc.array(fc.tuple(input(fc.constantFrom(...PATTERN_CLASSES, 'other' as const)), fc.double({ noNaN: true, noDefaultInfinity: true })), { maxLength: 10 }), (s, calls) => {
        const e = createHapticEngine(s);
        for (const [inp, t] of calls) {
          const d = e.decide(inp, t);
          expect(['play', 'drop']).toContain(d.action);
        }
      }),
      params,
    );
  });

  it('7: no dropped event is returned later in a play result', () => {
    fc.assert(
      fc.property(settings, sequence, (s, steps) => {
        const e = createHapticEngine(s);
        const dropped = new Set<string>();
        for (const { input: inp, nowMs } of steps) {
          const d = e.decide(inp, nowMs);
          if (d.action === 'drop') {
            dropped.add(inp.event.id);
          } else {
            expect(dropped.has(d.command.eventId)).toBe(false);
            expect(d.command.eventId).toBe(inp.event.id);
          }
        }
      }),
      params,
    );
  });

  it('8: a play that replaces a command still playing has a strictly higher priority', () => {
    fc.assert(
      fc.property(settings, sequence, (s, steps) => {
        const e = createHapticEngine(s);
        let current: { endMs: number; priority: number } | null = null;
        for (const { input: inp, nowMs } of steps) {
          const d = e.decide(inp, nowMs);
          if (d.action === 'drop') continue;
          if (current !== null && nowMs < current.endMs) expect(d.command.priority).toBeGreaterThan(current.priority);
          current = { endMs: nowMs + d.command.totalMs, priority: d.command.priority };
        }
      }),
      params,
    );
  });

  it('a drop changes no state: replaying only the played calls gives the same commands', () => {
    fc.assert(
      fc.property(settings, sequence, (s, steps) => {
        const a = createHapticEngine(s);
        const played = steps.map((st) => ({ ...st, d: a.decide(st.input, st.nowMs) })).filter((x) => x.d.action === 'play');
        const b = createHapticEngine(s);
        for (const x of played) expect(b.decide(x.input, x.nowMs)).toEqual(x.d);
      }),
      params,
    );
  });

  it("'other' never plays, in any state", () => {
    fc.assert(
      fc.property(settings, sequence, input(fc.constant('other' as const)), (s, steps, other) => {
        const e = createHapticEngine(s);
        for (const st of steps) {
          e.decide(st.input, st.nowMs);
          expect(e.decide(other, st.nowMs)).toEqual({ action: 'drop', reason: 'no-pattern' });
        }
      }),
      params,
    );
  });
});
