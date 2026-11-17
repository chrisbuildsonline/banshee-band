import { describe, expect, it } from 'vitest';
import type { SoundEvent } from '../../src/events';
import { createHapticEngine } from '../../src/haptics/engine';
import type { Decision, HapticEngine, HapticInput } from '../../src/haptics/types';
import { makeEvent, makeInput } from './helpers/events';

const RIGHT = { bearingDeg: 40, bearingSource: 'gcc-phat' as const };
const LEFT = { bearingDeg: -40, bearingSource: 'gcc-phat' as const };

const play = (d: Decision) => {
  expect(d.action, JSON.stringify(d)).toBe('play');
  return (d as Extract<Decision, { action: 'play' }>).command;
};
const reason = (d: Decision) => (d.action === 'drop' ? d.reason : 'play');

describe('drop reasons (R9.2, R9.3)', () => {
  it("'no-pattern' for other: idle, loud, quiet, while playing, and with every class off", () => {
    const e = createHapticEngine();
    expect(e.decide(makeInput({ class: 'other' }), 0)).toEqual({ action: 'drop', reason: 'no-pattern' });
    expect(reason(e.decide(makeInput({ class: 'other', loudnessDb: 0 }), 10))).toBe('no-pattern');
    expect(reason(e.decide(makeInput({ class: 'other', loudnessDb: -90 }), 20))).toBe('no-pattern');
    play(e.decide(makeInput({ class: 'voice', urgency: 'low' }), 30));
    expect(reason(e.decide(makeInput({ class: 'other', urgency: 'high' }), 40))).toBe('no-pattern');
    const off = createHapticEngine({ enabledClasses: { knock: false, doorbell: false, alarm: false, baby: false, vehicle: false, voice: false } });
    expect(reason(off.decide(makeInput({ class: 'other' }), 0))).toBe('no-pattern');
  });

  it("'disabled-class' only for the class that is off", () => {
    const e = createHapticEngine({ enabledClasses: { knock: false } });
    expect(e.decide(makeInput({ class: 'knock' }), 0)).toEqual({ action: 'drop', reason: 'disabled-class' });
    play(e.decide(makeInput({ class: 'doorbell' }), 0));
    for (const cls of ['alarm', 'baby', 'vehicle', 'voice'] as const) play(createHapticEngine({ enabledClasses: { knock: false } }).decide(makeInput({ class: cls }), 0));
  });

  it("'too-quiet' at -50.01, loud enough at -50", () => {
    expect(createHapticEngine().decide(makeInput({ loudnessDb: -50.01 }), 0)).toEqual({ action: 'drop', reason: 'too-quiet' });
    play(createHapticEngine().decide(makeInput({ loudnessDb: -50 }), 0));
    const e = createHapticEngine({ minLoudnessDb: -30 });
    expect(reason(e.decide(makeInput({ loudnessDb: -30.01 }), 0))).toBe('too-quiet');
    play(e.decide(makeInput({ loudnessDb: -30 }), 0));
  });

  it('checks in the order no-pattern, disabled-class, too-quiet, rate-limited, lower-priority', () => {
    const e = createHapticEngine({ enabledClasses: { doorbell: false } });
    expect(reason(e.decide(makeInput({ class: 'other', loudnessDb: -90 }), 0))).toBe('no-pattern');
    expect(reason(e.decide(makeInput({ class: 'doorbell', loudnessDb: -90 }), 0))).toBe('disabled-class');
    play(e.decide(makeInput({ class: 'knock', ...RIGHT }), 0));
    expect(reason(e.decide(makeInput({ class: 'knock', ...RIGHT, loudnessDb: -90 }), 100))).toBe('too-quiet');
    // inside the rate limit and also equal priority while playing
    expect(reason(e.decide(makeInput({ class: 'knock', ...RIGHT }), 100))).toBe('rate-limited');
    // inside the rate limit with a higher urgency than the one playing: still rate-limited
    const f = createHapticEngine();
    play(f.decide(makeInput({ class: 'knock', urgency: 'low', ...RIGHT }), 0));
    expect(reason(f.decide(makeInput({ class: 'knock', urgency: 'high', ...RIGHT }), 100))).toBe('rate-limited');
    expect(reason(f.decide(makeInput({ class: 'knock', urgency: 'low', ...LEFT }), 100))).toBe('lower-priority');
  });
});

describe('preemption (R8.3-R8.6)', () => {
  it('a high alarm preempts a low knock that is playing', () => {
    const e = createHapticEngine();
    expect(play(e.decide(makeInput({ class: 'knock', urgency: 'low' }), 0)).totalMs).toBe(240);
    const c = play(e.decide(makeInput({ class: 'alarm', urgency: 'high' }), 100));
    expect(c.class).toBe('alarm');
    expect(c.priority).toBe(36);
  });

  it('a medium vehicle preempts nothing while a high alarm plays', () => {
    const e = createHapticEngine();
    play(e.decide(makeInput({ class: 'alarm', urgency: 'high' }), 0));
    expect(e.decide(makeInput({ class: 'vehicle', urgency: 'medium' }), 200)).toEqual({ action: 'drop', reason: 'lower-priority' });
    expect(reason(e.decide(makeInput({ class: 'vehicle', urgency: 'high' }), 300))).toBe('lower-priority');
  });

  it('an equal priority is dropped while playing', () => {
    const e = createHapticEngine();
    play(e.decide(makeInput({ class: 'doorbell', urgency: 'medium', ...RIGHT }), 0));
    expect(reason(e.decide(makeInput({ class: 'doorbell', urgency: 'medium', ...LEFT }), 100))).toBe('lower-priority');
    expect(reason(e.decide(makeInput({ class: 'knock', urgency: 'medium' }), 100))).toBe('lower-priority');
  });

  it('after startMs + totalMs anything plays, also at exactly the end', () => {
    const e = createHapticEngine();
    expect(play(e.decide(makeInput({ class: 'alarm', urgency: 'high' }), 1000)).totalMs).toBe(3800);
    expect(reason(e.decide(makeInput({ class: 'voice', urgency: 'low' }), 4799))).toBe('lower-priority');
    play(e.decide(makeInput({ class: 'voice', urgency: 'low' }), 4800));
    const f = createHapticEngine();
    play(f.decide(makeInput({ class: 'knock', urgency: 'high' }), 0));
    play(f.decide(makeInput({ class: 'voice', urgency: 'low' }), 5000));
  });

  it('a preempting command becomes the current one', () => {
    const e = createHapticEngine();
    play(e.decide(makeInput({ class: 'knock', urgency: 'low' }), 0));
    play(e.decide(makeInput({ class: 'alarm', urgency: 'medium' }), 100));
    // the alarm (26) now plays until 3900; a high voice (31) preempts it, a medium baby (25) does not
    expect(reason(e.decide(makeInput({ class: 'baby', urgency: 'medium' }), 200))).toBe('lower-priority');
    play(e.decide(makeInput({ class: 'voice', urgency: 'high' }), 300));
    // the voice (31) replaced the alarm and plays until 550; then a medium baby (25) plays
    expect(reason(e.decide(makeInput({ class: 'baby', urgency: 'medium' }), 549))).toBe('lower-priority');
    play(e.decide(makeInput({ class: 'baby', urgency: 'medium' }), 550));
  });

  it('the 3000 ms alarm case: lower-priority at 3000, play at 3800', () => {
    const e = createHapticEngine();
    play(e.decide(makeInput({ class: 'alarm', urgency: 'high' }), 0));
    expect(reason(e.decide(makeInput({ class: 'alarm', urgency: 'high' }), 2999))).toBe('rate-limited');
    expect(reason(e.decide(makeInput({ class: 'alarm', urgency: 'high' }), 3000))).toBe('lower-priority');
    play(e.decide(makeInput({ class: 'alarm', urgency: 'high' }), 3800));
  });
});

describe('stale drops (R8.5, R8.7, R9.5)', () => {
  it('a dropped event is never played by a later call', () => {
    const e = createHapticEngine();
    const dropped = new Set<string>();
    const played: string[] = [];
    const inputs: [HapticInput, number][] = [
      [makeInput({ class: 'alarm', urgency: 'high' }), 0],
      [makeInput({ class: 'knock', urgency: 'low' }), 100],
      [makeInput({ class: 'voice', urgency: 'medium' }), 200],
      [makeInput({ class: 'baby', urgency: 'high' }), 300],
      [makeInput({ class: 'doorbell', urgency: 'low', loudnessDb: -80 }), 400],
      [makeInput({ class: 'vehicle', urgency: 'low' }), 4000],
      [makeInput({ class: 'voice', urgency: 'low' }), 10000],
      [makeInput({ class: 'knock', urgency: 'low' }), 20000],
    ];
    for (const [input, t] of inputs) {
      const d = e.decide(input, t);
      if (d.action === 'drop') dropped.add(input.event.id);
      else played.push(d.command.eventId);
    }
    expect(dropped.size).toBe(4);
    for (const id of played) expect(dropped.has(id)).toBe(false);
    expect(played).toEqual([inputs[0][0].event.id, inputs[5][0].event.id, inputs[6][0].event.id, inputs[7][0].event.id]);
  });

  it('a drop leaves the state as if the call did not happen', () => {
    const rest = (e: HapticEngine) => [
      e.decide(makeInput({ class: 'knock', urgency: 'low', id: 'k' }), 300),
      e.decide(makeInput({ class: 'knock', urgency: 'low', ...RIGHT, id: 'k2' }), 3100),
      e.decide(makeInput({ class: 'alarm', urgency: 'high', id: 'a' }), 3200),
    ];
    const a = createHapticEngine({ rateLimitMs: 3000 });
    const b = createHapticEngine({ rateLimitMs: 3000 });
    play(a.decide(makeInput({ class: 'knock', urgency: 'high', ...RIGHT, id: 'first' }), 0));
    play(b.decide(makeInput({ class: 'knock', urgency: 'high', ...RIGHT, id: 'first' }), 0));
    // drops of every reason that reaches the state checks, only on engine a
    expect(reason(a.decide(makeInput({ class: 'knock', ...RIGHT }), 100))).toBe('rate-limited');
    expect(reason(a.decide(makeInput({ class: 'voice', urgency: 'low' }), 100))).toBe('lower-priority');
    expect(reason(a.decide(makeInput({ class: 'baby', loudnessDb: -70 }), 100))).toBe('too-quiet');
    expect(reason(a.decide(makeInput({ class: 'other' }), 100))).toBe('no-pattern');
    expect(() => a.decide(makeInput({ class: 'alarm' }), NaN)).toThrow(RangeError);
    expect(rest(a)).toEqual(rest(b));
  });

  it('only played events update the last start of the rate limit', () => {
    const e = createHapticEngine();
    play(e.decide(makeInput({ ...RIGHT }), 0));
    expect(reason(e.decide(makeInput({ ...RIGHT }), 2000))).toBe('rate-limited');
    play(e.decide(makeInput({ ...RIGHT }), 3000));
    const f = createHapticEngine({ rateLimitMs: 10000 });
    play(f.decide(makeInput({ class: 'alarm', urgency: 'high' }), 0));
    expect(reason(f.decide(makeInput({ class: 'knock', urgency: 'low' }), 100))).toBe('lower-priority');
    play(f.decide(makeInput({ class: 'knock', urgency: 'low' }), 3800));
  });
});

describe('rate limit (R9.4-R9.6)', () => {
  it('the same class and side at rateLimitMs - 1 is dropped, at rateLimitMs plays', () => {
    const e = createHapticEngine();
    play(e.decide(makeInput({ ...RIGHT }), 1000));
    expect(e.decide(makeInput({ ...RIGHT }), 3999)).toEqual({ action: 'drop', reason: 'rate-limited' });
    play(e.decide(makeInput({ ...RIGHT }), 4000));
  });

  it('another side or another class is not limited', () => {
    const e = createHapticEngine();
    play(e.decide(makeInput({ class: 'knock', ...RIGHT }), 0));
    play(e.decide(makeInput({ class: 'knock', ...LEFT }), 1000));
    play(e.decide(makeInput({ class: 'knock', bearingDeg: 0 }), 2000));
    play(e.decide(makeInput({ class: 'doorbell', ...RIGHT }), 2500));
  });

  it("side 'unknown' is a side of its own", () => {
    const e = createHapticEngine();
    play(e.decide(makeInput({ ...RIGHT }, 0.5), 0));
    expect(reason(e.decide(makeInput({ bearingDeg: null, bearingSource: 'none' }), 1000))).toBe('rate-limited');
    expect(reason(e.decide(makeInput({ ...LEFT, bearingSource: 'loudness' }), 1000))).toBe('rate-limited');
    play(e.decide(makeInput({ ...RIGHT }, 0.8), 1000));
  });

  it("a clock that goes back is 'rate-limited' and does not throw", () => {
    const e = createHapticEngine();
    play(e.decide(makeInput({ ...RIGHT }), 5000));
    expect(reason(e.decide(makeInput({ ...RIGHT }), 4000))).toBe('rate-limited');
    expect(reason(e.decide(makeInput({ ...RIGHT }), -10000))).toBe('rate-limited');
    // another side is not rate-limited, but the command started at 5000 still counts as playing
    expect(reason(e.decide(makeInput({ ...LEFT }), -10000))).toBe('lower-priority');
    play(e.decide(makeInput({ ...LEFT, class: 'alarm' }), -10000));
  });

  it('a custom rateLimitMs, and 0 turns the limit off', () => {
    const e = createHapticEngine({ rateLimitMs: 500 });
    play(e.decide(makeInput({ ...RIGHT }), 0));
    expect(reason(e.decide(makeInput({ ...RIGHT }), 499))).toBe('rate-limited');
    play(e.decide(makeInput({ ...RIGHT }), 500));
    const f = createHapticEngine({ rateLimitMs: 0 });
    play(f.decide(makeInput({ ...RIGHT }), 0));
    play(f.decide(makeInput({ ...RIGHT }), 240));
  });
});

describe('the command (R9.8, R7.1)', () => {
  it('carries the event id, class, side, sideKnown and priority', () => {
    const e = createHapticEngine();
    const c = play(e.decide({ event: makeEvent({ id: 'abc', class: 'vehicle', urgency: 'medium', ...LEFT }), bearingConfidence: 0.9 }, 0));
    expect(c).toMatchObject({ eventId: 'abc', class: 'vehicle', side: 'left', sideKnown: true, priority: 24, totalMs: 580 });
    const u = play(e.decide({ event: makeEvent({ id: 'def', class: 'baby', urgency: 'high', ...RIGHT }), bearingConfidence: 0.79 }, 0));
    expect(u).toMatchObject({ eventId: 'def', class: 'baby', side: 'unknown', sideKnown: false, priority: 35 });
    expect(JSON.stringify(u)).not.toContain('Knock');
  });

  it('uses the intensity setting for the levels and keeps the rhythm', () => {
    const c = play(createHapticEngine({ intensity: 0.5 }).decide(makeInput({ bearingDeg: 0, urgency: 'high' }), 0));
    expect(c.segments[0]).toMatchObject({ ms: 70, left: 0.5, right: 0.5 });
    const z = play(createHapticEngine({ intensity: 0 }).decide(makeInput({ bearingDeg: 0 }), 0));
    expect(z.vibrate).toEqual([70, 100, 70]);
    expect(z.segments.every((s) => s.left === 0 && s.right === 0)).toBe(true);
  });

  it('does not change its input', () => {
    const input = makeInput({ ...RIGHT });
    const before = JSON.stringify(input);
    createHapticEngine().decide(input, 0);
    expect(JSON.stringify(input)).toBe(before);
  });
});

describe('settings of the engine (R10.6, R10.7)', () => {
  it('junk and undefined give a working engine with the defaults', () => {
    for (const s of [undefined, null, 'junk', 42, [], { intensity: 'loud', minLoudnessDb: NaN }]) {
      const e = createHapticEngine(s);
      play(e.decide(makeInput({ loudnessDb: -50 }), 0));
      expect(reason(e.decide(makeInput({ class: 'doorbell', loudnessDb: -50.01 }), 1000))).toBe('too-quiet');
      expect(reason(e.decide(makeInput({ loudnessDb: -50 }), 2999))).toBe('rate-limited');
    }
    play(createHapticEngine().decide(makeInput(), 0));
  });

  it('changing the passed object later does not change the engine', () => {
    const s = { enabledClasses: { knock: true }, minLoudnessDb: -50, intensity: 1, rateLimitMs: 3000 };
    const e = createHapticEngine(s);
    s.enabledClasses.knock = false;
    s.minLoudnessDb = -5;
    s.intensity = 0;
    s.rateLimitMs = 100000;
    const c = play(e.decide(makeInput({ class: 'knock', loudnessDb: -20, bearingDeg: 0 }), 0));
    expect(c.segments[0].left).toBe(1);
    play(e.decide(makeInput({ class: 'knock', loudnessDb: -20, bearingDeg: 0 }), 3000));
  });
});

describe('nowMs (R9.7)', () => {
  it('throws RangeError naming nowMs for NaN and Infinity', () => {
    const e = createHapticEngine();
    for (const t of [NaN, Infinity, -Infinity]) {
      expect(() => e.decide(makeInput(), t)).toThrow(RangeError);
      expect(() => e.decide(makeInput(), t)).toThrow(/nowMs/);
    }
    expect(() => e.decide(makeInput(), '5' as unknown as number)).toThrow(RangeError);
  });

  it('throws for nothing else', () => {
    const e = createHapticEngine();
    const odd: [Partial<SoundEvent>, number][] = [
      [{ bearingDeg: NaN }, NaN],
      [{ bearingDeg: null, bearingSource: 'gcc-phat' }, 2],
      [{ bearingDeg: 30, bearingSource: 'none' }, -1],
      [{ bearingDeg: Infinity }, Infinity],
      [{ loudnessDb: NaN }, 1],
      [{ class: 'other' }, 0.5],
    ];
    let t = -5;
    for (const [ev, conf] of odd) expect(() => e.decide(makeInput(ev, conf), (t += 1000))).not.toThrow();
    expect(() => e.decide(makeInput(), -1e12)).not.toThrow();
    expect(() => e.decide(makeInput(), 1e15)).not.toThrow();
  });
});
