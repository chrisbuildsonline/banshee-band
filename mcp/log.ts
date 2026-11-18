// The local sound log: a JSONL file of SoundEvent records. Only `src/events` and `node:` modules are imported.
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { BEARING_SOURCES, SOUND_CLASSES, URGENCY_LEVELS, validateSoundEvent, type BearingSource, type SoundClass, type SoundEvent, type Urgency } from '../src/events';

export type LogSide = 'left' | 'centre' | 'right' | 'live';
export const LOG_SIDES: readonly LogSide[] = ['left', 'centre', 'right', 'live'];

/** One line of the log: a SoundEvent (with `t` in epoch ms) plus the clip and side it came from, when known. */
export interface LogRecord extends SoundEvent {
  clip?: string;
  side?: LogSide;
}

export interface ParsedLog {
  records: LogRecord[];
  skipped: number;
}

export interface LogStats {
  total: number;
  first: number | null;
  last: number | null;
  byClass: Record<SoundClass, number>;
  byUrgency: Record<Urgency, number>;
  byBearingSource: Record<BearingSource, number>;
  meanConfidence: Record<SoundClass, number | null>;
  loudestDb: number | null;
}

export const DEFAULT_LOG = '.banshee/events.jsonl';
const CLIP_ID = /^[\w-]+$/;

/** `BANSHEE_LOG` when set and non-empty (relative to `cwd`), otherwise `.banshee/events.jsonl` under `cwd`. */
export function logPath(env: Record<string, string | undefined>, cwd: string): string {
  const fromEnv = env.BANSHEE_LOG;
  return resolve(cwd, fromEnv && fromEnv.length > 0 ? fromEnv : DEFAULT_LOG);
}

/** The checked record, or null. Extra fields are dropped. Never throws. */
function checkRecord(input: unknown): LogRecord | null {
  const v = validateSoundEvent(input);
  if (!v.ok) return null;
  const { clip, side } = input as Record<string, unknown>;
  if (clip !== undefined && (typeof clip !== 'string' || !CLIP_ID.test(clip))) return null;
  if (side !== undefined && !(LOG_SIDES as readonly unknown[]).includes(side)) return null;
  const record: LogRecord = { ...v.event };
  if (clip !== undefined) record.clip = clip as string;
  if (side !== undefined) record.side = side as LogSide;
  return record;
}

/** Records of a JSONL text. Blank lines are ignored; any other line that fails is counted in `skipped`. Pure. */
export function parseLog(text: string): ParsedLog {
  const records: LogRecord[] = [];
  let skipped = 0;
  for (const raw of text.split('\n')) {
    if (raw.trim() === '') continue;
    let value: unknown;
    try {
      value = JSON.parse(raw);
    } catch {
      skipped++;
      continue;
    }
    const record = checkRecord(value);
    if (record) records.push(record);
    else skipped++;
  }
  return { records, skipped };
}

/** The log at `path`; a missing or unreadable file is an empty log. Never throws. */
export function readLog(path: string): ParsedLog {
  try {
    if (!existsSync(path)) return { records: [], skipped: 0 };
    return parseLog(readFileSync(path, 'utf8'));
  } catch {
    return { records: [], skipped: 0 };
  }
}

/** Appends one checked record as one line, creating the folder. An invalid record is refused and nothing is written. */
export function appendRecord(path: string, record: LogRecord): { ok: true } | { ok: false; errors: string[] } {
  const v = validateSoundEvent(record);
  if (!v.ok) return v;
  const checked = checkRecord(record);
  if (!checked) return { ok: false, errors: ['clip, side: clip must match [\\w-]+ and side must be left, centre, right or live'] };
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, JSON.stringify(checked) + '\n');
  return { ok: true };
}

/** Newest first by `t` (a tie goes to the later line), filtered by class and `since` (inclusive), at most `limit` (10). Pure. */
export function recentEvents(records: readonly LogRecord[], options: { limit?: number; class?: SoundClass; since?: number }): LogRecord[] {
  const { limit = 10, class: cls, since } = options;
  return records
    .map((r, i) => ({ r, i }))
    .filter(({ r }) => (cls === undefined || r.class === cls) && (since === undefined || r.t >= since))
    .sort((a, b) => b.r.t - a.r.t || b.i - a.i)
    .slice(0, limit)
    .map(({ r }) => r);
}

const zeroes = <K extends string>(keys: readonly K[]): Record<K, number> => Object.fromEntries(keys.map((k) => [k, 0])) as Record<K, number>;

/** Counts per class, urgency and bearing source (every key present), mean confidence per class, first, last and loudest. Pure. */
export function eventStats(records: readonly LogRecord[], options: { since?: number }): LogStats {
  const { since } = options;
  const kept = since === undefined ? records : records.filter((r) => r.t >= since);
  const byClass = zeroes(SOUND_CLASSES);
  const byUrgency = zeroes(URGENCY_LEVELS);
  const byBearingSource = zeroes(BEARING_SOURCES);
  const sums = zeroes(SOUND_CLASSES);
  for (const r of kept) {
    byClass[r.class]++;
    byUrgency[r.urgency]++;
    byBearingSource[r.bearingSource]++;
    sums[r.class] += r.confidence;
  }
  const meanConfidence = Object.fromEntries(
    SOUND_CLASSES.map((c) => [c, byClass[c] === 0 ? null : Math.round((sums[c] / byClass[c]) * 1000) / 1000]),
  ) as Record<SoundClass, number | null>;
  const empty = kept.length === 0;
  return {
    total: kept.length,
    first: empty ? null : Math.min(...kept.map((r) => r.t)),
    last: empty ? null : Math.max(...kept.map((r) => r.t)),
    byClass,
    byUrgency,
    byBearingSource,
    meanConfidence,
    loudestDb: empty ? null : Math.max(...kept.map((r) => r.loudnessDb)),
  };
}
