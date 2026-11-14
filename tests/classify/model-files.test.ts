import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseClassMap } from '../../src/classify/classmap';

const DIR = fileURLToPath(new URL('../../public/models/yamnet/', import.meta.url));
const read = (name: string) => readFileSync(join(DIR, name));

describe('bundled YAMNet files', () => {
  it('has every weight shard named in model.json', () => {
    const model = JSON.parse(read('model.json').toString('utf8')) as { weightsManifest: { paths: string[] }[] };
    const paths = model.weightsManifest.flatMap((g) => g.paths);
    expect(paths.length).toBeGreaterThan(0);
    for (const p of paths) expect(existsSync(join(DIR, p)), p).toBe(true);
  });

  it('matches SHA256SUMS, which lists every other file in the directory', () => {
    const lines = read('SHA256SUMS').toString('utf8').trim().split('\n');
    const listed = new Map(lines.map((l) => [l.slice(66), l.slice(0, 64)]));
    for (const [name, digest] of listed) {
      expect(existsSync(join(DIR, name)), name).toBe(true);
      expect(createHash('sha256').update(read(name)).digest('hex'), name).toBe(digest);
    }
    const others = readdirSync(DIR).filter((f) => f !== 'SHA256SUMS').sort();
    expect([...listed.keys()].sort()).toEqual(others);
  });

  it('has a LICENSE.txt with the Apache 2.0 notice and the retrieval date', () => {
    const text = read('LICENSE.txt').toString('utf8');
    expect(text).toContain('Apache License');
    expect(text).toContain('Version 2.0');
    expect(text).toMatch(/Retrieved: \d{4}-\d{2}-\d{2}/);
  });

  it('has a class map that parses to 521 entries', () => {
    expect(parseClassMap(read('yamnet_class_map.csv').toString('utf8'))).toHaveLength(521);
  });
});
