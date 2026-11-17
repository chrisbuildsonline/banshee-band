import { PATTERN_CLASSES } from './constants';
import { checkDistinctiveness, limitViolations } from './distinct';
import raw from './patterns.json';
import type { HapticClass, Pattern, Pulse, Repeat } from './types';

type Obj = Record<string, unknown>;

const isObject = (x: unknown): x is Obj => typeof x === 'object' && x !== null && !Array.isArray(x);
const isPatternClass = (x: unknown): x is HapticClass => typeof x === 'string' && (PATTERN_CLASSES as readonly string[]).includes(x);

/** A deep copy of a pattern, so a caller cannot change the stored one. */
function clonePattern(p: Pattern): Pattern {
  const pulses = p.pulses.map((q) => ({ onMs: q.onMs, gapMs: q.gapMs }));
  return p.repeat ? { class: p.class, pulses, repeat: { count: p.repeat.count, pauseMs: p.repeat.pauseMs } } : { class: p.class, pulses };
}

/** Reads the structure of one entry with a known class. Returns null (and adds errors) when it is malformed. */
function readPattern(cls: HapticClass, entry: Obj, errors: string[]): Pattern | null {
  const start = errors.length;
  const pulses: Pulse[] = [];
  if (!Array.isArray(entry.pulses) || entry.pulses.length === 0) {
    errors.push(`${cls}: pulses must be a non-empty array`);
  } else {
    entry.pulses.forEach((q: unknown, i: number) => {
      if (!isObject(q)) {
        errors.push(`${cls}: pulse ${i + 1} must be an object with integer onMs and gapMs`);
        return;
      }
      if (!Number.isInteger(q.onMs)) errors.push(`${cls}: pulse ${i + 1} onMs must be an integer`);
      if (!Number.isInteger(q.gapMs)) errors.push(`${cls}: pulse ${i + 1} gapMs must be an integer`);
      pulses.push({ onMs: q.onMs as number, gapMs: q.gapMs as number });
    });
    const last = pulses[pulses.length - 1];
    if (errors.length === start && last.gapMs !== 0) errors.push(`${cls}: the last pulse must have gapMs 0, not ${last.gapMs}`);
  }

  let repeat: Repeat | undefined;
  if (entry.repeat !== undefined) {
    if (!isObject(entry.repeat)) {
      errors.push(`${cls}: repeat must be an object with count and pauseMs`);
    } else {
      const { count, pauseMs } = entry.repeat;
      if (!Number.isInteger(count) || (count as number) < 1) errors.push(`${cls}: repeat.count must be an integer >= 1`);
      if (!Number.isInteger(pauseMs)) errors.push(`${cls}: repeat.pauseMs must be an integer`);
      repeat = { count: count as number, pauseMs: pauseMs as number };
    }
    if (cls !== 'alarm') errors.push(`${cls}: only alarm may have a repeat`);
  } else if (cls === 'alarm') {
    errors.push(`${cls}: alarm must have a repeat`);
  }

  if (errors.length > start) return null;
  return repeat ? { class: cls, pulses, repeat } : { class: cls, pulses };
}

/**
 * Checks raw pattern data against the rules of the pattern language: one pattern for each pattern
 * class and none for `'other'`, integer milliseconds, last gap 0, the limits on pulses, gaps, cycle,
 * total and pause, and a repeat on `alarm` only. Returns deep copies of the well-formed patterns and
 * one short error per broken rule. Never throws.
 */
export function validatePatternData(data: unknown): { patterns: Pattern[]; errors: string[] } {
  const patterns: Pattern[] = [];
  const errors: string[] = [];
  try {
    if (!Array.isArray(data)) return { patterns, errors: ['patterns: data must be an array'] };
    const seen = new Set<string>();
    data.forEach((entry: unknown, i: number) => {
      if (!isObject(entry)) {
        errors.push(`entry ${i + 1}: must be an object`);
        return;
      }
      const cls = entry.class;
      if (!isPatternClass(cls)) {
        const name = typeof cls === 'string' ? cls : `entry ${i + 1}`;
        errors.push(`${name}: class must be one of ${PATTERN_CLASSES.join(', ')} ('other' has no pattern)`);
        return;
      }
      if (seen.has(cls)) {
        errors.push(`${cls}: duplicate pattern`);
        return;
      }
      seen.add(cls);
      const p = readPattern(cls, entry, errors);
      if (p === null) return;
      patterns.push(p);
      for (const v of limitViolations(p)) errors.push(`${v.kind}: ${v.detail}`);
    });
    for (const cls of PATTERN_CLASSES) if (!seen.has(cls)) errors.push(`${cls}: missing pattern`);
  } catch {
    errors.push('patterns: data could not be read');
  }
  return { patterns, errors };
}

let loaded: Pattern[] | null = null;

/**
 * The bundled `patterns.json`, validated (and checked with `checkDistinctiveness`) on the first call,
 * in `PATTERN_CLASSES` order. Each call returns a fresh deep copy. Throws one `Error` listing every
 * problem if the bundled file is bad; this is the only function of the module that throws on data.
 */
export function loadPatterns(): Pattern[] {
  if (loaded === null) {
    const { patterns, errors } = validatePatternData(raw);
    const violations = checkDistinctiveness(patterns).map((v) => `${v.kind}: ${v.detail}`);
    const problems = [...new Set([...errors, ...violations])];
    if (problems.length > 0) throw new Error(`src/haptics/patterns.json is invalid:\n${problems.join('\n')}`);
    loaded = PATTERN_CLASSES.map((cls) => patterns.find((p) => p.class === cls)!);
  }
  return loaded.map(clonePattern);
}
