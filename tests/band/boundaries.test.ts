import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const read = (dir: string) =>
  readdirSync(dir)
    .filter((f) => f.endsWith('.ts'))
    .map((f) => ({ name: f, text: readFileSync(join(dir, f), 'utf8') }));

const BAND = fileURLToPath(new URL('../../src/band/', import.meta.url));
const HAPTICS = fileURLToPath(new URL('../../src/haptics/', import.meta.url));
const bandFiles = read(BAND);
const hapticsFiles = read(HAPTICS);

const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

/** Every module specifier a file imports or re-exports, static or dynamic. */
function specifiersOf(text: string): string[] {
  const code = stripComments(text);
  const specs: string[] = [];
  for (const m of code.matchAll(/\b(?:import|export)\s+(?:type\s+)?[^'";]*?\bfrom\s+['"]([^'"]+)['"]/g)) specs.push(m[1]);
  for (const m of code.matchAll(/\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g)) specs.push(m[1]);
  for (const m of code.matchAll(/\bimport\s+['"]([^'"]+)['"]/g)) specs.push(m[1]);
  for (const m of code.matchAll(/\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g)) specs.push(m[1]);
  return specs;
}

/** Specifiers outside the allowed set: `../events`, `../haptics`, `./file` and `.css` files (R1.2). */
function importViolations(text: string): string[] {
  return specifiersOf(text).filter((spec) => !(spec === '../events' || spec === '../haptics' || /^\.\/[\w-]+$/.test(spec) || /^\.\/[\w-]+\.css$/.test(spec)));
}

const FORBIDDEN: [string, RegExp][] = [
  ['fetch', /\bfetch\b/],
  ['XMLHttpRequest', /\bXMLHttpRequest\b/],
  ['WebSocket', /\bWebSocket\b/],
  ['bluetooth', /\bbluetooth\b/],
  ['console', /\bconsole\b/],
  ['Math.random', /\bMath\s*\.\s*random\b/],
  ['Date', /\bDate\b/],
];

/** Forbidden identifiers in a file with its comments removed (R1.4). */
function forbiddenUses(text: string): string[] {
  const code = stripComments(text);
  return FORBIDDEN.filter(([, re]) => re.test(code)).map(([what]) => what);
}

describe('src/band boundaries (R1)', () => {
  it('finds the band sources', () => {
    expect(bandFiles.map((f) => f.name)).toEqual(expect.arrayContaining(['index.ts', 'types.ts']));
  });

  it('imports only src/events, src/haptics, its own files and CSS', () => {
    for (const f of bandFiles) expect(importViolations(f.text), f.name).toEqual([]);
  });

  it('uses no network, Bluetooth, console, random source or clock', () => {
    for (const f of bandFiles) expect(forbiddenUses(f.text), f.name).toEqual([]);
  });

  it('src/haptics imports nothing from src/band', () => {
    for (const f of hapticsFiles) expect(specifiersOf(f.text).filter((s) => /band/.test(s)), f.name).toEqual([]);
  });

  it('the scanner catches what it should', () => {
    expect(importViolations("import { classify } from '../classify';")).toEqual(['../classify']);
    expect(importViolations("import { x } from '../audio';")).toEqual(['../audio']);
    expect(importViolations("import { x } from '../bearing';")).toEqual(['../bearing']);
    expect(importViolations("import { x } from '../ghosts';")).toEqual(['../ghosts']);
    expect(importViolations("import { x } from '../ui/styleguide';")).toEqual(['../ui/styleguide']);
    expect(importViolations("import { x } from '../../mcp/server';")).toEqual(['../../mcp/server']);
    expect(importViolations("import fc from 'fast-check';")).toEqual(['fast-check']);
    expect(importViolations("const m = await import('../audio');")).toEqual(['../audio']);
    expect(importViolations("import '../ui/tokens.css';")).toEqual(['../ui/tokens.css']);
    expect(
      importViolations(
        "import type { HapticCommand } from '../haptics';\nimport { PATTERN_CLASSES } from '../haptics';\nimport type { Urgency } from '../events';\nimport { sideText } from './labels';\nimport './simulator.css';\nexport * from './types';",
      ),
    ).toEqual([]);
    expect(forbiddenUses("fetch('/x');")).toEqual(['fetch']);
    expect(forbiddenUses('new WebSocket(u); new XMLHttpRequest();')).toEqual(['XMLHttpRequest', 'WebSocket']);
    expect(forbiddenUses('navigator.bluetooth.requestDevice();')).toEqual(['bluetooth']);
    expect(forbiddenUses('console.log(x);')).toEqual(['console']);
    expect(forbiddenUses('const r = Math.random();')).toEqual(['Math.random']);
    expect(forbiddenUses('const t = Date.now();')).toEqual(['Date']);
    expect(forbiddenUses('// console.log in a comment\n/* fetch Date */\nconst vibrate = [1];')).toEqual([]);
    expect(specifiersOf("import { x } from '../band';")).toEqual(['../band']);
  });
});
