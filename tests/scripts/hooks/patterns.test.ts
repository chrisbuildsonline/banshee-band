import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import raw from '../../../src/haptics/patterns.json';
import { patternProblems } from '../../../scripts/hooks/patterns';
import { runScript } from './helpers';

const copy = () => structuredClone(raw) as { class: string; pulses: { onMs: number; gapMs: number }[] }[];

describe('patternProblems', () => {
  it('passes the bundled patterns.json', () => {
    expect(patternProblems(raw)).toEqual([]);
  });

  it('names two patterns that are too close (checkDistinctiveness)', () => {
    const data = copy();
    data.find((p) => p.class === 'doorbell')!.pulses = [{ onMs: 80, gapMs: 100 }, { onMs: 70, gapMs: 0 }];
    const problems = patternProblems(data);
    expect(problems.some((p) => p.startsWith('not-distinct') && p.includes('knock') && p.includes('doorbell'))).toBe(true);
  });

  it('names a broken structure and a broken limit', () => {
    const data = copy();
    data.find((p) => p.class === 'voice')!.pulses = [{ onMs: 10, gapMs: 0 }];
    expect(patternProblems(data).some((p) => p.includes('voice') && p.includes('pulse-too-short'))).toBe(true);
    expect(patternProblems({})).toEqual(['patterns: data must be an array']);
  });
});

describe('bun scripts/hooks/patterns.ts', () => {
  it('exits 0 on the bundled patterns', () => {
    const r = runScript('scripts/hooks/patterns.ts');
    expect(r.code, r.out).toBe(0);
  });

  it('exits non-zero and names the pair on patterns that are not distinct', () => {
    const data = copy();
    data.find((p) => p.class === 'doorbell')!.pulses = [{ onMs: 80, gapMs: 100 }, { onMs: 70, gapMs: 0 }];
    const file = join(mkdtempSync(join(tmpdir(), 'bb-hook-')), 'patterns.json');
    writeFileSync(file, JSON.stringify(data));
    const r = runScript('scripts/hooks/patterns.ts', [file]);
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/not-distinct: knock and doorbell/);
  });

  it('exits non-zero on a file that is not JSON', () => {
    const file = join(mkdtempSync(join(tmpdir(), 'bb-hook-')), 'patterns.json');
    writeFileSync(file, '{ nope');
    expect(runScript('scripts/hooks/patterns.ts', [file]).code).toBe(1);
  });
});
