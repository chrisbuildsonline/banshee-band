import { existsSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const DIST = resolve(import.meta.dirname, '../../dist');
const SW = join(DIST, 'sw.js');
const MB = 1024 * 1024;
const built = existsSync(SW);

if (!built) console.warn('tests/pwa/build.test.ts skipped: dist/sw.js is missing, run `bun run build` first');

/** The precache list the build injected: the one string literal in sw.js made of `\n`-joined absolute paths. */
function precacheList(): string[] {
  const sw = readFileSync(SW, 'utf8');
  const m = sw.match(/[`'"](\/[^`'"\s]+(?:\\n\/[^`'"\s]+)+)[`'"]/);
  if (!m) throw new Error('no precache list in dist/sw.js');
  return m[1].split('\\n');
}

describe.runIf(built)('the built service worker (dist/sw.js)', () => {
  it('has the cache name injected', () => {
    const sw = readFileSync(SW, 'utf8');
    expect(sw).toMatch(/banshee-[0-9a-f]{8}/);
    expect(sw).not.toContain('__PRECACHE_LIST__');
    expect(sw).not.toContain('__CACHE_NAME__');
  });

  it('lists only URLs that exist in dist/', () => {
    const list = precacheList();
    expect(list.length).toBeGreaterThan(10);
    const missing = list.filter((u) => !existsSync(join(DIST, u.slice(1))));
    expect(missing).toEqual([]);
  });

  it('precaches the pages, the manifest, the icons and the model', () => {
    const list = precacheList();
    for (const u of ['/index.html', '/band.html', '/manifest.webmanifest', '/clips/manifest.json']) expect(list).toContain(u);
    expect(list.some((u) => u.startsWith('/icons/') && u.endsWith('.png'))).toBe(true);
    expect(list.some((u) => u.endsWith('model.json'))).toBe(true);
  });

  it('has a total size from 17 to 40 MB', () => {
    const total = precacheList().reduce((sum, u) => sum + statSync(join(DIST, u.slice(1))).size, 0);
    expect(total).toBeGreaterThanOrEqual(17 * MB);
    expect(total).toBeLessThanOrEqual(40 * MB);
  });

  it('ships the generated manifest and icons unchanged', () => {
    const pub = resolve(import.meta.dirname, '../../public');
    for (const f of ['manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png']) {
      expect(readFileSync(join(DIST, f)).equals(readFileSync(join(pub, f))), f).toBe(true);
    }
  });

  it('contains no LICENSE.txt, sw.js, checksum file, source map or .md note', () => {
    const list = precacheList();
    expect(list.filter((u) => /\/(LICENSE\.txt|sw\.js|SHA256SUMS)$|\.(map|md)$/.test(u))).toEqual([]);
    expect(readFileSync(SW, 'utf8')).not.toContain('LICENSE.txt');
  });
});
