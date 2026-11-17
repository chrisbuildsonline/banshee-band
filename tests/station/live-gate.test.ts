import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { SOUND_CLASSES } from '../../src/events';
import { createLiveGate, LIVE_COOLDOWN_MS } from '../../src/station/live-gate';

describe('createLiveGate', () => {
  it('lets a class through once per 3000 ms', () => {
    expect(LIVE_COOLDOWN_MS).toBe(3000);
    const gate = createLiveGate();
    expect(gate.accept('knock', 0)).toBe(true);
    expect(gate.accept('knock', 2999)).toBe(false);
    expect(gate.accept('knock', 3000)).toBe(true);
  });

  it('keeps classes apart', () => {
    const gate = createLiveGate();
    expect(gate.accept('knock', 0)).toBe(true);
    expect(gate.accept('doorbell', 100)).toBe(true);
  });

  it('never lets other through, and other starts no cooldown', () => {
    const gate = createLiveGate();
    expect(gate.accept('other', 0)).toBe(false);
    expect(gate.accept('other', 10_000)).toBe(false);
    expect(gate.accept('knock', 1)).toBe(true);
  });

  it('refuses NaN and negative times', () => {
    const gate = createLiveGate();
    expect(gate.accept('knock', Number.NaN)).toBe(false);
    expect(gate.accept('knock', -1)).toBe(false);
    expect(gate.accept('knock', 0)).toBe(true);
  });

  it('takes a cooldownMs option', () => {
    const gate = createLiveGate({ cooldownMs: 500 });
    expect(gate.accept('alarm', 0)).toBe(true);
    expect(gate.accept('alarm', 499)).toBe(false);
    expect(gate.accept('alarm', 500)).toBe(true);
  });

  it('never accepts the same class twice within the cooldown', () => {
    const cls = fc.constantFrom(...SOUND_CLASSES);
    fc.assert(
      fc.property(fc.array(fc.tuple(cls, fc.integer({ min: 0, max: 4000 })), { maxLength: 60 }), (steps) => {
        const gate = createLiveGate();
        const last = new Map<string, number>();
        let t = 0;
        for (const [c, dt] of steps) {
          t += dt;
          if (!gate.accept(c, t)) continue;
          if (c === 'other') return false;
          const prev = last.get(c);
          if (prev !== undefined && t - prev < 3000) return false;
          last.set(c, t);
        }
        return true;
      }),
      { seed: 9, numRuns: 100 },
    );
  });
});
