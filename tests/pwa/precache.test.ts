import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { buildPrecacheList, cacheNameFor } from '../../src/pwa/precache';

const input = {
  bundleFiles: ['index.html', 'band.html', 'styleguide.html', 'assets/main-ab12.js', 'assets/main-ab12.js.map', 'assets/tf-9f.js', 'assets/main-cd.css', 'assets/tap.worklet-1.js', 'sw.js'],
  publicFiles: [
    'favicon.svg',
    'manifest.webmanifest',
    'icons/icon-192.png',
    'models/yamnet/LICENSE.txt',
    'models/yamnet/SHA256SUMS',
    'models/yamnet/model.json',
    'models/yamnet/group1-shard1of4.bin',
    'models/yamnet/yamnet_class_map.csv',
    'clips/LICENSE.txt',
    'clips/manifest.json',
    'clips/knock-01.wav',
    'clips/stray.wav',
    'docs/notes.md',
    'sw.js',
  ],
  clipNames: ['knock-01.wav', 'doorbell-01.wav'],
};

describe('buildPrecacheList', () => {
  it('gives the sorted list of urls', () => {
    expect(buildPrecacheList(input)).toEqual([
      '/assets/main-ab12.js',
      '/assets/main-cd.css',
      '/assets/tap.worklet-1.js',
      '/assets/tf-9f.js',
      '/band.html',
      '/clips/doorbell-01.wav',
      '/clips/knock-01.wav',
      '/clips/manifest.json',
      '/favicon.svg',
      '/icons/icon-192.png',
      '/index.html',
      '/manifest.webmanifest',
      '/models/yamnet/group1-shard1of4.bin',
      '/models/yamnet/model.json',
      '/models/yamnet/yamnet_class_map.csv',
      '/styleguide.html',
    ]);
  });
});

describe('cacheNameFor', () => {
  it('is banshee- plus 8 hex digits and stable', () => {
    const name = cacheNameFor(['/index.html?10', '/a.js?20']);
    expect(name).toMatch(/^banshee-[0-9a-f]{8}$/);
    expect(cacheNameFor(['/index.html?10', '/a.js?20'])).toBe(name);
  });

  it('changes when any entry changes', () => {
    fc.assert(
      fc.property(fc.uniqueArray(fc.string({ minLength: 1 }), { minLength: 1, maxLength: 8 }), fc.nat(), fc.string({ minLength: 1 }), (list, i, extra) => {
        const k = i % list.length;
        const changed = list.slice();
        changed[k] = list[k] + extra;
        return cacheNameFor(list) !== cacheNameFor(changed);
      }),
      { seed: 2, numRuns: 100 },
    );
  });
});
