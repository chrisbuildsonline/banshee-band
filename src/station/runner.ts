import { createFramer, YAMNET_RATE } from '../audio';
import type { HapticOutput } from '../band';
import { createBearingWindow } from '../bearing';
import type { Classification } from '../classify';
import { PEAK_BUCKETS } from './constants';
import { latencyMs } from './latency';
import { processEvent } from './pipeline';
import { buildStereo, toStereoFrames } from './stereo';
import { loudestRmsDb, summariseClassifications } from './summary';
import type { RunnerDeps, RunResult, StageTimes, TrySide } from './types';
import { decodePcm16kWav } from './wav';
import { waveformPeaks } from './waveform';

/** Runs counted per set of deps, for the event ids `station-1`, `station-2`, ... */
const runCounts = new WeakMap<RunnerDeps, number>();

/**
 * Runs one clip through the five stages in order: `waveform` (load, decode, peaks), `label` (frames, classify,
 * summary), `bearing` (stereo pair for the chosen side into the real estimator), `pattern` (loudness, event,
 * engine decision) and `band` (play the command on every available output). Each stage reads `deps.now()` once
 * before and once after its work, and nothing else reads it; the event's `t` is the read at the start of
 * `pattern`. `latencyMs` is the last read minus the first (onset: the start of the run, before the clip loads;
 * output: right after the last available output was handed the pattern), or null when nothing played.
 * Returns plain data or `{ ok: false, code }`. No DOM.
 */
export async function runSound(deps: RunnerDeps, clipId: string, side: TrySide): Promise<RunResult> {
  const n = (runCounts.get(deps) ?? 0) + 1;
  runCounts.set(deps, n);
  const at = deps.epoch();
  const times = {} as StageTimes;

  // The onset of a clip run: its first clock read, before the clip is loaded.
  const onsetMs = deps.now();
  let t0 = onsetMs;
  let bytes: ArrayBuffer;
  try {
    bytes = await deps.loadClip(clipId);
  } catch {
    return { ok: false, code: 'clip-load-failed' };
  }
  const samples = decodePcm16kWav(bytes);
  if (!samples) return { ok: false, code: 'clip-unreadable' };
  const peaks = waveformPeaks(samples, PEAK_BUCKETS);
  times.waveform = deps.now() - t0;

  t0 = deps.now();
  const frames = createFramer().push(samples);
  if (frames.length === 0) return { ok: false, code: 'clip-unreadable' };
  const results: Classification[] = [];
  try {
    for (const f of frames) results.push(await deps.classifier.classify(f.samples));
  } catch {
    return { ok: false, code: 'classify-failed' };
  }
  const classification = summariseClassifications(results)!;
  times.label = deps.now() - t0;

  t0 = deps.now();
  const estimator = createBearingWindow();
  for (const f of toStereoFrames(buildStereo(samples, side), YAMNET_RATE)) estimator.push(f);
  const bearing = estimator.result();
  times.bearing = deps.now() - t0;

  t0 = deps.now();
  const processed = processEvent({ classification, bearing, loudnessDb: loudestRmsDb(samples), nowMs: t0, id: `station-${n}` }, deps.engine);
  if (!processed.ok) return { ok: false, code: 'event-invalid' };
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
  // The output: the last read, right after the last available output was handed the pattern.
  const outputMs = deps.now();
  times.band = outputMs - t0;
  const latency = played.length > 0 ? latencyMs(onsetMs, outputMs) : null;

  return { ok: true, clipId, chosen: side, backend: deps.classifier.backend ?? 'unknown', peaks, seconds: samples.length / YAMNET_RATE, classification, frames: frames.length, bearing, event, bearingConfidence, decision, played, times, latencyMs: latency, onset: 'clip', at };
}
