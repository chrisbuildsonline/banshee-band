import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(resolve(import.meta.dirname, '../../src/station/station.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

/** Every `.bb-latency…` rule body of station.css, keyed by selector (rules inside @media included). */
function rules(): Map<string, string> {
  const out = new Map<string, string>();
  for (const m of css.matchAll(/([^{}]*\.bb-latency[^{}]*)\{([^{}]*)\}/g)) {
    const selector = m[1].trim();
    out.set(selector, `${out.get(selector) ?? ''}${m[2]}`);
  }
  return out;
}

const decl = (body: string, prop: string) => body.match(new RegExp(`(?:^|;|\\s)${prop}\\s*:\\s*([^;]+)`))?.[1].trim();

describe('latency figure styles in station.css (latency R6.1, R6.2, R6.9, R6.10)', () => {
  const all = rules();

  it('has rules for the figure, label, number, unit and note', () => {
    for (const part of ['.bb-latency', '.bb-latency__figure', '.bb-latency__label', '.bb-latency__number', '.bb-latency__unit', '.bb-latency__note']) {
      expect([...all.keys()].some((s) => s.split(',').map((x) => x.trim()).includes(part)), part).toBe(true);
    }
  });

  it('uses tokens only: no colour or px literal, no border, background or keyframes', () => {
    for (const [selector, body] of all) {
      expect(body, selector).not.toMatch(/#[0-9a-f]{3,8}\b|\b(rgba?|hsla?|oklch|color-mix)\(/i);
      expect(body, selector).not.toMatch(/\d+(\.\d+)?(px|rem|em)\b/);
      expect(body, selector).not.toMatch(/(^|[;\s])(border|background)(-[a-z-]+)?\s*:/);
    }
    expect(css).not.toMatch(/@keyframes[^{]*latency/);
  });

  it('the number is display type with tabular figures; label, unit and note are muted captions', () => {
    const body = (sel: string) => [...all].filter(([s]) => s.split(',').map((x) => x.trim()).includes(sel)).map(([, b]) => b).join(';');
    const number = body('.bb-latency__number');
    expect(decl(number, 'font-size')).toBe('var(--bb-type-display-size)');
    expect(decl(number, 'line-height')).toBe('var(--bb-type-display-line)');
    expect(decl(number, 'font-weight')).toBe('var(--bb-type-display-weight)');
    expect(decl(number, 'font-variant-numeric')).toBe('tabular-nums');
    for (const sel of ['.bb-latency__label', '.bb-latency__unit', '.bb-latency__note']) {
      const b = body(sel);
      expect(decl(b, 'color'), sel).toBe('var(--bb-color-text-muted)');
      expect(decl(b, 'font-size'), sel).toBe('var(--bb-type-caption-size)');
    }
  });
});
