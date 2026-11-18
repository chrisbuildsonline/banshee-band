# Tasks: Bluetooth band link (F11)

Each task ends in a test gate. Write the test first, see it fail for the right reason (a stub that throws `not implemented`, or a missing module), then implement. Run `bun run typecheck` and `bun run test` at every gate, and `bun run e2e` at every gate that touches the UI. Requirement numbers refer to `requirements.md`. Do not add dependencies. Tests use literal bytes, numbers and strings for the values the requirements fix. Before task 1 read `.kiro/steering/*.md`, `design/DESIGN.md` (Principles, Pills, Status pills, Settings, Band simulator), `src/band/` (types, phone-output, simulator, labels, index), `src/haptics/types.ts`, `src/haptics/patterns.json`, `src/station/` (settings, settings-panel, status, station, pipeline-view), `src/ui/band-page.ts`, `band.html`, `tests/band/boundaries.test.ts`, `tests/band/styles.test.ts`, `tests/station/settings.test.ts`, `e2e/settings.spec.ts`, `e2e/band.spec.ts` and `playwright.config.ts`. Do the tasks in order.

- [x] 1. The byte protocol
  - [x] 1.1 Write `tests/band/protocol.test.ts` against a throwing stub of `src/band/protocol.ts`: CRC-8 values (`crc8([])` 0x00, "123456789" 0xF4); the literal STOP frame; a literal knock-on-the-left frame; each `DecodeError` from a hand-made bad frame, in the order of Requirement 2.7; the `RangeError` cases of 2.5; the alarm command is 98 bytes. Implement `protocol.ts`.
    - _Requirements: 2.1-2.7_
  - [x] 1.2 Write `tests/band/protocol.property.test.ts` (fast-check, fixed seed, at least 200 runs): the command round trip (class, side, ms exact, levels within 1/510); decode then encode gives the same bytes for every ok decode; `decodeFrame` never throws for any `Uint8Array`; a single flipped bit in a valid frame is an error; all 256 level bytes survive the round trip.
    - _Requirements: 2.8, 9.1_
  - [x] 1.3 In `tests/band/boundaries.test.ts` add a pure list with `protocol.ts` (no `document`, `window`, `navigator`, `fetch`, `console`, `Math.random`, `Date`) and allow the word `bluetooth` in `ble-output.ts` only. Export the protocol from `src/band/index.ts`.
    - _Requirements: 1.1-1.3_
  - **Gate:** the new tests and `boundaries` pass; `typecheck` and `test` pass.

- [x] 2. Firmware, guide and the sync test
  - [x] 2.1 Write `tests/band/firmware.test.ts` against the missing sketch and README: the UUIDs, the name, the class and side codes, the opcodes, the maximum segment count and the CRC polynomial match `protocol.ts`; the README's example bytes equal `encodePlay` of the knock-on-the-left command.
    - _Requirements: 8.4_
  - [x] 2.2 Write `firmware/banshee-band/banshee-band.ino` and `firmware/README.md` by `design.md` (Firmware): parts, wiring table, flashing, the byte protocol and the worked example. The sketch's parser follows `decodeFrame` rule for rule. It cannot be compiled here, so read it against `decodeFrame` line by line.
    - _Requirements: 8.1-8.3_
  - **Gate:** `firmware.test.ts`, `typecheck` and `test` pass.

- [x] 3. The Web Bluetooth link and status texts
  - [x] 3.1 Add `'band'` to the `kind` union in `src/band/types.ts`. Write `tests/band/ble-output.test.ts` with a fake `BluetoothLike` against a stub of `ble-output.ts`: unsupported cases; connect success and the calls made, in order, with the service filter; `requestDevice` runs before any await; cancelled, failed, lost; disconnect writes nothing; a second connect is a no-op; `play` writes `encodePlay` bytes; serialised writes keep only the newest waiting frame; a failing write and an encoder `RangeError` do not throw; `available()` follows the state; listeners fire and unsubscribe. Implement `createBandLink`.
    - _Requirements: 3.1-3.8_
  - [x] 3.2 Add `bandStatusText` to `labels.ts` with the literals of Requirement 4.1 in `tests/band/labels.test.ts`. Export both from `src/band/index.ts`.
    - _Requirements: 4.1, 4.2_
  - **Gate:** `ble-output`, `labels` and `boundaries` tests pass; `typecheck` and `test` pass.

- [x] 4. Settings and the Wristband option
  - [x] 4.1 Extend `tests/station/settings.test.ts` for `outputsFor` with the band (`'band'` gives `[simulator, band]`, the other choices as before) and implement it. `effectiveOutput` stays unchanged.
    - _Requirements: 6.1_
  - [x] 4.2 Change `status.ts`: `setFallback(active)` becomes `setOutput(choice)` with the "Band connected" look (filled dot, accent tint); move its callers and tests. Change `pipeline-view.ts` to name the wristband for kind `'band'`, with a test in the existing pipeline or runner checks.
    - _Requirements: 6.6, 6.7_
  - **Gate:** `settings`, `status`, `pipeline` and `runner` tests pass; `typecheck` and `test` pass.

- [ ] 5. The connect control, Settings, the station pill and the band page
  - [x] 5.1 Extend `tests/band/styles.test.ts` to `src/band/connect.css` (tokens only, no `@keyframes`, no remote resource), then write `connect.css` and `connect.ts` (`mountBandConnect`) by `design.md`. Export it from `src/band/index.ts`.
    - _Requirements: 5.1-5.4_
  - [x] 5.2 In `settings-panel.ts`: enable the Wristband radio when Bluetooth is supported with the two captions of 6.2, show a chosen Wristband as chosen while not connected, mount the connect control under Buzz on, set the output to `band` on a connect. In `station.ts`: create the link, pass `band: link.state() === 'connected'`, and `link.subscribe(() => apply(settings))`.
    - _Requirements: 6.2-6.5_
  - [x] 5.3 In `band.html` and `src/ui/band-page.ts`: the Connect band card, the new lede, and Feel a pattern also plays on the band when connected.
    - _Requirements: 7.1, 7.2_
  - [x] 5.4 Look at it: `bun run dev`, Day and Night at 1440 and 390 px, with the mock of task 6 or a real band. No horizontal scroll at 390 px, targets at least 44 px, focus ring visible, the state readable without colour. Add any new colour pair to the contrast table of `design/DESIGN.md` and `tests/ui`.
    - _Requirements: 5.4_
  - **Gate:** `styles`, `tests/ui`, `typecheck` and `test` pass; `bun run build` passes.

- [ ] 6. Playwright e2e and screenshots
  - [x] 6.1 Write `e2e/band-link.spec.ts` with the mocked `navigator.bluetooth` and the seven cases of `design.md`: connect and buzz, lost, cancelled, unsupported, `band.html`, keyboard, and the four screenshots. Each case fails first on the missing control, then passes after task 5.
    - _Requirements: 3.3-3.7, 6.2-6.6, 7.1, 7.2, 9.2_
  - [x] 6.2 Update `e2e/settings.spec.ts` (the Wristband radio is enabled when Bluetooth exists, disabled with the new caption when it does not) and `e2e/band.spec.ts` (the new lede). Fix what the tests find in the page; do not change a test to fit the code unless the test is wrong.
    - _Requirements: 9.2_
  - **Gate:** `bun run e2e` passes with no console error or warning; four screenshots exist in `e2e/screenshots/`.

- [x] 7. Docs
  - [x] 7.1 Update `design/DESIGN.md`: the Settings section (Wristband option, connect control, the primary pill in the sheet), the Band simulator section (Connect band card), a "Band connected" row check in Status pills, and the connect control. Add one line about the band to `README.md`.
    - _Requirements: 9.3_
  - **Gate:** `tests/ui` (which reads DESIGN.md) and `typecheck` pass.

- [x] 8. Review and final gate
  - [x] 8.1 Check the diff: `src/haptics`, `src/audio`, `src/classify`, `src/bearing` and `src/events` unchanged; `package.json` unchanged; `bluetooth` only in `ble-output.ts`; no `console`, `Math.random` or `Date` in the new code; no `@keyframes` in `connect.css`; the aid sentence unchanged.
    - _Requirements: 1.1-1.5_
  - [x] 8.2 Run `bun run typecheck`, `bun run test`, `bun run build` and `bun run e2e`. All four must be green. Write the commit summary: what is built, the changed e2e checks, the untested firmware (never compiled or flashed here), and the choices listed under "Choices" in `design.md` that need a yes or no.
    - _Requirements: 9.4_
  - **Gate:** all four commands exit 0; the diff matches 8.1.
