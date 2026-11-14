import { describe, expect, it } from 'vitest';
import { BEARING_SOURCES, SOUND_CLASSES, URGENCY_LEVELS, validateSoundEvent, type SoundEvent } from '../../src/events';

const FIELDS = ['id', 't', 'class', 'label', 'confidence', 'bearingDeg', 'bearingSource', 'loudnessDb', 'urgency'] as const;
type Field = (typeof FIELDS)[number];

const validEvent = (): SoundEvent => ({
  id: 'evt-1',
  t: 1_700_000_000_000,
  class: 'doorbell',
  label: 'Doorbell',
  confidence: 0.82,
  bearingDeg: 45,
  bearingSource: 'gcc-phat',
  loudnessDb: -18.5,
  urgency: 'medium',
});

function accepts(input: unknown) {
  const result = validateSoundEvent(input);
  expect(result.ok ? [] : result.errors).toEqual([]);
  return result.ok ? result.event : undefined;
}

function rejects(input: unknown, ...fields: string[]) {
  const result = validateSoundEvent(input);
  expect(result.ok).toBe(false);
  const errors = result.ok ? [] : result.errors;
  expect(errors.length).toBeGreaterThan(0);
  for (const field of fields) expect(errors.some((e) => e.startsWith(`${field}:`) || e.startsWith(`${field},`) || e.includes(` ${field}:`)), `no error names ${field}: ${errors.join(' | ')}`).toBe(true);
  return errors;
}

const without = (field: Field) => {
  const event: Record<string, unknown> = { ...validEvent() };
  delete event[field];
  return event;
};

describe('validateSoundEvent accepts', () => {
  it('a typical event and returns the same values', () => {
    expect(accepts(validEvent())).toEqual(validEvent());
  });

  it('a null bearing with bearingSource none', () => {
    expect(accepts({ ...validEvent(), bearingDeg: null, bearingSource: 'none' })).toMatchObject({ bearingDeg: null, bearingSource: 'none' });
  });

  it('every class, bearing source and urgency', () => {
    for (const c of SOUND_CLASSES) accepts({ ...validEvent(), class: c });
    for (const u of URGENCY_LEVELS) accepts({ ...validEvent(), urgency: u });
    for (const s of BEARING_SOURCES) accepts({ ...validEvent(), bearingSource: s, bearingDeg: s === 'none' ? null : 10 });
  });

  it('the boundary values', () => {
    accepts({ ...validEvent(), t: 0 });
    accepts({ ...validEvent(), confidence: 0 });
    accepts({ ...validEvent(), confidence: 1 });
    accepts({ ...validEvent(), bearingDeg: -180 });
    accepts({ ...validEvent(), bearingDeg: 180 });
    accepts({ ...validEvent(), loudnessDb: 0 });
    accepts({ ...validEvent(), t: Number.MAX_VALUE });
  });

  it('-0 for t and loudnessDb, and keeps it', () => {
    // -0 >= 0 and -0 <= 0 are both true, so -0 is valid; the result keeps the sign.
    const event = accepts({ ...validEvent(), t: -0, loudnessDb: -0 });
    expect(Object.is(event?.t, -0)).toBe(true);
    expect(Object.is(event?.loudnessDb, -0)).toBe(true);
  });
});

describe('validateSoundEvent rejects wrong types', () => {
  const wrongTypes: Record<Field, unknown[]> = {
    id: [undefined, null, 1, {}, [], true],
    t: [undefined, null, '1', {}, [], true, new Number(1), 1n],
    class: [undefined, null, 1, {}, [], true],
    label: [undefined, null, 1, {}, [], true],
    confidence: [undefined, null, '0.5', {}, [], true],
    bearingDeg: [undefined, '45', {}, [], true],
    bearingSource: [undefined, null, 1, {}, [], true],
    loudnessDb: [undefined, null, '-10', {}, [], true],
    urgency: [undefined, null, 1, {}, [], true],
  };
  for (const field of FIELDS) {
    it(`for ${field}`, () => {
      for (const value of wrongTypes[field]) rejects({ ...validEvent(), [field]: value }, field);
    });
    it(`when ${field} is missing`, () => {
      rejects(without(field), field);
    });
  }
});

describe('validateSoundEvent rejects out-of-range and non-finite values', () => {
  it('just outside each range', () => {
    rejects({ ...validEvent(), t: -1 }, 't');
    rejects({ ...validEvent(), t: -Number.MIN_VALUE }, 't');
    rejects({ ...validEvent(), confidence: -0.01 }, 'confidence');
    rejects({ ...validEvent(), confidence: 1.01 }, 'confidence');
    rejects({ ...validEvent(), bearingDeg: -180.01 }, 'bearingDeg');
    rejects({ ...validEvent(), bearingDeg: 180.01 }, 'bearingDeg');
    rejects({ ...validEvent(), loudnessDb: 0.01 }, 'loudnessDb');
    rejects({ ...validEvent(), loudnessDb: Number.MIN_VALUE }, 'loudnessDb');
  });

  it('NaN, Infinity and -Infinity in every numeric field', () => {
    for (const field of ['t', 'confidence', 'bearingDeg', 'loudnessDb'] as const) {
      for (const value of [NaN, Infinity, -Infinity]) rejects({ ...validEvent(), [field]: value }, field);
    }
  });

  it('unknown enum strings', () => {
    rejects({ ...validEvent(), class: 'dog' }, 'class');
    rejects({ ...validEvent(), class: 'Knock' }, 'class');
    rejects({ ...validEvent(), class: '__proto__' }, 'class');
    rejects({ ...validEvent(), bearingSource: 'compass' }, 'bearingSource');
    rejects({ ...validEvent(), urgency: 'critical' }, 'urgency');
    rejects({ ...validEvent(), urgency: 'constructor' }, 'urgency');
  });

  it('an empty id and a blank label', () => {
    rejects({ ...validEvent(), id: '' }, 'id');
    rejects({ ...validEvent(), label: '' }, 'label');
    rejects({ ...validEvent(), label: '   ' }, 'label');
    rejects({ ...validEvent(), label: '\n\t' }, 'label');
  });
});

describe('validateSoundEvent rejects a bearing that disagrees with its source', () => {
  const coupling = /^bearingDeg, bearingSource:/;
  it.each([
    [null, 'gcc-phat'],
    [null, 'loudness'],
    [90, 'none'],
    [0, 'none'],
  ])('bearingDeg %s with %s', (bearingDeg, bearingSource) => {
    const errors = rejects({ ...validEvent(), bearingDeg, bearingSource }, 'bearingDeg', 'bearingSource');
    expect(errors.some((e) => coupling.test(e))).toBe(true);
  });

  it('does not add a coupling error when a field already failed its own check', () => {
    const errors = rejects({ ...validEvent(), bearingDeg: NaN, bearingSource: 'none' }, 'bearingDeg');
    expect(errors).toHaveLength(1);
  });
});

describe('validateSoundEvent rejects a non-object input', () => {
  it.each([
    ['null', null],
    ['undefined', undefined],
    ['a number', 42],
    ['a string', 'x'],
    ['a boolean', true],
    ['an array', []],
    ['an array of a valid event', [validEvent()]],
    ['a function', () => {}],
    ['a symbol', Symbol('s')],
    ['a bigint', 0n],
  ])('%s', (_name, input) => {
    expect(rejects(input)).toEqual(['input must be an object']);
  });
});

describe('validateSoundEvent survives hostile input', () => {
  it('a throwing getter', () => {
    const input = { ...validEvent() };
    Object.defineProperty(input, 'label', { get() { throw new Error('boom'); } });
    expect(rejects(input)).toEqual(['input could not be read']);
  });

  it('a revoked proxy', () => {
    const { proxy, revoke } = Proxy.revocable(validEvent(), {});
    revoke();
    expect(rejects(proxy)).toEqual(['input could not be read']);
  });

  it('a proxy whose get trap throws', () => {
    const proxy = new Proxy(validEvent(), { get() { throw new Error('trap'); } });
    expect(rejects(proxy)).toEqual(['input could not be read']);
  });

  it('a null-prototype object', () => {
    const input = Object.assign(Object.create(null), validEvent());
    expect(accepts(input)).toEqual(validEvent());
  });

  it('a circular object', () => {
    const input: Record<string, unknown> = { ...validEvent() };
    input.self = input;
    const event = accepts(input);
    expect(event).toEqual(validEvent());
  });

  it('a getter that changes its value is read once', () => {
    let reads = 0;
    const input = { ...validEvent() };
    Object.defineProperty(input, 'confidence', { enumerable: true, get: () => (reads++ === 0 ? 0.5 : 7) });
    expect(accepts(input)?.confidence).toBe(0.5);
    expect(reads).toBe(1);
  });

  it('a 1 MB label (accepted) and a 1 MB id (accepted)', () => {
    const big = 'a'.repeat(1 << 20);
    expect(accepts({ ...validEvent(), label: big })?.label).toHaveLength(1 << 20);
    expect(accepts({ ...validEvent(), id: big })?.id).toHaveLength(1 << 20);
  });

  it('a 1 MB blank label (rejected)', () => {
    rejects({ ...validEvent(), label: ' '.repeat(1 << 20) }, 'label');
  });
});

describe('validateSoundEvent result shape', () => {
  it('drops fields outside the contract', () => {
    const event = accepts({ ...validEvent(), samples: [1, 2, 3], embedding: new Float32Array(4), extra: 'x' });
    expect(Object.keys(event ?? {}).sort()).toEqual([...FIELDS].sort());
  });

  it('returns a new object', () => {
    const input = validEvent();
    const event = accepts(input);
    expect(event).not.toBe(input);
    expect(event).toEqual(input);
  });

  it('does not mutate the input', () => {
    const input = Object.freeze({ ...validEvent(), extra: { nested: true } });
    validateSoundEvent(input);
    const bad = { ...validEvent(), t: -5, extra: 1 };
    validateSoundEvent(bad);
    expect(bad).toEqual({ ...validEvent(), t: -5, extra: 1 });
  });

  it('reports every failing field at once', () => {
    const errors = rejects({ id: '', t: NaN, class: 'dog', label: ' ', confidence: 2, bearingDeg: 999, bearingSource: 'compass', loudnessDb: 3, urgency: 'now' }, ...FIELDS);
    expect(errors).toHaveLength(9);
  });

  it('reports nothing but the field and rule, never the value', () => {
    const secret = 'Front door: Alice Smith';
    const errors = rejects({ ...validEvent(), id: secret, label: secret, class: secret, urgency: secret, bearingSource: secret, t: secret, confidence: secret, loudnessDb: secret, bearingDeg: secret });
    expect(errors.join('\n')).not.toContain('Alice');
    const blank = rejects({ ...validEvent(), label: `   ${'\t'}`, confidence: 12345.678 });
    expect(blank.join('\n')).not.toContain('12345');
  });
});
