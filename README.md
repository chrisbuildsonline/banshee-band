# Banshee Band

Sounds you cannot hear, felt on your wrist and seen as ghosts that point to where they came from.

Built for [Kiroween 2026](https://kiroween.devpost.com/). Submissions close 2026-12-04.

## What it does

Banshee Band listens through the device microphones, classifies the sound in the browser, estimates which side it came from, and tells you in two ways. On screen, each sound appears as a ghost whose shape shows the type (knock, alarm, voice, vehicle, baby), whose position shows direction, and whose glow shows urgency. On the wrist, a small Bluetooth band plays a distinct vibration pattern per sound class, with a stronger buzz on the side the sound came from. Users choose which sounds matter and how loud they must be. Without the band, the phone vibration API acts as a fallback. All audio stays on the device.

## Stack

TypeScript, Vite, Web Audio API, TensorFlow.js with YAMNet, custom GCC-PHAT DSP module, Web Bluetooth, ESP32 firmware (Arduino C++) with two vibration motors, canvas/WebGL for ghosts, an MCP server (Bun, stdio), Vitest, static hosting. Open-source license (MIT) with the .kiro folder at the repo root.

## Development

Needs [bun](https://bun.sh). Install with `bun install`, then:

| Command | What it does |
|---|---|
| `bun run dev` | Vite dev server on http://localhost:5173 |
| `bun run build` | Type check, then static build to `dist/` |
| `bun run test` | Vitest unit and property tests, once |
| `bun run e2e` | Playwright tests: starts the dev server on port 5287 and a production build with `vite preview` on port 5288; screenshots go to `e2e/screenshots/` |
| `bun run typecheck` | `tsc --noEmit` (strict) |
| `bun run mcp:banshee-log` | Starts the `banshee-log` MCP server on stdio (see [MCP server](#mcp-server)) |
| `bun run log:seed` | Replays every sample clip from the left, centre and right through the real pipeline and appends the 18 events to the sound log |
| `bun run icons` | Regenerates `public/icons/*.png` and `public/manifest.webmanifest` from code (same bytes every run; the output is committed) |

### Install and offline

The station is an installable web app. A production build (`bun run build`) writes a service worker, `dist/sw.js`, that caches the pages, the scripts, the YAMNet model (about 16 MB) and the sample clips at the first visit, about 18 MB in all. After that one online visit the station opens, classifies and listens with no network, and the title block says "Works offline after the first visit." Your browser's install or "Add to Home Screen" option installs it. The dev server never registers the worker, so offline only works from a production build. For the same reason the offline test (`e2e/offline.spec.ts`) runs against the production build on port 5288, and `tests/pwa/build.test.ts` checks `dist/sw.js` after `bun run build` (it is skipped with a message when `dist/` is missing).

### Settings

The Settings pill in the station header opens a sheet: switch each sound class on or off, set how loud it must be to alert (−80 to −10 dB, default −50 dB), and choose where the buzz goes (phone vibration, screen only or the wristband). Changes apply at once, in Try a sound and while listening, and are saved in this browser's `localStorage` only.

### Wristband

The wristband is an ESP32 with two vibration motors, one on each side of the wrist. Press **Connect band** in Settings (under Buzz on) or on the band simulator page and pick the band in the browser's chooser; from then on each alert is sent to it as a short byte frame, and it buzzes the pattern stronger on the side the sound came from. The band only plays what it is sent; it does not listen or store anything. If it drops, the screen takes over at once.

The link uses Web Bluetooth, so it works in Chrome and Edge only. Safari and Firefox do not have it; there the Wristband option is disabled and the phone or the screen is used instead.

Parts, wiring, flashing and the byte protocol are in [firmware/README.md](firmware/README.md). Honest note: the firmware has never been compiled, flashed or tried on a real band here. The browser side is tested against a mocked `navigator.bluetooth`, and a test checks that the sketch uses the same constants as `src/band/protocol.ts`.

The design system lives in `design/DESIGN.md` and `src/ui/tokens.css`. See it at http://localhost:5173/styleguide.html.

## Latency

The pipeline card shows **Onset to output**: the measured time from the start of a sound to the moment its vibration pattern is handed to the outputs. It is read from `performance.now()` in the page, not estimated.

Measured with `e2e/latency.spec.ts` (Knock, one test at a time, `--repeat-each=5 --workers=1`) in headless Chromium from Playwright, dev server, on the development PC under WSL2; TensorFlow.js reported the `webgl` backend:

| Path | Five runs (ms) | Median |
|---|---|---|
| Try a sound, `knock-01.wav` (6.3 s clip) | 795.8, 899, 813.8, 828.8, 743.6 | 814 ms |
| Listening, fake microphone playing the same clip | 57.1, 58.6, 77.4, 74.3, 69.8 | 70 ms |

With the whole e2e suite running in parallel the same tests read about 1130 ms and 110 to 130 ms. A phone will differ.

What onset means:

- **Try a sound**: the start of the run, right after the chip press once the model is loaded. It counts fetching the clip and classifying every 0.975 s window of it (11 for this clip), then the side, the pattern and the output. The clip is processed faster than real time, so this is processing time on a whole clip, not a live delay. The one-time model load on the first press is not counted.
- **Listening**: the moment a 0.975 s microphone window reaches the page, which is the end of that window. It counts any wait behind a classification still running, then classify, side, pattern and output.

Output is the moment the last output's `play()` returned: the band simulator and phone vibration start then; for the wristband the frame has been queued for the Bluetooth write.

Not counted: the model load; the microphone, operating system and Web Audio buffering before a window reaches the page; the time the sound sat inside its window before the window ended (up to 0.975 s); the screen paint; the Bluetooth radio time and the motor spin-up. When nothing buzzed (the sound was muted in Settings or has no pattern) the card says so and shows no number.

## MCP server

`banshee-log` lets an agent such as Kiro or Claude Code ask what was heard and try a sound, offline, with no key. It runs with Bun over stdio (`mcp/banshee-log.ts`, built on `@modelcontextprotocol/sdk` with zod input schemas).

**The log.** The station is a browser app: it saves only its settings and never writes events to disk. So the server reads its own local log, a JSONL file at `BANSHEE_LOG`, by default `.banshee/events.jsonl` in the folder it runs from (gitignored). Each line is one event in the same shape as `src/events` (class, label, confidence, bearing, bearing source, loudness, urgency, with `t` in epoch ms), plus the `clip` and `side` it came from. Lines that are not valid events are skipped and counted. `bun run log:seed` fills it from the sample clips; `replay_clip` with `append: true` adds one event. The log holds event data only, never audio.

| Tool | What it does |
|---|---|
| `recent_events` | Newest events first. Optional `limit` (1 to 100, default 10), `class` (knock, doorbell, alarm, baby, vehicle, voice, other) and `since` (epoch ms). |
| `event_stats` | Counts per class, urgency and bearing source, mean confidence per class, first and last time and the loudest event. Optional `since`. |
| `replay_clip` | Runs a sample clip (`knock-01`, `doorbell-01`, `alarm-smoke-01`, `baby-cry-01`, `vehicle-horn-01`, `voice-speech-01`) through the same code as Try a sound: YAMNet on the TensorFlow.js CPU backend, the GCC-PHAT side estimate on a simulated stereo pair for `side` (left, centre or right), and the haptic engine. Returns the event, the pattern it would buzz, the bearing and the stage times. Nothing buzzes. The first call loads the model (a few seconds). `append: true` also writes the event to the log. |

Bad input (a `limit` of 0, an unknown class, an unknown clip) comes back as an error result, not a crash; an unknown clip lists the known ones.

Run it with `bun run mcp:banshee-log`. In Kiro it is already registered in `.kiro/settings/mcp.json`, so opening this repo in Kiro starts it (`recent_events` and `event_stats` are auto-approved; `replay_clip` asks, because it can write). To add it to another client, use the command `bun` with the arguments `run mcp:banshee-log`, run from the repo root, and set `BANSHEE_LOG` to point at another log file if you like.

`tests/mcp/banshee-log.test.ts` spawns the server over stdio and calls every tool, including the bad-input cases; `tests/mcp/log.test.ts` covers the log file itself.

## Kiro hooks

Four agent hooks in `.kiro/hooks/` run a check when a matching file is saved in Kiro. Each one runs a bun script through `package.json`, so you can run the same check by hand. A script prints every problem it finds and exits 1 when there is one.

| Hook | Runs on save of | Command | What it checks |
|---|---|---|---|
| Pattern distinctiveness on save | `src/haptics/patterns.json`, `patterns.ts`, `distinct.ts` | `bun run hooks:patterns` | Every vibration pattern keeps the pattern language limits, and no two patterns feel too alike (`checkDistinctiveness`). Takes an optional file path. |
| Every spec requirement has a test | spec `requirements.md` and `tasks.md`, `scripts/hooks/spec-gaps.json`, test files | `bun run hooks:spec-tests` | Every `### Requirement N` of each spec in `.kiro/specs/` is listed by a task that names a test file that exists. The 13 known gaps (review steps, gate commands, mutation scripts) are listed with their reasons in `scripts/hooks/spec-gaps.json`. A known gap that later gets a test also fails the check, so the list stays accurate. |
| No colour-only alerts | `src/station/status.ts`, `listen-status.ts`, `src/ghosts/constants.ts`, `src/band/labels.ts`, `connect.ts`, `connect.css` | `bun run hooks:colour` | The station pill, the Listen pill, the ghost urgencies and the wristband row never tell two states apart by colour alone. Each state has a word, and two states with different colours also differ in word and, where they have one, in shape. |
| Regenerate fixtures | `public/clips/*.wav`, `public/clips/manifest.json`, `src/classify/*.ts`, `src/bearing/*.ts` | `bun run hooks:fixtures` | Reruns `classify:report`, `bearing:report` and `log:seed` in order, and stops at the first one that fails. |

The scripts are in `scripts/hooks/` and their tests are in `tests/scripts/hooks/`.

## License

MIT, see LICENSE.
