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
src/station/    listening station (index.html): sample clip to ghost, row, pattern and pipeline view
  constants.ts        PEAK_BUCKETS, MAX_ROWS
  types.ts            TrySide, StageName, StageTimes, RunnerDeps, RunFailure, RunResult
  wav.ts              decodePcm16kWav: 16 kHz mono 16-bit WAV to samples (pure)
  summary.ts          summariseClassifications, rmsDb, loudestRmsDb (pure)
  waveform.ts         peak buckets for the waveform bars (pure)
  stereo.ts           simulated stereo pair for a chosen side, toStereoFrames (pure)
  format.ts           formatMs, formatClock, alertText, sideWord, dropText, failureText (pure)
  pipeline.ts         buildEvent and processEvent: classification and bearing to a SoundEvent (pure)
  runner.ts           runSound: load, classify, bearing, event, pattern, outputs, stage times
  status.ts           mountStatusPill: output state pill
  try-sound.ts        mountTrySound: sound chips, side control, busy state, messages
  list.ts             mountEventList: Latest alert and Recent sounds
  pipeline-view.ts    mountPipelineView: five stage tiles with times
  station.ts          mountStation: builds the page and runs a pick
  station.css         station layout and card styles, design tokens only
  index.ts            public exports
src/ui/         settings, controls, text alerts, layout
  theme.ts            shared Day and Night theme control
  band-page.ts        band simulator page script: status pill, Feel a pattern card
  styleguide.ts       styleguide page script: theme control, Ghosts section (field and glyph grid)
mcp/            banshee-log MCP server (recent_events, event_stats, replay_clip)
firmware/       ESP32 Arduino C++ for the two-motor band
tests/          Vitest unit and property tests
  tests/ghosts/       unit, property, shape raster
  tests/station/      unit, property, real clip side table
e2e/            Playwright tests
  e2e/ghosts.spec.ts  ghost field e2e
  e2e/station.spec.ts listening station e2e and screenshots
public/clips/   CC0 fallback clips (with licence notes)
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
