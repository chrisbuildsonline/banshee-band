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

  it('gives the band simulator bar on its track at least 3:1 (accent on surface-raised, Day and Night)', () => {
    expect(contrastRatio('#6236E0', '#F4F5F8')).toBeCloseTo(6.17, 2);
    expect(contrastRatio('#B49CFF', '#241F2E')).toBeCloseTo(6.97, 2);
  });

  it('gives the station pipeline tile its accent stage number at 4.5:1 and its dial arc at 3:1 (Day and Night)', () => {
    expect(contrastRatio('#6236E0', '#F4F5F8')).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio('#B49CFF', '#241F2E')).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio('#7C8291', '#F4F5F8')).toBeCloseTo(3.53, 2);
    expect(contrastRatio('#736C82', '#241F2E')).toBeCloseTo(3.2, 2);
  });

  it('keeps ghost labels and ghosts readable where they cross a station field ring (accent-tint)', () => {
    // Day: text, muted, ghost fill, ghost outline on #ECE6FF.
    expect(contrastRatio('#111318', '#ECE6FF')).toBeCloseTo(15.33, 2);
    expect(contrastRatio('#5A606C', '#ECE6FF')).toBeCloseTo(5.21, 2);
    expect(contrastRatio('#8B6CF2', '#ECE6FF')).toBeCloseTo(3.14, 2);
    expect(contrastRatio('#4A22B5', '#ECE6FF')).toBeCloseTo(7.92, 2);
    // Night: the same on #2D2348.
    expect(contrastRatio('#F2EEF8', '#2D2348')).toBeCloseTo(12.7, 2);
    expect(contrastRatio('#A9A1B8', '#2D2348')).toBeCloseTo(5.86, 2);
    expect(contrastRatio('#E6DEFF', '#2D2348')).toBeCloseTo(11.25, 2);
    expect(contrastRatio('#B49CFF', '#2D2348')).toBeCloseTo(6.32, 2);
    // Why the rings stay thin lines: the uncertain arc (border) would be under 3:1 on a filled Night glow.
    expect(contrastRatio('#736C82', '#2D2348')).toBeLessThan(3);
  });

  it('keeps the wristband connect row readable on its tile (surface-raised, Day and Night)', () => {
    // The connected status line: accent-strong on the tile.
    expect(contrastRatio('#4A22B5', '#F4F5F8')).toBeCloseTo(8.81, 2);
    expect(contrastRatio('#D9CCFF', '#241F2E')).toBeCloseTo(10.71, 2);
    // The Connect band primary pill on the tile: the Day fill, the Night outline.
    expect(contrastRatio('#111318', '#F4F5F8')).toBeCloseTo(17.04, 2);
    expect(contrastRatio('#CCC5DB', '#241F2E')).toBeCloseTo(9.6, 2);
  });

  it('is exactly 1 for a colour against itself', () => {
    fc.assert(fc.property(hexColour, (a) => contrastRatio(a, a) === 1));
  });
});
