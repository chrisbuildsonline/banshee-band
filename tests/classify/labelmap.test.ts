import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SOUND_CLASSES } from '../../src/events';
import { aggregateScores } from '../../src/classify/aggregate';
import { parseClassMap } from '../../src/classify/classmap';
import { DEFAULT_THRESHOLD } from '../../src/classify/constants';
import { buildLabelMap } from '../../src/classify/labelmap';
import { RULES } from '../../src/classify/rules';

const CSV = readFileSync(new URL('../../public/models/yamnet/yamnet_class_map.csv', import.meta.url), 'utf8');
const classMap = parseClassMap(CSV);
const map = buildLabelMap(classMap);
const indexOf = (name: string) => classMap.findIndex((e) => e.name === name);

describe('buildLabelMap on the real class map', () => {
  it('finds every Rule name in the class map exactly once', () => {
    for (const names of Object.values(RULES)) {
      for (const name of names) expect(classMap.filter((e) => e.name === name), name).toHaveLength(1);
    }
  });

  it('gives every Index 0 to 520 a class from SOUND_CLASSES', () => {
    expect(map.classOf).toHaveLength(521);
    expect(map.names).toHaveLength(521);
    for (let i = 0; i < 521; i++) {
      expect(SOUND_CLASSES).toContain(map.classOf[i]);
      expect(map.classForIndex(i)).toBe(map.classOf[i]);
      expect(map.names[i]).toBe(classMap[i].name);
    }
  });

  it('puts every Index in exactly one class, ascending, with a Member in each specific class', () => {
    const all = SOUND_CLASSES.flatMap((c) => [...map.members[c]]);
    expect(all).toHaveLength(521);
    expect(new Set(all).size).toBe(521);
    for (const c of SOUND_CLASSES) {
      const m = map.members[c];
      expect(m.length, c).toBeGreaterThan(0);
      expect([...m].sort((a, b) => a - b)).toEqual([...m]);
      for (const i of m) expect(map.classOf[i]).toBe(c);
    }
    for (const [cls, names] of Object.entries(RULES)) {
      for (const name of names) {
        const i = indexOf(name);
        expect(SOUND_CLASSES.filter((c) => map.members[c].includes(i)), name).toEqual([cls]);
      }
    }
  });

  it('maps the named examples', () => {
    const cases: [string, string][] = [
      ['Doorbell', 'doorbell'],
      ['Ding-dong', 'doorbell'],
      ['Knock', 'knock'],
      ['Smoke detector, smoke alarm', 'alarm'],
      ['Fire alarm', 'alarm'],
      ['Baby cry, infant cry', 'baby'],
      ['Vehicle horn, car horn, honking', 'vehicle'],
      ['Speech', 'voice'],
      ['Music', 'other'],
      ['Silence', 'other'],
    ];
    for (const [name, cls] of cases) {
      expect(indexOf(name), name).toBeGreaterThanOrEqual(0);
      expect(map.classForIndex(indexOf(name)), name).toBe(cls);
    }
  });

  it('returns other for anything that is not an Index, without throwing', () => {
    for (const i of [-1, 521, 1000, 0.5, NaN, Infinity, -Infinity]) expect(map.classForIndex(i)).toBe('other');
  });

  it('is frozen', () => {
    expect(Object.isFrozen(map)).toBe(true);
    expect(Object.isFrozen(map.classOf)).toBe(true);
    expect(Object.isFrozen(map.names)).toBe(true);
    expect(Object.isFrozen(map.members)).toBe(true);
    for (const c of SOUND_CLASSES) expect(Object.isFrozen(map.members[c])).toBe(true);
  });
});

describe('aggregateScores', () => {
  /** A 521-score array, zero except for the named classes. */
  const scores = (set: Record<string, number> = {}) => {
    const s = new Array<number>(521).fill(0);
    for (const [name, v] of Object.entries(set)) s[indexOf(name)] = v;
    return s;
  };
  const firstOther = map.members.other[0];

  it('gives other for all zeros', () => {
    expect(aggregateScores(scores(), map)).toEqual({ class: 'other', label: map.names[firstOther], confidence: 0 });
  });

  it('gives doorbell for one doorbell Member at 0.9', () => {
    expect(aggregateScores(scores({ Doorbell: 0.9 }), map)).toEqual({ class: 'doorbell', label: 'Doorbell', confidence: 0.9 });
  });

  it('takes the max of two alarm Members, not the sum', () => {
    const r = aggregateScores(scores({ Buzzer: 0.4, 'Smoke detector, smoke alarm': 0.6 }), map);
    expect(r).toEqual({ class: 'alarm', label: 'Smoke detector, smoke alarm', confidence: 0.6 });
  });

  it('accepts an Aggregate equal to the Threshold and refuses one just under it', () => {
    expect(aggregateScores(scores({ Doorbell: DEFAULT_THRESHOLD }), map).class).toBe('doorbell');
    expect(aggregateScores(scores({ Doorbell: DEFAULT_THRESHOLD - 1e-9 }), map).class).toBe('other');
    expect(aggregateScores(scores({ Doorbell: 0.5 }), map, { threshold: 0.5 }).class).toBe('doorbell');
  });

  it('breaks ties by priority: alarm over voice, knock over vehicle', () => {
    expect(aggregateScores(scores({ Speech: 0.7, Alarm: 0.7 }), map).class).toBe('alarm');
    expect(aggregateScores(scores({ Car: 0.5, Knock: 0.5 }), map).class).toBe('knock');
  });

  it('gives other the label and confidence of the best other Index', () => {
    expect(aggregateScores(scores({ Music: 0.8, Silence: 0.6, Doorbell: 0.1 }), map)).toEqual({
      class: 'other',
      label: 'Music',
      confidence: 0.8,
    });
  });

  it('does not let a high unmapped score raise a specific class', () => {
    const s = scores({ Music: 1, Doorbell: 0.3 });
    expect(aggregateScores(s, map, { threshold: 0.5 })).toEqual({ class: 'other', label: 'Music', confidence: 1 });
    expect(aggregateScores(s, map, { threshold: 0.2 })).toEqual({ class: 'doorbell', label: 'Doorbell', confidence: 0.3 });
  });

  it('throws a RangeError naming the argument for invalid input', () => {
    expect(() => aggregateScores(new Array(520).fill(0), map)).toThrow(RangeError);
    expect(() => aggregateScores(new Array(520).fill(0), map)).toThrow(/scores/);
    expect(() => aggregateScores(new Array(522).fill(0), map)).toThrow(/scores/);
    for (const bad of [NaN, Infinity, -Infinity, -0.01, 1.01]) {
      const s = scores();
      s[100] = bad;
      expect(() => aggregateScores(s, map), String(bad)).toThrow(RangeError);
      expect(() => aggregateScores(s, map), String(bad)).toThrow(/scores/);
    }
    for (const bad of [NaN, Infinity, -0.01, 1.01]) {
      expect(() => aggregateScores(scores(), map, { threshold: bad }), String(bad)).toThrow(RangeError);
      expect(() => aggregateScores(scores(), map, { threshold: bad }), String(bad)).toThrow(/threshold/);
    }
  });
});

describe('buildLabelMap failures (modified copies)', () => {
  it('names a Rule that is not in the class map', () => {
    const rules = { ...RULES, knock: [...RULES.knock, 'Knock knock'] };
    expect(() => buildLabelMap(classMap, rules)).toThrow(/"Knock knock"/);
  });

  it('refuses a Rule name that appears twice in the class map', () => {
    const copy = classMap.map((e) => (e.index === 132 ? { ...e, name: 'Doorbell' } : e));
    expect(() => buildLabelMap(copy)).toThrow(/"Doorbell"/);
  });

  it('names the Index, display name and both classes when two classes claim one Index', () => {
    const rules = { ...RULES, knock: [...RULES.knock, 'Doorbell'] };
    expect(() => buildLabelMap(classMap, rules)).toThrow(/349.*"Doorbell".*(knock.*doorbell|doorbell.*knock)/);
  });
});
