# Requirements: Listening live (F9b)

## Introduction

The listening station (`.kiro/specs/listening-station/`) runs recorded sample clips through the real pipeline: classify, bearing, haptic engine, band simulator, ghost. This feature adds the live half of the station and makes the app installable and usable offline:

1. **Listen (mic)**: a "Start listening" button that opens the microphone through `src/audio`, feeds mono frames to the classifier and stereo frames to the bearing estimator, and runs each result through the same chain as Try a sound.
2. **Classify timing**: the pipeline view's Label tile says which TensorFlow.js backend ran (`webgl` or `cpu`) and how long classifying took.
3. **PWA**: a web manifest, procedurally generated icons and a service worker that precaches the app shell, the YAMNet model (about 16 MB) and the clips, so the app works offline after one online visit.

The station stays an aid and not a safety device. Audio never leaves the device and nothing is stored (`.kiro/steering/privacy.md`). Every live alert still has the three forms: ghost, haptic pattern and text.

Assumptions (confirm or change before building):

- The Listen status pill is a second pill, inside the Listen card. The existing output pill in the header ("Band not connected" / "Phone vibration fallback" / "Problem") keeps its meaning and its rules (listening-station Requirement 3).
- Settings (class on/off, loudness threshold) are out of scope. The live path uses fixed defaults (Requirement 3).
- This spec amends listening-station Requirements 2.3, 2.5 and 2.7 (the page now has one primary pill, and the Listen controls join the phone bottom bar). The station tests that check those points change in the same task as the code.

Terms:

- **Live run**: the time between a successful Start listening and Stop (or a failure).
- **Window**: one mono frame of 15600 samples at 16 kHz, hop 7800, from `capture.onMonoFrame`.
- **Live event**: a `SoundEvent` built from one window and the bearing at that moment.
- **Listen status**: one of Idle, Starting, Listening, Stopped, Mic blocked, Problem (Requirement 2).
- **Precache list**: the same-origin URLs the service worker stores at install (Requirement 7.5).
- **Backend**: the name TensorFlow.js reports from `tf.getBackend()`.

## Requirements

### Requirement 1: Module boundaries and privacy

**User story:** As a developer, I want the live code to sit on the existing modules without changing how they work, and as a user, I want my audio to stay on my device.

#### Acceptance criteria

1. THE live code SHALL live in `src/station/` (`live.ts`, `live-gate.ts`, `listen.ts`) and the offline code in a new module `src/pwa/`. `src/pwa/` imports nothing from the other modules. Only `src/main.ts` imports `src/station/` and `src/pwa/register.ts`.
2. THE pure files `live-gate.ts`, `live.ts` (capture, classifier, engine, outputs and clocks injected), `src/pwa/precache.ts`, `src/pwa/routes.ts`, `src/pwa/manifest.ts` and `src/pwa/icons.ts` SHALL NOT use `document`, `window`, `navigator`, `fetch`, `caches`, `console`, `Math.random` or `Date`. A test SHALL scan them like `tests/station/boundaries.test.ts` does.
3. THE feature SHALL add one field to `src/classify`: `readonly backend: string` on `Classifier`, read from `tf.getBackend()` after `tf.ready()`. It SHALL NOT change what any other function of `src/audio`, `src/classify`, `src/bearing`, `src/haptics`, `src/band`, `src/events` or `src/ghosts` does. `src/audio` is used as it is (`createCapture`).
4. THE feature SHALL NOT add a dependency to `package.json`. The service worker, the manifest and the icons use no library.
5. THE page SHALL keep audio in memory only. Nothing SHALL write audio, windows, scores or events to `localStorage`, `IndexedDB`, the Cache Storage or the console. `src/station/` SHALL contain no `console`, `Math.random` or storage call.
6. THE page SHALL ask for the microphone only after a click, Enter or Space on Start listening. Loading the page, the service worker and the chips SHALL NOT ask for it.
7. EVERY exported function, constant and type of the new files SHALL have a short doc comment.

### Requirement 2: Start, Stop and listen status

**User story:** As a Deaf or hard-of-hearing user, I want one clear button to start and stop live listening and a plain statement of what is happening, so that I never wonder whether the app can hear.

#### Acceptance criteria

1. THE page SHALL have a Listen card with a "Start listening" button. It SHALL be the one primary pill of the screen (`pill-bg`, `pill-text`, `pill-outline`, `design/DESIGN.md` Components, Pills), at least 44 px high and wide, a `<button type="button">`.
2. THE DOM order of `<main>` SHALL be: title block, Listen card, Try a sound card, ghost field card, Latest alert and Recent sounds card, band simulator, pipeline card.
3. THE Listen card SHALL say in one muted sentence why the microphone is needed and what happens to the sound: "Banshee Band listens through your microphone to tell you about sounds. The sound is processed on this device and is never recorded or sent anywhere."
4. WHEN Start listening is activated and no live run is active, THE station SHALL call `capture.start({ kind: 'mic' })`. The status SHALL be "Starting" until the capture state is `listening`.
5. WHEN the capture state becomes `listening`, THE Listen status SHALL be "Listening" (filled circle glyph, accent tint) and the button SHALL be replaced by a "Stop" secondary pill, which takes the focus so keyboard users keep their place.
6. WHEN Stop is activated, THE station SHALL call `capture.stop()`, release the microphone and show "Stopped" (square glyph, neutral tint) and the Start listening button again, which takes the focus.
7. WHEN the capture state is `error`, THE status SHALL be "Mic blocked" (cross glyph, strong tint) for code `permission-denied`, and "Problem" (cross glyph, strong tint) for every other code. The card SHALL show `CAPTURE_MESSAGES[code]` or the error's own message from `src/audio` in a polite live region, with no stack trace and no raw error text. The button SHALL return to Start listening so the user can try again.
8. THE Listen status SHALL be a polite `role="status"` element. Its text SHALL change only on the transitions above. No state SHALL be shown by colour alone: each has its own glyph shape and word.
9. WHILE starting, THE button SHALL have `aria-disabled="true"` (not `disabled`) and a second activation SHALL do nothing.
10. THE Listen card SHALL work without the band. The page SHALL say nothing that implies the user is protected while the status is not "Listening".
11. WHEN the page is hidden or the tab is closed, THE station SHALL leave the capture to the browser (no extra handler). THE microphone track ending by itself (unplugged, permission revoked) SHALL give the "Problem" status with the message from `src/audio`.
12. THE Day and Night themes SHALL show the new pill and glyphs through tokens only. `design/DESIGN.md` SHALL list the primary pill on this screen and the Stopped and Mic blocked rows of the status table.
13. BELOW 720 px, THE Listen controls SHALL be the first row of the same fixed bottom bar as Try a sound, so the primary pill is within thumb reach. The bar SHALL keep its chips and side control in the lower 45% of an 844 px high viewport, and `--bb-station-bar` SHALL follow the bar's height so no content is hidden behind it.

### Requirement 3: Live pipeline

**User story:** As a user, I want a live sound to produce the same ghost, buzz and text as a sample clip, so that I can trust one behaviour.

#### Acceptance criteria

1. WHILE the status is Listening, EACH window SHALL be classified with the page's classifier (`createClassifier()`, loaded on the first Start listening, with the text "Loading the sound model" in the Listen card's live region). A model load failure SHALL give the "Problem" status and the message of listening-station Requirement 3.4, and SHALL stop the microphone.
2. THE stereo frames of `capture.onStereoFrame` SHALL go to a `createBearingWindow()` (`src/bearing`). The bearing used for a live event SHALL be the window's `result()` at the moment the window's classification finishes. Frames at the context sample rate SHALL go in as they are (the estimator already handles the rate in the frame).
3. Windows SHALL be classified one at a time. WHILE a classification is running, THE station SHALL keep only the newest waiting window and drop older ones, so work never queues up. The number of dropped windows SHALL be available to tests.
4. THE loudness of a live event SHALL be `rmsDb` of the window (`src/station/summary.ts`).
5. A live event SHALL pass a **gate** (`live-gate.ts`, pure): a window whose class is `other` gives no event. After an event of a class, THE gate SHALL give no event of the same class for `LIVE_COOLDOWN_MS` (3000) of the injected clock. Different classes do not block each other. A window that the gate lets through goes to `processEvent` (`src/station/pipeline.ts`) with the id `live-<n>` and urgency from `URGENCY_BY_CLASS`.
6. FOR a valid live event THE station SHALL show, exactly as a clip run does: `ghostField.show`, a row and the Latest alert text (`alertText`), the pattern on the band simulator (and the phone when `available()`), and the pipeline view. A dropped decision (too quiet, no pattern) SHALL show the reason as the clip path does and play nothing.
7. THE live path SHALL use its own `createHapticEngine()` with the default rate limit, not the Try a sound engine (which has `rateLimitMs: 0`).
8. THE live path SHALL NOT change the result of Try a sound. Both can be used at the same time. A chip press while listening runs as before.
9. WHEN a classification fails, THE station SHALL skip that window and continue. After 5 failures in a row it SHALL stop the live run with the "Problem" status and "The sound could not be classified. Listening stopped." No raw error text SHALL be shown.
10. THE side text of a live event SHALL come from the real bearing (`sideOf`), and the word "simulated" SHALL NOT appear for a live event. Bearing is coarse and the confidence rule is the one already in `src/haptics`.

### Requirement 4: Classify timing in the pipeline view

**User story:** As a judge or developer, I want to see which backend ran and how long classifying took, so that the browser speed claim can be checked.

#### Acceptance criteria

1. THE `Classifier` SHALL expose `backend` (Requirement 1.3). Its value after `tf.ready()` is `'webgl'`, `'cpu'` or another name TensorFlow.js reports. If `tf.getBackend()` returns nothing usable, it SHALL be `'unknown'`.
2. THE Label tile of the pipeline view SHALL show, after the first run of any kind, a line "Backend: webgl" (or `cpu`) and a line "Classify: 42 ms per window" with the mean of the classify time per window, in `formatMs`. WHEN the run is a clip run, the mean is the Label stage time divided by the number of frames. WHEN it is a live window, it is the time that one window took.
3. THE Label tile SHALL keep its existing stage time, the label with percent and the class line. The new lines SHALL be plain text in the tile (no tooltip), with `data-backend` on the backend line and `data-classify-ms` (a number) on the time line for tests.
4. THE time SHALL cover the `classify` calls only and SHALL NOT include model loading. WHEN no run has happened yet, the tile SHALL keep its "No label yet" text.
5. THE Label stage of `runSound` SHALL keep its clock rule (listening-station Requirement 10.2). The per-window time of a live window SHALL be measured by `live.ts` with its injected `now()`.
6. WHEN a live window shows in the pipeline view, THE view SHALL keep the other four tiles as they are (a live event fills the five tiles from the live window, with the Waveform tile showing the window's peaks and "1.0 s").

### Requirement 5: Installable PWA

**User story:** As a user, I want to install Banshee Band on my phone or desktop, so that it opens like an app.

#### Acceptance criteria

1. THE app SHALL serve `/manifest.webmanifest` with `name` "Banshee Band", `short_name` "Banshee", `start_url` "/index.html", `scope` "/", `display` "standalone", `background_color` and `theme_color` equal to the Day canvas and accent tokens of `design/DESIGN.md`, and icons of 192 and 512 px (`purpose` "any") plus a 512 px `maskable` icon.
2. EVERY HTML page SHALL link the manifest with `<link rel="manifest">` and carry `<meta name="theme-color">`.
3. THE icons SHALL be generated by code, not drawn by hand: `src/pwa/icons.ts` (pure) renders a ghost on a disc to RGBA pixels, and a script `scripts/make-icons.ts` (run with `bun run icons`) encodes PNG files into `public/icons/` with `node:zlib`. The output SHALL be byte for byte the same on every run. The icons SHALL be committed.
4. THE ghost on each icon SHALL have two eyes and use the accent and canvas colours only. The maskable icon SHALL keep the ghost inside the central 80% circle.
5. THE manifest SHALL be built by a pure function (`src/pwa/manifest.ts`) from the token values and the icon list, and a test SHALL compare the file in `public/` with that function's output.
6. CHROMIUM SHALL see the app as installable: a manifest with the fields above, the icons that load, and a service worker with a `fetch` handler that controls the page. A Playwright test SHALL check the manifest link, the icon responses and the controlled state. It SHALL NOT test the install prompt.

### Requirement 6: Service worker and caching rules

**User story:** As a developer, I want a small service worker with rules I can test, so that offline behaviour does not depend on luck.

#### Acceptance criteria

1. THE service worker SHALL be served as `/sw.js` from the root, so its scope is `/`. It SHALL be registered by `src/pwa/register.ts`, only in a production build (`import.meta.env.PROD`) and only when `'serviceWorker' in navigator`. The development server SHALL NOT register it.
2. AT install, THE worker SHALL fetch every URL of the precache list into a cache named `banshee-<hash>`, where `<hash>` is a hash of the sorted list and the build's file names, so a change in any file gives a new cache. IF any URL fails, the install SHALL fail, so a half-filled cache is never active. The worker SHALL then call `skipWaiting()`. At activate it SHALL delete every cache whose name starts with `banshee-` and is not the current one, then call `clients.claim()`.
3. EVERY cache lookup SHALL pass `{ ignoreVary: true }`, so a `Vary` header from a server or a host never makes a cached file miss.
4. A navigation request (`request.mode === 'navigate'`) to the app's own origin SHALL be answered with the cached page first: `/` and `/index.html` give the cached `/index.html`, `/band.html` and `/styleguide.html` their own cached page, and any other same-origin path gives the cached `/index.html`. If the cache has no match, the worker SHALL try the network.
5. A same-origin `GET` that is not a navigation SHALL be answered cache first, then the network. The query string SHALL be ignored when matching precached assets.
6. A request to another origin, or with a method other than `GET`, SHALL NOT be handled by the worker (no `respondWith`). A range request SHALL be passed to the network unless the cache has the full file, as the browser's own cache would.
7. THE worker SHALL NOT cache anything after install except through the precache list. It SHALL NOT store responses that are not `ok`.
8. THE decision of requirements 4 to 6 SHALL be a pure function `routeFor({ url, method, mode, origin })` in `src/pwa/routes.ts` that returns `'navigate'`, `'asset'` or `'ignore'` plus the cache key to look up. The worker only calls it and applies the answer.
9. THE worker SHALL tell open pages when the precache is complete, with a `postMessage({ type: 'precache-complete', cache })`, and `register.ts` SHALL expose this as `window.__bbOffline = { ready: boolean }` for tests and set a `data-offline-ready` attribute on `<html>`. Nothing is shown to the user for it except the line of Requirement 7.3.
10. A new deployment SHALL replace the old worker at the next visit (`skipWaiting` and `clients.claim`). The page SHALL NOT reload by itself.

### Requirement 7: Offline use

**User story:** As a user with no network, I want the app to open and classify the sample sounds, so that I can still use what I installed.

#### Acceptance criteria

1. AFTER one online visit in which the precache completes, WHEN the network is off and the page is reloaded, THE station SHALL open with the title, the chips and the footer, and Try a sound SHALL still classify a clip: the model loads from the cache, the Knock chip gives a ghost and a row.
2. THE same SHALL hold for `/band.html` and `/styleguide.html`.
3. THE title block SHALL carry a muted line "Works offline after the first visit." once `data-offline-ready` is set, and not before. It SHALL be plain text with no colour-only meaning.
4. THE live path (Requirement 3) SHALL work offline too, because it uses the same model and the microphone, not the network.
5. THE precache list SHALL include: the built files of all three HTML pages and every JS, CSS and worklet file they use (including the TensorFlow.js chunk); `favicon.svg`, the icons and the manifest; `models/yamnet/model.json`, the four `group1-shard*.bin` files, `yamnet_class_map.csv`; `clips/manifest.json` and every WAV file named in it. It SHALL NOT include `sw.js`, `LICENSE.txt`, `SHA256SUMS` or the `.md` files.
6. THE list SHALL be built at build time by a Vite plugin in `vite.config.ts` that reads the bundle and the `public/` folder, not written by hand. A test SHALL check that every URL of the list exists in `dist/` after a build, and that the list's size is within 17 to 40 MB.
7. THE page SHALL work with no service worker (a browser that lacks one, or the development server). The service worker adds offline use and changes nothing else.
8. IF the model could not be precached because the install was interrupted (the worker is not active), THE next visit SHALL try again, and a failed install SHALL leave the app working online as before.

### Requirement 8: No unexpected requests

**User story:** As a user, I want proof that nothing leaves my device, so that I can trust the microphone.

#### Acceptance criteria

1. DURING a visit, a live run, a clip run and an offline reload, EVERY request the page and the worker make SHALL be to the page's own origin. A Playwright test SHALL record `page.on('request')` (and the worker's requests through `context.on('request')`) and fail on any request whose origin differs, ignoring `data:` and `blob:` URLs.
2. THE test SHALL also fail on a request the page makes to its own origin for a path outside the app (anything not in the precache list, the HTML pages, `sw.js`, the dev server's own files, or the `/@vite` paths in development).
3. THE app SHALL NOT use a CDN, a font service or analytics.

### Requirement 9: Tests and accessibility

**User story:** As a maintainer, I want the new behaviour covered at every level, so that later work can change the code safely.

#### Acceptance criteria

1. UNIT tests (Vitest, tests mirror source paths) SHALL cover the pure parts: the gate (cooldown, `other`, per-class, same-time edge), `live.ts` with a fake capture (frames in order, newest-wins dropping, five failures in a row, stop releases the capture, ids `live-1`, `live-2`), the listen status text and glyph table, `routeFor` (every row of Requirement 6), `precache.ts` (list from a bundle, exclusions, cache name from the list), the manifest builder and the icon renderer (size, determinism, eyes present, the maskable safe zone). Property tests (fast-check, fixed seed, at least 100 runs) SHALL cover: the gate never lets the same class through twice inside the cooldown; `routeFor` never throws and never answers for another origin; the cache name changes when any file name changes.
2. PLAYWRIGHT tests SHALL cover, in Chromium with `--use-fake-device-for-media-stream` and `--use-fake-ui-for-media-stream`: Start listening gives "Listening" and a Stop button; with `--use-file-for-fake-audio-capture` pointed at `public/clips/knock-01.wav` a row for a live event appears and the Label tile shows the backend and a number of ms; Stop gives "Stopped" and the microphone tracks are `readyState === 'ended'`; a denied permission (getUserMedia rejected with `NotAllowedError` in an init script) gives "Mic blocked" and the plain message; no microphone request before the click.
3. PLAYWRIGHT tests against a production build (`vite preview`, a second web server in `playwright.config.ts` on its own port) SHALL cover: the service worker becomes active and controls the page; the manifest and icons load; after `data-offline-ready`, `context.setOffline(true)` and a reload, the station shows and Try a sound classifies Knock; `/band.html` also reloads offline; no request leaves the origin (Requirement 8); the console has no `error` and there is no `pageerror` in every test of this feature.
4. THE keyboard flow SHALL be tested: Tab reaches Start listening before the chips, Enter starts, focus moves to Stop, Enter stops, focus returns to Start listening. A reduced-motion case SHALL check that the Listening pill has no animation.
5. THE existing station e2e specs that check the DOM order, the missing primary pill and the phone bar SHALL be updated for Requirement 2 in the same change, with the reason in the commit summary.
6. THE contrast of the new pairs (primary pill on the Day and Night canvas, the Stopped and Mic blocked pills, the muted offline line) SHALL be in the contrast table and `tests/ui`.
7. `bun run typecheck`, `bun run test`, `bun run e2e` and `bun run build` SHALL pass.

## Out of scope

- Settings (class on/off, loudness threshold), a saved log, the MCP server, `replay_clip`, clip recording.
- Web Bluetooth and the ESP32 band.
- Push notifications, background listening while the tab is closed, wake lock.
- An install button or prompt, update toasts, a cache size screen.
- Runtime caching of anything outside the precache list.
- Echo cancellation, noise control or stereo calibration beyond what `src/audio` does today.
- A WebGL or WASM backend switch in the UI. The page reports the backend TensorFlow.js picks.
