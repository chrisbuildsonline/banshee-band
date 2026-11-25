import { TRAIL_ALPHA } from './constants';

const FAINTEST = TRAIL_ALPHA[TRAIL_ALPHA.length - 1];

/**
 * The body alpha of a ghost in trail mode: `TRAIL_ALPHA` by rank (0 is the newest), the faintest step beyond the
 * list, and the faintest step for a latest ghost older than `ttlMs` (it stays, but reads as old). Pure.
 */
export function trailAlpha(rank: number, ageMs: number, ttlMs: number): number {
  if (rank === 0 && ageMs > ttlMs) return FAINTEST;
  return TRAIL_ALPHA[rank] ?? FAINTEST;
}
