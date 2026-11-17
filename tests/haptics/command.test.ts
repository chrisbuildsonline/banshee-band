import { describe, expect, it } from 'vitest';
import type { Urgency } from '../../src/events';
import { buildCommand } from '../../src/haptics/command';
import { loadPatterns } from '../../src/haptics/patterns';
import type { HapticClass, HapticCommand, Pattern, Segment, Side } from '../../src/haptics/types';

const byClass = Object.fromEntries(loadPatterns().map((p) => [p.class, p])) as Record<HapticClass, Pattern>;

/** Builds a command for a real pattern; priority and id are filler unless given. */
const build = (cls: HapticClass, side: Side, urgency: Urgency, intensity = 1, eventId = 'e1', priority = 7) =>
  buildCommand(byClass[cls], side, urgency, intensity, eventId, priority);

/** Segments from `[ms, left, right]` triples. */
const segs = (...t: [number, number, number][]): Segment[] => t.map(([ms, left, right]) => ({ ms, left, right }));

/** Compares segments: ms exactly, levels to 12 digits. */
function expectSegments(actual: Segment[], expected: Segment[]): void {
  expect(actual.map((s) => s.ms)).toEqual(expected.map((s) => s.ms));
  actual.forEach((s, i) => {
    expect(s.left, `segment ${i} left`).toBeCloseTo(expected[i].left, 12);
    expect(s.right, `segment ${i} right`).toBeCloseTo(expected[i].right, 12);
  });
}

/** The alarm rhythm: 150/100/150/100/150, four cycles with 400 ms pauses. */
const ALARM_CYCLE = [150, 100, 150, 100, 150];
const ALARM_VIBRATE = [...ALARM_CYCLE, 400, ...ALARM_CYCLE, 400, ...ALARM_CYCLE, 400, ...ALARM_CYCLE];

function expectWellFormed(c: HapticCommand): void {
  expect(c.segments.length % 2).toBe(1);
  c.segments.forEach((s, i) => {
    expect(Number.isInteger(s.ms) && s.ms > 0, `segment ${i} ms ${s.ms}`).toBe(true);
    if (i % 2 === 1) expect([s.left, s.right]).toEqual([0, 0]);
    for (const v of [s.left, s.right]) expect(v >= 0 && v <= 1, `segment ${i} level ${v}`).toBe(true);
  });
  expect(c.vibrate).toEqual(c.segments.map((s) => s.ms));
  expect(c.totalMs).toBe(c.vibrate.reduce((a, b) => a + b, 0));
  expect(c.totalMs).toBeLessThanOrEqual(4000);
}

describe('buildCommand rhythm (R7)', () => {
  it('knock, left, high: 70 / 100 / 70 with 1 and 0.3', () => {
    const c = build('knock', 'left', 'high');
    expectSegments(c.segments, segs([70, 1, 0.3], [100, 0, 0], [70, 1, 0.3]));
    expect(c.vibrate).toEqual([70, 100, 70]);
    expect(c.totalMs).toBe(240);
  });

  it('knock, right, low: 0.15 and 0.5', () => {
    const c = build('knock', 'right', 'low');
    expectSegments(c.segments, segs([70, 0.15, 0.5], [100, 0, 0], [70, 0.15, 0.5]));
    expect(c.vibrate).toEqual([70, 100, 70]);
    expect(c.totalMs).toBe(240);
  });

  it('voice: one pulse, one segment', () => {
    const c = build('voice', 'centre', 'medium');
    expectSegments(c.segments, segs([250, 0.75, 0.75]));
    expect(c.vibrate).toEqual([250]);
    expect(c.totalMs).toBe(250);
  });

  it('doorbell: 250 / 150 / 250', () => {
    const c = build('doorbell', 'unknown', 'high');
    expectSegments(c.segments, segs([250, 1, 1], [150, 0, 0], [250, 1, 1]));
    expect(c.totalMs).toBe(650);
  });

  it('vehicle: 80 / 100 / 400', () => {
    const c = build('vehicle', 'right', 'high');
    expectSegments(c.segments, segs([80, 0.3, 1], [100, 0, 0], [400, 0.3, 1]));
    expect(c.totalMs).toBe(580);
  });

  it('baby: four pulses of 100 with gaps of 80', () => {
    const c = build('baby', 'left', 'medium');
    expect(c.vibrate).toEqual([100, 80, 100, 80, 100, 80, 100]);
    expectSegments(c.segments, segs([100, 0.75, 0.225], [80, 0, 0], [100, 0.75, 0.225], [80, 0, 0], [100, 0.75, 0.225], [80, 0, 0], [100, 0.75, 0.225]));
    expect(c.totalMs).toBe(640);
  });

  it('alarm: 3 pulses, 4 cycles, 400 ms pauses, 3800 ms', () => {
    const c = build('alarm', 'centre', 'high');
    expect(c.vibrate).toEqual(ALARM_VIBRATE);
    expect(c.vibrate).toHaveLength(23);
    expect(c.segments.filter((_, i) => i % 2 === 0)).toHaveLength(12);
    expect(c.segments.filter((s) => s.ms === 400)).toHaveLength(3);
    expect(c.totalMs).toBe(3800);
    expectWellFormed(c);
  });

  it('every class gives a well-formed command, one cycle unless alarm', () => {
    const cycles: Record<HapticClass, number> = { knock: 240, doorbell: 650, alarm: 650, baby: 640, vehicle: 580, voice: 250 };
    for (const cls of Object.keys(cycles) as HapticClass[]) {
      for (const side of ['left', 'right', 'centre', 'unknown'] as Side[]) {
        for (const u of ['low', 'medium', 'high'] as Urgency[]) {
          const c = build(cls, side, u);
          expectWellFormed(c);
          expect(c.totalMs).toBe(cls === 'alarm' ? 3800 : cycles[cls]);
        }
      }
    }
  });
});

describe('buildCommand levels (R6)', () => {
  const BASE: Record<Urgency, number> = { low: 0.5, medium: 0.75, high: 1 };

  it('left and right: the near motor gets the level, the far one 0.3 times it; centre and unknown both', () => {
    for (const intensity of [1, 0.5, 0]) {
      for (const u of ['low', 'medium', 'high'] as Urgency[]) {
        const level = BASE[u] * intensity;
        const pulse = (side: Side) => build('knock', side, u, intensity).segments[0];
        expect(pulse('left').left).toBeCloseTo(level, 12);
        expect(pulse('left').right).toBeCloseTo(level * 0.3, 12);
        expect(pulse('right').right).toBeCloseTo(level, 12);
        expect(pulse('right').left).toBeCloseTo(level * 0.3, 12);
        for (const side of ['centre', 'unknown'] as Side[]) {
          expect(pulse(side).left).toBeCloseTo(level, 12);
          expect(pulse(side).right).toBeCloseTo(level, 12);
        }
      }
    }
  });

  it('literal levels: high 1 / 0.3, medium 0.75 / 0.225, low 0.5 / 0.15; intensity 0.5 halves them', () => {
    expect(build('knock', 'left', 'high').segments[0]).toMatchObject({ left: 1 });
    expect(build('knock', 'left', 'high').segments[0].right).toBeCloseTo(0.3, 12);
    expect(build('knock', 'left', 'medium').segments[0].left).toBeCloseTo(0.75, 12);
    expect(build('knock', 'left', 'medium').segments[0].right).toBeCloseTo(0.225, 12);
    expect(build('knock', 'right', 'low').segments[0].right).toBeCloseTo(0.5, 12);
    expect(build('knock', 'right', 'low').segments[0].left).toBeCloseTo(0.15, 12);
    expect(build('knock', 'centre', 'high', 0.5).segments[0]).toMatchObject({ left: 0.5, right: 0.5 });
    expect(build('knock', 'left', 'low', 0.5).segments[0].left).toBeCloseTo(0.25, 12);
    expect(build('knock', 'left', 'low', 0.5).segments[0].right).toBeCloseTo(0.075, 12);
  });

  it('intensity 0 gives all-zero levels but keeps the rhythm', () => {
    const c = build('alarm', 'left', 'high', 0);
    for (const s of c.segments) expect([s.left, s.right]).toEqual([0, 0]);
    expect(c.vibrate).toEqual(ALARM_VIBRATE);
    expect(c.totalMs).toBe(3800);
  });

  it('the rhythm is the same for every side, urgency and intensity', () => {
    for (const cls of Object.keys(byClass) as HapticClass[]) {
      const ref = build(cls, 'centre', 'high').vibrate;
      for (const side of ['left', 'right', 'centre', 'unknown'] as Side[]) {
        for (const u of ['low', 'medium', 'high'] as Urgency[]) {
          for (const intensity of [0, 0.3, 1]) expect(build(cls, side, u, intensity).vibrate).toEqual(ref);
        }
      }
    }
  });

  it('every level is in [0, 1]', () => {
    for (const side of ['left', 'right', 'centre', 'unknown'] as Side[]) {
      for (const u of ['low', 'medium', 'high'] as Urgency[]) {
        for (const s of build('baby', side, u).segments) {
          for (const v of [s.left, s.right]) {
            expect(v).toBeGreaterThanOrEqual(0);
            expect(v).toBeLessThanOrEqual(1);
          }
        }
      }
    }
  });
});

describe('buildCommand fields and copies (R7.1, R7.7, R1.6)', () => {
  it('has exactly the fields of R7.1', () => {
    const c = build('knock', 'left', 'high', 1, 'abc', 32);
    expect(Object.keys(c).sort()).toEqual(['class', 'eventId', 'priority', 'segments', 'side', 'sideKnown', 'totalMs', 'vibrate']);
    expect(c).toMatchObject({ eventId: 'abc', class: 'knock', side: 'left', sideKnown: true, priority: 32 });
    expect(build('knock', 'unknown', 'high').sideKnown).toBe(false);
    expect(build('knock', 'centre', 'high').sideKnown).toBe(true);
    expect(build('knock', 'right', 'high').sideKnown).toBe(true);
  });

  it('does not change the pattern, and a changed command does not change the next one', () => {
    const pattern = byClass.alarm;
    const before = JSON.stringify(pattern);
    const a = buildCommand(pattern, 'left', 'high', 1, 'a', 36);
    a.vibrate[0] = 1;
    a.segments[0].ms = 1;
    a.segments[0].left = 0;
    a.segments.pop();
    expect(JSON.stringify(pattern)).toBe(before);
    const b = buildCommand(pattern, 'left', 'high', 1, 'a', 36);
    expect(b.vibrate).toEqual(ALARM_VIBRATE);
    expect(b.segments[0]).toMatchObject({ ms: 150, left: 1 });
  });
});
