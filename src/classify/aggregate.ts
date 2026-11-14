import type { SoundClass } from '../events';
import { CLASS_PRIORITY, DEFAULT_THRESHOLD, SCORE_COUNT } from './constants';
import type { Classification, LabelMap } from './types';

/** Highest Score among `members` and the first (lowest) Index that has it; score 0 and index -1 if none. */
function best(scores: ArrayLike<number>, members: readonly number[]): { score: number; index: number } {
  let score = 0;
  let index = -1;
  for (const i of members) {
    if (index < 0 || scores[i] > score) {
      score = scores[i];
      index = i;
    }
  }
  return { score, index };
}

/**
 * Turns 521 YAMNet scores into one class. A class's Aggregate is the max over its Members (scores are
 * independent sigmoids, so a sum could pass 1). The best specific class wins if it reaches the threshold;
 * exact ties go to the class first in CLASS_PRIORITY. Otherwise the result is `other` with its own best label.
 */
export function aggregateScores(
  scores: ArrayLike<number>,
  map: LabelMap,
  options: { threshold?: number } = {},
): Classification {
  const threshold = options.threshold ?? DEFAULT_THRESHOLD;
  if (scores.length !== SCORE_COUNT) {
    throw new RangeError(`scores must have ${SCORE_COUNT} values, got ${scores.length}`);
  }
  for (let i = 0; i < SCORE_COUNT; i++) {
    const v = scores[i];
    if (!Number.isFinite(v) || v < 0 || v > 1) throw new RangeError(`scores[${i}] must be a finite number from 0 to 1`);
  }
  if (typeof threshold !== 'number' || !Number.isFinite(threshold) || threshold < 0 || threshold > 1) {
    throw new RangeError('threshold must be a finite number from 0 to 1');
  }

  let winner: SoundClass = 'other';
  let top = { score: -1, index: -1 };
  for (const cls of CLASS_PRIORITY) {
    const b = best(scores, map.members[cls]);
    if (b.score > top.score) {
      winner = cls;
      top = b;
    }
  }
  if (top.index >= 0 && top.score >= threshold) {
    return { class: winner, label: map.names[top.index], confidence: top.score };
  }
  const other = best(scores, map.members.other);
  return { class: 'other', label: map.names[other.index], confidence: other.score };
}
