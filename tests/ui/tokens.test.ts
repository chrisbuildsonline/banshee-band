import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { chroma, contrastRatio, hue, parseHex } from './contrast';
import { parseContrastTable, parseCssTokens, parseHueTable, parseTokenTable, type Declarations } from './design-parse';

const root = resolve(import.meta.dirname, '../..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');

const designMd = read('design/DESIGN.md');
const tokensCss = read('src/ui/tokens.css');
const styleguideCss = read('src/ui/styleguide.css');

const tokens = parseTokenTable(designMd);
const css = parseCssTokens(tokensCss);
const nightCss: Declarations = { ...css.day, ...css.nightAttribute };

/** Hex colours compare case-insensitively; everything else compares exactly. */
const same = (a: string, b: string) => (/^#[0-9a-f]+$/i.test(a) ? a.toLowerCase() === b.toLowerCase() : a === b);
const isHex = (value: string) => /^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(value);

// Tokens allowed to carry the accent hue (design.md, "Single accent rule").
const ACCENT_FAMILY = /^--bb-(color-accent(-.+)?|color-status-accent-.+|ghost-.+|color-focus)$/;
const NEUTRAL_MAX_CHROMA = 0.1;
const ACCENT_HUE_TOLERANCE = 15;

describe('DESIGN.md token table', () => {
  it('names at least one token (no vacuous pass)', () => {
    expect(tokens.length).toBeGreaterThan(0);
  });

  it('names each token once', () => {
    const names = tokens.map((t) => t.name);
    const duplicates = names.filter((name, i) => names.indexOf(name) !== i);
    expect(duplicates, `Duplicate tokens in DESIGN.md: ${duplicates.join(', ')}`).toEqual([]);
  });

  it('gives every token a Night value or marks it theme-independent', () => {
    // parseTokenTable throws on an empty Night cell; this guards the result shape too.
    const unthemed = tokens.filter((t) => !t.themeIndependent && t.night === '').map((t) => t.name);
    expect(unthemed, `Tokens with no Night value: ${unthemed.join(', ')}`).toEqual([]);
  });
});

describe('tokens.css matches DESIGN.md', () => {
  it('defines every DESIGN.md token on :root', () => {
    const missing = tokens.map((t) => t.name).filter((name) => !(name in css.day));
    expect(missing, `Missing from tokens.css :root: ${missing.join(', ')}`).toEqual([]);
  });

  it('defines no token that DESIGN.md does not name', () => {
    const named = new Set(tokens.map((t) => t.name));
    const defined = new Set([...Object.keys(css.day), ...Object.keys(css.nightAttribute), ...Object.keys(css.nightMedia), ...Object.keys(css.reducedMotion)]);
    const extra = [...defined].filter((name) => !named.has(name));
    expect(extra, `In tokens.css but not in DESIGN.md: ${extra.join(', ')}`).toEqual([]);
  });

  it('uses the Day values from DESIGN.md', () => {
    const wrong = tokens.filter((t) => t.name in css.day && !same(css.day[t.name], t.day)).map((t) => `${t.name} (css ${css.day[t.name]}, doc ${t.day})`);
    expect(wrong, `Day values differ: ${wrong.join('; ')}`).toEqual([]);
  });

  it('overrides exactly the theme-dependent tokens with their Night values', () => {
    const themed = tokens.filter((t) => !t.themeIndependent);
    const wrong = themed.filter((t) => !same(css.nightAttribute[t.name] ?? '', t.night)).map((t) => `${t.name} (css ${css.nightAttribute[t.name] ?? 'missing'}, doc ${t.night})`);
    expect(wrong, `Night values differ: ${wrong.join('; ')}`).toEqual([]);
    const themedNames = new Set(themed.map((t) => t.name));
    const stray = Object.keys(css.nightAttribute).filter((name) => !themedNames.has(name));
    expect(stray, `Theme-independent tokens overridden in Night: ${stray.join(', ')}`).toEqual([]);
  });

  it('writes the Night block and the prefers-color-scheme block identically', () => {
    expect(Object.keys(css.nightAttribute).length).toBeGreaterThan(0);
    expect(css.nightMedia).toEqual(css.nightAttribute);
  });

  it('zeroes every motion token under prefers-reduced-motion', () => {
    const motion = tokens.filter((t) => t.name.startsWith('--bb-motion-')).map((t) => t.name);
    expect(motion.length).toBeGreaterThan(0);
    const notZeroed = motion.filter((name) => css.reducedMotion[name] !== '0s');
    expect(notZeroed, `Motion tokens not zeroed under reduced motion: ${notZeroed.join(', ')}`).toEqual([]);
  });
});

describe('shape and single accent', () => {
  it('keeps the card radius between 16px and 20px', () => {
    const match = /^(\d+(?:\.\d+)?)px$/.exec(css.day['--bb-radius-card'] ?? '');
    expect(match, '--bb-radius-card must be a px value').not.toBeNull();
    const px = Number(match![1]);
    expect(px).toBeGreaterThanOrEqual(16);
    expect(px).toBeLessThanOrEqual(20);
  });

  const hues = parseHueTable(designMd);
  const colourTokens = tokens.filter((t) => /^--bb-(color|ghost)-/.test(t.name));

  it('lists every colour token in the Colour section Hue column', () => {
    const unlisted = colourTokens.map((t) => t.name).filter((name) => !(name in hues));
    expect(unlisted, `Colour tokens without a Hue entry: ${unlisted.join(', ')}`).toEqual([]);
  });

  it('has exactly one accent family: every hue-bearing token is neutral or accent', () => {
    const families = new Set(Object.values(hues).filter((h) => h !== 'neutral'));
    expect([...families]).toEqual(['accent']);
    const misnamed = Object.entries(hues).filter(([name, h]) => h === 'accent' && !ACCENT_FAMILY.test(name)).map(([name]) => name);
    expect(misnamed, `Accent hue on a token outside the accent family: ${misnamed.join(', ')}`).toEqual([]);
  });

  it('keeps neutrals low-chroma and the accent family on the accent hue, in both themes', () => {
    const problems: string[] = [];
    for (const [theme, values] of [['day', css.day], ['night', nightCss]] as const) {
      const accentHue = hue(parseHex(values['--bb-color-accent']));
      for (const t of colourTokens) {
        const value = values[t.name];
        if (!value || !isHex(value)) continue;
        const rgb = parseHex(value);
        if (hues[t.name] === 'neutral' && chroma(rgb) > NEUTRAL_MAX_CHROMA) problems.push(`${theme} ${t.name} ${value} is not neutral`);
        if (hues[t.name] === 'accent') {
          const distance = Math.abs(((hue(rgb) - accentHue + 540) % 360) - 180);
          if (distance > ACCENT_HUE_TOLERANCE) problems.push(`${theme} ${t.name} ${value} is ${distance.toFixed(0)}deg off the accent hue`);
        }
      }
    }
    expect(problems).toEqual([]);
  });
});

describe('contrast table', () => {
  const pairs = parseContrastTable(designMd);

  it('lists pairs for both themes', () => {
    expect(pairs.some((p) => p.theme === 'day')).toBe(true);
    expect(pairs.some((p) => p.theme === 'night')).toBe(true);
  });

  it('meets every threshold, and each stated ratio matches the computed one within 0.1', () => {
    const problems: string[] = [];
    for (const p of pairs) {
      const values = p.theme === 'day' ? css.day : nightCss;
      const fg = values[p.foreground];
      const bg = values[p.background];
      if (!fg || !bg || !isHex(fg) || !isHex(bg)) {
        problems.push(`${p.pair} (${p.theme}): ${p.foreground} or ${p.background} is not a hex colour in tokens.css`);
        continue;
      }
      const computed = contrastRatio(fg, bg);
      if (computed < p.threshold) problems.push(`${p.pair} (${p.theme}): ${computed.toFixed(2)} is below ${p.threshold}`);
      if (Math.abs(computed - p.ratio) > 0.1) problems.push(`${p.pair} (${p.theme}): stated ${p.ratio}, computed ${computed.toFixed(2)}`);
    }
    expect(problems).toEqual([]);
  });
});

describe('no remote resources and no hard-coded values', () => {
  const remote = /@import|url\(\s*['"]?(https?:)?\/\//i;

  it('has no remote @import or url() in tokens.css or styleguide.css', () => {
    expect(remote.test(tokensCss)).toBe(false);
    expect(remote.test(styleguideCss)).toBe(false);
  });

  it('uses only var(--bb-*) for colours and sizes in styleguide.css', () => {
    const body = styleguideCss
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/@media[^{]*\{/g, '{') // breakpoints cannot use var(); DESIGN.md documents them
      .replace(/var\(--bb-[a-z0-9-]+\)/g, 'TOKEN');
    const literals = [
      ...(body.match(/#[0-9a-f]{3,8}\b/gi) ?? []),
      ...(body.match(/\b(rgba?|hsla?|oklch|color-mix)\(/gi) ?? []),
      // Size literals; 1px to 3px are allowed for borders and outlines.
      ...(body.match(/(?<![\w-])(\d*\.?\d+)(px|rem|em|ms|s)\b/gi) ?? []).filter((v) => !/^[123]px$/.test(v)),
    ];
    expect(literals, `Hard-coded literals in styleguide.css: ${literals.join(', ')}`).toEqual([]);
  });
});
