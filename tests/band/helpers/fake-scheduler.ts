import type { Scheduler } from '../../../src/band/segment-player';

/** A manual clock. Nothing runs until the test calls `advance`. */
export interface FakeScheduler {
  scheduler: Scheduler;
  /** Moves the clock forward by `ms`, running due timers in (time, creation) order with `now()` set to each timer's time. */
  advance(ms: number): void;
  /** Runs every pending timer, however far away. */
  runAll(): void;
  now(): number;
  /** Number of timers that are scheduled and not yet run or cleared. */
  pending(): number;
}

export function createFakeScheduler(): FakeScheduler {
  let now = 0;
  let nextId = 1;
  const timers = new Map<number, { at: number; fn: () => void }>();

  function nextDue(limit: number): number | undefined {
    let best: number | undefined;
    for (const [id, t] of timers) {
      if (t.at > limit) continue;
      if (best === undefined) best = id;
      else {
        const b = timers.get(best)!;
        if (t.at < b.at || (t.at === b.at && id < best)) best = id;
      }
    }
    return best;
  }

  function runUntil(limit: number): void {
    for (let id = nextDue(limit); id !== undefined; id = nextDue(limit)) {
      const t = timers.get(id)!;
      timers.delete(id);
      now = t.at;
      t.fn();
    }
  }

  return {
    scheduler: {
      setTimeout(fn, ms) {
        const id = nextId++;
        timers.set(id, { at: now + Math.max(0, ms), fn });
        return id;
      },
      clearTimeout(handle) {
        timers.delete(handle as number);
      },
    },
    advance(ms) {
      const target = now + ms;
      runUntil(target);
      now = target;
    },
    runAll() {
      runUntil(Infinity);
    },
    now: () => now,
    pending: () => timers.size,
  };
}
