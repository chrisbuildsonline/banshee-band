import { readFileSync } from 'node:fs';
import { deflateSync, inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { ICON_COLOURS, ICON_SPECS, renderIcon } from '../../src/pwa/icons';
import { buildManifest, MANIFEST_ICONS } from '../../src/pwa/manifest';
import { encodePng } from '../../src/pwa/png';

const root = new URL('../../', import.meta.url);
const tokens = readFileSync(new URL('src/ui/tokens.css', root), 'utf8');
const dayToken = (name: string) => tokens.match(new RegExp(`--bb-color-${name}:\\s*(#[0-9A-Fa-f]{6})`))![1];
const hex = (rgb: readonly number[]) => `#${rgb.map((v) => v.toString(16).padStart(2, '0')).join('')}`.toUpperCase();

function px(rgba: Uint8ClampedArray, size: number, x: number, y: number): number[] {
  const i = (Math.floor(y * size) * size + Math.floor(x * size)) * 4;
  return [...rgba.slice(i, i + 4)];
}

describe('icons', () => {
  it('use the Day canvas and accent tokens', () => {
    expect(hex(ICON_COLOURS.accent)).toBe(dayToken('accent').toUpperCase());
    expect(hex(ICON_COLOURS.canvas)).toBe(dayToken('canvas').toUpperCase());
  });

  it('draw a canvas ghost with two accent eyes on an accent disc', () => {
    const a = renderIcon(192, 'any');
    expect(a.length).toBe(192 * 192 * 4);
    expect(renderIcon(192, 'any')).toEqual(a);
    expect(px(a, 192, 0.5, 0.1)).toEqual([...ICON_COLOURS.accent, 255]);
    expect(px(a, 192, 0.5, 0.6)).toEqual([...ICON_COLOURS.canvas, 255]);
    expect(px(a, 192, 0.42, 0.45)).toEqual([...ICON_COLOURS.accent, 255]);
    expect(px(a, 192, 0.58, 0.45)).toEqual([...ICON_COLOURS.accent, 255]);
    expect(px(a, 192, 0.01, 0.01)[3]).toBe(0);
  });

  it('keep the maskable ghost inside the central 80% circle', () => {
    const size = 128;
    const m = renderIcon(size, 'maskable');
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = (y * size + x) * 4;
        expect(m[i + 3]).toBe(255);
        if (Math.hypot((x + 0.5) / size - 0.5, (y + 0.5) / size - 0.5) > 0.4) expect([m[i], m[i + 1], m[i + 2]]).toEqual([...ICON_COLOURS.accent]);
      }
    }
  });
});

describe('png and manifest files', () => {
  it('are what the code generates', () => {
    for (const spec of ICON_SPECS) {
      const file = readFileSync(new URL(`public/icons/${spec.file}`, root));
      expect([...file.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
      expect(file.readUInt32BE(16)).toBe(spec.size);
      expect(file.readUInt32BE(20)).toBe(spec.size);
      // Bun and Node deflate differently, so the decoded pixels are compared, not the compressed bytes.
      const png = Buffer.from(encodePng(renderIcon(spec.size, spec.kind), spec.size, (b) => deflateSync(b, { level: 9 })));
      const idat = (b: Buffer) => inflateSync(b.subarray(41, 41 + b.readUInt32BE(33)));
      expect(idat(png).equals(idat(file))).toBe(true);
    }
    const manifest = JSON.parse(readFileSync(new URL('public/manifest.webmanifest', root), 'utf8'));
    expect(manifest).toEqual(buildManifest({ background: dayToken('canvas'), theme: dayToken('accent') }));
  });

  it('round-trips pixels through the png encoder', () => {
    const rgba = renderIcon(16, 'any');
    const png = Buffer.from(encodePng(rgba, 16, (b) => deflateSync(b)));
    const raw = inflateSync(png.subarray(41, 41 + png.readUInt32BE(33)));
    expect(raw.length).toBe(16 * (16 * 4 + 1));
    expect([...raw.subarray(1 + 16 * 4 * 0, 1 + 16 * 4)]).toEqual([...rgba.subarray(0, 16 * 4)]);
  });

  it('has the manifest fields', () => {
    const m = buildManifest({ background: '#EEF0F4', theme: '#6236E0' });
    expect(m).toMatchObject({ name: 'Banshee Band', short_name: 'Banshee', start_url: '/index.html', scope: '/', display: 'standalone', background_color: '#EEF0F4', theme_color: '#6236E0' });
    expect(m.icons).toEqual(MANIFEST_ICONS);
    expect(MANIFEST_ICONS).toEqual([
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ]);
  });
});
