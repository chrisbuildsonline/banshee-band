import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '../..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');

// The simulator styles and the band page layout (R6.4-R6.6, R9.1).
const sheets = { 'src/band/simulator.css': read('src/band/simulator.css'), 'src/ui/band-page.css': read('src/ui/band-page.css'), 'src/band/connect.css': read('src/band/connect.css') };
const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');

/** Colour and size literals outside var(--bb-*), as tests/ui/tokens.test.ts checks styleguide.css. */
function literals(css: string): string[] {
  const body = stripComments(css)
    .replace(/@media[^{]*\{/g, '{') // the 720px breakpoint cannot use var(); DESIGN.md documents it
    .replace(/var\(--bb-[a-z0-9-]+\)/g, 'TOKEN');
  return [
    ...(body.match(/#[0-9a-f]{3,8}\b/gi) ?? []),
    ...(body.match(/\b(rgba?|hsla?|oklch|color-mix)\(/gi) ?? []),
    // 1px to 3px are allowed for borders, outlines and the visually hidden live region.
    ...(body.match(/(?<![\w-])(\d*\.?\d+)(px|rem|em|ms|s)\b/gi) ?? []).filter((v) => !/^[123]px$/.test(v)),
  ];
}

describe('band styles', () => {
  for (const [path, css] of Object.entries(sheets)) {
    it(`${path} uses only var(--bb-*) for colours, sizes and motion`, () => {
      expect(literals(css)).toEqual([]);
    });

    it(`${path} has no @keyframes and no remote resource`, () => {
      expect(stripComments(css)).not.toMatch(/@keyframes/);
      expect(css).not.toMatch(/@import|url\(\s*['"]?(https?:)?\/\//i);
    });
  }

  it('the bar fill moves with --bb-motion-fast and not at all under reduced motion', () => {
    const css = stripComments(sheets['src/band/simulator.css']);
    expect(css).toMatch(/\.bb-motor__fill\s*\{[^}]*transition:\s*width var\(--bb-motion-fast\)/);
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)\s*\{\s*\.bb-motor__fill\s*\{\s*transition:\s*none;/);
  });

  it('the scanner catches literals', () => {
    expect(literals('a { color: #fff; width: 12px; transition: width 150ms; }')).toEqual(['#fff', '12px', '150ms']);
    expect(literals('a { outline: 2px dashed var(--bb-color-border); margin: -1px; }')).toEqual([]);
  });
});
