import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { URGENCY_LEVELS, type SoundEvent } from '../../src/events';
import { FIELD_PADDING_X, GHOST_BOX_MAX_PX, URGENCY_STYLE } from '../../src/ghosts/constants';
import { ghostBasePx, ghostBlock, layoutGhost, layoutGhosts } from '../../src/ghosts/layout';
import type { GhostInput } from '../../src/ghosts/types';
import { validEvent } from '../events/arbitraries';

const RUNS = { seed: 20261031, numRuns: 150 };
const width = fc.integer({ min: 200, max: 3000 });
const height = fc.integer({ min: 360, max: 2000 });
const bearingConfidence = fc.oneof(fc.double({ min: -0.5, max: 1.5, noNaN: true }), fc.constantFrom(0, 0.79, 0.8, 1, Number.NaN));
const input = fc.record({ event: validEvent, bearingConfidence });
const certainAt = (bearingDeg: number, overrides: Partial<SoundEvent> = {}): GhostInput => ({
  event: { id: 'p', t: 0, class: 'knock', label: 'Knock', confidence: 0.9, bearingDeg, bearingSource: 'gcc-phat', loudnessDb: -20, urgency: 'low', ...overrides },
  bearingConfidence: 1,
});

describe('layout properties (R14.5)', () => {
  it('keeps x inside [72, width - 72] for any finite bearing and width', () => {
    fc.assert(
      fc.property(fc.double({ min: -1000, max: 1000, noNaN: true }), width, (b, w) => {
        const { x } = layoutGhost(certainAt(b), { width: w, height: 400 });
        return x >= 72 - 1e-9 && x <= w - 72 + 1e-9;
      }),
      RUNS,
    );
    fc.assert(
      fc.property(input, width, (i, w) => {
        const { x } = layoutGhost(i, { width: w, height: 400 });
        return x >= 72 - 1e-9 && x <= w - 72 + 1e-9;
      }),
      RUNS,
    );
  });

  it('pads at least half the largest box plus the largest glow', () => {
    expect(FIELD_PADDING_X).toBeGreaterThanOrEqual((GHOST_BOX_MAX_PX * 1.5) / 2 + 12);
  });

  it('puts a certain ghost outside the centre zone on the side of its bearing', () => {
    fc.assert(
      fc.property(fc.double({ min: 15.0001, max: 180, noNaN: true }), fc.boolean(), width, (abs, neg, w) => {
        const b = neg ? -abs : abs;
        const { x, uncertain } = layoutGhost(certainAt(b), { width: w, height: 400 });
        return !uncertain && Math.sign(x - w / 2) === Math.sign(b);
      }),
      RUNS,
    );
  });

  it('gives the same layout for the same input', () => {
    fc.assert(
      fc.property(input, width, height, (i, w, h) => {
        expect(layoutGhost(i, { width: w, height: h })).toEqual(layoutGhost(i, { width: w, height: h }));
      }),
      RUNS,
    );
  });

  it('grows scale, outline and glow strictly with urgency, and boxPx is basePx times scale', () => {
    fc.assert(
      fc.property(fc.double({ min: -180, max: 180, noNaN: true }), width, height, (b, w, h) => {
        const [low, medium, high] = URGENCY_LEVELS.map((u) => layoutGhost(certainAt(b, { urgency: u }), { width: w, height: h }));
        for (const k of ['scale', 'outlineWidth', 'glowBlur'] as const) if (!(low[k] < medium[k] && medium[k] < high[k])) return false;
        return [low, medium, high].every((l) => l.boxPx === ghostBasePx(h, 1) * l.scale);
      }),
      RUNS,
    );
  });

  it('draws an uncertain ghost at the centre with Side unknown', () => {
    const uncertainInput = fc.oneof(
      fc.record({ event: validEvent.filter((e) => e.bearingSource !== 'gcc-phat'), bearingConfidence }),
      fc.record({ event: validEvent, bearingConfidence: fc.oneof(fc.double({ min: -0.5, max: 0.7999, noNaN: true }), fc.double({ min: 1.0001, max: 5, noNaN: true }), fc.constant(Number.NaN)) }),
    );
    fc.assert(
      fc.property(uncertainInput, width, (i, w) => {
        const l = layoutGhost(i, { width: w, height: 400 });
        return l.uncertain && l.x === w / 2 && l.side === 'unknown' && l.sideText === 'Side unknown';
      }),
      RUNS,
    );
  });
});

describe('row properties (R14.5)', () => {
  it('lays out min(n, 4) ghosts whose blocks do not overlap and stay inside the margins', () => {
    fc.assert(
      fc.property(fc.array(input, { maxLength: 6 }), width, height, (inputs, w, h) => {
        const ls = layoutGhosts(inputs, { width: w, height: h });
        if (ls.length !== Math.min(inputs.length, 4)) return false;
        const blocks = ls.map(ghostBlock);
        return blocks.every((b, i) => b.top >= 8 - 1e-9 && b.bottom <= h - 40 + 1e-9 && (i === 0 || b.top >= blocks[i - 1].bottom - 1e-9));
      }),
      RUNS,
    );
  });

  it('fits the block of every urgency in its slot for rows 1 to 4 and any height from 360', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 4 }), height, (rows, h) => {
        const slotH = (h - 8 - 40) / rows;
        const base = ghostBasePx(h, rows);
        const unclamped = Math.floor((slotH - 30) / 1.5);
        if (unclamped >= 32 && 1.5 * base + 30 > slotH + 1e-9) return false;
        return URGENCY_LEVELS.every((u) => base * URGENCY_STYLE[u].scale + URGENCY_STYLE[u].glowBlur + 2 + 16 <= slotH + 1e-9);
      }),
      RUNS,
    );
  });

  it('keeps ghostBasePx in [32, 72], non-increasing in rows and non-decreasing in height, reaching both clamps', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 4 }), fc.integer({ min: 1, max: 4 }), fc.integer({ min: 0, max: 3000 }), fc.integer({ min: 0, max: 3000 }), (r1, r2, h1, h2) => {
        const b = ghostBasePx(h1, r1);
        if (b < 32 || b > 72) return false;
        if (r1 <= r2 && ghostBasePx(h1, r1) < ghostBasePx(h1, r2)) return false;
        if (h1 <= h2 && ghostBasePx(h1, r1) > ghostBasePx(h2, r1)) return false;
        return true;
      }),
      RUNS,
    );
    expect(ghostBasePx(360, 4)).toBe(32);
    expect(ghostBasePx(2000, 1)).toBe(72);
  });
});
