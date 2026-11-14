// Script for capture-harness.html, a test page served by the dev server only (not in the build).
// Records frame metadata for the e2e tests. Never records or shows samples.
import { createCapture, type CaptureState, type MonoFrame, type StereoFrame } from './index';

const KEEP = 200;

export interface MonoMeta {
  fields: string;
  length: number;
  sampleRate: number;
  index: number;
  startSec: number;
  startSample: number;
  rms: number;
}

export interface StereoMeta {
  fields: string;
  leftLength: number;
  rightLength: number;
  sampleRate: number;
  startSample: number;
  startSec: number;
}

export interface HarnessFrames {
  mono: MonoMeta[];
  stereo: StereoMeta[];
  monoCount: number;
  stereoCount: number;
}

declare global {
  interface Window {
    __frames: HarnessFrames;
    __states: CaptureState[];
  }
}

function rms(x: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < x.length; i++) sum += x[i] * x[i];
  return Math.sqrt(sum / x.length);
}

function keep<T>(list: T[], item: T): void {
  list.push(item);
  if (list.length > KEEP) list.shift();
}

const frames: HarnessFrames = { mono: [], stereo: [], monoCount: 0, stereoCount: 0 };
window.__frames = frames;
window.__states = [];

const capture = createCapture();
const status = document.getElementById('status')!;
const log = document.getElementById('log')!;
const clipId = document.getElementById('clip-id') as HTMLInputElement;

function showCounts(): void {
  log.textContent = `mono ${frames.monoCount}, stereo ${frames.stereoCount}`;
}

capture.onStateChange((state) => {
  window.__states.push(state);
  status.textContent = JSON.stringify(state);
});

capture.onMonoFrame((frame: MonoFrame) => {
  frames.monoCount++;
  keep(frames.mono, {
    fields: Object.keys(frame).sort().join(','),
    length: frame.samples.length,
    sampleRate: frame.sampleRate,
    index: frame.index,
    startSec: frame.startSec,
    startSample: Math.round(frame.startSec * frame.sampleRate),
    rms: rms(frame.samples),
  });
  showCounts();
});

capture.onStereoFrame((frame: StereoFrame) => {
  frames.stereoCount++;
  keep(frames.stereo, {
    fields: Object.keys(frame).sort().join(','),
    leftLength: frame.left.length,
    rightLength: frame.right.length,
    sampleRate: frame.sampleRate,
    startSample: frame.startSample,
    startSec: frame.startSec,
  });
  showCounts();
});

function resetFrames(): void {
  frames.mono.length = 0;
  frames.stereo.length = 0;
  frames.monoCount = 0;
  frames.stereoCount = 0;
  showCounts();
}

document.getElementById('start-mic')!.addEventListener('click', () => {
  resetFrames();
  void capture.start({ kind: 'mic' });
});

document.getElementById('start-clip')!.addEventListener('click', () => {
  resetFrames();
  void capture.start({ kind: 'clip', id: clipId.value.trim() });
});

document.getElementById('stop')!.addEventListener('click', () => {
  void capture.stop();
});
