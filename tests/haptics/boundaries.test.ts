import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const HAPTICS = fileURLToPath(new URL('../../src/haptics/', import.meta.url));
const files = readdirSync(HAPTICS)
  .filter((f) => f.endsWith('.ts'))
  .map((f) => ({ name: f, text: readFileSync(join(HAPTICS, f), 'utf8') }));

const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const stripStrings = (s: string) => s.replace(/'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`/g, "''");

interface Import {
  statement: string;
  spec: string;
  typeOnly: boolean;
  names: string[];
}

function namesOf(clause: string): string[] {
  const braces = clause.match(/\{([^}]*)\}/);
  const inner = braces ? braces[1].split(',') : [];
  const named = inner
    .map((n) => n.trim())
    .filter((n) => n && !n.startsWith('type '))
    .map((n) => n.split(/\s+as\s+/)[0].trim());
  const outside = clause.replace(/\{[^}]*\}/, '').replace(/\bfrom\b|\bimport\b|\bexport\b|,/g, ' ').trim();
  return outside ? [...named, outside] : named;
}

function importsOf(text: string): Import[] {
  const code = stripComments(text);
  const found: Import[] = [];
  for (const m of code.matchAll(/\b(import|export)\s+(type\s+)?([^'";]*?)\bfrom\s+['"]([^'"]+)['"]/g)) {
    found.push({ statement: m[0], spec: m[4], typeOnly: Boolean(m[2]), names: m[2] ? [] : namesOf(m[3]) });
  }
  for (const m of code.matchAll(/\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g)) found.push({ statement: m[0], spec: m[1], typeOnly: false, names: ['*'] });
  for (const m of code.matchAll(/\bimport\s+['"]([^'"]+)['"]/g)) found.push({ statement: m[0], spec: m[1], typeOnly: false, names: ['*'] });
  for (const m of code.matchAll(/\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g)) found.push({ statement: m[0], spec: m[1], typeOnly: false, names: ['*'] });
  return found;
}

/** Import problems of one file: only `./x`, `./patterns.json`, and types or UPPER_CASE constants from `../events`. */
function importViolations(text: string): string[] {
  const bad: string[] = [];
  for (const imp of importsOf(text)) {
    if (/^\.\/[\w-]+$/.test(imp.spec) || imp.spec === './patterns.json') continue;
    if (imp.spec === '../events' && imp.names.every((n) => /^[A-Z][A-Z0-9_]*$/.test(n))) continue;
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
  ['performance', /\bperformance\b/],
  ['Math.random', /\bMath\s*\.\s*random\b/],
  ['setTimeout', /\bsetTimeout\b/],
  ['setInterval', /\bsetInterval\b/],
  ['requestAnimationFrame', /\brequestAnimationFrame\b/],
  ['queueMicrotask', /\bqueueMicrotask\b/],
  ['crypto', /\bcrypto\b/],
  ['globalThis', /\bglobalThis\b/],
  ['localStorage', /\blocalStorage\b/],
  ['indexedDB', /\bindexedDB\b/],
  ['sendBeacon', /\bsendBeacon\b/],
  ['process', /\bprocess\b/],
];

function forbiddenUses(text: string): string[] {
  const withStrings = stripComments(text);
  const code = stripStrings(withStrings);
  const found = FORBIDDEN.filter(([, re]) => re.test(code)).map(([what]) => what);
  if (/https?:\/\//.test(withStrings)) found.push('absolute URL');
  return found;
}

describe('src/haptics boundaries (R1)', () => {
  it('finds the haptics sources', () => {
    expect(files.map((f) => f.name)).toEqual(expect.arrayContaining(['index.ts', 'constants.ts', 'types.ts']));
  });

  it('imports only its own files, patterns.json, and types and constants from src/events', () => {
    for (const f of files) expect(importViolations(f.text), f.name).toEqual([]);
  });

  it('uses no network, console, clock, timer, random source or other I/O', () => {
    for (const f of files) expect(forbiddenUses(f.text), f.name).toEqual([]);
  });

  it('imports no npm package at all', () => {
    for (const f of files) for (const imp of importsOf(f.text)) expect(imp.spec.startsWith('.'), `${f.name}: ${imp.statement}`).toBe(true);
  });

  it('the scanner catches what it should', () => {
    expect(importViolations("import fc from 'fast-check';")).toHaveLength(1);
    expect(importViolations("import { estimateBearing } from '../bearing';")).toHaveLength(1);
    expect(importViolations("import type { BearingResult } from '../bearing/types';")).toHaveLength(1);
    expect(importViolations("import { classify } from '../classify';")).toHaveLength(1);
    expect(importViolations("import { x } from '../audio';")).toHaveLength(1);
    expect(importViolations("import { validateEvent } from '../events';")).toHaveLength(1);
    expect(importViolations("import { SOUND_CLASSES, validateEvent } from '../events';")).toHaveLength(1);
    expect(importViolations("import data from './other.json';")).toHaveLength(1);
    expect(importViolations("const m = await import('mathjs');")).toHaveLength(1);
    expect(importViolations("const m = require('../ui');")).toHaveLength(1);
    expect(
      importViolations(
        "import type { SoundEvent, Urgency } from '../events';\nimport { SOUND_CLASSES } from '../events';\nimport raw from './patterns.json';\nimport { sideOf } from './side';\nexport * from './constants';",
      ),
    ).toEqual([]);
    expect(forbiddenUses("fetch('/x');")).toEqual(['fetch']);
    expect(forbiddenUses("const u = 'https://example.com';")).toEqual(['absolute URL']);
    expect(forbiddenUses('const t = Date.now();')).toEqual(['Date']);
    expect(forbiddenUses('const t = performance.now();')).toEqual(['performance']);
    expect(forbiddenUses('const r = Math.random();')).toEqual(['Math.random']);
    expect(forbiddenUses('console.log(x);')).toEqual(['console']);
    expect(forbiddenUses('setTimeout(f, 1); setInterval(f, 1); requestAnimationFrame(f);')).toEqual(['setTimeout', 'setInterval', 'requestAnimationFrame']);
    expect(forbiddenUses('navigator.vibrate(1); window.x = 1; document.title = "";')).toEqual(['navigator', 'window', 'document']);
    expect(forbiddenUses('new WebSocket(u); new XMLHttpRequest();')).toEqual(['XMLHttpRequest', 'WebSocket']);
    expect(forbiddenUses("// console.log in a comment\nconst label = 'Date';\nconst vibrate = [1];")).toEqual([]);
  });
});
