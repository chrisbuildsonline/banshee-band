// banshee-log: an MCP server over stdio for the local sound log. `bun run mcp:banshee-log`.
// stdout is the protocol channel, so every console message goes to stderr.
import './vite-shim';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { SOUND_CLASSES } from '../src/events';
import { appendRecord, eventStats, logPath, readLog, recentEvents } from './log';

for (const level of ['log', 'info', 'debug', 'warn'] as const) console[level] = (...args: unknown[]) => console.error(...args);

const LOG = logPath(process.env, process.cwd());

type Result = { content: { type: 'text'; text: string }[]; isError?: boolean };
const ok = (value: unknown): Result => ({ content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] });
const fail = (text: string): Result => ({ content: [{ type: 'text', text }], isError: true });

/** Runs a handler and turns a throw into an error result, so one bad call never ends the session. */
const safe =
  <A>(handler: (args: A) => Promise<Result> | Result) =>
  async (args: A): Promise<Result> => {
    try {
      return await handler(args);
    } catch (e) {
      return fail(`banshee-log: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

const since = z.number().min(0).optional().describe('Only events at or after this time (epoch ms, inclusive).');

const server = new McpServer({ name: 'banshee-log', version: '0.1.0' });

server.registerTool(
  'recent_events',
  {
    title: 'Recent sound events',
    description:
      'The newest sound events in the local Banshee Band log (.banshee/events.jsonl or BANSHEE_LOG), newest first. Each event has class, label, confidence, bearing (negative = left), loudness in dBFS, urgency, and the clip and side it came from when known.',
    inputSchema: {
      limit: z.number().int().min(1).max(100).default(10).describe('How many events, 1 to 100 (default 10).'),
      class: z.enum(SOUND_CLASSES).optional().describe('Only this sound class.'),
      since,
    },
  },
  safe(({ limit, class: cls, since: from }) => {
    const { records, skipped } = readLog(LOG);
    const events = recentEvents(records, { limit, class: cls, since: from });
    return ok({ log: LOG, count: events.length, skipped, events });
  }),
);

server.registerTool(
  'event_stats',
  {
    title: 'Sound log stats',
    description:
      'Totals over the local Banshee Band log: counts per sound class, urgency and bearing source, mean confidence per class, first and last time, and the loudest event. Lines that are not valid events are counted in skipped.',
    inputSchema: { since },
  },
  safe(({ since: from }) => {
    const { records, skipped } = readLog(LOG);
    return ok({ log: LOG, skipped, ...eventStats(records, { since: from }) });
  }),
);

server.registerTool(
  'replay_clip',
  {
    title: 'Replay a recorded clip',
    description:
      'Runs one of the recorded clips in public/clips (e.g. knock-01, doorbell-01, alarm-smoke-01, baby-cry-01, vehicle-horn-01, voice-speech-01) through the real pipeline, headless and offline: YAMNet on the TF.js CPU backend, the GCC-PHAT bearing on a simulated stereo pair for the chosen side, and the haptic engine. Returns the event, the haptic decision, the bearing and the stage times. Nothing buzzes. With append: true the event is also written to the log. The first call loads the model (a few seconds).',
    inputSchema: {
      clip: z.string().min(1).describe('Clip id from public/clips/manifest.json, e.g. knock-01.'),
      side: z.enum(['left', 'centre', 'right']).default('centre').describe('Which side the simulated sound comes from (default centre).'),
      append: z.boolean().default(false).describe('Also write the event to the log (default false).'),
    },
  },
  safe(async ({ clip, side, append }) => {
    // Loaded on the first call only, so the server starts without TF.js.
    const { replayClip } = await import('./replay');
    const outcome = await replayClip(clip, side);
    if (!outcome.ok) {
      if (outcome.code === 'unknown-clip') return fail(`Unknown clip "${clip}". Known clips: ${outcome.known.join(', ')}.`);
      return fail(`The replay of "${clip}" failed: ${outcome.code}.`);
    }
    const { replay } = outcome;
    let appended = false;
    if (append) {
      const written = appendRecord(LOG, { ...replay.event, id: randomUUID(), clip: replay.clip, side: replay.side });
      if (!written.ok) return fail(`The event could not be written to the log: ${written.errors.join('; ')}`);
      appended = true;
    }
    return ok({ ...replay, appended, log: LOG });
  }),
);

await server.connect(new StdioServerTransport());
