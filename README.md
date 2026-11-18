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

The design system lives in `design/DESIGN.md` and `src/ui/tokens.css`. See it at http://localhost:5173/styleguide.html.

## License

MIT, see LICENSE.
