// Writes public/icons/*.png and public/manifest.webmanifest from code (bun run icons). Same bytes on every run.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { ICON_SPECS, renderIcon } from '../src/pwa/icons';
import { buildManifest } from '../src/pwa/manifest';
import { encodePng } from '../src/pwa/png';

const root = new URL('../', import.meta.url);
const tokens = readFileSync(new URL('src/ui/tokens.css', root), 'utf8');

function dayToken(name: string): string {
  const m = tokens.match(new RegExp(`--bb-color-${name}:\\s*(#[0-9A-Fa-f]{6})`));
  if (!m) throw new Error(`--bb-color-${name} not found in tokens.css`);
  return m[1];
}

mkdirSync(new URL('public/icons/', root), { recursive: true });
for (const spec of ICON_SPECS) {
  writeFileSync(new URL(`public/icons/${spec.file}`, root), encodePng(renderIcon(spec.size, spec.kind), spec.size, (b) => deflateSync(b, { level: 9 })));
}
const manifest = buildManifest({ background: dayToken('canvas'), theme: dayToken('accent') });
writeFileSync(new URL('public/manifest.webmanifest', root), `${JSON.stringify(manifest, null, 2)}\n`);
