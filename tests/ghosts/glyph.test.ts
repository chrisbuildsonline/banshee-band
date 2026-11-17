import { describe, expect, it } from 'vitest';
import { SOUND_CLASSES } from '../../src/events';
import { GLYPH_SIZE_PX, glyphSpec } from '../../src/ghosts/glyph';
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
});
