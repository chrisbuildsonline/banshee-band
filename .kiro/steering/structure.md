---
inclusion: always
---

# Structure

```
index.html, styleguide.html, band.html   page shells (index.html: listening station page; band.html: band simulator page)
src/events/     SoundEvent contract: type, class constants, validator
src/audio/      microphone and clip input, stereo capture, framing
src/classify/   YAMNet loading and inference, label-to-class mapping
src/bearing/    GCC-PHAT bearing estimation
src/haptics/    priority engine and vibration pattern language
src/band/       haptic outputs: one HapticOutput interface, segment player, phone vibrate, band simulator
  types.ts            HapticOutput interface
  segment-player.ts   timed motor levels from a HapticCommand (injected scheduler)
  phone-output.ts     navigator.vibrate output
  protocol.ts         byte protocol v1: BAND_SERVICE_UUID, BAND_COMMAND_UUID, BAND_NAME, crc8, encodePlay, encodeStop, decodeFrame (pure)
  ble-output.ts       createBandLink: Web Bluetooth link, state, problem, serialised writes, the 'band' HapticOutput (the only file that uses `bluetooth`)
  connect.ts          mountBandConnect: the Wristband row with status line and Connect band, Disconnect
  connect.css         connect row styles, design tokens only
  labels.ts           plain-word labels: class, side, percent, pattern name, pulse count
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
  types.ts            TrySide, StageName, StageTimes, RunnerDeps, RunFailure, RunResult
  wav.ts              decodePcm16kWav: 16 kHz mono 16-bit WAV to samples (pure)
  summary.ts          summariseClassifications, rmsDb, loudestRmsDb (pure)
  waveform.ts         peak buckets for the waveform bars (pure)
  stereo.ts           simulated stereo pair for a chosen side, toStereoFrames (pure)
  format.ts           formatMs, formatClock, alertText, sideWord, dropText, failureText, classifyText, liveFailureText, dbText, mutedText (pure)
  pipeline.ts         buildEvent and processEvent: classification and bearing to a SoundEvent (pure)
  runner.ts           runSound: load, classify, bearing, event, pattern, outputs, stage times
  live-gate.ts        createLiveGate: per-class 3000 ms cooldown for live events (pure)
  live.ts             createLive: microphone windows to classify, bearing, event, pattern, outputs; newest window wins (deps injected, pure)
  listen-status.ts    LISTEN_STATES and listenStateFor: capture state to Listen pill word, glyph and tint (pure)
  listen.ts           mountListenCard: Start and Stop listening, Listen status pill, note and message line
  status.ts           mountStatusPill: output state pill; renderPill and GLYPHS shared by both pills; setFallback: the pill follows the output in use
  try-sound.ts        mountTrySound: sound chips, side control, busy state, messages
  list.ts             mountEventList: Latest alert and Recent sounds
  pipeline-view.ts    mountPipelineView: five stage tiles with times; Label tile shows backend and classify ms
  settings.ts         StationSettings: per-class on/off and level (-80 to -10 dB), Buzz on output; resolveSettings, parseSettings, load and save with injected storage (key `banshee-band.settings.v1`), settingsVerdict, createSettingsEngine, isMuted, effectiveOutput, outputsFor (pure)
  settings-panel.ts   mountSettings: the Settings sheet (native dialog) with a switch and level slider per class, Buzz on radios (Wristband disabled until the Bluetooth link) and Reset; browserStorage
  settings.css        Settings sheet styles: side sheet from 720px, bottom sheet below, design tokens only
  station.ts          mountStation: builds the page, applies the saved settings (new settings engines and outputs on each change), runs a pick and starts or stops listening
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
  band-page.ts        band simulator page script: status pill, Feel a pattern card
  styleguide.ts       styleguide page script: theme control, Ghosts section (field and glyph grid)
mcp/            banshee-log MCP server (recent_events, event_stats, replay_clip)
firmware/       ESP32 Arduino C++ for the two-motor band
  banshee-band/banshee-band.ino  BLE service, frame parser (same rules as decodeFrame), non-blocking two-motor PWM player
  README.md           parts list, wiring table, how to flash, the byte protocol with a worked example frame
scripts/        build-time scripts: make-icons.ts (bun run icons) writes public/icons/*.png and public/manifest.webmanifest
tests/          Vitest unit and property tests
  tests/ghosts/       unit, property, shape raster
  tests/band/         protocol unit and property, ble-output with a fake BluetoothLike, firmware sync (sketch and README against protocol.ts)
  tests/station/      unit, property, real clip side table, settings unit, property and styles tests
  tests/pwa/          manifest, icons, routes, precache, and the built dist/sw.js check (runs after bun run build)
e2e/            Playwright tests
  e2e/ghosts.spec.ts  ghost field e2e
  e2e/station.spec.ts listening station e2e and screenshots
  e2e/live.spec.ts    Start listening with a fake microphone: Knock row, backend, Stop, Mic blocked
  e2e/settings.spec.ts Settings sheet: keyboard, persistence after reload, corrupt or blocked storage, muted Try a sound and live runs, Screen only, screenshots
  e2e/offline.spec.ts offline after one visit, against a production build (vite preview on 5288)
  e2e/band-link.spec.ts Bluetooth band link with a mocked navigator.bluetooth: connect, written bytes, lost, cancelled, unsupported, band.html, screenshots
public/         clips/ (CC0 fallback clips with licence notes), models/, icons/ and manifest.webmanifest
vite.config.ts  banshee-pwa plugin: injects the precache list and cache name into /sw.js, fails over 40 MB or on a missing file
design/DESIGN.md  UI source of truth
```

## Rules

- `src/events/` is a leaf. It imports nothing from the project, and every module (and `mcp/`) may import it.
- Dependencies flow one way: audio -> classify and bearing -> haptics -> band and ghosts -> ui. Lower modules must not import from `ui`.
- `src/band` exposes one output interface. The Bluetooth band, simulator and vibrate fallback implement it, so `haptics` never knows which is active.
- Modules take plain data in and return plain data out where possible, so they can be tested without a browser.
- Tests mirror source paths, for example `tests/bearing/gcc-phat.test.ts`.
- `mcp/` has no imports from `src/` except shared event types.
- `src/station` sits with `ui` at the top of the flow: it may import the other modules, and nothing but `src/main.ts` imports it.
- `src/pwa/` imports nothing from the other project modules. Only `src/main.ts` imports `src/pwa/register.ts`.
- The pure files of `src/station` and `src/pwa` (`live-gate.ts`, `live.ts`, `settings.ts`, `precache.ts`, `routes.ts`, `manifest.ts`, `icons.ts`) use no `document`, `window`, `navigator`, `localStorage`, `fetch`, `caches`, `console`, `Math.random` or `Date`; `tests/station/boundaries.test.ts` checks this.
