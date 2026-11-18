# Requirements: banshee-log MCP server (F13)

## Introduction

`banshee-log` is an MCP server in `mcp/`, run with Bun over stdio. It lets an agent (Kiro, Claude Code) read the local sound-event log and replay a recorded clip through the real pipeline. It needs no network, no key and no paid API.

The app is a browser PWA. It keeps only its settings in `localStorage` and never events, and a browser cannot write a file on disk. So the log is a file defined by this feature: a JSONL file of `SoundEvent` records. It is written by `replay_clip` with `append: true` and by `bun run log:seed`. This feature changes no UI and no module of `src/`.

Terms:

- **Log**: the JSONL file at `BANSHEE_LOG`, default `.banshee/events.jsonl` relative to the working directory. `.banshee/` is gitignored.
- **Record**: one line of the log: a `SoundEvent` plus optional `clip` (matches `^[\w-]+$`) and `side` (`left`, `centre`, `right` or `live`). In the log, `t` is wall-clock epoch ms.
- **Clip id**: the manifest `file` of `public/clips/manifest.json` without `.wav`, for example `knock-01`.

## Requirements

### Requirement 1: The log file

**User story:** As an agent user, I want one plain file of events, so that the log can be read, appended to and checked without the browser.

#### Acceptance criteria

1. THE log path SHALL be the value of `BANSHEE_LOG` when set and non-empty, otherwise `.banshee/events.jsonl` under the working directory.
2. WHEN the log is read, THE reader SHALL treat a missing file as an empty log, ignore blank lines, and skip and count in `skipped` every line that is not JSON, fails `validateSoundEvent`, or has a `clip` or `side` outside the rules above. Reading SHALL NOT throw.
3. WHEN a record is appended, THE writer SHALL create the folder, write exactly one line, and write only a record that passes the same check. An invalid record SHALL be refused and nothing written.

### Requirement 2: Tool `recent_events`

**User story:** As an agent, I want the newest events, so that I can say what was heard lately.

#### Acceptance criteria

1. THE tool SHALL accept `{ limit?: integer 1..100 (default 10), class?: one of SOUND_CLASSES, since?: number >= 0 }`, where `since` is epoch ms and inclusive.
2. THE tool SHALL return `{ log, count, skipped, events }`, newest first by `t`, ties by file order with the later line first.

### Requirement 3: Tool `event_stats`

**User story:** As an agent, I want totals, so that I can summarise the log without reading every line.

#### Acceptance criteria

1. THE tool SHALL accept `{ since?: number >= 0 }` and return `{ log, total, skipped, first, last, byClass, byUrgency, byBearingSource, meanConfidence, loudestDb }`.
2. `byClass`, `byUrgency` and `byBearingSource` SHALL list every value of `SOUND_CLASSES`, `URGENCY_LEVELS` and `BEARING_SOURCES`, with 0 when none. `meanConfidence` SHALL be per class, rounded to 3 decimals, and null when the class has no event.
3. `first` and `last` SHALL be the smallest and largest `t`, and `loudestDb` the largest `loudnessDb`, each null when the log (after `since`) is empty.

### Requirement 4: Tool `replay_clip`

**User story:** As an agent, I want to run a recorded clip through the real pipeline, so that I can check how it is classified and what pattern it would buzz.

#### Acceptance criteria

1. THE tool SHALL accept `{ clip: string, side?: 'left' | 'centre' | 'right' (default 'centre'), append?: boolean (default false) }`.
2. THE tool SHALL run `runSound` of `src/station/runner.ts` headless, with the real YAMNet classifier (`createClassifier`, TF.js CPU backend, model files read from `public/models/yamnet/`), the bearing estimator on the simulated stereo pair for the side, and `createHapticEngine({ rateLimitMs: 0 })`, with no outputs. Nothing SHALL buzz: `played` is empty and `latencyMs` is null.
3. THE classifier SHALL be loaded once, on the first call. THE server SHALL start without loading TF.js.
4. THE tool SHALL return `{ clip, side, expected, event, decision, bearing, frames, backend, times, appended }`, where `expected` is the manifest class, `decision` is the action with the pattern name or drop reason, and `bearing` is degrees, source and confidence.
5. WHEN `append` is true, THE tool SHALL write the event to the log with a fresh random id, `clip` and `side`, and report `appended: true`.

### Requirement 5: Results and errors

**User story:** As an agent, I want every failure to be a readable tool result, so that one bad call never ends the session.

#### Acceptance criteria

1. EACH result SHALL be one text content item holding JSON.
2. WHEN the input fails its zod schema (wrong type, out of range, unknown class or side, missing `clip`), THE tool SHALL return `isError: true`, and SHALL NOT crash or answer with a JSON-RPC error.
3. WHEN `clip` is not in the manifest, THE tool SHALL return `isError: true` with text that lists the known clip ids. A clip id with `/`, `..` or any character outside `[\w-]` SHALL never be used in a path.
4. WHEN a run fails (`clip-unreadable`, `classify-failed`, `event-invalid`), THE tool SHALL return `isError: true` with the failure code.

### Requirement 6: Module boundaries

**User story:** As a maintainer, I want the server to stay at the edge of the project, so that the app does not depend on it.

#### Acceptance criteria

1. `mcp/log.ts` SHALL import only `src/events` and `node:` modules. Its parse and its two queries SHALL be pure.
2. `mcp/replay.ts` SHALL be the only file of `mcp/` that imports the pipeline (`src/station/runner.ts`, `src/classify`, `src/haptics`). Nothing in `src/` SHALL import `mcp/`.
3. `mcp/vite-shim.ts` SHALL register a Bun plugin that loads Vite `?worker&url` imports as an empty string. It SHALL run before `replay.ts` is loaded, so the server and the seed script SHALL import `replay.ts` dynamically after it.
4. THE feature SHALL change no file of `src/`, SHALL write nowhere but the log path, and SHALL make no network request.

### Requirement 7: Seeding and registration

**User story:** As a user, I want a log to try the tools on and a one-line registration in Kiro.

#### Acceptance criteria

1. `bun run log:seed` SHALL replay every clip of `public/clips/manifest.json` through the real pipeline, with sides left, centre and right in turn, and append each event to the log.
2. `package.json` SHALL have the scripts `"mcp:banshee-log": "bun mcp/banshee-log.ts"` and `"log:seed": "bun scripts/log-clips.ts"`, and `tsconfig.json` SHALL include `mcp`.
3. `.kiro/settings/mcp.json` SHALL register `banshee-log` with `bun run mcp:banshee-log` and auto-approve only `recent_events` and `event_stats`.

### Requirement 8: Tests

**User story:** As a maintainer, I want the contract checked in code.

#### Acceptance criteria

1. `tests/mcp/log.test.ts` (Vitest, unit) SHALL cover: parse (valid, blank, junk JSON, contract failure, bad clip, bad side, missing file), `recentEvents` order, limit, class and since filters, `eventStats` counts with every key present, an empty log and rounding, append then read back, and append refusing an invalid record.
2. `tests/mcp/banshee-log.test.ts` (Vitest, integration) SHALL spawn `bun mcp/banshee-log.ts` through `StdioClientTransport` with `BANSHEE_LOG` pointing at a temp file seeded with known records and one junk line, list the three tools, and call each tool for real, including `replay_clip` of `knock-01` on the left (class `knock`, a negative `gcc-phat` bearing, a `play` decision) and with `append: true` (the event is then first in `recent_events` with `clip` `knock-01`).
3. THE integration test SHALL check `isError: true` for: `limit` 0, 101, 2.5 and `"x"`; `class` `ghost`; `since` -1; `replay_clip` with no clip, `nope`, `../clips/knock-01` and side `up`. A missing log file SHALL give an empty `recent_events`, not an error. THE test SHALL close the client and use a generous timeout for the model load.
