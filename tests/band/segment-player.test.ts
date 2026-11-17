import { afterEach, describe, expect, it, vi } from 'vitest';
import { browserScheduler, createSegmentPlayer, type Levels } from '../../src/band/segment-player';
import type { HapticCommand } from '../../src/haptics';
import { ALARM_CENTRE_HIGH, KNOCK_LEFT_HIGH } from './helpers/commands';
import { createFakeScheduler } from './helpers/fake-scheduler';

interface Emission {
  at: number;
  left: number;
  right: number;
}

/** A player on a fresh fake clock that records `{ at, left, right }` for every emission. */
function setup() {
  const clock = createFakeScheduler();
  const emissions: Emission[] = [];
  const player = createSegmentPlayer((l) => emissions.push({ at: clock.now(), left: l.left, right: l.right }), clock.scheduler);
  return { clock, emissions, player };
}

const command = (overrides: Partial<HapticCommand>): HapticCommand => ({ ...KNOCK_LEFT_HIGH, ...overrides });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('createSegmentPlayer: offsets (R2.4, R2.5)', () => {
  it('emits a knock at 0, 70 and 170, then 0/0 at 240', () => {
    const { clock, emissions, player } = setup();
    player.play(KNOCK_LEFT_HIGH);
    clock.advance(1000);
    expect(emissions).toEqual([
      { at: 0, left: 1, right: 0.3 },
      { at: 70, left: 0, right: 0 },
      { at: 170, left: 1, right: 0.3 },
      { at: 240, left: 0, right: 0 },
    ]);
  });

  it('emits an alarm with its repeats and pauses, ending at 3800', () => {
    const { clock, emissions, player } = setup();
    player.play(ALARM_CENTRE_HIGH);
    clock.advance(5000);
    expect(emissions.map((e) => e.at)).toEqual([
      0, 150, 250, 400, 500, 650, 1050, 1200, 1300, 1450, 1550, 1700, 2100, 2250, 2350, 2500, 2600, 2750, 3150, 3300, 3400, 3550, 3650, 3800,
    ]);
    expect(emissions.map((e) => e.left)).toEqual([1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0]);
    expect(emissions.at(-1)).toEqual({ at: 3800, left: 0, right: 0 });
  });

  it('emits the first segment inside play, before any time passes', () => {
    const { emissions, player } = setup();
    player.play(KNOCK_LEFT_HIGH);
    expect(emissions).toEqual([{ at: 0, left: 1, right: 0.3 }]);
  });

  it('schedules every later segment and the end at once, from the call of play', () => {
    const { clock, player } = setup();
    player.play(KNOCK_LEFT_HIGH);
    expect(clock.pending()).toBe(3);
  });

  it('does not emit the final 0/0 before totalMs', () => {
    const { clock, emissions, player } = setup();
    player.play(KNOCK_LEFT_HIGH);
    clock.advance(239);
    expect(emissions.at(-1)).toEqual({ at: 170, left: 1, right: 0.3 });
    clock.advance(1);
    expect(emissions.at(-1)).toEqual({ at: 240, left: 0, right: 0 });
    expect(clock.pending()).toBe(0);
  });

  it('passes levels as given, without clamping or rounding (R2.11)', () => {
    const { clock, emissions, player } = setup();
    player.play(command({ segments: [{ ms: 50, left: 0.123456, right: 1.5 }], vibrate: [50], totalMs: 50 }));
    clock.advance(50);
    expect(emissions).toEqual([
      { at: 0, left: 0.123456, right: 1.5 },
      { at: 50, left: 0, right: 0 },
    ]);
  });
});

describe('createSegmentPlayer: preemption and stop (R2.7-R2.9)', () => {
  it('a second play cancels the first: nothing old after it, and no old 0/0', () => {
    const { clock, emissions, player } = setup();
    player.play(ALARM_CENTRE_HIGH);
    clock.advance(100);
    player.play(KNOCK_LEFT_HIGH);
    expect(clock.pending()).toBe(3);
    clock.advance(5000);
    expect(emissions).toEqual([
      { at: 0, left: 1, right: 1 },
      { at: 100, left: 1, right: 0.3 },
      { at: 170, left: 0, right: 0 },
      { at: 270, left: 1, right: 0.3 },
      { at: 340, left: 0, right: 0 },
    ]);
  });

  it('stop emits 0/0 once and cancels the rest', () => {
    const { clock, emissions, player } = setup();
    player.play(KNOCK_LEFT_HIGH);
    clock.advance(80);
    player.stop();
    expect(clock.pending()).toBe(0);
    clock.advance(1000);
    expect(emissions).toEqual([
      { at: 0, left: 1, right: 0.3 },
      { at: 70, left: 0, right: 0 },
      { at: 80, left: 0, right: 0 },
    ]);
  });

  it('stop when nothing ever played emits nothing', () => {
    const { emissions, player } = setup();
    player.stop();
    expect(emissions).toEqual([]);
  });

  it('stop after the natural end emits nothing', () => {
    const { clock, emissions, player } = setup();
    player.play(KNOCK_LEFT_HIGH);
    clock.advance(240);
    const before = emissions.length;
    player.stop();
    expect(emissions.length).toBe(before);
  });

  it('two stop calls emit once', () => {
    const { emissions, player } = setup();
    player.play(KNOCK_LEFT_HIGH);
    player.stop();
    player.stop();
    expect(emissions).toEqual([
      { at: 0, left: 1, right: 0.3 },
      { at: 0, left: 0, right: 0 },
    ]);
  });

  it('play after stop works', () => {
    const { clock, emissions, player } = setup();
    player.play(KNOCK_LEFT_HIGH);
    player.stop();
    clock.advance(10);
    player.play(KNOCK_LEFT_HIGH);
    clock.advance(1000);
    expect(emissions.map((e) => e.at)).toEqual([0, 0, 10, 80, 180, 250]);
    expect(emissions.at(-1)).toEqual({ at: 250, left: 0, right: 0 });
  });

  it('emits nothing more for a command after it ended, whatever the scheduler does (R2.9)', () => {
    // A scheduler that ignores clearTimeout: the cleared timers still fire.
    const fired: (() => void)[] = [];
    const emissions: Levels[] = [];
    const player = createSegmentPlayer((l) => emissions.push(l), {
      setTimeout: (fn) => fired.push(fn),
      clearTimeout: () => undefined,
    });
    player.play(KNOCK_LEFT_HIGH);
    player.stop();
    expect(emissions.length).toBe(2);
    for (const fn of fired) fn();
    expect(emissions.length).toBe(2);
  });

  it('a late timer of a preempted command emits nothing (R2.7, R2.9)', () => {
    const fired: (() => void)[] = [];
    const emissions: Levels[] = [];
    const player = createSegmentPlayer((l) => emissions.push(l), {
      setTimeout: (fn) => fired.push(fn),
      clearTimeout: () => undefined,
    });
    player.play(ALARM_CENTRE_HIGH);
    const oldTimers = fired.splice(0);
    player.play(KNOCK_LEFT_HIGH);
    for (const fn of oldTimers) fn();
    expect(emissions).toEqual([
      { left: 1, right: 1 },
      { left: 1, right: 0.3 },
    ]);
  });
});

describe('createSegmentPlayer: edge cases (R2.10-R2.12)', () => {
  it('an empty segments list emits 0/0 once and schedules nothing', () => {
    const { clock, emissions, player } = setup();
    player.play(command({ segments: [], vibrate: [], totalMs: 0 }));
    expect(emissions).toEqual([{ at: 0, left: 0, right: 0 }]);
    expect(clock.pending()).toBe(0);
    player.stop();
    expect(emissions.length).toBe(1);
  });

  it('a throwing onLevels does not stop later emissions', () => {
    const clock = createFakeScheduler();
    const seen: number[] = [];
    const player = createSegmentPlayer(() => {
      seen.push(clock.now());
      throw new Error('ui bug');
    }, clock.scheduler);
    expect(() => player.play(KNOCK_LEFT_HIGH)).not.toThrow();
    expect(() => clock.advance(1000)).not.toThrow();
    expect(seen).toEqual([0, 70, 170, 240]);
    player.play(KNOCK_LEFT_HIGH);
    expect(() => player.stop()).not.toThrow();
  });

  it('emits fresh objects: changing one changes neither the next nor the command', () => {
    const clock = createFakeScheduler();
    const got: Levels[] = [];
    const cmd = command({ segments: [{ ms: 70, left: 1, right: 0.3 }, { ms: 100, left: 0, right: 0 }, { ms: 70, left: 1, right: 0.3 }] });
    const player = createSegmentPlayer((l) => {
      got.push(l);
      l.left = 99;
    }, clock.scheduler);
    player.play(cmd);
    player.play(cmd);
    clock.advance(1000);
    expect(got[0]).not.toBe(got[1]);
    expect(new Set(got).size).toBe(got.length);
    expect(cmd.segments).toEqual([
      { ms: 70, left: 1, right: 0.3 },
      { ms: 100, left: 0, right: 0 },
      { ms: 70, left: 1, right: 0.3 },
    ]);
    for (const l of got) expect(cmd.segments).not.toContain(l);
  });

  it('does not change the command it plays (R1.6)', () => {
    const { clock, player } = setup();
    const cmd = structuredClone(ALARM_CENTRE_HIGH);
    player.play(cmd);
    clock.advance(1000);
    player.stop();
    expect(cmd).toEqual(ALARM_CENTRE_HIGH);
  });
});

describe('createSegmentPlayer: timers (R2.2, R2.3)', () => {
  it('uses only the injected scheduler, never the global timers', () => {
    const boom = () => {
      throw new Error('global timer used');
    };
    vi.stubGlobal('setTimeout', boom);
    vi.stubGlobal('clearTimeout', boom);
    const { clock, emissions, player } = setup();
    player.play(KNOCK_LEFT_HIGH);
    clock.advance(100);
    player.play(KNOCK_LEFT_HIGH);
    player.stop();
    expect(emissions.length).toBe(4);
  });

  it('browserScheduler calls the current globalThis timers at call time', () => {
    const calls: unknown[][] = [];
    vi.stubGlobal('setTimeout', (...args: unknown[]) => {
      calls.push(['set', ...args]);
      return 42;
    });
    vi.stubGlobal('clearTimeout', (...args: unknown[]) => {
      calls.push(['clear', ...args]);
    });
    const fn = () => undefined;
    expect(browserScheduler.setTimeout(fn, 70)).toBe(42);
    browserScheduler.clearTimeout(42);
    expect(calls).toEqual([
      ['set', fn, 70],
      ['clear', 42],
    ]);
  });
});
