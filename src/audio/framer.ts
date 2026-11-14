// Cuts a continuous stream into fixed windows with a fixed hop. Pure, no Web Audio or DOM.
import { HOP_SIZE, WINDOW_SIZE } from './constants';

export interface Frame {
  /** 0, 1, 2, ... */
  index: number;
  /** `index * hop`, counted from the first sample pushed. */
  startSample: number;
  /** A new array of `windowSize` samples, owned by the caller. */
  samples: Float32Array;
}

export interface Framer {
  /** Returns every frame the chunk completes, in order. Does not change the chunk. */
  push(chunk: Float32Array): Frame[];
  /** Drops all buffered samples and restarts the index at 0. */
  reset(): void;
  /** Samples held for the next frame. Never more than `windowSize`. */
  readonly buffered: number;
}

export interface FramerOptions {
  windowSize?: number;
  hop?: number;
}

function checkSize(name: string, value: number): void {
  if (!Number.isInteger(value) || value <= 0) throw new RangeError(`${name} must be a positive integer, got ${value}`);
}

export function createFramer({ windowSize = WINDOW_SIZE, hop = HOP_SIZE }: FramerOptions = {}): Framer {
  checkSize('windowSize', windowSize);
  checkSize('hop', hop);
  if (hop > windowSize) throw new RangeError(`hop (${hop}) must not be greater than windowSize (${windowSize})`);

  // Ring of the last `windowSize` samples; `write` is where the next sample goes (and, when full, the oldest).
  const ring = new Float32Array(windowSize);
  let write = 0;
  let total = 0;

  return {
    push(chunk) {
      const frames: Frame[] = [];
      let pos = 0;
      while (pos < chunk.length) {
        // Frame i is complete when total reaches windowSize + i * hop. Copy up to the next such point.
        const nextEmit = total < windowSize ? windowSize : windowSize + (Math.floor((total - windowSize) / hop) + 1) * hop;
        const take = Math.min(chunk.length - pos, nextEmit - total);
        const first = Math.min(take, windowSize - write);
        ring.set(chunk.subarray(pos, pos + first), write);
        if (take > first) ring.set(chunk.subarray(pos + first, pos + take), 0);
        write = (write + take) % windowSize;
        total += take;
        pos += take;
        if (total === nextEmit) {
          const samples = new Float32Array(windowSize);
          samples.set(ring.subarray(write));
          samples.set(ring.subarray(0, write), windowSize - write);
          const index = (total - windowSize) / hop;
          frames.push({ index, startSample: index * hop, samples });
        }
      }
      return frames;
    },
    reset() {
      ring.fill(0);
      write = 0;
      total = 0;
    },
    get buffered() {
      return Math.min(total, windowSize);
    },
  };
}
