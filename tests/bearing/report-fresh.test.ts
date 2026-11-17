import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { accuracyJson } from './helpers/cases';

describe('accuracy report (R11.4)', () => {
  it('tests/bearing/accuracy.json matches the regenerated cases (run `bun run bearing:report` when it does not)', () => {
    const committed = readFileSync(new URL('./accuracy.json', import.meta.url), 'utf8');
    expect(accuracyJson()).toBe(committed);
  }, 120_000); // regenerates every case; slow when the whole suite runs in parallel
});
