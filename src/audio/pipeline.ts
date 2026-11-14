// Stereo frames to YAMNet windows: downmix, resample to 16 kHz, frame. Pure, no Web Audio or DOM.
import { YAMNET_RATE } from './constants';
import { createFramer, type Frame } from './framer';
import { createResampler } from './resampler';
import type { MonoFrame } from './types';

export interface MonoPipeline {
  /** Takes one stereo frame (equal lengths) and returns every Mono frame it completes. Reads the arrays synchronously. */
  push(left: Float32Array, right: Float32Array): MonoFrame[];
  /** Ends the stream: runs the resampler tail through the framer. Then the pipeline starts over. */
  flush(): MonoFrame[];
  /** Drops everything buffered and restarts the stream time at 0. */
  reset(): void;
}

function toMono(frames: Frame[]): MonoFrame[] {
  return frames.map(({ index, startSample, samples }) => ({
    samples,
    sampleRate: YAMNET_RATE,
    index,
    startSec: startSample / YAMNET_RATE,
  }));
}

export function createMonoPipeline(contextRate: number): MonoPipeline {
  let resampler = createResampler(contextRate, YAMNET_RATE);
  const framer = createFramer();
  let mix = new Float32Array(1024);

  return {
    push(left, right) {
      const n = left.length;
      if (right.length !== n) throw new RangeError(`left and right must have equal lengths, got ${n} and ${right.length}`);
      if (mix.length < n) mix = new Float32Array(n);
      for (let i = 0; i < n; i++) mix[i] = (left[i] + right[i]) / 2;
      return toMono(framer.push(resampler.push(mix.subarray(0, n))));
    },
    flush() {
      const frames = toMono(framer.push(resampler.flush()));
      framer.reset();
      return frames;
    },
    reset() {
      resampler = createResampler(contextRate, YAMNET_RATE);
      framer.reset();
    },
  };
}
