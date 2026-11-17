import { describe, expect, it, vi } from 'vitest';
import type { CaptureState, MonoFrame, StereoFrame } from '../../src/audio';
import { CAPTURE_MESSAGES } from '../../src/audio/errors';
import type { HapticOutput } from '../../src/band';
import { createBearingWindow } from '../../src/bearing';
import type { Classification } from '../../src/classify';
import { createHapticEngine } from '../../src/haptics';
import { createLive } from '../../src/station/live';
import type { LiveDeps, LiveUpdate } from '../../src/station/types';

type L<T> = ((v: T) => void)[];

/** A capture the test drives: it pushes mono and stereo frames and state changes. */
function fakeCapture() {
  const mono: L<MonoFrame> = [];
  const stereo: L<StereoFrame> = [];
  const states: L<CaptureState> = [];
  const sub = <T>(list: L<T>, f: (v: T) => void) => {
    list.push(f);
    return () => void list.splice(list.indexOf(f), 1);
  };
  const emit = (s: CaptureState) => states.slice().forEach((f) => f(s));
  const capture = {
    start: vi.fn(async () => {
      const s: CaptureState = { status: 'listening', source: { kind: 'mic' }, sampleRate: 16000, channels: 2, rawProcessing: true };
      emit({ status: 'starting', source: { kind: 'mic' } });
      emit(s);
      return s;
    }),
    stop: vi.fn(async () => emit({ status: 'idle' })),
    onMonoFrame: (f: (v: MonoFrame) => void) => sub(mono, f),
    onStereoFrame: (f: (v: StereoFrame) => void) => sub(stereo, f),
    onStateChange: (f: (v: CaptureState) => void) => sub(states, f),
  };
  return {
    capture,
    listeners: () => mono.length + stereo.length + states.length,
    mono: (i: number, amp = 0.25) => mono.slice().forEach((f) => f({ samples: new Float32Array(15600).map((_, k) => amp * Math.sin(k / 3)), sampleRate: 16000, index: i, startSec: i * 0.4875 })),
    stereo: (left: Float32Array, right: Float32Array) => stereo.slice().forEach((f) => f({ left, right, sampleRate: 16000, startSample: 0, startSec: 0 })),
    emit,
  };
}

const c = (cls: Classification['class'], label: string, confidence = 0.6): Classification => ({ class: cls, label, confidence });
const output = (kind: HapticOutput['kind']) => ({ kind, available: () => true, play: vi.fn(), stop: vi.fn() });
const tick = () => new Promise((r) => setTimeout(r, 0));

/** A classifier whose calls resolve only when the test says so. */
function heldClassifier() {
  const calls: { samples: Float32Array; resolve: (c: Classification) => void; reject: (e: unknown) => void }[] = [];
  return {
    calls,
    classifier: { backend: 'cpu', classify: (samples: Float32Array) => new Promise<Classification>((resolve, reject) => calls.push({ samples, resolve, reject })) },
  };
}

function setup(classifier: LiveDeps['classifier']) {
  const cap = fakeCapture();
  const updates: LiveUpdate[] = [];
  let t = 0;
  const outputs = [output('simulator'), output('phone')];
  const deps: LiveDeps = { capture: cap.capture, classifier, bearing: createBearingWindow(), engine: createHapticEngine(), outputs, now: () => (t += 10), epoch: () => 1_763_000_000_000 };
  const live = createLive(deps, (u) => updates.push(u));
  return { cap, updates, live, outputs, events: () => updates.filter((u) => u.kind === 'event'), states: () => updates.filter((u) => u.kind === 'state').map((u) => (u.kind === 'state' ? u.state : '')) };
}

describe('createLive', () => {
  it('starts the microphone and reports the states', async () => {
    const { classifier } = heldClassifier();
    const s = setup(classifier);
    await s.live.start();
    expect(s.cap.capture.start).toHaveBeenCalledWith({ kind: 'mic' });
    expect(s.states()).toEqual(['starting', 'listening']);
    await s.live.stop();
    expect(s.states()).toEqual(['starting', 'listening', 'stopped']);
    expect(s.cap.listeners()).toBe(0);
  });

  it('classifies one window at a time and keeps only the newest waiting one', async () => {
    const h = heldClassifier();
    const s = setup(h.classifier);
    await s.live.start();
    s.cap.mono(0, 0.1);
    s.cap.mono(1, 0.2);
    s.cap.mono(2, 0.3);
    s.cap.mono(3, 0.4);
    expect(h.calls.length).toBe(1);
    h.calls[0].resolve(c('other', 'Silence'));
    await tick();
    expect(h.calls.length).toBe(2);
    expect(h.calls[1].samples[1]).toBeCloseTo(0.4 * Math.sin(1 / 3), 6);
    expect(s.live.dropped).toBe(2);
    h.calls[1].resolve(c('other', 'Silence'));
    await tick();
    expect(s.events()).toEqual([]);
  });

  it('turns a Knock window into one event that plays on every output, and gates a second one', async () => {
    const h = heldClassifier();
    const s = setup(h.classifier);
    await s.live.start();
    const left = new Float32Array(1024).map((_, k) => 0.3 * Math.sin(k / 5));
    s.cap.stereo(left, left.map((v) => v * 0.2));
    s.cap.mono(0);
    h.calls[0].resolve(c('knock', 'Knock', 0.7));
    await tick();
    const [u] = s.events();
    if (u?.kind !== 'event') throw new Error('no event');
    const r = u.result;
    expect([r.event.id, r.chosen, r.frames, r.backend, r.event.class, r.event.urgency]).toEqual(['live-1', 'live', 1, 'cpu', 'knock', 'medium']);
    expect(r.bearing.source).not.toBe('none');
    expect(r.times.label).toBe(10);
    expect(r.event.loudnessDb).toBeCloseTo(20 * Math.log10(0.25 / Math.SQRT2), 0);
    expect(r.decision.action).toBe('play');
    expect(r.played).toEqual(['simulator', 'phone']);
    for (const o of s.outputs) expect(o.play).toHaveBeenCalledTimes(1);
    s.cap.mono(1);
    h.calls[1].resolve(c('knock', 'Knock', 0.7));
    await tick();
    expect(s.events().length).toBe(1);
  });

  it('stops with a failure after five failed windows in a row', async () => {
    const h = heldClassifier();
    const s = setup(h.classifier);
    await s.live.start();
    for (let i = 0; i < 5; i++) {
      s.cap.mono(i);
      h.calls[i].reject(new Error('boom'));
      await tick();
    }
    expect(s.updates.some((u) => u.kind === 'failure' && u.code === 'classify-failed')).toBe(true);
    expect(s.cap.capture.stop).toHaveBeenCalled();
    expect(s.cap.listeners()).toBe(0);
  });

  it('ignores a classification that finishes after stop', async () => {
    const h = heldClassifier();
    const s = setup(h.classifier);
    await s.live.start();
    s.cap.mono(0);
    await s.live.stop();
    h.calls[0].resolve(c('knock', 'Knock'));
    await tick();
    expect(s.events()).toEqual([]);
    for (const o of s.outputs) expect(o.play).not.toHaveBeenCalled();
  });

  it('maps capture errors to Mic blocked or Problem with the capture message', async () => {
    const h = heldClassifier();
    const s = setup(h.classifier);
    await s.live.start();
    s.cap.emit({ status: 'error', error: { code: 'permission-denied', message: CAPTURE_MESSAGES['permission-denied'] } });
    expect(s.updates.at(-1)).toEqual({ kind: 'state', state: 'blocked', message: CAPTURE_MESSAGES['permission-denied'] });
    expect(s.cap.listeners()).toBe(0);
  });
});
