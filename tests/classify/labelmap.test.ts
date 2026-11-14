import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SOUND_CLASSES } from '../../src/events';
import { parseClassMap } from '../../src/classify/classmap';
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
