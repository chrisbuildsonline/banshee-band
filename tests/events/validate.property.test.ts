import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { validateSoundEvent, type ValidationResult } from '../../src/events';
import { FIELDS, invalidValue, mismatchedBearing, validEvent, type Field } from './arbitraries';

// No fixed seed: a failure prints its seed and shrunk counterexample, and can be replayed with { seed, path }.
const MANY = { numRuns: 500 };

const namesField = (errors: string[], field: string) => errors.some((e) => e.split(':')[0].split(', ').includes(field));

function expectShape(result: ValidationResult) {
  if (result.ok) {
    expect(Object.keys(result).sort()).toEqual(['event', 'ok']);
    expect(Object.keys(result.event).sort()).toEqual([...FIELDS].sort());
  } else {
    expect(Object.keys(result).sort()).toEqual(['errors', 'ok']);
    expect(result.errors.length).toBeGreaterThan(0);
    for (const e of result.errors) expect(typeof e).toBe('string');
  }
}

describe('validateSoundEvent properties', () => {
  it('P1: never throws and keeps the result shape for any value', () => {
    fc.assert(fc.property(fc.oneof(fc.anything(), fc.object()), (input) => expectShape(validateSoundEvent(input))), MANY);
  });

  it('P2: never throws and keeps the result shape for any value in each field', () => {
    const anyFields = fc.record(Object.fromEntries(FIELDS.map((f) => [f, fc.anything()])) as Record<Field, fc.Arbitrary<unknown>>, { requiredKeys: [] });
    fc.assert(fc.property(anyFields, (input) => expectShape(validateSoundEvent(input))), MANY);
  });

  it('P3: accepts every valid event and returns equal values in a new object', () => {
    fc.assert(
      fc.property(validEvent, (input) => {
        const result = validateSoundEvent(input);
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.event).not.toBe(input);
        expect(result.event).toStrictEqual(input);
        for (const f of FIELDS) expect(Object.is(result.event[f], input[f])).toBe(true);
      }),
      MANY,
    );
  });

  it('P4: rejects a valid event with one field made invalid, and names that field', () => {
    const mutation = fc.constantFrom(...FIELDS).chain((field) => fc.tuple(fc.constant(field), invalidValue[field]));
    fc.assert(
      fc.property(validEvent, mutation, (valid, [field, value]) => {
        const input: Record<string, unknown> = { ...valid, [field]: value };
        for (const other of FIELDS) if (other !== field) expect(Object.is(input[other], valid[other])).toBe(true);
        const result = validateSoundEvent(input);
        expect(result.ok).toBe(false);
        if (!result.ok) expect(namesField(result.errors, field), result.errors.join(' | ')).toBe(true);
      }),
    );
  });

  it('P4: rejects a bearing that disagrees with its source, naming both fields', () => {
    fc.assert(
      fc.property(validEvent, mismatchedBearing, (valid, bearing) => {
        const result = validateSoundEvent({ ...valid, ...bearing });
        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(namesField(result.errors, 'bearingDeg')).toBe(true);
          expect(namesField(result.errors, 'bearingSource')).toBe(true);
        }
      }),
    );
  });

  it('P4: rejects bearingSource set to none on an event that has a bearing', () => {
    const withBearing = validEvent.filter((e) => e.bearingDeg !== null);
    fc.assert(
      fc.property(withBearing, (valid) => {
        const result = validateSoundEvent({ ...valid, bearingSource: 'none' });
        expect(result.ok).toBe(false);
        if (!result.ok) expect(namesField(result.errors, 'bearingSource')).toBe(true);
      }),
    );
  });

  it('P5: rejects an event with any one field removed, and names it', () => {
    fc.assert(
      fc.property(validEvent, fc.constantFrom(...FIELDS), (valid, field) => {
        const input: Record<string, unknown> = { ...valid };
        delete input[field];
        const result = validateSoundEvent(input);
        expect(result.ok).toBe(false);
        if (!result.ok) expect(namesField(result.errors, field)).toBe(true);
      }),
    );
  });

  it('P6: gives equal results twice and leaves the input unchanged', () => {
    const input = fc.oneof(validEvent, fc.record({ ...Object.fromEntries(FIELDS.map((f) => [f, fc.anything()])) }), fc.anything());
    fc.assert(
      fc.property(input, (value) => {
        const before = structuredClone(value);
        const first = validateSoundEvent(value);
        const second = validateSoundEvent(value);
        expect(second).toStrictEqual(first);
        // Clone again rather than compare `value` itself: structuredClone drops a null prototype.
        expect(structuredClone(value)).toStrictEqual(before);
      }),
    );
  });

  it('P7: drops keys outside the contract', () => {
    const extras = fc.dictionary(fc.string().filter((k) => !(FIELDS as readonly string[]).includes(k) && k !== '__proto__'), fc.anything());
    fc.assert(
      fc.property(validEvent, extras, (valid, extra) => {
        const result = validateSoundEvent({ ...extra, ...valid });
        expect(result.ok).toBe(true);
        if (result.ok) expect(Object.keys(result.event).sort()).toEqual([...FIELDS].sort());
      }),
    );
  });

  it('P8: never puts a rejected label in the error text', () => {
    // '#' never occurs in an error message, so a match can only come from the input.
    const label = fc.string({ minLength: 7 }).map((s) => `#${s}`);
    const otherwiseBroken = fc.constantFrom(...FIELDS.filter((f) => f !== 'label')).chain((field) => fc.tuple(fc.constant(field), invalidValue[field]));
    fc.assert(
      fc.property(validEvent, label, otherwiseBroken, (valid, text, [field, value]) => {
        const result = validateSoundEvent({ ...valid, label: text, id: text, [field]: value });
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.errors.join('\n')).not.toContain(text);
      }),
    );
  });
});
