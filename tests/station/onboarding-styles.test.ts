import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '../..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');
const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');

/** Colour and size literals outside var(--bb-*), by the rule of tests/station/settings-styles.test.ts. */
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

describe('src/station/onboarding.css', () => {
  const path = 'src/station/onboarding.css';

  it('exists', () => {
    expect(existsSync(resolve(root, path))).toBe(true);
  });

  it('uses only var(--bb-*) for colours, sizes and motion', () => {
    expect(literals(read(path))).toEqual([]);
  });

  it('has no @keyframes and no remote resource', () => {
    const css = read(path);
    expect(stripComments(css)).not.toMatch(/@keyframes/);
    expect(css).not.toMatch(/@import|url\(/i);
  });

  it('uses the one 720px breakpoint and the reduced-motion query only', () => {
    const queries = [...stripComments(read(path)).matchAll(/@media([^{]*)\{/g)].map((m) => m[1].trim());
    expect(queries.length).toBeGreaterThan(0);
    for (const q of queries) expect(q).toMatch(/^\((min-width: 720px|prefers-reduced-motion: reduce)\)$/);
  });

  it('moves only with the motion tokens, so reduced motion stops it', () => {
    const css = stripComments(read(path));
    for (const m of css.matchAll(/transition(?:-duration)?\s*:([^;]+);/g)) {
      if (m[1].trim() === 'none') continue;
      expect(m[1], m[0]).toMatch(/var\(--bb-motion-(fast|slow)\)/);
    }
  });

  it('is linked from index.html', () => {
    expect(read('index.html')).toContain('<link rel="stylesheet" href="/src/station/onboarding.css" />');
  });
});
