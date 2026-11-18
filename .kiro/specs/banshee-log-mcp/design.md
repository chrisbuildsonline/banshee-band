# Design: banshee-log MCP server (F13)

Requirement numbers refer to `requirements.md`.

## Overview

A stdio MCP server built with `@modelcontextprotocol/sdk` (`McpServer`, `StdioServerTransport`) and `zod` 4 input schemas. Two tools read a JSONL file. One tool runs a clip through the real pipeline headless and can append the result to that file.

```
agent (Kiro, Claude Code)
   | stdio (JSON-RPC)
mcp/banshee-log.ts  --- recent_events, event_stats ---> mcp/log.ts ---> BANSHEE_LOG (.banshee/events.jsonl)
        |                                                   ^
        +--- replay_clip (first call: dynamic import) ---> mcp/replay.ts
                                                            |  runSound (src/station/runner.ts)
                                                            |  createClassifier (TF.js CPU, files from public/models/yamnet/)
                                                            |  createHapticEngine({ rateLimitMs: 0 }), no outputs
                                                            +-- appendRecord (when append: true)
```

## Files

```
mcp/
  log.ts            logPath, parseLog, readLog, appendRecord, recentEvents, eventStats
  replay.ts         listClips, replayClip
  vite-shim.ts      Bun plugin: Vite `?worker&url` imports load as an empty string
  banshee-log.ts    server entry: three tools, stdio transport
scripts/log-clips.ts   bun run log:seed
tests/mcp/log.test.ts   banshee-log.test.ts
package.json       + "mcp:banshee-log", "log:seed"
tsconfig.json      include gains "mcp"
.kiro/settings/mcp.json   registration
```

## Log (`mcp/log.ts`, Requirements 1 to 3)

Imports `src/events` (`validateSoundEvent`, `SOUND_CLASSES`, `URGENCY_LEVELS`, `BEARING_SOURCES`, types) and `node:fs`, `node:path` only.

```ts
type LogSide = 'left' | 'centre' | 'right' | 'live';
interface LogRecord extends SoundEvent { clip?: string; side?: LogSide }

logPath(env: Record<string, string | undefined>, cwd: string): string
parseLog(text: string): { records: LogRecord[]; skipped: number }      // pure
readLog(path: string): { records: LogRecord[]; skipped: number }       // missing file -> empty, never throws
appendRecord(path: string, record: LogRecord): { ok: true } | { ok: false; errors: string[] }
recentEvents(records, { limit, class, since }): LogRecord[]            // pure
eventStats(records, { since }): Stats                                  // pure
```

- `parseLog` splits on `\n`, drops blank lines, and per line: `JSON.parse` in a try, `validateSoundEvent`, then `clip` (string matching `^[\w-]+$` when present) and `side` (one of four when present). The kept record is the validated event plus the checked `clip` and `side`; extra fields are dropped. Any failure adds 1 to `skipped`.
- `appendRecord` runs the same per-record check, then `mkdirSync(dirname, { recursive: true })` and `appendFileSync(path, JSON.stringify(record) + '\n')`. An invalid record writes nothing.
- `recentEvents` filters by `class` and `since` (inclusive), sorts by `t` descending with the later file index first on a tie (sort on `(t, index)` descending), and slices to `limit`.
- `eventStats` filters by `since`, then counts into zero-filled maps made from the three constant lists. `meanConfidence[c]` is `Math.round(mean * 1000) / 1000` or null. `first`, `last` and `loudestDb` are null on an empty set.

## Replay (`mcp/replay.ts`, Requirement 4)

Imports `src/station/runner.ts`, `src/classify`, `src/haptics`, `src/events` and `@tensorflow/tfjs`.

- `listClips()` reads `public/clips/manifest.json` and returns `{ id, file, class, label }[]`, with `id` the `file` without `.wav`.
- `replayClip(id, side)` looks the id up in `listClips()` (never builds a path from the raw input), then calls `runSound(deps, id, side)`.
- Deps: `loadClip(id)` reads `public/clips/<manifest file>` from disk; `classifier` comes from `createClassifier({ fetchFunc })` where `fetchFunc` is the file fetch of `tests/classify/fs-fetch.ts` in spirit (serves `public/` under a fake origin, refuses another origin and `..`), after `tf.setBackend('cpu')`; `engine` is `createHapticEngine({ rateLimitMs: 0 })`; `outputs` is `[]`; `now` is `performance.now()`; `epoch` is `Date.now()`.
- The classifier promise is cached in a module variable, so the model loads once.
- Result: `{ clip, side, expected, event, decision, bearing, frames, backend, times, appended: false }` from the ok run result. `decision` is `{ action: 'play', pattern }` or `{ action: 'drop', reason }`. `bearing` is `{ deg, source, confidence }` from the event and `bearingConfidence`. A failed run returns the code.
- Appending is done by the server, not by `replay.ts`: it calls `appendRecord(path, { ...event, id: randomUUID(), clip, side })`.

## Vite shim (`mcp/vite-shim.ts`, Requirement 6.3)

`src/audio` imports the worklet as `…?worker&url`, which only Vite resolves. The shim calls `Bun.plugin({ setup(build) { build.onResolve({ filter: /\?worker&url$/ }, …); build.onLoad(…) } })` and returns `export default ""`. The server entry and `scripts/log-clips.ts` import the shim first and `replay.ts` afterwards with `await import('./replay')`.

## Server (`mcp/banshee-log.ts`, Requirement 5)

- `new McpServer({ name: 'banshee-log', version })`, three `registerTool` calls, `StdioServerTransport`.
- Input schemas (zod 4): `limit` `z.number().int().min(1).max(100).default(10)`, `class` `z.enum(SOUND_CLASSES)`, `since` `z.number().min(0)`, `clip` `z.string()`, `side` `z.enum(['left','centre','right']).default('centre')`, `append` `z.boolean().default(false)`.
- Schema failures: the SDK validates input before the handler and returns a tool result with `isError: true`. The integration test checks this for each bad input; if an SDK version answers with a JSON-RPC error instead, the schema is parsed inside the handler (`safeParse`) and the failure returned as `isError: true`.
- Every handler returns `{ content: [{ type: 'text', text: JSON.stringify(value) }] }`, and with `isError: true` for failures. A handler never throws: the body is wrapped in a try, and a throw becomes an error result.
- `replay_clip`: unknown id returns `Unknown clip "<id>". Known clips: …`. The clip id is checked against the manifest list by equality, so `../clips/knock-01` is never used in a path.
- stdout is the protocol channel: nothing else writes to it. Diagnostics go to stderr, and no audio or raw sample data is logged.

## Seed script (`scripts/log-clips.ts`, Requirement 7.1)

Imports the shim, then `replay.ts`. For each manifest clip and each side of `left`, `centre`, `right`, it calls `replayClip`, and appends `{ ...event, id: randomUUID(), t: Date.now(), clip, side }` through `appendRecord`. It prints the count and the log path.

## Privacy and safety

The server is read-only except for `appendRecord` to the log path. The tools `recent_events` and `event_stats` are auto-approved in `.kiro/settings/mcp.json`; `replay_clip` is not, because it can write. Nothing is sent anywhere. Records hold event metadata only, never audio.

## Testing

- `tests/mcp/log.test.ts`: unit tests on `parseLog`, `recentEvents`, `eventStats`, `readLog` and `appendRecord` with a temp dir (Requirement 8.1).
- `tests/mcp/banshee-log.test.ts`: the stdio integration test (Requirements 8.2 and 8.3). Timeout 120 s for the first `replay_clip`.
- `tests/station/boundaries.test.ts` is unchanged: `mcp/` is not in the pure list.
