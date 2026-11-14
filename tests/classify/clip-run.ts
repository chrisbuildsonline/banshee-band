// The Clip run (Requirement 7), shared by the integration test and `bun run classify:report`.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createFramer } from '../../src/audio/framer';
import { SOUND_CLASSES, type SoundClass } from '../../src/events';
import type { Classification, Classifier } from '../../src/classify';
import { PUBLIC_DIR } from './fs-fetch';
import { readPcm16k } from './wav';

export const RESULTS_FILE = new URL('./clip-results.json', import.meta.url);

export interface ClipResult {
  id: string;
  file: string;
  expected: SoundClass;
  clipClass: SoundClass;
  pass: boolean;
  frames: number;
  frameAccuracy: number;
  classCounts: Record<SoundClass, number>;
  meanConfidence: number | null;
  topLabel: string | null;
}

export interface ClipReport {
  generatedBy: string;
  tfjsVersion: string;
  backend: string;
  modelSha256: string;
  threshold: number;
  overall: { clips: number; passed: number; meanFrameAccuracy: number };
  clips: ClipResult[];
}

export interface ClipRun {
  report: ClipReport;
  /** Mean classify time per clip in ms (machine-dependent, not in the Results file). */
  meanMs: Record<string, number>;
  /** Every Frame's Classification per clip, for review. */
  frames: Record<string, Classification[]>;
}

const round = (x: number) => Math.round(x * 1e4) / 1e4;

/** The most frequent value; on a tie for the most, `tie` (or the first to appear when `tie` is undefined). */
function mode<T>(values: T[], tie?: T): T | undefined {
  const counts = new Map<T, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  const max = Math.max(0, ...counts.values());
  const top = [...counts].filter(([, n]) => n === max).map(([v]) => v);
  return top.length > 1 && tie !== undefined ? tie : top[0];
}

function modelSha256(): string {
  const sums = readFileSync(join(PUBLIC_DIR, 'models/yamnet/SHA256SUMS'), 'utf8');
  const line = sums.split('\n').find((l) => l.endsWith('  model.json'));
  if (!line) throw new Error('SHA256SUMS has no entry for model.json');
  return line.split(' ')[0];
}

export async function runClips(
  classifier: Classifier,
  meta: { tfjsVersion: string; backend: string; threshold: number },
): Promise<ClipRun> {
  const manifest = JSON.parse(readFileSync(join(PUBLIC_DIR, 'clips/manifest.json'), 'utf8')) as { file: string; class: string }[];
  if (manifest.length < 6) throw new Error(`public/clips/manifest.json has ${manifest.length} entries, expected at least 6`);

  const clips: ClipResult[] = [];
  const meanMs: Record<string, number> = {};
  const frames: Record<string, Classification[]> = {};
  for (const entry of manifest) {
    const expected = entry.class as SoundClass;
    if (!SOUND_CLASSES.includes(expected)) throw new Error(`${entry.file}: class "${entry.class}" is not in SOUND_CLASSES`);
    const id = entry.file.replace(/\.wav$/, '');
    const pcm = readPcm16k(new Uint8Array(readFileSync(join(PUBLIC_DIR, 'clips', entry.file))), entry.file);

    const results: Classification[] = [];
    let ms = 0;
    for (const frame of createFramer().push(pcm)) {
      const t = performance.now();
      results.push(await classifier.classify(frame.samples));
      ms += performance.now() - t;
    }
    if (results.length === 0) throw new Error(`${entry.file} is shorter than one Frame`);
    frames[id] = results;
    meanMs[id] = ms / results.length;

    const classCounts = Object.fromEntries(SOUND_CLASSES.map((c) => [c, 0])) as Record<SoundClass, number>;
    for (const r of results) classCounts[r.class]++;
    const clipClass = mode(results.map((r) => r.class), 'other' as SoundClass)!;
    const hits = results.filter((r) => r.class === expected);
    clips.push({
      id,
      file: entry.file,
      expected,
      clipClass,
      pass: clipClass === expected,
      frames: results.length,
      frameAccuracy: round(hits.length / results.length),
      classCounts,
      meanConfidence: hits.length ? round(hits.reduce((s, r) => s + r.confidence, 0) / hits.length) : null,
      topLabel: mode(hits.map((r) => r.label)) ?? null,
    });
  }

  const report: ClipReport = {
    generatedBy: 'classify:report',
    tfjsVersion: meta.tfjsVersion,
    backend: meta.backend,
    modelSha256: modelSha256(),
    threshold: meta.threshold,
    overall: {
      clips: clips.length,
      passed: clips.filter((c) => c.pass).length,
      meanFrameAccuracy: round(clips.reduce((s, c) => s + c.frameAccuracy, 0) / clips.length),
    },
    clips,
  };
  return { report, meanMs, frames };
}
