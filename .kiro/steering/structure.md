---
inclusion: always
---

# Structure

```
index.html, styleguide.html, band.html, capture-harness.html   page shells (index.html: listening station page; band.html: band simulator page; capture-harness.html: test-only page for the audio capture e2e test (e2e/audio-capture.spec.ts, script src/audio/harness.ts), not linked from the app)
src/events/     SoundEvent contract: type, class constants, validator
src/audio/      microphone and clip input, stereo capture, framing
src/classify/   YAMNet loading and inference, label-to-class mapping
  constants.ts        FRAME_SIZE (15600), SCORE_COUNT (521), DEFAULT_THRESHOLD (0.15), CLASS_PRIORITY (tie-break order)
  types.ts            ClassMapEntry, LabelMap, Classification, ClassifierOptions, Classifier (with `backend`), ClassifyErrorCode
  classmap.ts         parseClassMap: the 521-row yamnet_class_map.csv text to entries, throws with the line number (pure)
  rules.ts            RULES: the exact AudioSet display names per specific class (data only)
  labelmap.ts         buildLabelMap: rules and class map to a frozen LabelMap, throws on an unknown, repeated or double-claimed name (pure)
  aggregate.ts        aggregateScores: 521 scores to one Classification, max per class, threshold, priority on ties (pure)
  errors.ts           ClassifyError with a fixed plain-language message per code (pure)
  classifier.ts       createClassifier: loads the class map and the model, warm-up, one frame at a time; the only file that imports TensorFlow.js (dynamic import)
  vite-env.d.ts       Vite client types for import.meta.env.BASE_URL
  index.ts            public exports
src/bearing/    GCC-PHAT bearing estimation
src/haptics/    priority engine and vibration pattern language
  constants.ts        pattern limits (pulse, gap, cycle, total, repeat pause), distinctness ms, bearing confidence and centre zone, rate limit, other-motor factor, default loudness, PATTERN_CLASSES, URGENCY_BASE_LEVEL, URGENCY_RANK, CLASS_WEIGHT
  types.ts            HapticClass, Side, Pulse, Repeat, Pattern, Segment, HapticCommand, HapticInput, HapticSettings, DropReason, Decision, Violation, HapticEngine
  patterns.json       the rhythm of each of the six pattern classes (data only)
  patterns.ts         validatePatternData, loadPatterns: the bundled patterns checked against the language rules (pure)
  distinct.ts         cycleMs, totalMs, patternDistance, limitViolations, checkDistinctiveness (pure)
  priority.ts         priorityOf: urgency rank and class weight to one number (pure)
  settings.ts         DEFAULT_HAPTIC_SETTINGS, resolveHapticSettings: any input to complete valid settings (pure)
  side.ts             sideOf: event and bearing confidence to left, right, centre or unknown (pure)
  command.ts          buildCommand: pattern, side, urgency and intensity to a HapticCommand with segments and a vibrate list (pure)
  engine.ts           createHapticEngine: decide() to play or drop (class off, too quiet, rate limit, lower priority), time passed in (pure)
  index.ts            public exports
src/band/       haptic outputs: one HapticOutput interface, segment player, phone vibrate, band simulator, Bluetooth wristband link
  types.ts            HapticOutput interface
  segment-player.ts   timed motor levels from a HapticCommand (injected scheduler)
  phone-output.ts     navigator.vibrate output
  protocol.ts         byte protocol v1: BAND_SERVICE_UUID, BAND_COMMAND_UUID, BAND_NAME, crc8, encodePlay, encodeStop, decodeFrame (pure)
  ble-output.ts       createBandLink: Web Bluetooth link, state, problem, serialised writes, the 'band' HapticOutput (the only file that uses `bluetooth`)
  connect.ts          mountBandConnect: the Wristband row: glyph, heading, polite status line and one pill (Connect band when idle, a disabled Connecting… while connecting, Disconnect when connected, no button without Web Bluetooth); onConnected fires after a press here
  connect.css         connect row styles, design tokens only
  labels.ts           plain-word labels: class, side, percent, pattern name, pulse count, bandStatusText (the wristband status line for each link state and problem)
  simulator.ts        mountBandSimulator: motor cards, pattern timeline, live region
  simulator.css       simulator styles, design tokens only
  index.ts            public exports
src/ghosts/     canvas ghost renderer: shape = class, position = bearing, glow = urgency
  constants.ts        sizes, margins, urgency style, class names, life and motion values
  types.ts            GhostInput, GhostLayout, FieldSize, Slot, Block, GhostField
  shapes.ts           SHAPES: one SVG path per class in a 24-unit box (data only)
  input.ts            acceptInput: validator and shape check, never throws
  outline.ts          shapeParts, pathLength, dashFor: outer/details/eyes split and the uncertain dash pattern (pure)
  layout.ts           layoutGhost, layoutGhosts, ghostBasePx, ghostBlock (pure, uses sideOf)
  life.ts             createGhostSet: newest first, cap 4, expiry (time passed in)
  text.ts             list item text, canvas label summary, data-x
  glyph.ts            glyphSpec and createGlyph: inline SVG list glyphs
  draw.ts             drawField: furniture, uncertain arc, ghosts, labels (canvas only)
  field.ts            mountGhostField: canvas, "Now:" list, timers, observers, motion
  field.css           field, list and glyph styles, design tokens only
  index.ts            public exports
src/station/    listening station (index.html): microphone or sample clip to ghost, row, pattern and pipeline view
  constants.ts        PEAK_BUCKETS, MAX_ROWS
  types.ts            TrySide, StageName, StageTimes, RunnerDeps, RunFailure, RunResult (the ok run result carries `latencyMs` and `onset`, clip or live)
  wav.ts              decodePcm16kWav: 16 kHz mono 16-bit WAV to samples (pure)
  summary.ts          summariseClassifications, rmsDb, loudestRmsDb (pure)
  waveform.ts         peak buckets for the waveform bars (pure)
  stereo.ts           simulated stereo pair for a chosen side, toStereoFrames (pure)
  format.ts           formatMs, formatClock, alertText, sideWord, dropText, failureText, classifyText, latencyNumber, latencyText ("Onset to output: 41 ms"), liveFailureText, dbText, mutedText, outputName (the output's name in the pipeline's Band tile: Band simulator, Phone vibration or Wristband) (pure)
  pipeline.ts         buildEvent and processEvent: classification and bearing to a SoundEvent (pure)
  runner.ts           runSound: load, classify, bearing, event, pattern, outputs, stage times; the latency is the run's first clock read (onset) to its last (after the outputs were handed the pattern)
  live-gate.ts        createLiveGate: per-class 3000 ms cooldown for live events (pure)
  live.ts             createLive: microphone windows to classify, bearing, event, pattern, outputs; newest window wins; each window's arrival time is its onset, so a wait behind a running classification is counted (deps injected, pure)
  latency.ts          latencyMs: onset to output in ms from two clock reads, null for a missing, non-finite or backwards value (pure)
  listen-status.ts    LISTEN_STATES and listenStateFor: capture state to Listen pill word, glyph and tint (pure)
  listen.ts           mountListenCard: Start and Stop listening, Listen status pill, note and message line
  status.ts           mountStatusPill: output state pill; renderPill and GLYPHS shared by both pills; setOutput: the pill follows the output in use (Band connected, Phone vibration fallback or Band not connected)
  try-sound.ts        mountTrySound: sound chips, side control, busy state, messages
  list.ts             mountEventList: Latest alert and Recent sounds
  pipeline-view.ts    mountPipelineView: five stage tiles with times; Label tile shows backend and classify ms; the latency figure ("Onset to output" number with a note on what is and is not counted, `data-latency-ms`, `data-latency-source`)
  settings.ts         StationSettings: per-class on/off and level (-80 to -10 dB), Buzz on output; resolveSettings, parseSettings, load and save with injected storage (key `banshee-band.settings.v1`), settingsVerdict, createSettingsEngine, isMuted, effectiveOutput, outputsFor (pure)
  settings-panel.ts   mountSettings: the Settings sheet (native dialog) with a switch and level slider per class, Buzz on radios (Wristband enabled when the browser has Web Bluetooth, disabled with an honest caption when not; the connect row sits under the radios and a connect from there sets the output to the wristband) and Reset; the Buzz on radios come from output-options.ts; settings(), setOutput() and the Show intro again pill; browserStorage
  settings.css        Settings sheet styles: side sheet from 720px, bottom sheet below, design tokens only
  output-options.ts   the Buzz on option list, PHONE_OFF, BAND_OFF, shownOutput and mountOutputOptions: the three radio tiles shared by the Settings sheet and the intro
  onboarding.ts       first-run flag (key `banshee-band.onboarded.v1`, value `done`) with injected storage: isOnboarded, shouldShowIntro, markOnboarded; INTRO_STEPS, micSupport, micStepView (the microphone step for each Listen state) (pure)
  onboarding-sheet.ts mountOnboarding: the first-run intro (native dialog built at each open): Welcome with the aid sentence, Microphone through the station's Start listening, Where should alerts buzz? through the Settings sheet; Skip intro, Escape and Done mark it seen
  onboarding.css      intro styles: centred card from 720px, bottom sheet below, design tokens only
  station.ts          mountStation: builds the page, applies the saved settings (new settings engines and outputs on each change), runs a pick and starts or stops listening; keeps the Listen state for the intro and opens the intro on the first visit; creates the wristband link and re-applies the outputs on every link change
  station.css         station layout and card styles, design tokens only
  index.ts            public exports
src/pwa/        offline install: web manifest, generated icons, service worker
  manifest.ts         buildManifest, MANIFEST_ICONS (pure)
  icons.ts            renderIcon: ghost-on-disc icon to RGBA pixels, ICON_SPECS (pure)
  png.ts              encodePng: RGBA to PNG bytes, CRC-32, deflate injected (pure)
  precache.ts         buildPrecacheList, cacheNameFor: precache URLs and the banshee- cache name (pure)
  routes.ts           routeFor: request to navigate, asset or ignore (pure)
  sw.ts               service worker: precache at install, cache-first fetch, old caches removed; built to /sw.js
  register.ts         registerServiceWorker: production only, sets data-offline-ready
src/ui/         settings, controls, text alerts, layout
  theme.ts            shared Day and Night theme control
  band-page.ts        band simulator page script: status pill, Connect band card, Feel a pattern card (also plays on the wristband when it is connected)
  styleguide.ts       styleguide page script: theme control, Ghosts section (field and glyph grid)
mcp/            banshee-log MCP server over stdio (recent_events, event_stats, replay_clip), run with bun
  log.ts              logPath, parseLog, readLog, appendRecord, recentEvents, eventStats: the JSONL sound log (parse and queries pure)
  replay.ts           listClips, replayClip: runs a clip headless through the real pipeline (runner, YAMNet on TF.js CPU, bearing, haptic engine, no outputs)
  vite-shim.ts        Bun plugin that loads Vite `?worker&url` imports as an empty string; imported before replay.ts
  banshee-log.ts      the server entry: the three tools and the stdio transport; loads replay.ts on the first replay_clip call
firmware/       ESP32 Arduino C++ for the two-motor band
  banshee-band/banshee-band.ino  BLE service, frame parser (same rules as decodeFrame), non-blocking two-motor PWM player
  README.md           parts list, wiring table, how to flash, the byte protocol with a worked example frame
scripts/        build-time scripts: make-icons.ts (bun run icons) writes public/icons/*.png and public/manifest.webmanifest; log-clips.ts (bun run log:seed) replays every clip through the pipeline and appends the events to the sound log
  scripts/hooks/patterns.ts      bun run hooks:patterns: a pattern file (default src/haptics/patterns.json) against the pattern language limits and checkDistinctiveness
  scripts/hooks/spec-tests.ts    bun run hooks:spec-tests: every spec requirement is listed by a task that names an existing test file, or is a known gap in spec-gaps.json
  scripts/hooks/spec-gaps.json   the known requirement gaps (spec#N) with their reasons
  scripts/hooks/colour-alerts.ts bun run hooks:colour: no state of the station pill, Listen pill, ghost urgency or wristband row differs by colour alone
  scripts/hooks/fixtures.ts      bun run hooks:fixtures: reruns classify:report, bearing:report and log:seed in order
tests/          Vitest unit and property tests
  tests/ghosts/       unit, property, shape raster
  tests/band/         protocol unit and property, ble-output with a fake BluetoothLike, firmware sync (sketch and README against protocol.ts)
  tests/station/      unit, property, real clip side table, settings unit, property and styles tests, onboarding unit, property and styles tests, output-options test
  tests/pwa/          manifest, icons, routes, precache, and the built dist/sw.js check (runs after bun run build)
  tests/mcp/          log unit and stdio integration tests
  tests/scripts/hooks/  the four hook scripts: unit tests and a run of each script
  tests/readme.test.ts  README against the code: classes, commands, credits, .kiro files, the screenshots
  tests/docker.test.ts  Dockerfile stages, docker scripts, README Run in Docker
  tests/writeup.test.ts no "[fill in" placeholder in README or docs/, devpost.md sections, honest claims and numbers matching the README
e2e/            Playwright tests
  e2e/ghosts.spec.ts  ghost field e2e
  e2e/audio-capture.spec.ts the capture harness: microphone and clip input, frame sizes and timing
  e2e/a11y.spec.ts    axe audits of every screen in Day and Night, keyboard, reduced motion, announcements
  e2e/station.spec.ts listening station e2e and screenshots
  e2e/live.spec.ts    Start listening with a fake microphone: Knock row, backend, Stop, Mic blocked
  e2e/settings.spec.ts Settings sheet: keyboard, persistence after reload, corrupt or blocked storage, muted Try a sound and live runs, Screen only, screenshots
  e2e/offline.spec.ts offline after one visit, against a production build (vite preview on 5288)
  e2e/band.spec.ts    band simulator page e2e and screenshots
  e2e/band-link.spec.ts Bluetooth band link with a mocked navigator.bluetooth: connect, written bytes, lost, cancelled, unsupported, band.html, screenshots
  e2e/fixtures.ts     shared test fixture: marks the intro as seen unless test.use({ onboarded: false })
  e2e/onboarding.spec.ts first-run intro: 1440 and 390, Day and Night, allow, denied and missing microphone, skip, Escape, shown once, corrupt or blocked storage, Show intro again, keyboard, reduced motion, screenshots
  e2e/latency.spec.ts  onset to output figure: Try a sound (1440 Day) and fake-microphone live run (390 Night) read a measured number, a muted run shows none, screenshots
public/         static files served as they are
  public/clips/                six CC0 or public-domain 16 kHz mono WAV fallback clips, manifest.json, LICENSE.txt (source, author and licence per clip)
  public/models/yamnet/        YAMNet TF.js graph model (model.json, four group1-shard*of4.bin), yamnet_class_map.csv, LICENSE.txt, SHA256SUMS; unmodified, checked by tests/classify/model-files.test.ts; about 16 MB
  public/icons/                the app icons, generated by bun run icons
  public/manifest.webmanifest  the web manifest, generated by bun run icons
vite.config.ts  banshee-pwa plugin: injects the precache list and cache name into /sw.js, fails over 40 MB or on a missing file
design/DESIGN.md  UI source of truth
Dockerfile      two targets: the default (last) stage `app` builds the app and serves it with `vite preview --host 0.0.0.0 --port ${PORT:-4173} --strictPort` (EXPOSE 4173); the `test` stage (`docker build --target test`) runs typecheck, build, test and e2e and prints GATE PASSED or GATE FAILED; package.json scripts docker:serve and docker:test run them
docs/           written documents
  docs/bearing.md     direction accuracy report, written by bun run bearing:report
  docs/yamnet.md      YAMNet notes
  docs/devpost.md     the Devpost submission text, numbers taken from the README
  docs/screenshots/   README screenshots of the station, band simulator and pipeline card at 1440 px Day and Night, plus one 390 px Night phone shot, captured from the production build
.kiro/hooks/     Kiro agent hooks: on save, run bun run hooks:patterns, hooks:spec-tests, hooks:colour and hooks:fixtures
```

## Rules

- `src/events/` is a leaf. It imports nothing from the project, and every module (and `mcp/`) may import it.
- Dependencies flow one way: audio -> classify and bearing -> haptics -> band and ghosts -> ui. Lower modules must not import from `ui`.
- `src/band` exposes one output interface. The Bluetooth band, simulator and vibrate fallback implement it, so `haptics` never knows which is active.
- Modules take plain data in and return plain data out where possible, so they can be tested without a browser.
- Tests mirror source paths, for example `tests/bearing/gcc-phat.test.ts`.
- `mcp/` reads and writes the log with `src/events` only; `mcp/replay.ts` is the one file that may also import the real pipeline (`src/station/runner.ts`, `src/classify`, `src/haptics`) to run a clip headless. Nothing in `src/` imports `mcp/`.
- `src/station` sits with `ui` at the top of the flow: it may import the other modules, and nothing but `src/main.ts` (and `mcp/replay.ts`, for `runner.ts`) imports it.
- `src/pwa/` imports nothing from the other project modules. Only `src/main.ts` imports `src/pwa/register.ts`.
- The pure files of `src/station` and `src/pwa` (`live-gate.ts`, `live.ts`, `latency.ts`, `settings.ts`, `onboarding.ts`, `precache.ts`, `routes.ts`, `manifest.ts`, `icons.ts`) use no `document`, `window`, `navigator`, `localStorage`, `fetch`, `caches`, `console`, `Math.random` or `Date`; `tests/station/boundaries.test.ts` checks this.
