import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPhoneOutput } from '../../src/band/phone-output';
import type { HapticCommand } from '../../src/haptics';
import { ALARM_CENTRE_HIGH, KNOCK_LEFT_HIGH, engineCommand } from './helpers/commands';

/** A navigator stand-in whose `vibrate` records its arguments and the `this` it was called with. */
function stubNav(result: unknown = true) {
  const calls: unknown[] = [];
  const thisValues: unknown[] = [];
  const nav = {
    vibrate(this: unknown, pattern: unknown) {
      thisValues.push(this);
      calls.push(pattern);
      return result;
    },
  };
  return { nav, calls, thisValues };
}

const allZero = (cmd: HapticCommand): HapticCommand => ({ ...cmd, segments: cmd.segments.map((s) => ({ ...s, left: 0, right: 0 })) });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('createPhoneOutput (R3)', () => {
  it('has kind phone', () => {
    expect(createPhoneOutput(stubNav().nav).kind).toBe('phone');
  });

  it('play calls vibrate once with the knock array [70, 100, 70]', () => {
    const { nav, calls } = stubNav();
    createPhoneOutput(nav).play(KNOCK_LEFT_HIGH);
    expect(calls).toEqual([[70, 100, 70]]);
  });

  it('passes the command array itself, same values in the same order', () => {
    const { nav, calls } = stubNav();
    const cmd = structuredClone(ALARM_CENTRE_HIGH);
    createPhoneOutput(nav).play(cmd);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toBe(cmd.vibrate);
    expect(calls[0]).toEqual([150, 100, 150, 100, 150, 400, 150, 100, 150, 100, 150, 400, 150, 100, 150, 100, 150, 400, 150, 100, 150, 100, 150]);
    expect(cmd).toEqual(ALARM_CENTRE_HIGH);
  });

  it('calls vibrate as a method of the navigator', () => {
    const { nav, thisValues } = stubNav();
    createPhoneOutput(nav).play(KNOCK_LEFT_HIGH);
    createPhoneOutput(nav).stop();
    expect(thisValues).toEqual([nav, nav]);
  });

  it('does not vibrate for a command with every level 0 (intensity 0)', () => {
    const { nav, calls } = stubNav();
    createPhoneOutput(nav).play(allZero(KNOCK_LEFT_HIGH));
    createPhoneOutput(nav).play(engineCommand('alarm', 'left', 'high', 0));
    expect(calls).toEqual([]);
  });

  it('vibrates when only one level of one segment is above 0', () => {
    const { nav, calls } = stubNav();
    const cmd = allZero(KNOCK_LEFT_HIGH);
    cmd.segments[2] = { ms: 70, left: 0, right: 0.01 };
    createPhoneOutput(nav).play(cmd);
    expect(calls).toEqual([[70, 100, 70]]);
  });

  it('stop calls vibrate(0) once', () => {
    const { nav, calls } = stubNav();
    createPhoneOutput(nav).stop();
    expect(calls).toEqual([0]);
  });

  it('ignores the return value of vibrate', () => {
    const { nav, calls } = stubNav(false);
    const out = createPhoneOutput(nav);
    expect(() => out.play(KNOCK_LEFT_HIGH)).not.toThrow();
    expect(calls).toEqual([[70, 100, 70]]);
  });

  it('available() is true with vibrate and does not call it', () => {
    const { nav, calls } = stubNav();
    expect(createPhoneOutput(nav).available()).toBe(true);
    expect(calls).toEqual([]);
  });

  for (const [name, nav] of [
    ['vibrate missing', {}],
    ['vibrate not a function', { vibrate: 'yes' }],
    ['vibrate undefined', { vibrate: undefined }],
  ] as const) {
    it(`${name}: available() is false, play and stop do nothing and do not throw`, () => {
      const out = createPhoneOutput(nav);
      expect(out.available()).toBe(false);
      expect(() => out.play(KNOCK_LEFT_HIGH)).not.toThrow();
      expect(() => out.stop()).not.toThrow();
    });
  }

  it('a throwing vibrate does not throw out of play or stop', () => {
    let count = 0;
    const out = createPhoneOutput({
      vibrate() {
        count++;
        throw new Error('blocked');
      },
    });
    expect(out.available()).toBe(true);
    expect(() => out.play(KNOCK_LEFT_HIGH)).not.toThrow();
    expect(() => out.stop()).not.toThrow();
    expect(count).toBe(2);
  });
});

describe('createPhoneOutput with no nav argument (R3.1)', () => {
  it('reads globalThis.navigator at call time', () => {
    vi.stubGlobal('navigator', undefined);
    const out = createPhoneOutput();
    expect(out.available()).toBe(false);
    expect(() => out.play(KNOCK_LEFT_HIGH)).not.toThrow();
    expect(() => out.stop()).not.toThrow();

    const { nav, calls, thisValues } = stubNav();
    vi.stubGlobal('navigator', nav);
    expect(out.available()).toBe(true);
    out.play(KNOCK_LEFT_HIGH);
    out.stop();
    expect(calls).toEqual([[70, 100, 70], 0]);
    expect(thisValues).toEqual([nav, nav]);
  });

  it('navigator without vibrate gives available() false', () => {
    vi.stubGlobal('navigator', { userAgent: 'x' });
    const out = createPhoneOutput();
    expect(out.available()).toBe(false);
    expect(() => out.play(KNOCK_LEFT_HIGH)).not.toThrow();
    expect(() => out.stop()).not.toThrow();
  });
});
