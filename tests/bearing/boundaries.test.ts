import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const BEARING = fileURLToPath(new URL('../../src/bearing/', import.meta.url));
const files = readdirSync(BEARING)
  .filter((f) => f.endsWith('.ts'))
  .map((f) => ({ name: f, text: readFileSync(join(BEARING, f), 'utf8') }));

const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const stripStrings = (s: string) => s.replace(/'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`/g, "''");

interface Import {
  statement: string;
  spec: string;
  typeOnly: boolean;
}

function importsOf(text: string): Import[] {
  const code = stripComments(text);
  const found: Import[] = [];
  for (const m of code.matchAll(/\b(import|export)\s+(type\s+)?[^'";]*?\bfrom\s+['"]([^'"]+)['"]/g)) {
    found.push({ statement: m[0], spec: m[3], typeOnly: Boolean(m[2]) });
  }
  for (const m of code.matchAll(/\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g)) found.push({ statement: m[0], spec: m[1], typeOnly: false });
  for (const m of code.matchAll(/\bimport\s+['"]([^'"]+)['"]/g)) found.push({ statement: m[0], spec: m[1], typeOnly: false });
  for (const m of code.matchAll(/\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g)) found.push({ statement: m[0], spec: m[1], typeOnly: false });
  return found;
}

/** Import problems of one file: only `./x`, `../events` and `import type` from `../audio/types` are allowed. */
function importViolations(text: string): string[] {
  const bad: string[] = [];
  for (const imp of importsOf(text)) {
    if (/^\.\/[\w-]+$/.test(imp.spec) || imp.spec === '../events') continue;
    if (imp.spec === '../audio/types' && imp.typeOnly) continue;
    bad.push(imp.statement);
  }
  return bad;
}

const FORBIDDEN: [string, RegExp][] = [
  ['fetch', /\bfetch\b/],
  ['XMLHttpRequest', /\bXMLHttpRequest\b/],
  ['WebSocket', /\bWebSocket\b/],
  ['navigator', /\bnavigator\b/],
  ['window', /\bwindow\b/],
  ['document', /\bdocument\b/],
  ['console', /\bconsole\b/],
  ['Date', /\bDate\b/],
  ['Math.random', /\bMath\s*\.\s*random\b/],
  ['performance', /\bperformance\b/],
  ['crypto', /\bcrypto\b/],
  ['globalThis', /\bglobalThis\b/],
  ['localStorage', /\blocalStorage\b/],
  ['indexedDB', /\bindexedDB\b/],
  ['sendBeacon', /\bsendBeacon\b/],
  ['process', /\bprocess\b/],
  ['setTimeout', /\bsetTimeout\b/],
];

function forbiddenUses(text: string): string[] {
  const withStrings = stripComments(text);
  const code = stripStrings(withStrings);
  const found = FORBIDDEN.filter(([, re]) => re.test(code)).map(([what]) => what);
  if (/https?:\/\//.test(withStrings)) found.push('absolute URL');
  return found;
}

describe('src/bearing boundaries', () => {
  it('finds the bearing sources', () => {
    expect(files.map((f) => f.name)).toEqual(expect.arrayContaining(['index.ts', 'constants.ts', 'types.ts', 'geometry.ts']));
  });

  it('imports only its own files, src/events, and types from src/audio/types', () => {
    for (const f of files) expect(importViolations(f.text), f.name).toEqual([]);
  });

  it('uses no network, console, clock, random source or other I/O', () => {
    for (const f of files) expect(forbiddenUses(f.text), f.name).toEqual([]);
  });

  it('has no DSP or maths library (no package import at all)', () => {
    for (const f of files) for (const imp of importsOf(f.text)) expect(imp.spec.startsWith('.'), `${f.name}: ${imp.statement}`).toBe(true);
  });

  it('the scanner catches what it should', () => {
    expect(importViolations("import { fft } from 'fft.js';")).toHaveLength(1);
    expect(importViolations("import { classify } from '../classify';")).toHaveLength(1);
    expect(importViolations("import { STEREO_BLOCK } from '../audio/constants';")).toHaveLength(1);
    expect(importViolations("import { x } from '../audio/types';")).toHaveLength(1);
    expect(importViolations("const m = await import('mathjs');")).toHaveLength(1);
    expect(importViolations("import type { StereoFrame } from '../audio/types';\nimport { BEARING_SOURCES } from '../events';\nimport { fft } from './fft';")).toEqual([]);
    expect(forbiddenUses("fetch('/x');")).toEqual(['fetch']);
    expect(forbiddenUses("const u = 'https://example.com';")).toEqual(['absolute URL']);
    expect(forbiddenUses('const t = Date.now();')).toEqual(['Date']);
    expect(forbiddenUses('const r = Math.random();')).toEqual(['Math.random']);
    expect(forbiddenUses('console.log(x);')).toEqual(['console']);
    expect(forbiddenUses('navigator.vibrate(1); window.x = 1; document.title = "";')).toEqual(['navigator', 'window', 'document']);
    expect(forbiddenUses('new WebSocket(u); new XMLHttpRequest();')).toEqual(['XMLHttpRequest', 'WebSocket']);
    expect(forbiddenUses('// console.log in a comment\nconst createBearingWindow = 1;')).toEqual([]);
  });
});
