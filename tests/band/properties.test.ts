import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { createSegmentPlayer, type Levels } from '../../src/band/segment-player';
import { BEARING_SOURCES, URGENCY_LEVELS, type SoundEvent } from '../../src/events';
import { PATTERN_CLASSES, createHapticEngine, type HapticCommand } from '../../src/haptics';
import { createFakeScheduler } from './helpers/fake-scheduler';

/** Fixed fast-check seed and run count (R10.4). */
const params = { seed: 20261117, numRuns: 200 };

/** Any bearing, including null, NaN and values that disagree with the source. */
const bearingDeg = fc.oneof(fc.constant(null), fc.double({ min: -180, max: 180 }), fc.double());
/** Any bearing confidence, including junk. */
const confidence = fc.oneof(fc.double({ min: 0, max: 1 }), fc.constantFrom(0.5, 0.8, 0.9, NaN, -1, 2), fc.double());
/** Intensity from 0 (the all-zero command) to 1, or junk that the engine replaces with its default. */
const intensity = fc.oneof(fc.constant(0), fc.double({ min: 0, max: 1, noNaN: true }), fc.anything());
const settings = fc.oneof({ weight: 4, arbitrary: fc.record({ intensity }) }, { weight: 1, arbitrary: fc.anything() });

const engineInput = fc.record({
  event: fc.record({
    id: fc.constant('p'),
    t: fc.constant(0),
    class: fc.constantFrom(...PATTERN_CLASSES),
    label: fc.constant('filler'),
    confidence: fc.double({ min: 0, max: 1, noNaN: true }),
    bearingDeg,
    bearingSource: fc.constantFrom(...BEARING_SOURCES),
    loudnessDb: fc.constant(-20),
    urgency: fc.constantFrom(...URGENCY_LEVELS),
  }) as fc.Arbitrary<SoundEvent>,
  bearingConfidence: confidence,
  settings,
});

/** A command the real engine builds for the generated input, or null when the (junk) settings drop it. */
function commandFor(inp: { event: SoundEvent; bearingConfidence: number; settings: unknown }): HapticCommand | null {
  const d = createHapticEngine(inp.settings).decide({ event: inp.event, bearingConfidence: inp.bearingConfidence }, 0);
  return d.action === 'play' ? d.command : null;
}

describe('segment player on engine commands (R10.4)', () => {
  it('reproduces the segments in order at their cumulative offsets, then 0/0 at totalMs', () => {
    fc.assert(
      fc.property(engineInput, (inp) => {
        const command = commandFor(inp);
        fc.pre(command !== null);
        const cmd = command!;
        const clock = createFakeScheduler();
        const got: (Levels & { at: number })[] = [];
        const player = createSegmentPlayer((l) => got.push({ at: clock.now(), ...l }), clock.scheduler);
        player.play(cmd);
        clock.runAll();

        expect(got.length).toBe(cmd.segments.length + 1);
        let offset = 0;
        cmd.segments.forEach((s, i) => {
          expect(got[i]).toEqual({ at: offset, left: s.left, right: s.right });
          offset += s.ms;
        });
        expect(got.at(-1)).toEqual({ at: cmd.totalMs, left: 0, right: 0 });
        expect(offset).toBe(cmd.totalMs);
        expect(clock.pending()).toBe(0);
      }),
      params,
    );
  });
});
