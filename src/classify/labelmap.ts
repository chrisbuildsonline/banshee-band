import { SOUND_CLASSES, type SoundClass } from '../events';
import { SCORE_COUNT } from './constants';
import { RULES, type Rules, type SpecificClass } from './rules';
import type { ClassMapEntry, LabelMap } from './types';

/** Resolves every Rule name to its Index by exact name. Unnamed Indexes are `other`. Throws on any ambiguity. */
export function buildLabelMap(classMap: ClassMapEntry[], rules: Rules = RULES): LabelMap {
  if (classMap.length !== SCORE_COUNT) throw new Error(`class map must have ${SCORE_COUNT} entries`);
  const names = Object.freeze(classMap.map((e) => e.name));
  const nameToIndexes = new Map<string, number[]>();
  names.forEach((name, i) => nameToIndexes.set(name, [...(nameToIndexes.get(name) ?? []), i]));

  const classOf: SoundClass[] = new Array<SoundClass>(SCORE_COUNT).fill('other');
  for (const cls of Object.keys(rules) as SpecificClass[]) {
    for (const name of rules[cls]) {
      const found = nameToIndexes.get(name);
      if (!found) throw new Error(`label map rule "${name}" is not in the class map`);
      if (found.length > 1) throw new Error(`label map rule "${name}" appears ${found.length} times in the class map`);
      const index = found[0];
      const prev = classOf[index];
      if (prev !== 'other' && prev !== cls) {
        throw new Error(`class map index ${index} "${name}" is claimed by both ${prev} and ${cls}`);
      }
      classOf[index] = cls;
    }
  }

  const members = {} as Record<SoundClass, readonly number[]>;
  for (const cls of SOUND_CLASSES) {
    members[cls] = Object.freeze(classOf.flatMap((c, i) => (c === cls ? [i] : [])));
  }
  const frozenClassOf = Object.freeze(classOf);

  return Object.freeze({
    names,
    classOf: frozenClassOf,
    members: Object.freeze(members),
    classForIndex(index: number): SoundClass {
      return Number.isInteger(index) && index >= 0 && index < SCORE_COUNT ? frozenClassOf[index] : 'other';
    },
  });
}
