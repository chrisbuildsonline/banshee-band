import { describe, expect, it } from 'vitest';
import { acceptInput } from '../../src/ghosts/input';
import { ghostInput, makeEvent } from './helpers/inputs';

describe('acceptInput (R1.5, R1.6)', () => {
  it('accepts a valid input and returns a new object with the validated event', () => {
    const input = ghostInput({}, 0.9);
    const accepted = acceptInput(input);
    expect(accepted).not.toBeNull();
    expect(accepted).not.toBe(input);
    expect(accepted!.event).toEqual(input.event);
    expect(accepted!.event).not.toBe(input.event);
    expect(accepted!.bearingConfidence).toBe(0.9);
  });

  it('rejects values that are not an object with an event', () => {
    for (const v of [null, undefined, 42, 'knock', [], {}, { bearingConfidence: 1 }, [makeEvent()]]) expect(acceptInput(v), String(v)).toBeNull();
  });

  it('rejects an event that fails the validator', () => {
    const bad = [
      { class: 'ghoul' as never },
      { label: '' },
      { bearingDeg: 200 },
      { bearingSource: 'none' as const, bearingDeg: 30 },
      { t: -1 },
    ];
    for (const overrides of bad) expect(acceptInput({ event: { ...makeEvent(), ...overrides }, bearingConfidence: 1 }), JSON.stringify(overrides)).toBeNull();
  });

  it('accepts a missing or non-numeric bearing confidence (the ghost is then uncertain)', () => {
    expect(acceptInput({ event: makeEvent() })).not.toBeNull();
    expect(acceptInput({ event: makeEvent(), bearingConfidence: '0.9' })).not.toBeNull();
    expect(Number.isNaN(acceptInput({ event: makeEvent() })!.bearingConfidence)).toBe(true);
    expect(Number.isNaN(acceptInput({ event: makeEvent(), bearingConfidence: '0.9' })!.bearingConfidence)).toBe(true);
    expect(acceptInput({ event: makeEvent(), bearingConfidence: 2 })!.bearingConfidence).toBe(2);
  });

  it('returns null and does not throw when reading the input throws', () => {
    const trap = Object.defineProperty({}, 'event', { get() { throw new Error('boom'); } });
    expect(() => acceptInput(trap)).not.toThrow();
    expect(acceptInput(trap)).toBeNull();
    const revoked = Proxy.revocable({}, {});
    revoked.revoke();
    expect(acceptInput(revoked.proxy)).toBeNull();
  });

  it('does not modify the input', () => {
    const input = ghostInput({ label: 'Knock' }, 0.5);
    const copy = structuredClone(input);
    acceptInput(input);
    expect(input).toEqual(copy);
  });
});
