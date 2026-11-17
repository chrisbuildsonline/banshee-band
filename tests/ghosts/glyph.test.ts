import { describe, expect, it } from 'vitest';
import { SOUND_CLASSES } from '../../src/events';
import { GLYPH_SIZE_PX, glyphSpec } from '../../src/ghosts/glyph';
import { dashFor, pathLength, shapeParts } from '../../src/ghosts/outline';
import { SHAPES } from '../../src/ghosts/shapes';

describe('glyphSpec (R12.4)', () => {
  it('sizes and outlines the glyph by urgency', () => {
    expect(GLYPH_SIZE_PX).toEqual({ low: 24, medium: 32, high: 40 });
    expect([glyphSpec('knock', 'low').sizePx, glyphSpec('knock', 'medium').sizePx, glyphSpec('knock', 'high').sizePx]).toEqual([24, 32, 40]);
    expect([glyphSpec('knock', 'low').strokeWidth, glyphSpec('knock', 'medium').strokeWidth, glyphSpec('knock', 'high').strokeWidth]).toEqual([1.5, 2.5, 3.5]);
  });

  it('takes the path from SHAPES and uses the 24-unit view box', () => {
    for (const c of SOUND_CLASSES) {
      const spec = glyphSpec(c, 'medium');
      expect(spec.path).toBe(SHAPES[c]);
      expect(spec.viewBox).toBe('0 0 24 24');
    }
  });

  it('strokes the outline and the details but not the eyes (R14.3)', () => {
    for (const c of SOUND_CLASSES) {
      const { outer, details } = shapeParts(SHAPES[c]);
      expect(glyphSpec(c, 'high').strokePath, c).toBe([outer, ...details].join(' '));
    }
    expect(glyphSpec('voice', 'low').strokePath.match(/M/g)).toHaveLength(2);
    expect(glyphSpec('knock', 'low').strokePath.match(/M/g)).toHaveLength(1);
  });
});

describe('ghosts index (R14.2, R15.1)', () => {
  it('exports the outline helpers', async () => {
    const mod = await import('../../src/ghosts/index');
    expect(mod.shapeParts).toBe(shapeParts);
    expect(mod.pathLength).toBe(pathLength);
    expect(mod.dashFor).toBe(dashFor);
  });
});
