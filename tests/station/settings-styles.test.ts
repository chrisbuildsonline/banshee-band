import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '../..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');
const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');

/** Colour and size literals outside var(--bb-*), by the rule of tests/band/styles.test.ts (settings R11.1). */
function literals(css: string): string[] {
  const body = stripComments(css)
    .replace(/@media[^{]*\{/g, '{') // the 720px breakpoint cannot use var(); DESIGN.md documents it
    .replace(/var\(--bb-[a-z0-9-]+\)/g, 'TOKEN');
  return [
    ...(body.match(/#[0-9a-f]{3,8}\b/gi) ?? []),
    ...(body.match(/\b(rgba?|hsla?|oklch|color-mix)\(/gi) ?? []),
    ...(body.match(/(?<![\w-])(\d*\.?\d+)(px|rem|em|ms|s)\b/gi) ?? []).filter((v) => !/^[123]px$/.test(v)),
  ];
}

describe('src/station/settings.css (settings R11.1, R11.3)', () => {
  const css = read('src/station/settings.css');

  it('uses only var(--bb-*) for colours, sizes and motion', () => {
    expect(literals(css)).toEqual([]);
  });

  it('has no @keyframes and no remote resource', () => {
    expect(stripComments(css)).not.toMatch(/@keyframes/);
    expect(css).not.toMatch(/@import|url\(/i);
  });

  it('uses the one 720px breakpoint only', () => {
    const queries = [...stripComments(css).matchAll(/@media([^{]*)\{/g)].map((m) => m[1].trim());
    expect(queries.length).toBeGreaterThan(0);
    for (const q of queries) expect(q).toMatch(/^\((min-width: 720px|prefers-reduced-motion: reduce)\)$/);
  });

  it('is linked from index.html', () => {
    expect(read('index.html')).toContain('<link rel="stylesheet" href="/src/station/settings.css" />');
  });

  it('the scanner catches what it should', () => {
    expect(literals('a { color: #fff; width: 480px; gap: 1rem; transition: color 150ms; background: rgb(0 0 0); }')).toEqual(['#fff', 'rgb(', '480px', '1rem', '150ms']);
    expect(literals('a { border: 2px solid var(--bb-color-border); } @media (min-width: 720px) { a { gap: var(--bb-space-4); } }')).toEqual([]);
  });
});
