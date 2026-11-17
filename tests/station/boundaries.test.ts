import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SRC = fileURLToPath(new URL('../../src/', import.meta.url));
const STATION = join(SRC, 'station');
const PURE = ['wav.ts', 'stereo.ts', 'summary.ts', 'waveform.ts', 'format.ts', 'pipeline.ts', 'runner.ts', 'constants.ts', 'live-gate.ts', 'listen-status.ts'];
const pureFiles = PURE.filter((f) => existsSync(join(STATION, f))).map((f) => ({ name: f, text: readFileSync(join(STATION, f), 'utf8') }));

const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

interface Imported {
  spec: string;
  /** Value names imported (type-only names left out); '*' for a namespace or bare import. */
  values: string[];
}

/** Every import or re-export of a file, static or dynamic, with the value names it brings in. */
function importsOf(text: string): Imported[] {
  const code = stripComments(text);
  const out: Imported[] = [];
  for (const m of code.matchAll(/\b(?:import|export)\s+(type\s+)?([^'";]*?)\bfrom\s+['"]([^'"]+)['"]/g)) {
    const typeOnly = Boolean(m[1]);
    const clause = m[2].trim();
    const values: string[] = [];
    if (!typeOnly) {
      const braces = clause.match(/\{([^}]*)\}/);
      if (braces) {
        for (const part of braces[1].split(',')) {
          const p = part.trim();
          if (p && !p.startsWith('type ')) values.push(p.split(/\s+as\s+/)[0].trim());
        }
      }
      if (/\*/.test(clause) || /^[\w$]+\s*(,|$)/.test(clause)) values.push('*');
    }
    out.push({ spec: m[3], values });
  }
  for (const m of code.matchAll(/\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g)) out.push({ spec: m[1], values: ['*'] });
  for (const m of code.matchAll(/\bimport\s+['"]([^'"]+)['"]/g)) out.push({ spec: m[1], values: ['*'] });
  for (const m of code.matchAll(/\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g)) out.push({ spec: m[1], values: ['*'] });
  return out;
}

/** Value names each module may give a pure file; `null` means any (R1.2). Type-only imports are always allowed. */
const ALLOWED: Record<string, readonly string[] | null> = {
  '../events': null,
  '../bearing': null,
  '../haptics': null,
  '../audio': ['createFramer', 'HOP_SIZE', 'STEREO_BLOCK', 'WINDOW_SIZE', 'YAMNET_RATE'],
  '../classify': [],
  '../band': ['classLabel', 'patternName', 'percentOf', 'pulseCount', 'sideText'],
  '../ghosts': ['CLASS_NAMES', 'URGENCY_STYLE', 'EMPTY_TEXT', 'listItemText', 'canvasSummary', 'dataX'],
};

/** Imports outside the allowed modules and names (R1.2). */
function importViolations(text: string): string[] {
  const bad: string[] = [];
  for (const { spec, values } of importsOf(text)) {
    if (/^\.\/[\w-]+$/.test(spec)) continue;
    if (!(spec in ALLOWED)) {
      bad.push(spec);
      continue;
    }
    const allowed = ALLOWED[spec];
    if (allowed) for (const v of values) if (!allowed.includes(v)) bad.push(`${spec} ${v}`);
  }
  return bad;
}

const FORBIDDEN: [string, RegExp][] = [
  ['document', /\bdocument\b/],
  ['window', /\bwindow\b/],
  ['navigator', /\bnavigator\b/],
  ['fetch', /\bfetch\b/],
  ['XMLHttpRequest', /\bXMLHttpRequest\b/],
  ['WebSocket', /\bWebSocket\b/],
  ['console', /\bconsole\b/],
  ['Math.random', /\bMath\s*\.\s*random\b/],
  ['Date', /\bDate\b/],
];

/** Forbidden identifiers in a file with its comments removed; `Date` is allowed in `format.ts` only (R1.2). */
function forbiddenUses(text: string, name = ''): string[] {
  const code = stripComments(text);
  return FORBIDDEN.filter(([what, re]) => !(what === 'Date' && name === 'format.ts') && re.test(code)).map(([what]) => what);
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx|js)$/.test(f) ? [p] : [];
  });
}

describe('src/station boundaries (R1.1 to R1.4)', () => {
  it('finds the station sources', () => {
    expect(pureFiles.map((f) => f.name)).toContain('constants.ts');
  });

  it('pure files import only the allowed modules and names', () => {
    for (const f of pureFiles) expect(importViolations(f.text), f.name).toEqual([]);
  });

  it('pure files use no DOM, network, console, random source or clock', () => {
    for (const f of pureFiles) expect(forbiddenUses(f.text, f.name), f.name).toEqual([]);
  });

  it('src/audio/index.ts re-exports loadManifest, fetchClip and createFramer', () => {
    const names = importsOf(readFileSync(join(SRC, 'audio/index.ts'), 'utf8')).flatMap((i) => i.values);
    expect(names).toEqual(expect.arrayContaining(['loadManifest', 'fetchClip', 'createFramer']));
  });

  it('nothing outside src/main.ts and src/station imports src/station', () => {
    const offenders = walk(SRC)
      .filter((p) => !p.startsWith(STATION) && relative(SRC, p) !== 'main.ts')
      .filter((p) => importsOf(readFileSync(p, 'utf8')).some((i) => /(^|\/)station(\/|$)/.test(i.spec)));
    expect(offenders.map((p) => relative(SRC, p))).toEqual([]);
  });

  it('src/pwa imports nothing from the other modules, and its pure files use no DOM, network or clock', () => {
    const pwa = join(SRC, 'pwa');
    for (const p of walk(pwa)) {
      const text = readFileSync(p, 'utf8');
      expect(importsOf(text).filter((i) => !/^\.\/[\w-]+$/.test(i.spec)).map((i) => i.spec), relative(SRC, p)).toEqual([]);
      if (['routes.ts', 'precache.ts', 'manifest.ts', 'icons.ts', 'png.ts'].some((f) => p.endsWith(`/${f}`))) expect(forbiddenUses(text), relative(SRC, p)).toEqual([]);
    }
  });

  it('only src/main.ts imports src/pwa', () => {
    const offenders = walk(SRC)
      .filter((p) => !p.startsWith(join(SRC, 'pwa')) && relative(SRC, p) !== 'main.ts')
      .filter((p) => importsOf(readFileSync(p, 'utf8')).some((i) => /(^|\/)pwa(\/|$)/.test(i.spec)));
    expect(offenders.map((p) => relative(SRC, p))).toEqual([]);
  });

  it('the scanner catches what it should', () => {
    expect(importViolations("import { x } from '../ui/theme';")).toEqual(['../ui/theme']);
    expect(importViolations("import fc from 'fast-check';")).toEqual(['fast-check']);
    expect(importViolations("const m = await import('../band');")).toEqual(['../band *']);
    expect(importViolations("import { createCapture } from '../audio';")).toEqual(['../audio createCapture']);
    expect(importViolations("import { createClassifier } from '../classify';")).toEqual(['../classify createClassifier']);
    expect(importViolations("import { mountBandSimulator } from '../band';")).toEqual(['../band mountBandSimulator']);
    expect(importViolations("import { mountGhostField } from '../ghosts';")).toEqual(['../ghosts mountGhostField']);
    expect(importViolations("import * as a from '../audio';")).toEqual(['../audio *']);
    expect(
      importViolations(
        "import type { Classification } from '../classify';\nimport { createFramer, type StereoFrame } from '../audio';\nimport { percentOf } from '../band';\nimport { CLASS_NAMES } from '../ghosts';\nimport { sideOf } from '../haptics';\nimport { validateSoundEvent } from '../events';\nimport { estimateBearing } from '../bearing';\nimport { STAGES } from './constants';",
      ),
    ).toEqual([]);
    expect(forbiddenUses('document.body; window.x; navigator.vibrate(1);')).toEqual(['document', 'window', 'navigator']);
    expect(forbiddenUses("fetch('/x'); new WebSocket(u); new XMLHttpRequest();")).toEqual(['fetch', 'XMLHttpRequest', 'WebSocket']);
    expect(forbiddenUses('console.log(x); Math.random(); Date.now();')).toEqual(['console', 'Math.random', 'Date']);
    expect(forbiddenUses('new Date(t).getHours();', 'format.ts')).toEqual([]);
    expect(forbiddenUses('// console.log in a comment\n/* fetch Date */\nconst ok = 1;')).toEqual([]);
  });
});
