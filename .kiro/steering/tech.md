---
inclusion: always
---

# Tech

## Stack

- TypeScript (strict), Vite
- Web Audio API for capture and processing
- TensorFlow.js with the YAMNet audio classifier
- Custom GCC-PHAT stereo bearing DSP module (no DSP libraries)
- Haptic priority engine with a vibration pattern language
- Web Bluetooth to an optional ESP32 band (Arduino C++, two motors: left and right)
- Software band simulator and `navigator.vibrate` fallback
- Canvas ghost renderer
- Node.js MCP server `banshee-log` (`mcp/`)
- Tests: Vitest (unit and property-based with fast-check), Playwright e2e, `tsc` type check
- Package manager and script runner: bun

## Constraints

- All client-side. Static hosting only, no backend, no API keys.
- Web Bluetooth needs Chromium (Chrome, Edge) over HTTPS or localhost. Other browsers must still work through the simulator and the vibrate fallback, and say so in the UI.
- Disable echo cancellation, noise suppression and auto gain on `getUserMedia`. They break inter-channel timing and level differences that GCC-PHAT depends on.
- The band is optional. Every feature must work without hardware.
- Recorded CC0 clips are the fallback input when there is no microphone. Keep licence notes next to the clips.
- Keep audio-path code free of allocations in hot loops where practical, and deterministic so it can be property-tested.

## Commands

```
bun run dev        # Vite dev server
bun run test       # Vitest (unit + fast-check)
bun run e2e        # Playwright
bun run typecheck  # tsc --noEmit
```

Run `typecheck` and `test` before reporting a change done. Run `e2e` for UI or flow changes.
