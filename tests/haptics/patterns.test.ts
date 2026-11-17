import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadPatterns, validatePatternData } from '../../src/haptics/patterns';

/** The six patterns of the design, as raw data. */
function goodData(): Record<string, unknown>[] {
  return [
    { class: 'knock', pulses: [{ onMs: 70, gapMs: 100 }, { onMs: 70, gapMs: 0 }] },
    { class: 'doorbell', pulses: [{ onMs: 250, gapMs: 150 }, { onMs: 250, gapMs: 0 }] },
    {
      class: 'alarm',
      pulses: [{ onMs: 150, gapMs: 100 }, { onMs: 150, gapMs: 100 }, { onMs: 150, gapMs: 0 }],
      repeat: { count: 3, pauseMs: 400 },
    },
    { class: 'baby', pulses: [{ onMs: 100, gapMs: 80 }, { onMs: 100, gapMs: 80 }, { onMs: 100, gapMs: 80 }, { onMs: 100, gapMs: 0 }] },
    { class: 'vehicle', pulses: [{ onMs: 80, gapMs: 100 }, { onMs: 400, gapMs: 0 }] },
    { class: 'voice', pulses: [{ onMs: 250, gapMs: 0 }] },
  ];
}

type Raw = Record<string, unknown>;

/** Good data with the pattern of `cls` changed by `edit`. */
function withPattern(cls: string, edit: (p: Raw) => void): Raw[] {
  const data = goodData();
  const p = data.find((x) => x.class === cls);
  if (!p) throw new Error(`no ${cls} in the test data`);
  edit(p);
  return data;
}

const pulsesOf = (p: Raw) => p.pulses as Raw[];

/** Expects at least one error that names `cls` (when given) and matches `rule`. */
function expectError(data: unknown, cls: string | null, rule: RegExp): void {
  const { errors } = validatePatternData(data);
  const hit = errors.find((e) => (cls === null || e.includes(cls)) && rule.test(e));
  expect(hit, `no error for ${cls ?? '(no class)'} matching ${rule} in ${JSON.stringify(errors)}`).toBeDefined();
}

describe('validatePatternData (R3)', () => {
  it('accepts the six design patterns with no errors and returns them', () => {
    const { patterns, errors } = validatePatternData(goodData());
    expect(errors).toEqual([]);
    expect(patterns).toEqual(goodData());
  });

  it('accepts the exact limits: pulse 40, inner gap 80, cycle 1500, total 4000, pause 300', () => {
    const data = goodData();
    data[0] = { class: 'knock', pulses: [{ onMs: 40, gapMs: 80 }, { onMs: 40, gapMs: 0 }] };
    data[5] = { class: 'voice', pulses: [{ onMs: 1500, gapMs: 0 }] };
    // 1000 * 3 + 500 * 2 = 4000
    data[2] = { class: 'alarm', pulses: [{ onMs: 1000, gapMs: 0 }], repeat: { count: 2, pauseMs: 500 } };
    expect(validatePatternData(data).errors).toEqual([]);
    expect(validatePatternData(withPattern('alarm', (p) => (p.repeat = { count: 3, pauseMs: 300 }))).errors).toEqual([]);
  });

  it('reports a missing class', () => {
    expectError(goodData().filter((p) => p.class !== 'baby'), 'baby', /missing/);
  });

  it('reports a class outside the six', () => {
    expectError([...goodData(), { class: 'siren', pulses: [{ onMs: 100, gapMs: 0 }] }], 'siren', /class/);
  });

  it('reports a pattern for other', () => {
    expectError([...goodData(), { class: 'other', pulses: [{ onMs: 100, gapMs: 0 }] }], 'other', /class/);
  });

  it('reports a second pattern for one class', () => {
    expectError([...goodData(), { class: 'knock', pulses: [{ onMs: 300, gapMs: 0 }] }], 'knock', /duplicate/);
  });

  it('reports empty pulses', () => {
    expectError(withPattern('voice', (p) => (p.pulses = [])), 'voice', /pulses/);
  });

  it('reports a non-integer onMs, NaN and Infinity', () => {
    expectError(withPattern('knock', (p) => (pulsesOf(p)[0].onMs = 70.5)), 'knock', /integer/);
    expectError(withPattern('knock', (p) => (pulsesOf(p)[0].onMs = NaN)), 'knock', /integer/);
    expectError(withPattern('knock', (p) => (pulsesOf(p)[0].gapMs = Infinity)), 'knock', /integer/);
    expectError(withPattern('knock', (p) => (pulsesOf(p)[1].onMs = '70')), 'knock', /integer/);
    expectError(withPattern('knock', (p) => delete pulsesOf(p)[1].gapMs), 'knock', /integer/);
  });

  it('reports a last gap that is not 0', () => {
    expectError(withPattern('knock', (p) => (pulsesOf(p)[1].gapMs = 100)), 'knock', /last/);
  });

  it('reports an inner gap of 50 and of 79, not 80', () => {
    expectError(withPattern('knock', (p) => (pulsesOf(p)[0].gapMs = 50)), 'knock', /gap/);
    expectError(withPattern('knock', (p) => (pulsesOf(p)[0].gapMs = 79)), 'knock', /gap/);
    expect(validatePatternData(withPattern('knock', (p) => (pulsesOf(p)[0].gapMs = 80))).errors).toEqual([]);
  });

  it('reports a pulse of 30 and of 39, not 40', () => {
    expectError(withPattern('knock', (p) => (pulsesOf(p)[1].onMs = 30)), 'knock', /pulse/);
    expectError(withPattern('knock', (p) => (pulsesOf(p)[1].onMs = 39)), 'knock', /pulse/);
    expect(validatePatternData(withPattern('knock', (p) => (pulsesOf(p)[1].onMs = 40))).errors).toEqual([]);
  });

  it('reports a cycle of 1600 and of 1501', () => {
    expectError(withPattern('voice', (p) => (p.pulses = [{ onMs: 1600, gapMs: 0 }])), 'voice', /cycle/);
    expectError(withPattern('voice', (p) => (p.pulses = [{ onMs: 1501, gapMs: 0 }])), 'voice', /cycle/);
  });

  it('reports a total of 4100 and of 4001', () => {
    // 650 * 4 + 500 * 3 = 4100
    expectError(withPattern('alarm', (p) => (p.repeat = { count: 3, pauseMs: 500 })), 'alarm', /total/);
    // 1000 * 3 + 500 * 2 + 1 = 4001
    expectError(withPattern('alarm', (p) => ((p.pulses = [{ onMs: 1001, gapMs: 0 }]), (p.repeat = { count: 2, pauseMs: 500 }))), 'alarm', /total/);
  });

  it('reports repeat.count 0 and 1.5', () => {
    expectError(withPattern('alarm', (p) => (p.repeat = { count: 0, pauseMs: 400 })), 'alarm', /count/);
    expectError(withPattern('alarm', (p) => (p.repeat = { count: 1.5, pauseMs: 400 })), 'alarm', /count/);
  });

  it('reports repeat.pauseMs 200 and 299, and a non-integer pause', () => {
    expectError(withPattern('alarm', (p) => (p.repeat = { count: 3, pauseMs: 200 })), 'alarm', /pause/);
    expectError(withPattern('alarm', (p) => (p.repeat = { count: 3, pauseMs: 299 })), 'alarm', /pause/);
    expectError(withPattern('alarm', (p) => (p.repeat = { count: 3, pauseMs: NaN })), 'alarm', /pause/);
  });

  it('reports a repeat on knock and a missing repeat on alarm', () => {
    expectError(withPattern('knock', (p) => (p.repeat = { count: 1, pauseMs: 400 })), 'knock', /repeat/);
    expectError(withPattern('alarm', (p) => delete p.repeat), 'alarm', /repeat/);
    expectError(withPattern('alarm', (p) => (p.repeat = 'twice')), 'alarm', /repeat/);
  });

  it('returns errors and does not throw for junk input', () => {
    const junk: unknown[] = [
      null, undefined, 42, 'x', {}, [null], [42], ['knock'], [{}], [{ class: 7 }], [{ class: 'knock' }],
      [{ class: 'knock', pulses: 'x' }], [{ class: 'knock', pulses: [null] }], [{ class: 'knock', pulses: [[70, 0]] }],
      [{ class: 'alarm', pulses: [{ onMs: 70, gapMs: 0 }], repeat: null }], [{ class: '__proto__', pulses: [] }],
      [{ class: 'constructor', pulses: [] }], [{ class: 'toString', pulses: [] }],
    ];
    for (const data of junk) {
      let result: ReturnType<typeof validatePatternData> | undefined;
      expect(() => (result = validatePatternData(data)), JSON.stringify(data)).not.toThrow();
      expect(result!.errors.length, JSON.stringify(data)).toBeGreaterThan(0);
      for (const e of result!.errors) expect(typeof e).toBe('string');
    }
  });

  it('copies: changing the input later does not change the result', () => {
    const data = goodData();
    const { patterns } = validatePatternData(data);
    pulsesOf(data[0])[0].onMs = 999;
    expect(patterns[0].pulses[0].onMs).toBe(70);
  });

  it('does not change its input', () => {
    const data = withPattern('knock', (p) => (pulsesOf(p)[0].gapMs = 50));
    const before = JSON.stringify(data);
    validatePatternData(data);
    expect(JSON.stringify(data)).toBe(before);
  });
});

describe('loadPatterns (R3.10, R3.11)', () => {
  afterEach(() => {
    vi.doUnmock('../../src/haptics/patterns.json');
    vi.resetModules();
  });

  it('returns the six patterns in PATTERN_CLASSES order', () => {
    const patterns = loadPatterns();
    expect(patterns.map((p) => p.class)).toEqual(['knock', 'doorbell', 'alarm', 'baby', 'vehicle', 'voice']);
    expect(patterns).toHaveLength(6);
  });

  it('returns equal values each time, and a change of one result does not reach the next', () => {
    const a = loadPatterns();
    const b = loadPatterns();
    expect(b).toEqual(a);
    expect(b).not.toBe(a);
    a[0].pulses[0].onMs = 1;
    a[2].repeat!.count = 99;
    a.pop();
    const c = loadPatterns();
    expect(c).toEqual(b);
    expect(c[0].pulses[0].onMs).not.toBe(1);
  });

  it('throws one Error that lists every problem of a bad bundled file', async () => {
    const bad = withPattern('knock', (p) => (pulsesOf(p)[0].gapMs = 50));
    bad.push({ class: 'other', pulses: [{ onMs: 100, gapMs: 0 }] });
    const vehicle = bad.find((p) => p.class === 'vehicle')!;
    vehicle.pulses = [{ onMs: 70, gapMs: 100 }, { onMs: 70, gapMs: 0 }];
    vi.resetModules();
    vi.doMock('../../src/haptics/patterns.json', () => ({ default: bad }));
    const mod = await import('../../src/haptics/patterns');
    let message = '';
    try {
      mod.loadPatterns();
    } catch (e) {
      expect(e).toBeInstanceOf(Error);
      message = (e as Error).message;
    }
    expect(message).toMatch(/knock.*gap/);
    expect(message).toMatch(/other/);
    expect(message).toMatch(/knock.*vehicle|vehicle.*knock/);
  });
});
