import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { chroma, contrastRatio, hue, parseHex, relativeLuminance } from './contrast';

const hexColour = fc
  .tuple(fc.integer({ min: 0, max: 255 }), fc.integer({ min: 0, max: 255 }), fc.integer({ min: 0, max: 255 }))
  .map(([r, g, b]) => `#${[r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('')}`);

describe('parseHex', () => {
  it('reads 6-digit and 3-digit hex, any case', () => {
    expect(parseHex('#FF8000')).toEqual({ r: 255, g: 128, b: 0 });
    expect(parseHex('#ff8000')).toEqual({ r: 255, g: 128, b: 0 });
    expect(parseHex('#f80')).toEqual({ r: 255, g: 136, b: 0 });
  });

  it('throws on anything that is not a hex colour', () => {
    expect(() => parseHex('red')).toThrow(/not a hex colour/);
    expect(() => parseHex('#12345')).toThrow(/not a hex colour/);
  });
});

describe('relativeLuminance', () => {
  it('is 0 for black and 1 for white', () => {
    expect(relativeLuminance(parseHex('#000000'))).toBe(0);
    expect(relativeLuminance(parseHex('#FFFFFF'))).toBe(1);
  });
});

describe('hue and chroma', () => {
  it('gives the HSL hue in degrees', () => {
    expect(hue(parseHex('#FF0000'))).toBe(0);
    expect(hue(parseHex('#00FF00'))).toBe(120);
    expect(hue(parseHex('#0000FF'))).toBe(240);
    expect(hue(parseHex('#8000FF'))).toBeCloseTo(270, 0);
  });

  it('gives chroma as the channel spread in [0, 1]', () => {
    expect(chroma(parseHex('#808080'))).toBe(0);
    expect(chroma(parseHex('#FF0000'))).toBe(1);
    expect(chroma(parseHex('#EEF0F4'))).toBeCloseTo(6 / 255, 10);
  });
});

describe('contrastRatio', () => {
  it('gives 21 for black on white', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 10);
  });

  it('matches a known WCAG value (#777777 on white is about 4.48)', () => {
    expect(contrastRatio('#777777', '#FFFFFF')).toBeCloseTo(4.48, 2);
  });

  it('is symmetric', () => {
    fc.assert(fc.property(hexColour, hexColour, (a, b) => contrastRatio(a, b) === contrastRatio(b, a)));
  });

  it('lies in [1, 21]', () => {
    fc.assert(
      fc.property(hexColour, hexColour, (a, b) => {
        const ratio = contrastRatio(a, b);
        return ratio >= 1 && ratio <= 21 + 1e-9;
      }),
    );
  });

  it('is exactly 1 for a colour against itself', () => {
    fc.assert(fc.property(hexColour, (a) => contrastRatio(a, a) === 1));
  });
});
