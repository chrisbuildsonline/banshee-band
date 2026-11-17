/** Files that are never precached, by name. */
const EXCLUDED = new Set(['sw.js', 'LICENSE.txt', 'SHA256SUMS']);

function keep(path: string): boolean {
  const name = path.slice(path.lastIndexOf('/') + 1);
  return !EXCLUDED.has(name) && !name.endsWith('.map') && !name.endsWith('.md');
}

/**
 * The URLs the service worker caches at install: every bundle file (pages, JS, CSS, worklet) and every public
 * file, without source maps, `sw.js`, licence and checksum files or `.md` notes. Clips come from the clip
 * manifest only (`clips/manifest.json` plus each named file), so a stray WAV is left out. Sorted, unique,
 * with a leading slash. Pure.
 */
export function buildPrecacheList(input: { bundleFiles: readonly string[]; publicFiles: readonly string[]; clipNames: readonly string[] }): string[] {
  const out = new Set<string>();
  for (const f of input.bundleFiles) if (keep(f)) out.add(`/${f}`);
  for (const f of input.publicFiles) {
    if (!keep(f)) continue;
    if (f.startsWith('clips/') && f !== 'clips/manifest.json') continue;
    out.add(`/${f}`);
  }
  for (const name of input.clipNames) if (keep(name)) out.add(`/clips/${name}`);
  return [...out].sort();
}

/**
 * `banshee-` plus the 8 hex digits of FNV-1a (32-bit) over the entries joined by newlines. The build passes
 * `path?size` entries, so a changed file name or size gives a new cache. Pure.
 */
export function cacheNameFor(entries: readonly string[]): string {
  let h = 0x811c9dc5;
  const text = entries.join('\n');
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `banshee-${h.toString(16).padStart(8, '0')}`;
}
