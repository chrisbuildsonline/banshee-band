import { describe, expect, it } from 'vitest';
import { SOUND_CLASSES } from '../../src/events';
import { shapeParts } from '../../src/ghosts/outline';
import { SHAPES } from '../../src/ghosts/shapes';
import { differenceRatio, GRID, rasterize } from './helpers/raster';

/** Clearance around an eye, in raster pixels (2 units at 2 px per unit). */
const CLEAR_PX = 4;

const pixelsOf = (mask: Uint8Array): [number, number][] => {
  const out: [number, number][] = [];
  for (let k = 0; k < mask.length; k++) if (mask[k]) out.push([k % GRID, Math.floor(k / GRID)]);
  return out;
};

/** Centre of the filled pixels, in 24-unit box units. */
const centreOf = (px: [number, number][]): [number, number] => [
  px.reduce((s, [i]) => s + (i + 0.5) / 2, 0) / px.length,
  px.reduce((s, [, j]) => s + (j + 0.5) / 2, 0) / px.length,
];

/** The raster of the outer outline and the details, without the eyes. */
const bodyOf = (path: string): Uint8Array => {
  const { outer, details } = shapeParts(path);
  return rasterize([outer, ...details].join(' '));
};

describe('ghost eyes (R14.1, R14.4)', () => {
  for (const c of SOUND_CLASSES) {
    describe(c, () => {
      const parts = shapeParts(SHAPES[c]);

      it(`has two eyes and ${c === 'voice' ? 'one detail (the mouth)' : 'no detail'}`, () => {
        expect(parts.eyes).toHaveLength(2);
        expect(parts.details).toHaveLength(c === 'voice' ? 1 : 0);
      });

      it('fills 12 to 48 pixels with each eye', () => {
        expect(parts.eyes).toHaveLength(2);
        for (const eye of parts.eyes) {
          const n = pixelsOf(rasterize(eye)).length;
          expect(n, `${c} eye ${eye}`).toBeGreaterThanOrEqual(12);
          expect(n, `${c} eye ${eye}`).toBeLessThanOrEqual(48);
        }
      });

      it('keeps the eyes apart: at least 2.5 units centre to centre and no shared pixel', () => {
        expect(parts.eyes).toHaveLength(2);
        const [a, b] = parts.eyes.map((e) => rasterize(e));
        const shared = pixelsOf(a.map((v, k) => v & b[k]));
        expect(shared, `${c} eyes overlap`).toEqual([]);
        const [ca, cb] = [centreOf(pixelsOf(a)), centreOf(pixelsOf(b))];
        expect(Math.hypot(ca[0] - cb[0], ca[1] - cb[1]), `${c} eye centres ${ca} ${cb}`).toBeGreaterThanOrEqual(2.5);
      });

      it('keeps every pixel within 2 units of an eye filled in the body without the eyes', () => {
        expect(parts.eyes).toHaveLength(2);
        const body = bodyOf(SHAPES[c]);
        const bare: string[] = [];
        for (const eye of parts.eyes) {
          for (const [i, j] of pixelsOf(rasterize(eye))) {
            for (let dj = -CLEAR_PX; dj <= CLEAR_PX; dj++) {
              for (let di = -CLEAR_PX; di <= CLEAR_PX; di++) {
                if (di * di + dj * dj > CLEAR_PX * CLEAR_PX) continue;
                const [x, y] = [i + di, j + dj];
                const inside = x >= 0 && y >= 0 && x < GRID && y < GRID && body[y * GRID + x] === 1;
                if (!inside) bare.push(`${x},${y}`);
              }
            }
          }
        }
        expect([...new Set(bare)], `${c}: pixels near an eye that are not body`).toEqual([]);
      });
    });
  }

  it('tells the classes apart by the outline alone: every pair differs in 8% without the eyes (R14.5)', () => {
    const masks = SOUND_CLASSES.map((c) => bodyOf(SHAPES[c]));
    let lowest = 1;
    for (let i = 0; i < masks.length; i++) for (let j = i + 1; j < masks.length; j++) lowest = Math.min(lowest, differenceRatio(masks[i], masks[j]));
    expect(lowest).toBeGreaterThanOrEqual(0.08);
  });
});
