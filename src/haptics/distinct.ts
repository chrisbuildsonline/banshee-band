import { DISTINCT_TIMING_MS, MAX_PATTERN_MS, MAX_TOTAL_MS, MIN_GAP_MS, MIN_PULSE_MS, MIN_REPEAT_PAUSE_MS } from './constants';
import type { Pattern, Violation } from './types';

/** Length of one pass through the pulse list: the sum of every `onMs` and `gapMs`. */
export function cycleMs(p: Pattern): number {
  return p.pulses.reduce((sum, q) => sum + q.onMs + q.gapMs, 0);
}

/** Length of the whole pattern with repeats: `cycle * (1 + count) + pauseMs * count`. */
export function totalMs(p: Pattern): number {
  const count = p.repeat ? p.repeat.count : 0;
  const pause = p.repeat ? p.repeat.pauseMs : 0;
  return cycleMs(p) * (1 + count) + pause * count;
}

/**
 * Timing distance of two patterns over one cycle: the sum of `|onMs_a - onMs_b| + |gapMs_a - gapMs_b|`
 * per pulse. `Infinity` when the pulse counts differ (distinct by count). Symmetric; 0 to itself.
 */
export function patternDistance(a: Pattern, b: Pattern): number {
  if (a.pulses.length !== b.pulses.length) return Infinity;
  let d = 0;
  for (let i = 0; i < a.pulses.length; i++) {
    d += Math.abs(a.pulses[i].onMs - b.pulses[i].onMs) + Math.abs(a.pulses[i].gapMs - b.pulses[i].gapMs);
  }
  return d;
}

/** The limit violations of one pattern (pulse, inner gap, cycle, total and pause limits). */
export function limitViolations(p: Pattern): Violation[] {
  const out: Violation[] = [];
  const cls = p.class;
  const v = (kind: Violation['kind'], detail: string) => out.push({ kind, classes: [cls], detail: `${cls} ${detail}` });
  const last = p.pulses.length - 1;
  p.pulses.forEach((q, i) => {
    if (q.onMs < MIN_PULSE_MS) v('pulse-too-short', `pulse ${i + 1} is ${q.onMs} ms, under ${MIN_PULSE_MS} ms`);
    if (i < last && q.gapMs < MIN_GAP_MS) v('gap-too-short', `gap after pulse ${i + 1} is ${q.gapMs} ms, under ${MIN_GAP_MS} ms`);
  });
  const cycle = cycleMs(p);
  if (cycle > MAX_PATTERN_MS) v('cycle-too-long', `cycle is ${cycle} ms, over ${MAX_PATTERN_MS} ms`);
  const total = totalMs(p);
  if (total > MAX_TOTAL_MS) v('total-too-long', `total is ${total} ms, over ${MAX_TOTAL_MS} ms`);
  if (p.repeat && p.repeat.pauseMs < MIN_REPEAT_PAUSE_MS) {
    v('pause-too-short', `repeat pause is ${p.repeat.pauseMs} ms, under ${MIN_REPEAT_PAUSE_MS} ms`);
  }
  return out;
}

/**
 * Every rule of the pattern language that a list of structurally valid patterns breaks: the limits of
 * each pattern, then every pair that is not distinct (same pulse count and timing distance under
 * `DISTINCT_TIMING_MS`). Empty when the set is good. Never throws for validated patterns.
 */
export function checkDistinctiveness(patterns: readonly Pattern[]): Violation[] {
  const out: Violation[] = patterns.flatMap(limitViolations);
  for (let i = 0; i < patterns.length; i++) {
    for (let j = i + 1; j < patterns.length; j++) {
      const a = patterns[i];
      const b = patterns[j];
      const d = patternDistance(a, b);
      if (d < DISTINCT_TIMING_MS) {
        out.push({
          kind: 'not-distinct',
          classes: [a.class, b.class],
          detail: `${a.class} and ${b.class} both have ${a.pulses.length} pulses and a timing distance of ${d} ms, under ${DISTINCT_TIMING_MS} ms`,
        });
      }
    }
  }
  return out;
}
