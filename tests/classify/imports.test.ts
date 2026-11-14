import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SRC = fileURLToPath(new URL('../../src/', import.meta.url));
const CLASSIFY = join(SRC, 'classify');
const files = readdirSync(CLASSIFY)
  .filter((f) => f.endsWith('.ts'))
  .map((f) => ({ name: f, path: join(CLASSIFY, f), text: readFileSync(join(CLASSIFY, f), 'utf8') }));
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

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
  return found;
}

describe('src/classify boundaries', () => {
  it('finds the classify sources', () => {
    expect(files.map((f) => f.name)).toEqual(expect.arrayContaining(['classifier.ts', 'labelmap.ts', 'aggregate.ts', 'index.ts']));
  });

  it('imports only its own files, src/events, types from src/audio, and @tensorflow/tfjs', () => {
    for (const f of files) {
      for (const imp of importsOf(f.text)) {
        const where = `${f.name}: ${imp.statement}`;
        if (imp.spec.startsWith('.')) {
          const target = relative(SRC, resolve(dirname(f.path), imp.spec)).split(sep);
          expect(['classify', 'events', 'audio'], where).toContain(target[0]);
          if (target[0] === 'audio') expect(imp.typeOnly, `${where} must be "import type"`).toBe(true);
        } else {
          expect(imp.spec, where).toBe('@tensorflow/tfjs');
        }
      }
    }
  });

  it('mentions @tensorflow/tfjs only in classifier.ts', () => {
    for (const f of files) if (f.name !== 'classifier.ts') expect(f.text, f.name).not.toContain('@tensorflow/tfjs');
  });

  it('holds no outside URL, no TF Hub loading, no storage or network API, and no console output', () => {
    const banned: [string, RegExp][] = [
      ['tfhub.dev', /tfhub\.dev/],
      ['kaggle.com', /kaggle\.com/],
      ['storage.googleapis.com', /storage\.googleapis\.com/],
      ['absolute URL', /https?:\/\//],
      ['fromTFHub', /fromTFHub/],
      ['XMLHttpRequest', /XMLHttpRequest/],
      ['WebSocket', /WebSocket/],
      ['sendBeacon', /sendBeacon/],
      ['localStorage', /localStorage/],
      ['indexedDB', /indexedDB/i],
      ['caches', /\bcaches\b/],
      ['model.save', /\.save\(/],
      ['console', /\bconsole\./],
    ];
    for (const f of files) for (const [what, re] of banned) expect(re.test(f.text), `${f.name}: ${what}`).toBe(false);
  });
});
