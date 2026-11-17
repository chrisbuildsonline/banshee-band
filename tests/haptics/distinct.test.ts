import { describe, expect, it } from 'vitest';
import raw from '../../src/haptics/patterns.json';
import { checkDistinctiveness, patternDistance } from '../../src/haptics/distinct';
import { loadPatterns, validatePatternData } from '../../src/haptics/patterns';
import type { HapticClass, Pattern, Pulse, Violation } from '../../src/haptics/types';

/** A pattern from `on/gap` pairs. */
function pat(cls: string, pairs: [number, number][], repeat?: { count: number; pauseMs: number }): Pattern {
  const pulses: Pulse[] = pairs.map(([onMs, gapMs]) => ({ onMs, gapMs }));
  return repeat ? { class: cls as HapticClass, pulses, repeat } : { class: cls as HapticClass, pulses };
}

const kinds = (v: Violation[]) => v.map((x) => x.kind).sort();

const knock = pat('knock', [[70, 100], [70, 0]]);
const doorbell = pat('doorbell', [[250, 150], [250, 0]]);
const vehicle = pat('vehicle', [[80, 100], [400, 0]]);
const voice = pat('voice', [[250, 0]]);
const alarm = pat('alarm', [[150, 100], [150, 100], [150, 0]], { count: 3, pauseMs: 400 });
const baby = pat('baby', [[100, 80], [100, 80], [100, 80], [100, 0]]);
const design = [knock, doorbell, alarm, baby, vehicle, voice];

describe('patternDistance (R4.2, R4.6)', () => {
  it('sums the on and gap differences of equal-count patterns', () => {
    expect(patternDistance(knock, doorbell)).toBe(410);
    expect(patternDistance(knock, vehicle)).toBe(340);
    expect(patternDistance(doorbell, vehicle)).toBe(370);
  });

  it('is symmetric and 0 to itself', () => {
    for (const a of design) {
      expect(patternDistance(a, a)).toBe(0);
      expect(patternDistance(a, structuredClone(a))).toBe(0);
      for (const b of design) expect(patternDistance(a, b)).toBe(patternDistance(b, a));
    }
  });

  it('is Infinity for different pulse counts, and ignores repeats', () => {
    expect(patternDistance(voice, knock)).toBe(Infinity);
    expect(patternDistance(alarm, baby)).toBe(Infinity);
    const once = pat('alarm', [[150, 100], [150, 100], [150, 0]]);
    expect(patternDistance(alarm, once)).toBe(0);
  });
});

describe('checkDistinctiveness (R4)', () => {
  it('passes the design set', () => {
    expect(checkDistinctiveness(design)).toEqual([]);
  });

  it('counts different pulse counts as distinct, even with similar timing', () => {
    expect(checkDistinctiveness([pat('knock', [[100, 0]]), pat('voice', [[100, 80], [100, 0]])])).toEqual([]);
  });

  it('equal counts: distance 149 is not distinct, 150 is', () => {
    const a = pat('knock', [[100, 100], [100, 0]]);
    expect(checkDistinctiveness([a, pat('doorbell', [[249, 100], [100, 0]])])).toMatchObject([
      { kind: 'not-distinct', classes: ['knock', 'doorbell'] },
    ]);
    expect(checkDistinctiveness([a, pat('doorbell', [[250, 100], [100, 0]])])).toEqual([]);
    // 149 spread over on and gap differences: 50 + 49 + 50 + 0
    expect(kinds(checkDistinctiveness([a, pat('doorbell', [[150, 149], [150, 0]])]))).toEqual(['not-distinct']);
    expect(checkDistinctiveness([a, pat('doorbell', [[150, 150], [150, 0]])])).toEqual([]);
  });

  it('names both classes and the measured distance', () => {
    const v = checkDistinctiveness([knock, pat('vehicle', [[70, 100], [70, 0]])]);
    expect(v).toHaveLength(1);
    expect(v[0].kind).toBe('not-distinct');
    expect(v[0].classes).toEqual(['knock', 'vehicle']);
    expect(v[0].detail).toMatch(/knock/);
    expect(v[0].detail).toMatch(/vehicle/);
    expect(v[0].detail).toMatch(/\b0\b/);
    const w = checkDistinctiveness([knock, pat('vehicle', [[120, 100], [70, 0]])]);
    expect(w[0].detail).toMatch(/\b50\b/);
  });

  it('reports a pulse of 30 (and 39) as pulse-too-short, not 40', () => {
    expect(kinds(checkDistinctiveness([pat('voice', [[30, 0]])]))).toEqual(['pulse-too-short']);
    expect(kinds(checkDistinctiveness([pat('voice', [[39, 0]])]))).toEqual(['pulse-too-short']);
    expect(checkDistinctiveness([pat('voice', [[40, 0]])])).toEqual([]);
  });

  it('reports an inner gap of 50 (and 79) as gap-too-short, not 80', () => {
    expect(kinds(checkDistinctiveness([pat('knock', [[70, 50], [70, 0]])]))).toEqual(['gap-too-short']);
    expect(kinds(checkDistinctiveness([pat('knock', [[70, 79], [70, 0]])]))).toEqual(['gap-too-short']);
    expect(checkDistinctiveness([pat('knock', [[70, 80], [70, 0]])])).toEqual([]);
  });

  it('reports a cycle of 1600 (and 1501) as cycle-too-long, not 1500', () => {
    expect(kinds(checkDistinctiveness([pat('voice', [[1600, 0]])]))).toEqual(['cycle-too-long']);
    expect(kinds(checkDistinctiveness([pat('voice', [[1000, 401], [100, 0]])]))).toEqual(['cycle-too-long']);
    expect(checkDistinctiveness([pat('voice', [[1500, 0]])])).toEqual([]);
  });

  it('reports a total of 4100 (and 4001) as total-too-long, not 4000', () => {
    // 650 * 4 + 500 * 3 = 4100
    expect(kinds(checkDistinctiveness([pat('alarm', [[150, 100], [150, 100], [150, 0]], { count: 3, pauseMs: 500 })]))).toEqual(['total-too-long']);
    // 1001 * 3 + 500 * 2 = 4003; 1000 * 3 + 500 * 2 = 4000
    expect(kinds(checkDistinctiveness([pat('alarm', [[1001, 0]], { count: 2, pauseMs: 500 })]))).toEqual(['total-too-long']);
    expect(checkDistinctiveness([pat('alarm', [[1000, 0]], { count: 2, pauseMs: 500 })])).toEqual([]);
  });

  it('reports a repeat pause of 200 (and 299) as pause-too-short, not 300', () => {
    expect(kinds(checkDistinctiveness([pat('alarm', [[150, 0]], { count: 3, pauseMs: 200 })]))).toEqual(['pause-too-short']);
    expect(kinds(checkDistinctiveness([pat('alarm', [[150, 0]], { count: 3, pauseMs: 299 })]))).toEqual(['pause-too-short']);
    expect(checkDistinctiveness([pat('alarm', [[150, 0]], { count: 3, pauseMs: 300 })])).toEqual([]);
  });

  it('reports several violations in one call, as plain objects', () => {
    const v = checkDistinctiveness([
      pat('knock', [[30, 50], [70, 0]]),
      pat('vehicle', [[30, 50], [70, 0]]),
      pat('voice', [[1600, 0]]),
      pat('alarm', [[150, 100], [150, 100], [150, 0]], { count: 3, pauseMs: 200 }),
    ]);
    expect(kinds(v)).toEqual(
      ['gap-too-short', 'gap-too-short', 'not-distinct', 'pause-too-short', 'pulse-too-short', 'pulse-too-short', 'cycle-too-long'].sort(),
    );
    for (const x of v) {
      expect(Object.keys(x).sort()).toEqual(['classes', 'detail', 'kind']);
      expect(typeof x.detail).toBe('string');
      expect(x.detail.length).toBeGreaterThan(0);
    }
    expect(v.find((x) => x.kind === 'cycle-too-long')!.classes).toEqual(['voice']);
  });

  it('checks every pair', () => {
    const v = checkDistinctiveness([knock, pat('doorbell', [[70, 100], [70, 0]]), pat('vehicle', [[70, 100], [70, 0]])]);
    expect(v.map((x) => x.classes)).toEqual([
      ['knock', 'doorbell'],
      ['knock', 'vehicle'],
      ['doorbell', 'vehicle'],
    ]);
  });

  it('does not throw for an empty list or one pattern', () => {
    expect(checkDistinctiveness([])).toEqual([]);
    expect(checkDistinctiveness([knock])).toEqual([]);
  });

  it('passes the real patterns.json (R4.7)', () => {
    const { patterns, errors } = validatePatternData(raw);
    expect(errors).toEqual([]);
    expect(patterns).toHaveLength(6);
    expect(checkDistinctiveness(patterns)).toEqual([]);
    expect(checkDistinctiveness(loadPatterns())).toEqual([]);
  });

  it('every equal-count pair of the real patterns is at least 200 ms apart', () => {
    const real = loadPatterns();
    for (let i = 0; i < real.length; i++) {
      for (let j = i + 1; j < real.length; j++) {
        if (real[i].pulses.length === real[j].pulses.length) {
          expect(patternDistance(real[i], real[j]), `${real[i].class}/${real[j].class}`).toBeGreaterThanOrEqual(200);
        }
      }
    }
  });
});
