import { describe, expect, it } from 'vitest';
import { createFramer } from '../../src/audio/framer';

/** Ramp: sample n has value n (exact in Float32 up to 2^24). */
function ramp(from: number, n: number): Float32Array {
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) x[i] = from + i;
  return x;
}

describe('createFramer with the default 15600 / 7800', () => {
  it('gives no frame for fewer than 15600 samples', () => {
    const f = createFramer();
    expect(f.push(ramp(0, 15599))).toEqual([]);
  });

  it('gives one frame for exactly 15600 samples', () => {
    const f = createFramer();
    const frames = f.push(ramp(0, 15600));
    expect(frames).toHaveLength(1);
    expect(frames[0].index).toBe(0);
    expect(frames[0].startSample).toBe(0);
    expect(frames[0].samples).toEqual(ramp(0, 15600));
  });

  it('gives two frames for 15600 + 7800 samples, the second starting at 7800', () => {
    const f = createFramer();
    const frames = [...f.push(ramp(0, 15600)), ...f.push(ramp(15600, 7800))];
    expect(frames.map((fr) => fr.index)).toEqual([0, 1]);
    expect(frames[1].startSample).toBe(7800);
    expect(frames[1].samples).toEqual(ramp(7800, 15600));
  });

  it('gives one frame for 23399 samples (the tail is dropped)', () => {
    expect(createFramer().push(ramp(0, 23399))).toHaveLength(1);
  });

  it('gives four frames at once for one chunk of 40000 samples', () => {
    const frames = createFramer().push(ramp(0, 40000));
    expect(frames.map((fr) => fr.startSample)).toEqual([0, 7800, 15600, 23400]);
    for (const fr of frames) {
      expect(fr.samples).toHaveLength(15600);
      expect(fr.samples[0]).toBe(fr.startSample);
      expect(fr.samples[15599]).toBe(fr.startSample + 15599);
    }
  });

  it('never buffers more than one window', () => {
    const f = createFramer();
    f.push(ramp(0, 40000));
    expect(f.buffered).toBeLessThanOrEqual(15600);
  });
});

describe('createFramer behaviour', () => {
  it('reset drops buffered samples and restarts the index at 0', () => {
    const f = createFramer({ windowSize: 4, hop: 2 });
    f.push(ramp(0, 7));
    f.reset();
    expect(f.buffered).toBe(0);
    expect(f.push(ramp(100, 3))).toEqual([]);
    const frames = f.push(ramp(103, 1));
    expect(frames).toHaveLength(1);
    expect(frames[0]).toEqual({ index: 0, startSample: 0, samples: ramp(100, 4) });
  });

  it('returns new arrays the framer does not touch afterwards', () => {
    const f = createFramer({ windowSize: 4, hop: 2 });
    const [first] = f.push(ramp(0, 4));
    const kept = first.samples.slice();
    first.samples.fill(-1);
    const [second] = f.push(ramp(4, 2));
    expect(second.samples).toEqual(ramp(2, 4));
    f.push(ramp(6, 10));
    expect(first.samples).toEqual(new Float32Array(4).fill(-1));
    expect(kept).toEqual(ramp(0, 4));
  });

  it('does not mutate the chunk', () => {
    const f = createFramer({ windowSize: 5, hop: 3 });
    const x = ramp(0, 20);
    f.push(x);
    expect(x).toEqual(ramp(0, 20));
  });

  it('accepts a hop equal to the window (no overlap)', () => {
    const frames = createFramer({ windowSize: 3, hop: 3 }).push(ramp(0, 10));
    expect(frames.map((fr) => fr.startSample)).toEqual([0, 3, 6]);
  });

  it('accepts empty chunks', () => {
    const f = createFramer({ windowSize: 2, hop: 1 });
    expect(f.push(new Float32Array(0))).toEqual([]);
    f.push(ramp(0, 1));
    expect(f.push(new Float32Array(0))).toEqual([]);
    expect(f.push(ramp(1, 1))).toHaveLength(1);
  });
});

describe('createFramer options', () => {
  const bad: [string, { windowSize?: number; hop?: number }][] = [
    ['windowSize 0', { windowSize: 0 }],
    ['windowSize -1', { windowSize: -1 }],
    ['windowSize 1.5', { windowSize: 1.5 }],
    ['windowSize NaN', { windowSize: Number.NaN }],
    ['windowSize Infinity', { windowSize: Number.POSITIVE_INFINITY }],
    ['hop 0', { hop: 0 }],
    ['hop -1', { hop: -1 }],
    ['hop 2.5', { hop: 2.5 }],
    ['hop NaN', { hop: Number.NaN }],
    ['hop greater than windowSize', { windowSize: 10, hop: 11 }],
    ['hop greater than the default window', { hop: 15601 }],
  ];
  for (const [label, options] of bad) {
    it(`${label} throws a RangeError`, () => {
      expect(() => createFramer(options)).toThrow(RangeError);
    });
  }
});
