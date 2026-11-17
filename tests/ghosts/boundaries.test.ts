import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const GHOSTS = fileURLToPath(new URL('../../src/ghosts/', import.meta.url));
const ghostFiles = readdirSync(GHOSTS)
  .filter((f) => f.endsWith('.ts'))
  .map((f) => ({ name: f, text: readFileSync(join(GHOSTS, f), 'utf8') }));

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

/** Specifiers outside the allowed set: `../events`, `../haptics`, `./file` and `.css` files (R1.1). */
function importViolations(text: string): string[] {
  return specifiersOf(text).filter((spec) => !(spec === '../events' || spec === '../haptics' || /^\.\/[\w-]+$/.test(spec) || /^\.\/[\w-]+\.css$/.test(spec)));
}

/** Named imports from `../haptics` other than `sideOf` and the `Side` type (R1.1). */
function hapticsNameViolations(text: string): string[] {
  const code = stripComments(text);
  const names: string[] = [];
  for (const m of code.matchAll(/\b(?:import|export)\s+(type\s+)?(\*|\{[^}]*\})?[^'";]*?\bfrom\s+['"]\.\.\/haptics['"]/g)) {
    const clause = m[2] ?? '';
    if (clause === '*' || clause === '') {
      names.push(clause || 'default');
      continue;
    }
    for (const part of clause.slice(1, -1).split(',')) {
      const name = part.trim().replace(/^type\s+/, '').split(/\s+as\s+/)[0].trim();
      if (name) names.push(name);
    }
  }
  return names.filter((n) => n !== 'sideOf' && n !== 'Side');
}

const FORBIDDEN: [string, RegExp][] = [
  ['fetch', /\bfetch\b/],
  ['XMLHttpRequest', /\bXMLHttpRequest\b/],
  ['WebSocket', /\bWebSocket\b/],
  ['bluetooth', /\bbluetooth\b/],
  ['console', /\bconsole\b/],
  ['Math.random', /\bMath\s*\.\s*random\b/],
  ['Date', /\bDate\b/],
  ['gcc-phat', /gcc-phat/i],
  ['bearingSource', /\bbearingSource\b/],
  ['confidence compared with a number', /confidence\w*\s*(?:[<>]=?|[!=]==?)\s*-?\d|-?\d[\d.]*\s*(?:[<>]=?|[!=]==?)\s*[\w.]*confidence/i],
];

/** Forbidden identifiers and texts in a file with its comments removed (R1.2, R1.4). */
function forbiddenUses(text: string): string[] {
  const code = stripComments(text);
  return FORBIDDEN.filter(([, re]) => re.test(code)).map(([what]) => what);
}

describe('src/ghosts boundaries (R1.1, R1.2, R1.4, R1.8)', () => {
  it('finds the ghost sources', () => {
    expect(ghostFiles.map((f) => f.name)).toEqual(expect.arrayContaining(['index.ts', 'types.ts', 'constants.ts']));
  });

  it('imports only src/events, src/haptics, its own files and CSS', () => {
    for (const f of ghostFiles) expect(importViolations(f.text), f.name).toEqual([]);
  });

  it('imports only sideOf and Side from src/haptics', () => {
    for (const f of ghostFiles) expect(hapticsNameViolations(f.text), f.name).toEqual([]);
  });

  it('uses no network, Bluetooth, console, random source or clock, and does not copy the side rule', () => {
    for (const f of ghostFiles) expect(forbiddenUses(f.text), f.name).toEqual([]);
  });

  it('the scanner catches what it should', () => {
    expect(importViolations("import { x } from '../band';")).toEqual(['../band']);
    expect(importViolations("import { x } from '../ui/theme';")).toEqual(['../ui/theme']);
    expect(importViolations("import { x } from '../audio';")).toEqual(['../audio']);
    expect(importViolations("import { x } from '../classify';")).toEqual(['../classify']);
    expect(importViolations("import { x } from '../bearing';")).toEqual(['../bearing']);
    expect(importViolations("import { x } from '../../mcp/server';")).toEqual(['../../mcp/server']);
    expect(importViolations("const m = await import('../band');")).toEqual(['../band']);
    expect(importViolations("import fc from 'fast-check';")).toEqual(['fast-check']);
    expect(
      importViolations("import type { SoundEvent } from '../events';\nimport { sideOf, type Side } from '../haptics';\nimport { SHAPES } from './shapes';\nimport './field.css';\nexport * from './types';"),
    ).toEqual([]);
    expect(hapticsNameViolations("import { sideOf, type Side } from '../haptics';")).toEqual([]);
    expect(hapticsNameViolations("import type { Side } from '../haptics';")).toEqual([]);
    expect(hapticsNameViolations("import { sideOf, CENTRE_DEG } from '../haptics';")).toEqual(['CENTRE_DEG']);
    expect(hapticsNameViolations("import { UNCERTAIN_CONFIDENCE as U } from '../haptics';")).toEqual(['UNCERTAIN_CONFIDENCE']);
    expect(hapticsNameViolations("import * as h from '../haptics';")).toEqual(['*']);
    expect(hapticsNameViolations("export { createHapticEngine } from '../haptics';")).toEqual(['createHapticEngine']);
    expect(forbiddenUses("fetch('/x');")).toEqual(['fetch']);
    expect(forbiddenUses('new WebSocket(u); new XMLHttpRequest();')).toEqual(['XMLHttpRequest', 'WebSocket']);
    expect(forbiddenUses('navigator.bluetooth.requestDevice();')).toEqual(['bluetooth']);
    expect(forbiddenUses('console.log(x);')).toEqual(['console']);
    expect(forbiddenUses('const r = Math.random();')).toEqual(['Math.random']);
    expect(forbiddenUses('const t = Date.now();')).toEqual(['Date']);
    expect(forbiddenUses("if (e.bearingSource === 'gcc-phat') {}")).toEqual(['gcc-phat', 'bearingSource']);
    expect(forbiddenUses('if (bearingConfidence < 0.8) {}')).toEqual(['confidence compared with a number']);
    expect(forbiddenUses('if (0.8 <= input.bearingConfidence) {}')).toEqual(['confidence compared with a number']);
    expect(forbiddenUses('// console.log in a comment\n/* fetch Date gcc-phat */\nconst ok = sideOf(e, c);')).toEqual([]);
  });
});
