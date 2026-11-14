import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { createFramer, type Frame } from '../../src/audio/framer';

function ramp(n: number): Float32Array {
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) x[i] = i;
  return x;
}

/** Splits `x` at arbitrary points (repeats allowed, so empty chunks occur). */
function splitAt(x: Float32Array, cuts: number[]): Float32Array[] {
  const points = cuts.map((c) => c % (x.length + 1)).sort((a, b) => a - b);
  const parts: Float32Array[] = [];
  let prev = 0;
  for (const p of points) {
    parts.push(x.subarray(prev, p));
    prev = p;
  }
  parts.push(x.subarray(prev));
  return parts;
}

const sizes = fc
  .integer({ min: 1, max: 200 })
  .chain((windowSize) => fc.record({ windowSize: fc.constant(windowSize), hop: fc.integer({ min: 1, max: windowSize }) }));
const length = fc.integer({ min: 0, max: 2000 });
const cuts = fc.array(fc.nat(), { maxLength: 30 });

function run(opts: { windowSize: number; hop: number }, n: number, c: number[]): { frames: Frame[]; maxBuffered: number } {
  const f = createFramer(opts);
  const frames: Frame[] = [];
  let maxBuffered = 0;
  for (const chunk of splitAt(ramp(n), c)) {
    frames.push(...f.push(chunk));
    maxBuffered = Math.max(maxBuffered, f.buffered);
  }
  return { frames, maxBuffered };
}

describe('framer properties', () => {
  it('F1: the total frame count follows the formula', () => {
    fc.assert(
      fc.property(sizes, length, cuts, (opts, n, c) => {
        const expected = n < opts.windowSize ? 0 : Math.floor((n - opts.windowSize) / opts.hop) + 1;
        expect(run(opts, n, c).frames).toHaveLength(expected);
      }),
    );
  });

  it('F2: frame i holds samples i * hop onward, and startSample is index * hop', () => {
    fc.assert(
      fc.property(sizes, length, cuts, (opts, n, c) => {
        run(opts, n, c).frames.forEach((frame, i) => {
          expect(frame.index).toBe(i);
          expect(frame.startSample).toBe(i * opts.hop);
          expect(frame.samples).toHaveLength(opts.windowSize);
          for (let j = 0; j < opts.windowSize; j++) {
            if (frame.samples[j] !== frame.startSample + j) expect.fail(`frame ${i} sample ${j} is ${frame.samples[j]}`);
          }
        });
      }),
    );
  });

  it('F3: consecutive frames overlap by windowSize - hop equal samples', () => {
    fc.assert(
      fc.property(sizes, length, cuts, (opts, n, c) => {
        const { frames } = run(opts, n, c);
        const overlap = opts.windowSize - opts.hop;
        for (let i = 0; i + 1 < frames.length; i++) {
          expect(frames[i].samples.subarray(opts.hop)).toEqual(frames[i + 1].samples.subarray(0, overlap));
        }
      }),
    );
  });

  it('F4: different splits give identical frames', () => {
    fc.assert(
      fc.property(sizes, length, cuts, cuts, (opts, n, a, b) => {
        expect(run(opts, n, a).frames).toEqual(run(opts, n, b).frames);
      }),
    );
  });

  it('F5: frames are independent copies', () => {
    fc.assert(
      fc.property(sizes, length, cuts, (opts, n, c) => {
        // Copy each frame as it is returned, then scribble on it. If the framer shared or reused
        // an array, a later frame would come out changed.
        const f = createFramer(opts);
        const seen: Float32Array[] = [];
        for (const chunk of splitAt(ramp(n), c)) {
          const out = f.push(chunk);
          for (const fr of out) seen.push(fr.samples.slice());
          for (const fr of out) fr.samples.fill(-1);
        }
        expect(seen).toEqual(run(opts, n, []).frames.map((fr) => fr.samples));
      }),
    );
  });

  it('F6: the buffered count never exceeds windowSize', () => {
    fc.assert(
      fc.property(sizes, length, cuts, (opts, n, c) => {
        expect(run(opts, n, c).maxBuffered).toBeLessThanOrEqual(opts.windowSize);
      }),
    );
  });
});
