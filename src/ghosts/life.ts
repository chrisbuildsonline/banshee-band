import { DEFAULT_TTL_MS, MAX_GHOSTS } from './constants';
import type { GhostInput } from './types';

/** One live ghost: its input, when it was shown, when it expires, and a counter that sets its drift phase. */
export interface LiveGhost {
  input: GhostInput;
  shownAt: number;
  expiresAt: number;
  seq: number;
}

/** The pure set of live ghosts. Time is passed in. */
export interface GhostSet {
  /** Adds a ghost as the newest; drops the oldest beyond four. */
  add(input: GhostInput, now: number): void;
  /** Removes ghosts with `expiresAt <= now`. True if anything was removed. */
  prune(now: number): boolean;
  /** Live ghosts, newest first. */
  items(): readonly LiveGhost[];
  /** The earliest expiry, or null when empty or every ghost lives forever. */
  nextExpiry(): number | null;
  /** Removes every ghost. */
  clear(): void;
}

/** A ttl that is a positive number (`Infinity` included), else the 8000 ms default. */
export function resolveTtl(ttlMs: unknown): number {
  return typeof ttlMs === 'number' && ttlMs > 0 ? ttlMs : DEFAULT_TTL_MS;
}

/**
 * Creates an empty ghost set whose ghosts live `ttlMs` (validated once). With `trail`, the newest ghost never
 * expires; once a newer one arrives it expires `ttlMs` after its own show (at once if that has passed).
 */
export function createGhostSet(ttlMs: number, trail = false): GhostSet {
  const ttl = resolveTtl(ttlMs);
  let list: LiveGhost[] = [];
  let seq = 0;
  return {
    add(input, now) {
      if (trail) list = list.map((g) => ({ ...g, expiresAt: g.shownAt + ttl })).filter((g) => g.expiresAt > now);
      const expiresAt = trail ? Number.POSITIVE_INFINITY : now + ttl;
      list = [{ input, shownAt: now, expiresAt, seq: seq++ }, ...list].slice(0, MAX_GHOSTS);
    },
    prune(now) {
      const kept = list.filter((g) => g.expiresAt > now);
      const removed = kept.length !== list.length;
      list = kept;
      return removed;
    },
    items: () => list,
    nextExpiry() {
      const finite = list.map((g) => g.expiresAt).filter(Number.isFinite);
      return finite.length > 0 ? Math.min(...finite) : null;
    },
    clear() {
      list = [];
    },
  };
}
