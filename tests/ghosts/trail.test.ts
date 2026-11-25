import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { TRAIL_ALPHA } from '../../src/ghosts/constants';
import { trailAlpha } from '../../src/ghosts/trail';
import { contrastRatio, parseHex } from '../ui/contrast';
import { parseCssTokens } from '../ui/design-parse';

const css = parseCssTokens(readFileSync(resolve(import.meta.dirname, '../../src/ui/tokens.css'), 'utf8'));
const themes = { day: css.day, night: { ...css.day, ...css.nightAttribute } } as const;

/** `fg` drawn at `alpha` over `bg`, as a hex colour. */
function over(fg: string, bg: string, alpha: number): string {
  const f = parseHex(fg);
  const b = parseHex(bg);
  const mix = (x: number, y: number) => Math.round(x * alpha + y * (1 - alpha)).toString(16).padStart(2, '0');
  return `#${mix(f.r, b.r)}${mix(f.g, b.g)}${mix(f.b, b.b)}`;
}

describe('trail dimming (R10.8-R10.10)', () => {
  it('starts at full strength and dims with each older rank', () => {
    expect(TRAIL_ALPHA).toEqual([1, 0.8, 0.65, 0.55]);
    for (let i = 1; i < TRAIL_ALPHA.length; i++) expect(TRAIL_ALPHA[i]).toBeLessThan(TRAIL_ALPHA[i - 1]);
  });

  it('keeps the dimmest outline at 3:1 or more on the card, in Day and Night', () => {
    for (const theme of ['day', 'night'] as const) {
      const t = themes[theme];
      for (const alpha of TRAIL_ALPHA) {
        const ratio = contrastRatio(over(t['--bb-ghost-outline'], t['--bb-color-surface'], alpha), t['--bb-color-surface']);
        expect(ratio, `${theme} outline at ${alpha}`).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it('gives the rank alpha, and dims a latest ghost older than the ttl to the faintest step', () => {
    expect(trailAlpha(0, 0, 30000)).toBe(1);
    expect(trailAlpha(0, 30000, 30000)).toBe(1);
    expect(trailAlpha(0, 30001, 30000)).toBe(0.55);
    expect(trailAlpha(1, 0, 30000)).toBe(0.8);
    expect(trailAlpha(2, 0, 30000)).toBe(0.65);
    expect(trailAlpha(3, 0, 30000)).toBe(0.55);
    expect(trailAlpha(9, 0, 30000)).toBe(0.55);
  });
});
