import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { FIXTURE_STEPS, runSteps } from '../../../scripts/hooks/fixtures';
import { ROOT, runScript } from './helpers';

describe('runSteps', () => {
  it('runs every step in order and returns 0 when all pass', () => {
    const seen: string[] = [];
    expect(runSteps(['a', 'b', 'c'], (s) => (seen.push(s), 0))).toBe(0);
    expect(seen).toEqual(['a', 'b', 'c']);
  });

  it('stops at the first failing step and returns its exit code', () => {
    const seen: string[] = [];
    expect(runSteps(['a', 'b', 'c'], (s) => (seen.push(s), s === 'b' ? 3 : 0))).toBe(3);
    expect(seen).toEqual(['a', 'b']);
  });

  it('turns a step killed without a code into 1', () => {
    expect(runSteps(['a'], () => null)).toBe(1);
  });
});

describe('FIXTURE_STEPS', () => {
  it('are the existing fixture scripts of package.json', () => {
    expect(FIXTURE_STEPS).toEqual(['classify:report', 'bearing:report', 'log:seed']);
    const scripts = JSON.parse(readFileSync(`${ROOT}package.json`, 'utf8')).scripts as Record<string, string>;
    for (const s of FIXTURE_STEPS) expect(scripts[s], s).toBeDefined();
  });
});

describe('bun scripts/hooks/fixtures.ts', () => {
  it('exits non-zero when a step fails', () => {
    const r = runScript('scripts/hooks/fixtures.ts', ['no-such-script']);
    expect(r.code).not.toBe(0);
    expect(r.out).toContain('no-such-script');
  });
});
