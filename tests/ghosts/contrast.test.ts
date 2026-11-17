import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { contrastRatio } from '../ui/contrast';
import { parseContrastTable, parseCssTokens } from '../ui/design-parse';

const root = resolve(import.meta.dirname, '../..');
const css = parseCssTokens(readFileSync(resolve(root, 'src/ui/tokens.css'), 'utf8'));
const table = parseContrastTable(readFileSync(resolve(root, 'design/DESIGN.md'), 'utf8'));
const themes = { day: css.day, night: { ...css.day, ...css.nightAttribute } } as const;

// The colours the ghost field and the glyph tiles draw, against the surface they sit on (R11.4).
const PAIRS: [fg: string, bg: string, threshold: number][] = [
  ['--bb-color-text', '--bb-color-surface', 4.5],
  ['--bb-color-text-muted', '--bb-color-surface', 4.5],
  ['--bb-ghost-fill', '--bb-color-surface', 3],
  ['--bb-ghost-outline', '--bb-color-surface', 3],
  ['--bb-ghost-glow-1', '--bb-color-surface', 3],
  ['--bb-ghost-glow-2', '--bb-color-surface', 3],
  ['--bb-ghost-glow-3', '--bb-color-surface', 3],
  ['--bb-color-border', '--bb-color-surface', 3],
  ['--bb-ghost-fill', '--bb-color-surface-raised', 3],
];

describe('ghost field contrast (R11.4)', () => {
  for (const theme of ['day', 'night'] as const) {
    for (const [fg, bg, threshold] of PAIRS) {
      it(`${fg} on ${bg} in ${theme} is at least ${threshold}:1 and matches the DESIGN.md table`, () => {
        const values = themes[theme];
        const ratio = contrastRatio(values[fg], values[bg]);
        expect(ratio).toBeGreaterThanOrEqual(threshold);
        const row = table.find((r) => r.foreground === fg && r.background === bg && r.theme === theme);
        expect(row, `no contrast table row for ${fg} on ${bg} (${theme})`).toBeDefined();
        expect(Math.abs(row!.ratio - ratio)).toBeLessThanOrEqual(0.1);
      });
    }
  }
});
