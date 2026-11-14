import { describe, expect, it } from 'vitest';
import { parseClassMap } from '../../src/classify/classmap';

const HEADER = 'index,mid,display_name';

/** A valid CSV with `count` rows; `edit` may replace any data line (row i is line i + 2). */
function csv(count = 521, edit: (i: number, line: string) => string = (_i, l) => l, eol = '\n'): string {
  const lines = [HEADER];
  for (let i = 0; i < count; i++) lines.push(edit(i, `${i},/m/x${i},Name ${i}`));
  return lines.join(eol) + eol;
}

describe('parseClassMap', () => {
  it('parses a full 521-row CSV in index order', () => {
    const entries = parseClassMap(csv());
    expect(entries).toHaveLength(521);
    entries.forEach((e, i) => expect(e).toEqual({ index: i, mid: `/m/x${i}`, name: `Name ${i}` }));
  });

  it('keeps commas inside quoted fields', () => {
    const entries = parseClassMap(csv(521, (i, l) => (i === 1 ? '1,/m/0ytgt,"Child speech, kid speaking"' : l)));
    expect(entries[1].name).toBe('Child speech, kid speaking');
    expect(entries[2].name).toBe('Name 2');
  });

  it('turns doubled quotes inside a quoted field into one quote', () => {
    const entries = parseClassMap(csv(521, (i, l) => (i === 3 ? '3,/m/x3,"Say ""hi"", then go"' : l)));
    expect(entries[3].name).toBe('Say "hi", then go');
  });

  it('accepts \\r\\n line endings', () => {
    const entries = parseClassMap(csv(521, undefined, '\r\n'));
    expect(entries).toHaveLength(521);
    expect(entries[520]).toEqual({ index: 520, mid: '/m/x520', name: 'Name 520' });
  });

  it('accepts a file with or without a trailing newline', () => {
    expect(parseClassMap(csv())).toHaveLength(521);
    expect(parseClassMap(csv().slice(0, -1))).toHaveLength(521);
    expect(parseClassMap(csv(521, undefined, '\r\n').slice(0, -2))).toHaveLength(521);
  });

  it('rejects a wrong header on line 1', () => {
    expect(() => parseClassMap(csv().replace(HEADER, 'index,mid,name'))).toThrow(/line 1\b.*header/);
  });

  it('rejects a row with the wrong number of fields, naming its line', () => {
    expect(() => parseClassMap(csv(521, (i, l) => (i === 10 ? '10,/m/x10' : l)))).toThrow(/line 12\b.*3 fields/);
    expect(() => parseClassMap(csv(521, (i, l) => (i === 10 ? '10,/m/x10,A,B' : l)))).toThrow(/line 12\b.*3 fields/);
  });

  it('rejects an index gap, naming its line', () => {
    expect(() => parseClassMap(csv(521, (i, l) => (i === 5 ? '6,/m/x5,Name 5' : l)))).toThrow(/line 7\b.*index/);
    expect(() => parseClassMap(csv(521, (i, l) => (i === 0 ? 'zero,/m/x0,Name 0' : l)))).toThrow(/line 2\b.*index/);
  });

  it('rejects an empty name or mid, naming its line', () => {
    expect(() => parseClassMap(csv(521, (i, l) => (i === 7 ? '7,/m/x7,' : l)))).toThrow(/line 9\b.*display_name/);
    expect(() => parseClassMap(csv(521, (i, l) => (i === 8 ? '8,,Name 8' : l)))).toThrow(/line 10\b.*mid/);
  });

  it('rejects 520 rows and 522 rows, naming the line', () => {
    expect(() => parseClassMap(csv(520))).toThrow(/line 522\b.*521 rows/);
    expect(() => parseClassMap(csv(522))).toThrow(/line 523\b.*521 rows/);
  });

  it('rejects an empty file on line 1', () => {
    expect(() => parseClassMap('')).toThrow(/line 1\b/);
  });
});
