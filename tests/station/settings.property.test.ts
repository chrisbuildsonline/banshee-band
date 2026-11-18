import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { OUTPUT_CHOICES, parseSettings, resolveSettings, serializeSettings, type StationSettings } from '../../src/station/settings';

const RUNS = { seed: 20261118, numRuns: 300 };
const CLASSES = ['knock', 'doorbell', 'alarm', 'baby', 'vehicle', 'voice', 'other'] as const;

/** True when `s` is complete and every field is valid (R2.3, R2.4). */
function isValid(s: StationSettings): boolean {
  if (Object.keys(s).join() !== 'sounds,output') return false;
  if (Object.keys(s.sounds).join() !== CLASSES.join()) return false;
  if (!(OUTPUT_CHOICES as readonly string[]).includes(s.output)) return false;
  return CLASSES.every((c) => {
    const v = s.sounds[c];
    return typeof v.on === 'boolean' && Number.isInteger(v.minDb) && v.minDb >= -80 && v.minDb <= -10;
  });
}

const classSetting = fc.record({ on: fc.boolean(), minDb: fc.integer({ min: -80, max: -10 }) });
const validSettings: fc.Arbitrary<StationSettings> = fc.record({
  sounds: fc.record(Object.fromEntries(CLASSES.map((c) => [c, classSetting])) as Record<(typeof CLASSES)[number], typeof classSetting>),
  output: fc.constantFrom(...OUTPUT_CHOICES),
});

/** Any JSON value, for corrupting one field. */
const junk = fc.oneof(fc.anything(), fc.double(), fc.string(), fc.constant(null), fc.constant(undefined));

describe('parseSettings never throws and always gives valid settings (R2.3, R2.6, R12.1)', () => {
  it('for any string', () => {
    fc.assert(fc.property(fc.string({ unit: 'binary' }), (text) => isValid(parseSettings(text))), RUNS);
  });

  it('for the JSON of anything', () => {
    fc.assert(
      fc.property(fc.anything(), (value) => {
        let text: string | undefined;
        try {
          text = JSON.stringify(value);
        } catch {
          return true; // BigInt and the like cannot be stored, so they never reach the parser
        }
        return isValid(parseSettings(text ?? null));
      }),
      RUNS,
    );
  });

  it('for valid settings JSON with fields corrupted', () => {
    const path = fc.oneof(fc.constant(['output']), fc.constantFrom(...CLASSES).chain((c) => fc.constantFrom([c], [c, 'on'], [c, 'minDb'])));
    fc.assert(
      fc.property(validSettings, fc.array(fc.tuple(path, junk), { minLength: 1, maxLength: 5 }), (s, edits) => {
        const doc = JSON.parse(serializeSettings(s)) as Record<string, unknown> & { sounds: Record<string, Record<string, unknown>> };
        for (const [p, value] of edits) {
          if (p[0] === 'output') doc.output = value;
          else if (p.length === 1) doc.sounds[p[0]] = value as Record<string, unknown>;
          else if (typeof doc.sounds[p[0]] === 'object' && doc.sounds[p[0]] !== null) doc.sounds[p[0]][p[1]] = value;
        }
        let text: string;
        try {
          text = JSON.stringify(doc);
        } catch {
          return true;
        }
        const out = parseSettings(text);
        if (!isValid(out)) return false;
        // Fields that were not corrupted keep their value.
        const touched = new Set(edits.map(([p]) => p[0]));
        return CLASSES.filter((c) => !touched.has(c)).every((c) => out.sounds[c].on === s.sounds[c].on && out.sounds[c].minDb === s.sounds[c].minDb);
      }),
      RUNS,
    );
  });

  it('for truncated settings JSON', () => {
    fc.assert(
      fc.property(validSettings, fc.nat(), (s, cut) => {
        const text = serializeSettings(s);
        return isValid(parseSettings(text.slice(0, cut % text.length)));
      }),
      RUNS,
    );
  });
});

describe('resolveSettings and the round trip (R2.3, R2.7)', () => {
  it('resolves anything to valid settings', () => {
    fc.assert(fc.property(fc.anything(), (value) => isValid(resolveSettings(value))), RUNS);
  });

  it('round-trips every valid settings object', () => {
    fc.assert(
      fc.property(validSettings, (s) => {
          expect(parseSettings(serializeSettings(s))).toEqual(s);
        }),
      RUNS,
    );
  });
});
