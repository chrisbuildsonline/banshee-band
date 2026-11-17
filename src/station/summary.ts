import { HOP_SIZE, WINDOW_SIZE } from '../audio';
import type { Classification } from '../classify';
import type { SoundClass } from '../events';

/** Most frequent value, the first to appear on a tie; `tie` instead when given and more than one value ties. */
function mode<T>(values: readonly T[], tie?: T): T {
  const counts = new Map<T, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  const max = Math.max(...counts.values());
  const top = [...counts].filter(([, n]) => n === max).map(([v]) => v);
  return top.length > 1 && tie !== undefined ? tie : top[0];
}

/**
 * One classification for a whole clip (the rule of `tests/classify/clip-run.ts`): the most frequent class of the
 * frames, `'other'` on a tie for the most. The label is the most frequent label of the winning frames (first on
 * a tie), the confidence their mean; when `'other'` wins by a tie and no frame is `'other'`, all frames are used.
 * `null` for an empty list. Pure.
 */
export function summariseClassifications(results: readonly Classification[]): Classification | null {
  if (results.length === 0) return null;
  const cls = mode<SoundClass>(results.map((r) => r.class), 'other');
  const winners = results.filter((r) => r.class === cls);
  const pool = winners.length > 0 ? winners : results;
  return { class: cls, label: mode(pool.map((r) => r.label)), confidence: pool.reduce((s, r) => s + r.confidence, 0) / pool.length };
}

/** `20 * log10(rms)` in dBFS, floored at -120 and capped at 0; all zeros give -120, a `NaN` sample gives `NaN`. Pure. */
export function rmsDb(samples: Float32Array): number {
  let sum = 0;
  for (const s of samples) sum += s * s;
  const rms = samples.length > 0 ? Math.sqrt(sum / samples.length) : 0;
  if (Number.isNaN(rms)) return Number.NaN;
  return Math.min(0, Math.max(-120, 20 * Math.log10(rms)));
}

/**
 * Largest `rmsDb` over windows of `WINDOW_SIZE` (15600) samples that start every `HOP_SIZE` (7800) and end inside
 * the clip; one window of everything for a shorter clip. The event's `loudnessDb`. Pure.
 */
export function loudestRmsDb(samples: Float32Array): number {
  if (samples.length < WINDOW_SIZE) return rmsDb(samples);
  let best = -Infinity;
  for (let start = 0; start + WINDOW_SIZE <= samples.length; start += HOP_SIZE) {
    const db = rmsDb(samples.subarray(start, start + WINDOW_SIZE));
    if (Number.isNaN(db)) return db;
    best = Math.max(best, db);
  }
  return best;
}
