# Banshee Band

Sounds you cannot hear, felt on your wrist and seen as ghosts that point to where they came from.

Built for [Kiroween 2026](https://kiroween.devpost.com/). Submissions close 2026-12-04.

## What it does

Banshee Band listens through the device microphones, classifies the sound in the browser, estimates which side it came from, and tells you in two ways. On screen, each sound appears as a ghost whose shape shows the type (knock, alarm, voice, vehicle, baby), whose position shows direction, and whose glow shows urgency. On the wrist, a small Bluetooth band plays a distinct vibration pattern per sound class, with a stronger buzz on the side the sound came from. Users choose which sounds matter and how loud they must be. Without the band, the phone vibration API acts as a fallback. All audio stays on the device.

## Stack

TypeScript, Vite, Web Audio API, TensorFlow.js with YAMNet, custom GCC-PHAT DSP module, Web Bluetooth, ESP32 firmware (Arduino C++) with two vibration motors, canvas/WebGL for ghosts, Node.js MCP server, Vitest, static hosting. Open-source license (MIT) with the .kiro folder at the repo root.

## Development

Needs [bun](https://bun.sh). Install with `bun install`, then:

| Command | What it does |
|---|---|
| `bun run dev` | Vite dev server on http://localhost:5173 |
| `bun run build` | Type check, then static build to `dist/` |
| `bun run test` | Vitest unit and property tests, once |
| `bun run e2e` | Playwright tests: starts the dev server on port 5287 and a production build with `vite preview` on port 5288; screenshots go to `e2e/screenshots/` |
| `bun run typecheck` | `tsc --noEmit` (strict) |
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

## License

MIT, see LICENSE.
