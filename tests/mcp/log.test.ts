import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { appendRecord, eventStats, logPath, parseLog, readLog, recentEvents, type LogRecord } from '../../mcp/log';

const ev = (over: Partial<LogRecord> = {}): LogRecord => ({
  id: 'e1',
  t: 1000,
  class: 'knock',
  label: 'Knock',
  confidence: 0.5,
  bearingDeg: -40,
  bearingSource: 'gcc-phat',
  loudnessDb: -20,
  urgency: 'medium',
  ...over,
});
const line = (v: unknown) => JSON.stringify(v);

describe('logPath', () => {
  it('uses BANSHEE_LOG when set and non-empty', () => {
    expect(logPath({ BANSHEE_LOG: '/tmp/x.jsonl' }, '/repo')).toBe('/tmp/x.jsonl');
  });
  it('defaults to .banshee/events.jsonl under the working directory', () => {
    expect(logPath({}, '/repo')).toBe(join('/repo', '.banshee', 'events.jsonl'));
    expect(logPath({ BANSHEE_LOG: '' }, '/repo')).toBe(join('/repo', '.banshee', 'events.jsonl'));
  });
  it('resolves a relative BANSHEE_LOG against the working directory', () => {
    expect(logPath({ BANSHEE_LOG: 'logs/a.jsonl' }, '/repo')).toBe(join('/repo', 'logs', 'a.jsonl'));
  });
});

describe('parseLog', () => {
  it('keeps valid records with clip and side', () => {
    const { records, skipped } = parseLog(line(ev({ clip: 'knock-01', side: 'left' })) + '\n');
    expect(skipped).toBe(0);
    expect(records).toEqual([ev({ clip: 'knock-01', side: 'left' })]);
  });
  it('ignores blank lines and does not count them', () => {
    const { records, skipped } = parseLog(`\n${line(ev())}\n   \n\r\n${line(ev({ id: 'e2' }))}`);
    expect(records.map((r) => r.id)).toEqual(['e1', 'e2']);
    expect(skipped).toBe(0);
  });
  it('skips and counts junk JSON, contract failures, a bad clip and a bad side', () => {
    const text = [
      '{not json',
      line(ev({ confidence: 2 })),
      line({ hello: 'world' }),
      line([1, 2]),
      line(null),
      line(ev({ clip: '../etc' })),
      line({ ...ev(), clip: 5 }),
      line({ ...ev(), side: 'up' }),
      line(ev({ id: 'ok' })),
    ].join('\n');
    const { records, skipped } = parseLog(text);
    expect(records.map((r) => r.id)).toEqual(['ok']);
    expect(skipped).toBe(8);
  });
  it('drops extra fields', () => {
    const { records } = parseLog(line({ ...ev(), audio: [1, 2, 3] }));
    expect(records[0]).toEqual(ev());
    expect('audio' in records[0]).toBe(false);
  });
});

describe('readLog and appendRecord', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'banshee-log-'));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('treats a missing file as an empty log', () => {
    expect(readLog(join(dir, 'nope', 'events.jsonl'))).toEqual({ records: [], skipped: 0 });
  });
  it('appends one line, creating the folder, and reads it back', () => {
    const path = join(dir, 'a', 'b', 'events.jsonl');
    expect(appendRecord(path, ev({ clip: 'knock-01', side: 'right' }))).toEqual({ ok: true });
    expect(appendRecord(path, ev({ id: 'e2' }))).toEqual({ ok: true });
    expect(readFileSync(path, 'utf8').split('\n')).toHaveLength(3);
    expect(readLog(path).records.map((r) => r.id)).toEqual(['e1', 'e2']);
    expect(readLog(path).records[0].side).toBe('right');
  });
  it('refuses an invalid record and writes nothing', () => {
    const path = join(dir, 'events.jsonl');
    const bad = appendRecord(path, ev({ loudnessDb: 3 }));
    expect(bad.ok).toBe(false);
    expect(appendRecord(path, ev({ side: 'up' as never })).ok).toBe(false);
    expect(appendRecord(path, ev({ clip: 'a/b' })).ok).toBe(false);
    expect(existsSync(path)).toBe(false);
  });
  it('counts junk lines already in the file', () => {
    const path = join(dir, 'events.jsonl');
    writeFileSync(path, `garbage\n${line(ev())}\n`);
    expect(readLog(path)).toEqual({ records: [ev()], skipped: 1 });
  });
});

describe('recentEvents', () => {
  const records = [ev({ id: 'a', t: 10 }), ev({ id: 'b', t: 30, class: 'alarm', urgency: 'high' }), ev({ id: 'c', t: 20 }), ev({ id: 'd', t: 30 })];
  it('returns newest first, a tie goes to the later line', () => {
    expect(recentEvents(records, {}).map((r) => r.id)).toEqual(['d', 'b', 'c', 'a']);
  });
  it('defaults to 10 and honours limit', () => {
    const many = Array.from({ length: 15 }, (_, i) => ev({ id: `e${i}`, t: i }));
    expect(recentEvents(many, {})).toHaveLength(10);
    expect(recentEvents(records, { limit: 2 }).map((r) => r.id)).toEqual(['d', 'b']);
  });
  it('filters by class and by since (inclusive)', () => {
    expect(recentEvents(records, { class: 'alarm' }).map((r) => r.id)).toEqual(['b']);
    expect(recentEvents(records, { since: 20 }).map((r) => r.id)).toEqual(['d', 'b', 'c']);
    expect(recentEvents(records, { class: 'knock', since: 21 }).map((r) => r.id)).toEqual(['d']);
  });
  it('does not change its input', () => {
    const copy = structuredClone(records);
    recentEvents(records, { limit: 1 });
    expect(records).toEqual(copy);
  });
});

describe('eventStats', () => {
  it('has every key, zero-filled, on an empty log', () => {
    expect(eventStats([], {})).toEqual({
      total: 0,
      first: null,
      last: null,
      byClass: { knock: 0, doorbell: 0, alarm: 0, baby: 0, vehicle: 0, voice: 0, other: 0 },
      byUrgency: { low: 0, medium: 0, high: 0 },
      byBearingSource: { 'gcc-phat': 0, loudness: 0, none: 0 },
      meanConfidence: { knock: null, doorbell: null, alarm: null, baby: null, vehicle: null, voice: null, other: null },
      loudestDb: null,
    });
  });
  it('counts, rounds the mean to 3 decimals and finds first, last and loudest', () => {
    const records = [
      ev({ t: 50, confidence: 0.1, loudnessDb: -30 }),
      ev({ t: 10, confidence: 0.2, loudnessDb: -12.5 }),
      ev({ t: 40, confidence: 0.2, loudnessDb: -40 }),
      ev({ t: 30, class: 'alarm', urgency: 'high', confidence: 0.9, bearingDeg: null, bearingSource: 'none', loudnessDb: -15 }),
    ];
    const s = eventStats(records, {}) as Record<string, any>;
    expect(s.total).toBe(4);
    expect(s.first).toBe(10);
    expect(s.last).toBe(50);
    expect(s.byClass.knock).toBe(3);
    expect(s.byClass.alarm).toBe(1);
    expect(s.byClass.voice).toBe(0);
    expect(s.byUrgency).toEqual({ low: 0, medium: 3, high: 1 });
    expect(s.byBearingSource).toEqual({ 'gcc-phat': 3, loudness: 0, none: 1 });
    expect(s.meanConfidence.knock).toBe(0.167);
    expect(s.meanConfidence.alarm).toBe(0.9);
    expect(s.meanConfidence.baby).toBeNull();
    expect(s.loudestDb).toBe(-12.5);
  });
  it('filters by since (inclusive)', () => {
    const s = eventStats([ev({ t: 10 }), ev({ t: 20 }), ev({ t: 30 })], { since: 20 }) as Record<string, any>;
    expect(s.total).toBe(2);
    expect(s.first).toBe(20);
  });
});
