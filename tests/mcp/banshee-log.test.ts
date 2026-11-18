// Spawns the real server over stdio and calls every tool, including the bad-input cases.
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { LogRecord } from '../../mcp/log';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));

const ev = (over: Partial<LogRecord>): LogRecord => ({
  id: 'x',
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

const SEED: LogRecord[] = [
  ev({ id: 'a', t: 1000, clip: 'knock-01', side: 'left' }),
  ev({ id: 'b', t: 2000, class: 'alarm', label: 'Smoke detector, smoke alarm', urgency: 'high', confidence: 0.8, bearingDeg: null, bearingSource: 'none', loudnessDb: -10 }),
  ev({ id: 'c', t: 3000, class: 'doorbell', label: 'Doorbell', confidence: 0.9, bearingDeg: 0, bearingSource: 'loudness', loudnessDb: -30, side: 'live' }),
];

interface ToolResult {
  isError?: boolean;
  content: { type: string; text: string }[];
}

async function connect(logFile: string): Promise<Client> {
  const transport = new StdioClientTransport({
    command: 'bun',
    args: ['mcp/banshee-log.ts'],
    cwd: ROOT,
    env: { ...(process.env as Record<string, string>), BANSHEE_LOG: logFile },
    stderr: 'pipe',
  });
  const client = new Client({ name: 'banshee-log-test', version: '0.0.0' });
  await client.connect(transport);
  return client;
}

const call = async (client: Client, name: string, args: Record<string, unknown> = {}) => (await client.callTool({ name, arguments: args })) as ToolResult;
const json = (r: ToolResult) => {
  expect(r.isError ?? false).toBe(false);
  expect(r.content).toHaveLength(1);
  expect(r.content[0].type).toBe('text');
  return JSON.parse(r.content[0].text);
};

describe('banshee-log MCP server over stdio', { timeout: 180_000 }, () => {
  let dir: string;
  let logFile: string;
  let client: Client;

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'banshee-mcp-'));
    logFile = join(dir, 'events.jsonl');
    writeFileSync(logFile, [JSON.stringify(SEED[0]), 'not json at all', JSON.stringify(SEED[1]), JSON.stringify(SEED[2])].join('\n') + '\n');
    client = await connect(logFile);
  }, 60_000);

  afterAll(async () => {
    await client?.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('lists the three tools with descriptions', async () => {
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(['event_stats', 'recent_events', 'replay_clip']);
    for (const t of tools) expect(t.description?.length).toBeGreaterThan(20);
  });

  it('recent_events: newest first, with the log path and the skipped junk line', async () => {
    const out = json(await call(client, 'recent_events'));
    expect(out.log).toBe(logFile);
    expect(out.skipped).toBe(1);
    expect(out.count).toBe(3);
    expect(out.events.map((e: LogRecord) => e.id)).toEqual(['c', 'b', 'a']);
    expect(out.events[2]).toEqual(SEED[0]);
  });

  it('recent_events: limit, class and since', async () => {
    expect(json(await call(client, 'recent_events', { limit: 1 })).events.map((e: LogRecord) => e.id)).toEqual(['c']);
    expect(json(await call(client, 'recent_events', { class: 'alarm' })).events.map((e: LogRecord) => e.id)).toEqual(['b']);
    expect(json(await call(client, 'recent_events', { since: 2000 })).events.map((e: LogRecord) => e.id)).toEqual(['c', 'b']);
  });

  it('event_stats: counts with every key present', async () => {
    const s = json(await call(client, 'event_stats'));
    expect(s).toMatchObject({ log: logFile, total: 3, skipped: 1, first: 1000, last: 3000, loudestDb: -10 });
    expect(s.byClass).toEqual({ knock: 1, doorbell: 1, alarm: 1, baby: 0, vehicle: 0, voice: 0, other: 0 });
    expect(s.byUrgency).toEqual({ low: 0, medium: 2, high: 1 });
    expect(s.byBearingSource).toEqual({ 'gcc-phat': 1, loudness: 1, none: 1 });
    expect(s.meanConfidence.doorbell).toBe(0.9);
    expect(s.meanConfidence.baby).toBeNull();
    expect(json(await call(client, 'event_stats', { since: 2500 })).total).toBe(1);
  });

  it('replay_clip: knock-01 on the left runs the real pipeline', async () => {
    const r = json(await call(client, 'replay_clip', { clip: 'knock-01', side: 'left' }));
    expect(r.clip).toBe('knock-01');
    expect(r.side).toBe('left');
    expect(r.expected).toBe('knock');
    expect(r.event.class).toBe('knock');
    expect(r.bearing.source).toBe('gcc-phat');
    expect(r.bearing.deg).toBeLessThan(0);
    expect(r.event.bearingDeg).toBe(r.bearing.deg);
    expect(r.decision.action).toBe('play');
    expect(typeof r.decision.pattern).toBe('string');
    expect(r.frames).toBeGreaterThan(0);
    expect(r.backend).toBe('cpu');
    expect(r.appended).toBe(false);
    // Nothing was written.
    expect(json(await call(client, 'event_stats')).total).toBe(3);
  });

  it('replay_clip with append: the event is then first in recent_events', async () => {
    const before = Date.now();
    const r = json(await call(client, 'replay_clip', { clip: 'knock-01', side: 'right', append: true }));
    expect(r.appended).toBe(true);
    expect(r.bearing.deg).toBeGreaterThan(0);
    const first = json(await call(client, 'recent_events', { limit: 1 })).events[0];
    expect(first.clip).toBe('knock-01');
    expect(first.side).toBe('right');
    expect(first.class).toBe('knock');
    expect(first.t).toBeGreaterThanOrEqual(before);
    expect(first.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(json(await call(client, 'event_stats')).total).toBe(4);
  });

  const BAD: [string, Record<string, unknown>][] = [
    ['recent_events', { limit: 0 }],
    ['recent_events', { limit: 101 }],
    ['recent_events', { limit: 2.5 }],
    ['recent_events', { limit: 'x' }],
    ['recent_events', { class: 'ghost' }],
    ['recent_events', { since: -1 }],
    ['event_stats', { since: -1 }],
    ['event_stats', { since: 'yesterday' }],
    ['replay_clip', {}],
    ['replay_clip', { clip: 'nope' }],
    ['replay_clip', { clip: '../clips/knock-01' }],
    ['replay_clip', { clip: 'knock-01', side: 'up' }],
    ['replay_clip', { clip: 'knock-01', append: 'yes' }],
  ];
  it.each(BAD)('%s %j returns isError', async (name, args) => {
    const r = await call(client, name, args);
    expect(r.isError).toBe(true);
    expect(r.content[0].type).toBe('text');
    expect(r.content[0].text.length).toBeGreaterThan(0);
  });

  it('an unknown clip lists the known clip ids', async () => {
    const r = await call(client, 'replay_clip', { clip: 'nope' });
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toContain('knock-01');
    expect(r.content[0].text).toContain('doorbell-01');
  });

  it('the server still answers after the bad calls', async () => {
    expect(json(await call(client, 'recent_events', { limit: 1 })).count).toBe(1);
  });
});

describe('banshee-log with no log file yet', { timeout: 60_000 }, () => {
  it('recent_events and event_stats are empty, not errors', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'banshee-mcp-empty-'));
    const client = await connect(join(dir, 'missing', 'events.jsonl'));
    try {
      expect(json(await call(client, 'recent_events'))).toMatchObject({ count: 0, skipped: 0, events: [] });
      expect(json(await call(client, 'event_stats'))).toMatchObject({ total: 0, first: null, last: null, loudestDb: null });
    } finally {
      await client.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
