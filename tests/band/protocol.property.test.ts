import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { MAX_SEGMENTS, decodeFrame, encodeFrame, encodePlay, encodeStop } from '../../src/band/protocol';
import { PATTERN_CLASSES, type HapticCommand } from '../../src/haptics';

/** Fixed fast-check seed and run count (R9.1). */
const params = { seed: 20261118, numRuns: 300 };

const SIDES = ['left', 'right', 'centre', 'unknown'] as const;
const level = fc.double({ min: 0, max: 1, noNaN: true });
const segment = fc.record({ ms: fc.integer({ min: 1, max: 0xffff }), left: level, right: level });

/** Any command the encoder accepts. */
const command: fc.Arbitrary<HapticCommand> = fc
  .record({ class: fc.constantFrom(...PATTERN_CLASSES), side: fc.constantFrom(...SIDES), segments: fc.array(segment, { minLength: 1, maxLength: MAX_SEGMENTS }) })
  .map((c) => ({
    eventId: 'p',
    class: c.class,
    side: c.side,
    sideKnown: c.side !== 'unknown',
    priority: 1,
    segments: c.segments,
    vibrate: c.segments.map((s) => s.ms),
    totalMs: c.segments.reduce((sum, s) => sum + s.ms, 0),
  }));

/** Any valid frame: a PLAY of any command or the STOP frame. */
const validFrame = fc.oneof({ weight: 9, arbitrary: command.map(encodePlay) }, { weight: 1, arbitrary: fc.constant(encodeStop()) });

describe('protocol properties (R2.8)', () => {
  it('decode(encodePlay(c)) keeps class, side and ms exactly, levels within 1/510', () => {
    fc.assert(
      fc.property(command, (c) => {
        const r = decodeFrame(encodePlay(c));
        if (!r.ok || r.frame.op !== 'play') return false;
        expect(r.frame.class).toBe(c.class);
        expect(r.frame.side).toBe(c.side);
        expect(r.frame.segments.map((s) => s.ms)).toEqual(c.segments.map((s) => s.ms));
        r.frame.segments.forEach((s, i) => {
          expect(Math.abs(s.left - c.segments[i].left)).toBeLessThanOrEqual(1 / 510 + 1e-12);
          expect(Math.abs(s.right - c.segments[i].right)).toBeLessThanOrEqual(1 / 510 + 1e-12);
        });
        return true;
      }),
      params,
    );
  });

  it('re-encoding a decoded frame gives the same bytes', () => {
    fc.assert(
      fc.property(validFrame, (bytes) => {
        const r = decodeFrame(bytes);
        expect(r.ok).toBe(true);
        if (r.ok) expect([...encodeFrame(r.frame)]).toEqual([...bytes]);
      }),
      params,
    );
  });

  it('every one of the 256 level bytes survives decode then encode', () => {
    for (let b = 0; b < 256; b++) {
      const body = encodePlay({ ...{ eventId: 'p', class: 'knock', side: 'left', sideKnown: true, priority: 1, vibrate: [5], totalMs: 5 }, segments: [{ ms: 5, left: b / 255, right: (255 - b) / 255 }] });
      expect(body[7]).toBe(b);
      expect(body[8]).toBe(255 - b);
      const r = decodeFrame(body);
      if (!r.ok) throw new Error(r.error);
      expect([...encodeFrame(r.frame)]).toEqual([...body]);
    }
  });

  it('never throws for any bytes (fuzz), and re-encodes whatever it accepts', () => {
    fc.assert(
      fc.property(fc.uint8Array({ maxLength: 300 }), (bytes) => {
        const r = decodeFrame(bytes);
        if (r.ok) expect([...encodeFrame(r.frame)]).toEqual([...bytes]);
      }),
      { ...params, numRuns: 2000 },
    );
  });

  it('never throws for near-valid frames: valid bytes with random bytes changed, cut or added', () => {
    const mutated = fc.tuple(validFrame, fc.array(fc.tuple(fc.nat(), fc.integer({ min: 0, max: 255 })), { maxLength: 4 }), fc.integer({ min: -3, max: 3 })).map(([bytes, edits, grow]) => {
      const out = Array.from(bytes);
      for (const [at, value] of edits) out[at % out.length] = value;
      if (grow < 0) out.length = Math.max(0, out.length + grow);
      else for (let i = 0; i < grow; i++) out.push(i);
      return Uint8Array.from(out);
    });
    fc.assert(
      fc.property(mutated, (bytes) => {
        expect(() => decodeFrame(bytes)).not.toThrow();
      }),
      params,
    );
  });

  it('any single flipped bit in a valid frame is an error', () => {
    fc.assert(
      fc.property(validFrame, fc.nat(), (bytes, pick) => {
        const bit = pick % (bytes.length * 8);
        const flipped = Uint8Array.from(bytes);
        flipped[bit >> 3] ^= 1 << (bit & 7);
        expect(decodeFrame(flipped).ok).toBe(false);
      }),
      params,
    );
  });
});
