import type { MonoFrame } from '../audio';
import type { HapticOutput } from '../band';
import { PEAK_BUCKETS } from './constants';
import { listenStateFor } from './listen-status';
import { createLiveGate } from './live-gate';
import { processEvent } from './pipeline';
import { rmsDb } from './summary';
import type { LiveDeps, LiveUpdate } from './types';
import { waveformPeaks } from './waveform';

/** Failed classifications in a row that stop a live run. */
export const MAX_LIVE_FAILURES = 5;

/** What `createLive` returns. */
export interface Live {
  /** Subscribes to the capture and opens the microphone. */
  start(): Promise<void>;
  /** Unsubscribes, stops the capture and drops the waiting window. */
  stop(): Promise<void>;
  /** Windows dropped because a newer one arrived while a classification ran. */
  readonly dropped: number;
}

/**
 * The live microphone loop. Stereo frames go into `deps.bearing`; mono windows are classified one at a time,
 * and while one runs only the newest waiting window is kept. A window the gate lets through (not `other`, at
 * most once per class every 3 s) becomes an event through `processEvent` with the id `live-<n>`, plays on every
 * available output and is sent as a run result with `chosen: 'live'`. After each classified window the bearing
 * window is emptied, so a bearing covers the sound since the last window. Five failed classifications in a row
 * send a failure and stop. A result that finishes after `stop()` is ignored. No DOM.
 */
export function createLive(deps: LiveDeps, onUpdate: (u: LiveUpdate) => void): Live {
  const gate = createLiveGate();
  let unsubs: (() => void)[] = [];
  let pending: MonoFrame | null = null;
  let running = false;
  let generation = 0;
  let failures = 0;
  let dropped = 0;
  let n = 0;

  function detach(): void {
    generation++;
    for (const u of unsubs) u();
    unsubs = [];
    pending = null;
    deps.bearing.reset();
  }

  async function stop(): Promise<void> {
    if (unsubs.length === 0) return;
    generation++;
    pending = null;
    await deps.capture.stop();
    detach();
  }

  function play(window: Float32Array, cls: Awaited<ReturnType<LiveDeps['classifier']['classify']>>, ms: number): void {
    const times = { waveform: 0, label: ms, bearing: 0, pattern: 0, band: 0 };
    let t0 = deps.now();
    const peaks = waveformPeaks(window, PEAK_BUCKETS);
    times.waveform = deps.now() - t0;
    t0 = deps.now();
    const bearing = deps.bearing.result();
    times.bearing = deps.now() - t0;
    t0 = deps.now();
    const processed = processEvent({ classification: cls, bearing, loudnessDb: rmsDb(window), nowMs: t0, id: `live-${n + 1}` }, deps.engine);
    if (!processed.ok) return;
    n++;
    const { event, bearingConfidence, decision } = processed;
    times.pattern = deps.now() - t0;
    t0 = deps.now();
    const played: HapticOutput['kind'][] = [];
    if (decision.action === 'play') {
      for (const o of deps.outputs) {
        if (!o.available()) continue;
        o.play(decision.command);
        played.push(o.kind);
      }
    }
    times.band = deps.now() - t0;
    const seconds = window.length / 16000;
    const result = { ok: true as const, clipId: 'live', chosen: 'live' as const, backend: deps.classifier.backend, peaks, seconds, classification: cls, frames: 1, bearing, event, bearingConfidence, decision, played, times, at: deps.epoch() };
    onUpdate({ kind: 'event', result });
  }

  async function pump(gen: number): Promise<void> {
    running = true;
    try {
      while (pending && gen === generation) {
        const frame = pending;
        pending = null;
        const t0 = deps.now();
        let cls;
        try {
          cls = await deps.classifier.classify(frame.samples);
        } catch {
          if (gen !== generation) return;
          if (++failures >= MAX_LIVE_FAILURES) {
            onUpdate({ kind: 'failure', code: 'classify-failed' });
            await stop();
            return;
          }
          continue;
        }
        if (gen !== generation) return;
        failures = 0;
        const ms = deps.now() - t0;
        if (gate.accept(cls.class, t0)) play(frame.samples, cls, ms);
        deps.bearing.reset();
      }
    } finally {
      if (gen === generation) running = false;
    }
  }

  return {
    async start() {
      if (unsubs.length > 0) return;
      const gen = ++generation;
      running = false;
      failures = 0;
      unsubs = [
        deps.capture.onStateChange((state) => {
          const { state: s, message } = listenStateFor(state, true);
          onUpdate({ kind: 'state', state: s, message });
          if (state.status === 'error' || state.status === 'ended') detach();
        }),
        deps.capture.onStereoFrame((frame) => deps.bearing.push(frame)),
        deps.capture.onMonoFrame((frame) => {
          if (pending) dropped++;
          pending = frame;
          if (!running) void pump(gen);
        }),
      ];
      await deps.capture.start({ kind: 'mic' });
    },
    stop,
    get dropped() {
      return dropped;
    },
  };
}
