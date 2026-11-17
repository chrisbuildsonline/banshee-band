---
inclusion: always
---

# Structure

```
index.html, styleguide.html, band.html   page shells (band.html: band simulator page)
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
src/ghosts/     canvas ghost renderer
src/ui/         settings, controls, text alerts, layout
  theme.ts            shared Day and Night theme control
  band-page.ts        band simulator page script: status pill, Feel a pattern card
mcp/            banshee-log MCP server (recent_events, event_stats, replay_clip)
firmware/       ESP32 Arduino C++ for the two-motor band
tests/          Vitest unit and property tests
e2e/            Playwright tests
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
