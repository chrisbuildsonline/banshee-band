import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import { buildPrecacheList, cacheNameFor } from './src/pwa/precache.ts';

const root = import.meta.dirname;
const PUBLIC = resolve(root, 'public');
/** The precache must stay below this (the model is about 16 MB). */
const MAX_PRECACHE_BYTES = 40 * 1024 * 1024;

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [relative(PUBLIC, p).split('\\').join('/')];
  });
}

/**
 * Builds `/sw.js` (entry `src/pwa/sw.ts`, unhashed) and injects the precache list and the cache name: every
 * bundle file plus the public files (`buildPrecacheList`), with the cache name hashed over `path?size` so a
 * changed file gives a new cache. Fails the build on a URL with no file or when the list is over 40 MB.
 */
function pwa(): Plugin {
  return {
    name: 'banshee-pwa',
    apply: 'build',
    enforce: 'post', // after Vite's HTML plugin, so the pages are in the bundle
    generateBundle(_options, bundle) {
      const sw = bundle['sw.js'];
      if (!sw || sw.type !== 'chunk') this.error('sw.js was not built');
      const clipNames = (JSON.parse(readFileSync(join(PUBLIC, 'clips/manifest.json'), 'utf8')) as { file: string }[]).map((c) => c.file);
      const list = buildPrecacheList({ bundleFiles: Object.keys(bundle), publicFiles: walk(PUBLIC), clipNames });
      const sizeOf = (url: string): number => {
        const out = bundle[url.slice(1)];
        if (out) return out.type === 'chunk' ? Buffer.byteLength(out.code) : typeof out.source === 'string' ? Buffer.byteLength(out.source) : out.source.byteLength;
        const file = join(PUBLIC, url.slice(1));
        if (!existsSync(file)) this.error(`precache URL ${url} is not in the bundle or public/`);
        return statSync(file).size;
      };
      const sizes = list.map(sizeOf);
      const total = sizes.reduce((a, b) => a + b, 0);
      if (total > MAX_PRECACHE_BYTES) this.error(`precache is ${total} bytes, over ${MAX_PRECACHE_BYTES}`);
      const name = cacheNameFor(list.map((u, i) => `${u}?${sizes[i]}`));
      sw.code = sw.code.replace('__PRECACHE_LIST__', list.join('\\n')).replace('__CACHE_NAME__', name);
    },
  };
}

export default defineConfig({
  server: { port: 5173, strictPort: true },
  preview: { port: 5288, strictPort: true },
  plugins: [pwa()],
  build: {
    rolldownOptions: {
      input: {
        main: resolve(root, 'index.html'),
        styleguide: resolve(root, 'styleguide.html'),
        band: resolve(root, 'band.html'),
        sw: resolve(root, 'src/pwa/sw.ts'),
      },
      output: {
        entryFileNames: (chunk) => (chunk.name === 'sw' ? 'sw.js' : 'assets/[name]-[hash].js'),
      },
    },
  },
});
