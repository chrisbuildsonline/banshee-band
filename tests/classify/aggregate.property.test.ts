import { readFileSync } from 'node:fs';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { SOUND_CLASSES } from '../../src/events';
import { aggregateScores } from '../../src/classify/aggregate';
import { parseClassMap } from '../../src/classify/classmap';
import { CLASS_PRIORITY } from '../../src/classify/constants';
import { buildLabelMap } from '../../src/classify/labelmap';

const map = buildLabelMap(
  parseClassMap(readFileSync(new URL('../../public/models/yamnet/yamnet_class_map.csv', import.meta.url), 'utf8')),
);
const RUNS = { numRuns: 200 };
const SPECIFIC = CLASS_PRIORITY;
type Specific = (typeof SPECIFIC)[number];

const score = fc.double({ min: 0, max: 1, noNaN: true });
const dense = fc.array(score, { minLength: 521, maxLength: 521 });
/** Mostly zero: up to 12 non-zero Indexes. */
const sparse = fc.array(fc.tuple(fc.nat(520), score), { maxLength: 12 }).map((pairs) => {
  const s = new Array<number>(521).fill(0);
  for (const [i, v] of pairs) s[i] = v;
  return s;
});
const scores = fc.oneof(dense, sparse);
const threshold = score;
const specificClass = fc.constantFrom(...SPECIFIC);

/** Independent oracle: the Aggregate of a class by reduce, and the first Member that has it. */
const agg = (s: number[], cls: Specific | 'other') => map.members[cls].reduce((m, i) => Math.max(m, s[i]), 0);
const bestMember = (s: number[], cls: Specific) => map.members[cls].find((i) => s[i] === agg(s, cls));

describe('aggregateScores (properties)', () => {
  it('9.2.1 gives a valid Classification', () => {
    fc.assert(
      fc.property(scores, threshold, (s, t) => {
        const r = aggregateScores(s, map, { threshold: t });
        expect(SOUND_CLASSES).toContain(r.class);
        expect(Number.isFinite(r.confidence) && r.confidence >= 0 && r.confidence <= 1).toBe(true);
        expect(typeof r.label === 'string' && r.label.length > 0).toBe(true);
      }),
      RUNS,
    );
  });

  it('9.2.2 is deterministic and does not change its input', () => {
    fc.assert(
      fc.property(scores, threshold, (s, t) => {
        const copy = [...s];
        expect(aggregateScores(s, map, { threshold: t })).toEqual(aggregateScores(s, map, { threshold: t }));
        expect(s).toEqual(copy);
      }),
      RUNS,
    );
  });

  it('9.2.3 takes the maximum over the winning class and labels its best Member', () => {
    fc.assert(
      fc.property(scores, threshold, (s, t) => {
        const r = aggregateScores(s, map, { threshold: t });
        if (r.class === 'other') return;
        expect(r.confidence).toBe(agg(s, r.class));
        expect(r.label).toBe(map.names[bestMember(s, r.class)!]);
      }),
      RUNS,
    );
  });

  it('9.2.4 picks a class no other class beats, at or above the Threshold', () => {
    fc.assert(
      fc.property(scores, threshold, (s, t) => {
        const r = aggregateScores(s, map, { threshold: t });
        if (r.class === 'other') return;
        for (const c of SPECIFIC) expect(agg(s, c)).toBeLessThanOrEqual(r.confidence);
        expect(r.confidence).toBeGreaterThanOrEqual(t);
      }),
      RUNS,
    );
  });

  it('9.2.5 gives other only when every specific class is below the Threshold', () => {
    fc.assert(
      fc.property(scores, threshold, (s, t) => {
        const r = aggregateScores(s, map, { threshold: t });
        if (r.class !== 'other') return;
        for (const c of SPECIFIC) expect(agg(s, c)).toBeLessThan(t);
        expect(r.confidence).toBe(agg(s, 'other'));
      }),
      RUNS,
    );
  });

  it('9.2.6 Threshold 0 never gives other; Threshold 1 needs a Member at exactly 1', () => {
    expect(aggregateScores(new Array(521).fill(0), map, { threshold: 0 })).toMatchObject({ class: 'alarm', confidence: 0 });
    const withOnes = fc.array(fc.oneof(score, fc.constant(1), fc.constant(0)), { minLength: 521, maxLength: 521 });
    fc.assert(
      fc.property(fc.oneof(scores, withOnes), (s) => {
        expect(aggregateScores(s, map, { threshold: 0 }).class).not.toBe('other');
        const anyOne = SPECIFIC.some((c) => map.members[c].some((i) => s[i] === 1));
        expect(aggregateScores(s, map, { threshold: 1 }).class !== 'other').toBe(anyOne);
      }),
      RUNS,
    );
  });

  it('9.2.7 does not depend on the order of Scores within a class', () => {
    fc.assert(
      fc.property(scores, threshold, specificClass, fc.nat(), fc.nat(), (s, t, c, a, b) => {
        const m = map.members[c];
        const [i, j] = [m[a % m.length], m[b % m.length]];
        const swapped = [...s];
        [swapped[i], swapped[j]] = [s[j], s[i]];
        const r1 = aggregateScores(s, map, { threshold: t });
        const r2 = aggregateScores(swapped, map, { threshold: t });
        expect([r2.class, r2.confidence]).toEqual([r1.class, r1.confidence]);
      }),
      RUNS,
    );
  });

  it('9.2.8 raising a Member of the winner keeps the winner and does not lower confidence', () => {
    fc.assert(
      fc.property(scores, threshold, fc.nat(), score, (s, t, k, x) => {
        const r = aggregateScores(s, map, { threshold: t });
        if (r.class === 'other') return;
        const m = map.members[r.class];
        const i = m[k % m.length];
        const raised = [...s];
        raised[i] = s[i] + x * (1 - s[i]);
        const r2 = aggregateScores(raised, map, { threshold: t });
        expect(r2.class).toBe(r.class);
        expect(r2.confidence).toBeGreaterThanOrEqual(r.confidence);
      }),
      RUNS,
    );
  });

  it('9.2.9 unmapped Scores cannot win a specific class', () => {
    fc.assert(
      fc.property(scores, fc.double({ min: Number.MIN_VALUE, max: 1, noNaN: true }), (s, t) => {
        const zeroed = [...s];
        for (const c of SPECIFIC) for (const i of map.members[c]) zeroed[i] = 0;
        expect(aggregateScores(zeroed, map, { threshold: t }).class).toBe('other');
      }),
      RUNS,
    );
  });

  it('9.2.10 is not a sum: every Member at 0.5 gives confidence 0.5', () => {
    fc.assert(
      fc.property(specificClass, fc.double({ min: 0, max: 0.5, noNaN: true }), (c, t) => {
        const s = new Array<number>(521).fill(0);
        for (const i of map.members[c]) s[i] = 0.5;
        expect(aggregateScores(s, map, { threshold: t })).toMatchObject({ class: c, confidence: 0.5 });
      }),
      RUNS,
    );
  });

  it('9.2.11 equal Scores go to the class first in priority order', () => {
    const pair = fc.uniqueArray(specificClass, { minLength: 2, maxLength: 2 });
    fc.assert(
      fc.property(pair, fc.nat(), fc.nat(), fc.double({ min: Number.MIN_VALUE, max: 1, noNaN: true }), score, (cs, a, b, v, f) => {
        const [c1, c2] = cs as [Specific, Specific];
        const s = new Array<number>(521).fill(0);
        s[map.members[c1][a % map.members[c1].length]] = v;
        s[map.members[c2][b % map.members[c2].length]] = v;
        const first = SPECIFIC.indexOf(c1) < SPECIFIC.indexOf(c2) ? c1 : c2;
        expect(aggregateScores(s, map, { threshold: v * f }).class).toBe(first);
      }),
      RUNS,
    );
  });
});

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
      RUNS,
    );
  });
});
