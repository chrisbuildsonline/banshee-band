// Runs a recorded clip headless through the real pipeline: runSound with YAMNet on the TF.js CPU backend, the
// bearing estimator on the simulated stereo pair, and the haptic engine. No outputs, so nothing buzzes.
// Load this module only after `./vite-shim` (see that file).
import * as tf from '@tensorflow/tfjs';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClassifier, type Classifier } from '../src/classify';
import type { SoundClass, SoundEvent } from '../src/events';
import { createHapticEngine } from '../src/haptics';
import { runSound } from '../src/station/runner';
import type { RunFailure, StageTimes, TrySide } from '../src/station/types';

export const PUBLIC_DIR = fileURLToPath(new URL('../public/', import.meta.url));
const ORIGIN = 'http://banshee.local';
const SAFE_FILE = /^[\w-]+\.wav$/;

export interface ClipEntry {
  id: string;
  file: string;
  class: SoundClass;
  label: string;
}

export interface Replay {
  clip: string;
  side: TrySide;
  expected: SoundClass;
  event: SoundEvent;
  decision:
    | { action: 'play'; pattern: string; side: string; sideKnown: boolean; priority: number; totalMs: number; vibrate: number[] }
    | { action: 'drop'; reason: string };
  bearing: { deg: number | null; source: SoundEvent['bearingSource']; confidence: number };
  frames: number;
  backend: string;
  times: StageTimes;
}

export type ReplayOutcome = { ok: true; replay: Replay } | { ok: false; code: 'unknown-clip'; known: string[] } | { ok: false; code: RunFailure | 'model-load-failed' };

/** The clips of `public/clips/manifest.json`; `id` is the file name without `.wav`. */
export function listClips(): ClipEntry[] {
  const data = JSON.parse(readFileSync(join(PUBLIC_DIR, 'clips', 'manifest.json'), 'utf8')) as unknown;
  if (!Array.isArray(data)) return [];
  return data
    .filter((e): e is ClipEntry => typeof e?.file === 'string' && SAFE_FILE.test(e.file) && typeof e.class === 'string' && typeof e.label === 'string')
    .map((e) => ({ id: e.file.replace(/\.wav$/, ''), file: e.file, class: e.class, label: e.label }));
}

/** Serves the model files from `public/models/yamnet/` under a fake origin, so TF.js loads them with its normal code. */
const modelFetch = (async (input: RequestInfo | URL): Promise<Response> => {
  const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
  const segments = decodeURIComponent(url.pathname).split('/').filter(Boolean);
  if (url.origin !== ORIGIN || segments.includes('..') || segments[0] !== 'models' || segments[1] !== 'yamnet') {
    return new Response('Not found', { status: 404 });
  }
  const file = join(PUBLIC_DIR, ...segments);
  if (!existsSync(file) || !statSync(file).isFile()) return new Response('Not found', { status: 404 });
  return new Response(new Uint8Array(readFileSync(file)), { status: 200 });
}) as typeof fetch;

let classifier: Promise<Classifier> | null = null;

/** The classifier, loaded once on the first call (a failed load is retried on the next call). */
function getClassifier(): Promise<Classifier> {
  classifier ??= (async () => {
    await tf.setBackend('cpu');
    return createClassifier({ modelUrl: `${ORIGIN}/models/yamnet/model.json`, classMapUrl: `${ORIGIN}/models/yamnet/yamnet_class_map.csv`, fetchFunc: modelFetch });
  })().catch((e: unknown) => {
    classifier = null;
    throw e;
  });
  return classifier;
}

/** Runs the clip `id` (looked up in the manifest by equality, never used as a path) for the chosen side. */
export async function replayClip(id: string, side: TrySide): Promise<ReplayOutcome> {
  const clips = listClips();
  const clip = clips.find((c) => c.id === id);
  if (!clip) return { ok: false, code: 'unknown-clip', known: clips.map((c) => c.id) };

  let loaded: Classifier;
  try {
    loaded = await getClassifier();
  } catch {
    return { ok: false, code: 'model-load-failed' };
  }

  const result = await runSound(
    {
      loadClip: async () => {
        const bytes = readFileSync(join(PUBLIC_DIR, 'clips', clip.file));
        return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
      },
      classifier: loaded,
      engine: createHapticEngine({ rateLimitMs: 0 }),
      outputs: [],
      now: () => performance.now(),
      epoch: () => Date.now(),
    },
    clip.id,
    side,
  );
  if (!result.ok) return result;

  const { decision, bearingConfidence, frames, backend, times } = result;
  // The run's `t` is monotonic (as in the station); the log wants wall-clock epoch ms, so move it to the wall clock
  // here. (performance.timeOrigin + now() drifts from Date.now() on some machines, by seconds under load.)
  const event: SoundEvent = { ...result.event, t: Math.max(0, Date.now() - (performance.now() - result.event.t)) };
  return {
    ok: true,
    replay: {
      clip: clip.id,
      side,
      expected: clip.class,
      event,
      decision:
        decision.action === 'play'
          ? {
              action: 'play',
              pattern: decision.command.class,
              side: decision.command.side,
              sideKnown: decision.command.sideKnown,
              priority: decision.command.priority,
              totalMs: decision.command.totalMs,
              vibrate: decision.command.vibrate,
            }
          : { action: 'drop', reason: decision.reason },
      bearing: { deg: event.bearingDeg, source: event.bearingSource, confidence: bearingConfidence },
      frames,
      backend,
      times,
    },
  };
}
