import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { parseClassMap } from '../../src/classify/classmap';

/** Independent CSV writer: quote a field that has a comma or quote, double inner quotes. */
function writeCsv(names: string[]): string {
  const field = (s: string) => (/[",]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  return ['index,mid,display_name', ...names.map((n, i) => `${i},/m/x${i},${field(n)}`)].join('\n') + '\n';
}

describe('class map parser (property)', () => {
  it('reads back names made of letters, spaces, commas and quotes', () => {
    const name = fc.string({ unit: fc.constantFrom('a', 'Z', 'q', ' ', ',', '"'), minLength: 1, maxLength: 12 });
    fc.assert(
      fc.property(fc.array(name, { minLength: 521, maxLength: 521 }), (names) => {
        expect(parseClassMap(writeCsv(names)).map((e) => e.name)).toEqual(names);
      }),
      { numRuns: 200 },
    );
  });
});
