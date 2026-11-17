import type { HapticCommand } from '../haptics';

/** Motor levels, each in [0, 1] as the engine built them. */
export interface Levels {
  left: number;
  right: number;
}

/** The two timer functions the player uses, injected so tests can drive it with a fake clock. */
export interface Scheduler {
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

/**
 * The browser timers. `globalThis.setTimeout` and `clearTimeout` are looked up on each call, not when
 * this module loads, so a clock installed later (Playwright's `page.clock`) still controls the player.
 */
export const browserScheduler: Scheduler = {
  setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
  clearTimeout: (handle) => globalThis.clearTimeout(handle as ReturnType<typeof globalThis.setTimeout>),
};

/** Plays one command at a time as timed motor levels. */
export interface SegmentPlayer {
  /** Starts a command, cancelling the one before it without its final 0/0. */
  play(command: HapticCommand): void;
  /** Cancels the playing command and emits 0/0 once; does nothing when nothing plays. */
  stop(): void;
}

/**
 * Creates a segment player that calls `onLevels` with the levels of each segment at its start offset
 * (the sum of the `ms` before it) and with 0/0 at `command.totalMs`. The first segment is emitted inside
 * `play`; every later offset is scheduled at once from the call of `play`, never chained, so a late timer
 * delays only itself. The player reads no clock and uses only `scheduler`. Levels are passed as given,
 * in a fresh object each time. A throwing `onLevels` is ignored so the later emissions still happen.
 */
export function createSegmentPlayer(onLevels: (levels: Levels) => void, scheduler: Scheduler): SegmentPlayer {
  let handles: unknown[] = [];
  let playing = false;
  // Bumped by every play and stop, so a timer of an older command emits nothing even if it still fires.
  let generation = 0;

  function emit(left: number, right: number): void {
    try {
      onLevels({ left, right });
    } catch {
      // A UI bug must not freeze the motors on: keep going with the later emissions.
    }
  }

  function cancel(): void {
    for (const handle of handles) scheduler.clearTimeout(handle);
    handles = [];
    generation++;
  }

  function at(offset: number, gen: number, run: () => void): void {
    handles.push(scheduler.setTimeout(() => {
      if (gen === generation) run();
    }, offset));
  }

  return {
    play(command) {
      cancel();
      const gen = generation;
      const segments = command.segments;
      if (segments.length === 0) {
        playing = false;
        emit(0, 0);
        return;
      }
      playing = true;
      let offset = 0;
      segments.forEach((segment, i) => {
        const { left, right } = segment;
        if (i === 0) emit(left, right);
        else at(offset, gen, () => emit(left, right));
        offset += segment.ms;
      });
      at(command.totalMs, gen, () => {
        playing = false;
        handles = [];
        emit(0, 0);
      });
    },
    stop() {
      if (!playing) return;
      cancel();
      playing = false;
      emit(0, 0);
    },
  };
}
