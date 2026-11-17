import { describe, expect, it } from 'vitest';
import { SOUND_CLASSES } from '../../src/events';
import { SHAPE_BOX, SHAPES } from '../../src/ghosts/shapes';
import { areaRatio, differenceRatio, pathPoints, rasterize, tokenize } from './helpers/raster';

const classes = [...SOUND_CLASSES];

describe('SHAPES (R2)', () => {
  it('has a 24-unit box', () => {
    expect(SHAPE_BOX).toBe(24);
  });

  it('has one path for each of the seven classes', () => {
    expect(Object.keys(SHAPES).sort()).toEqual(['alarm', 'baby', 'doorbell', 'knock', 'other', 'vehicle', 'voice']);
    for (const c of classes) expect(typeof SHAPES[c], c).toBe('string');
  });

  it('is frozen', () => {
    expect(Object.isFrozen(SHAPES)).toBe(true);
  });

  it('has seven pairwise different path strings', () => {
    expect(new Set(classes.map((c) => SHAPES[c])).size).toBe(7);
  });

  it('uses only the absolute commands M L H V C Q Z', () => {
    for (const c of classes) {
      const cmds = tokenize(SHAPES[c]).flatMap((t) => ('cmd' in t ? [t.cmd] : []));
      expect(cmds.length, c).toBeGreaterThan(0);
      expect(cmds.filter((x) => !'MLHVCQZ'.includes(x)), c).toEqual([]);
    }
  });

  it('keeps every point, control points included, inside [2, 22]', () => {
    for (const c of classes) {
      const out = pathPoints(SHAPES[c]).flat().filter((n) => !Number.isNaN(n) && (n < 2 || n > 22));
      expect(out, c).toEqual([]);
    }
  });

  it('fills between 10% and 80% of the box', () => {
    for (const c of classes) {
      const area = areaRatio(rasterize(SHAPES[c]));
      expect(area, `${c} area ${area.toFixed(3)}`).toBeGreaterThanOrEqual(0.1);
      expect(area, `${c} area ${area.toFixed(3)}`).toBeLessThanOrEqual(0.8);
    }
  });

  it('differs in at least 8% of the 2304 pixels for every one of the 21 pairs', () => {
    const masks = Object.fromEntries(classes.map((c) => [c, rasterize(SHAPES[c])]));
    const pairs: { pair: string; ratio: number }[] = [];
    for (let i = 0; i < classes.length; i++) {
      for (let j = i + 1; j < classes.length; j++) {
        pairs.push({ pair: `${classes[i]}/${classes[j]}`, ratio: differenceRatio(masks[classes[i]], masks[classes[j]]) });
      }
    }
    expect(pairs).toHaveLength(21);
    const lowest = pairs.reduce((a, b) => (b.ratio < a.ratio ? b : a));
    expect(lowest.ratio, `lowest pair ${lowest.pair} differs in ${(lowest.ratio * 100).toFixed(1)}%`).toBeGreaterThanOrEqual(0.08);
  });
});
