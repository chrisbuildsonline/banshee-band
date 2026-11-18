# Requirements: Bluetooth band link (F11)

## Introduction

The listening station plays every alert on the band simulator and, when the phone can vibrate, on the phone. The Settings sheet (F10) shows a Wristband option that stays disabled "until the Bluetooth link". This feature builds that link: an ESP32 wristband with two vibration motors (left and right of the wrist) that the browser drives over Web Bluetooth. It plays the same `HapticCommand` that the simulator and the phone play, through the same `HapticOutput` interface, so `src/haptics` does not change.

The feature has four parts:

1. **Byte protocol, version 1**: a small framed format with a CRC-8, written once in TypeScript (`src/band/protocol.ts`) and mirrored by the firmware.
2. **Web Bluetooth link** (`src/band/ble-output.ts`): connect, state, problem, and an output that writes frames one at a time.
3. **Connect control and wiring**: a "Wristband" row (`src/band/connect.ts`) in the Settings sheet and on `band.html`, a "Band connected" header pill, and `outputsFor` that adds the band.
4. **Firmware and wiring guide**: `firmware/banshee-band/banshee-band.ino` and `firmware/README.md`, kept in step with `protocol.ts` by a test.

The band is optional. Every feature still works without it, and the simulator always mirrors what the band plays. The band is an aid and not a safety device: where the UI states it, it uses the exact sentence of `design/DESIGN.md` Principle 6: "Banshee Band is an aid, not a safety device. It can miss or misread sounds, so keep your smoke alarms and other certified alerting devices."

Decisions already made by the owner (listed again in `design.md`): the frame layout and UUIDs below, `createBandLink` with a structural `BluetoothLike` type and no `@types/web-bluetooth`, the new output kind `'band'`, the connect control in the Settings sheet and on `band.html`, and the simulator that always mirrors.

Terms:

- **Frame**: the bytes of one write: version, opcode, payload, CRC-8.
- **Link**: the object `createBandLink` returns: the output, the state, the problem, the device name and the connect and disconnect actions.
- **State**: `'unsupported'`, `'idle'`, `'connecting'` or `'connected'`. **Problem**: `'cancelled'`, `'failed'`, `'lost'` or `null`.

## Requirements

### Requirement 1: Module boundaries and privacy

**User story:** As a developer, I want the protocol pure and tested, and as a user, I want nothing but pattern bytes to reach the band.

#### Acceptance criteria

1. `src/band/protocol.ts` SHALL be pure: no `document`, `window`, `navigator`, `fetch`, `console`, `Math.random` or `Date`. It imports only types from `../haptics`. `tests/band/boundaries.test.ts` SHALL gain a pure list with `protocol.ts` and check this.
2. THE word `bluetooth` SHALL appear only in `src/band/ble-output.ts`. `tests/band/boundaries.test.ts` SHALL be changed to allow it in that one file and nowhere else in `src/band`.
3. THE new files SHALL import only `../events`, `../haptics` and their own folder, as the other `src/band` files do. `src/haptics` SHALL NOT change (it never knows which output is active).
4. THE link SHALL send only frames made from a `HapticCommand` (class, side, segment times and levels). No audio, label, score, event id or other data SHALL be written to the band, and nothing SHALL be stored about the band except what the browser itself keeps for the chooser.
5. THE new code SHALL contain no `console` call and no network request, SHALL add no dependency to `package.json`, and EVERY exported function, constant and type SHALL have a short doc comment.

### Requirement 2: The byte protocol

**User story:** As a firmware author, I want one exact frame layout, so that the band and the page cannot drift apart.

#### Acceptance criteria

1. `protocol.ts` SHALL export `BAND_SERVICE_UUID` (`b5e0b5e0-0001-4b1d-8a6e-0c0ffee0b0ba`), `BAND_COMMAND_UUID` (`b5e0b5e0-0002-4b1d-8a6e-0c0ffee0b0ba`) and `BAND_NAME` (`Banshee Band`).
2. EVERY frame SHALL be: byte 0 the version `0x01`, byte 1 the opcode, the payload, and a last byte CRC-8 (polynomial 0x07, init 0x00, no reflection, no final xor) over all bytes before it. `crc8([])` SHALL be `0x00` and `crc8` of the ASCII bytes of "123456789" SHALL be `0xF4`.
3. PLAY (opcode `0x01`) SHALL carry: byte 2 the class code (knock 1, doorbell 2, alarm 3, baby 4, vehicle 5, voice 6), byte 3 the side code (unknown 0, left 1, centre 2, right 3), byte 4 the segment count N (1 to 64), then N segments of 4 bytes: the duration in ms as uint16 little-endian (1 to 65535), the left level (0 to 255) and the right level (0 to 255). Its length SHALL be 6 + 4N bytes, at most 262.
4. STOP (opcode `0x02`) SHALL have no payload and SHALL be 3 bytes: `01 02` and the CRC.
5. `encodePlay(command)` SHALL turn a level `0..1` into `Math.round(level * 255)` and SHALL throw `RangeError` for zero or more than 64 segments, a `ms` that is not an integer from 1 to 65535, and a level that is not finite or is outside 0 to 1. `encodeStop()` SHALL return the STOP frame.
6. `decodeFrame(bytes)` SHALL return `{ ok: true, frame }` with `frame` `{ op: 'play', class, side, segments }` or `{ op: 'stop' }`, or `{ ok: false, error }` with `error` one of `too-short`, `bad-version`, `bad-opcode`, `bad-length`, `bad-checksum`, `bad-class`, `bad-side`, `bad-count`, `bad-duration`. Levels SHALL decode as `byte / 255`. It SHALL never throw, for any bytes.
7. THE checks SHALL run in this order, and the firmware SHALL use the same order: length below 3 is `too-short`; byte 0 is not 1 is `bad-version`; the opcode is not 1 or 2 is `bad-opcode`; the length does not match the opcode (STOP 3; PLAY at least 6 and equal to 6 + 4N, where N is byte 4) is `bad-length`; the CRC does not match is `bad-checksum`; the class code is not 1 to 6 is `bad-class`; the side code is above 3 is `bad-side`; N is 0 or above 64 is `bad-count`; a duration of 0 is `bad-duration`. For a PLAY with fewer than 5 bytes, the length check reports `bad-length`.
8. FOR every valid command, `decodeFrame(encodePlay(c))` SHALL give its class, side and segment `ms` exactly, and every level within 1/510. FOR every byte array that decodes ok, re-encoding the decoded frame SHALL give the same bytes. ANY single flipped bit in a valid frame SHALL decode as an error.

### Requirement 3: The Web Bluetooth link

**User story:** As a user, I want to connect the band with one press, and I want a failure to never break an alert.

#### Acceptance criteria

1. `createBandLink(host?)` SHALL take `{ bluetooth?: BluetoothLike }`, a minimal structural type of the parts of `navigator.bluetooth` used, with no `@types/web-bluetooth`. Without `host` it SHALL read `globalThis.navigator` once, at creation.
2. WHEN there is no `navigator.bluetooth`, or `requestDevice` is not a function, THE state SHALL always be `'unsupported'` and `connect()` SHALL do nothing.
3. `connect()` SHALL never reject. It SHALL call `requestDevice({ filters: [{ services: [BAND_SERVICE_UUID] }] })` first, with nothing awaited before it, so it runs inside the click that called it (a user gesture). It SHALL then call `gatt.connect()`, `getPrimaryService` and `getCharacteristic`, in that order, and the state SHALL be `connecting` from the call until the result.
4. A `NotFoundError` from the chooser SHALL give state `idle` and problem `cancelled`. Any other error SHALL give `idle` and `failed`. A `gattserverdisconnected` event while connected SHALL give `idle` and `lost`. `disconnect()` SHALL write nothing, call `gatt.disconnect()` and give `idle` with no problem. A new `connect()` SHALL clear the problem.
5. `deviceName()` SHALL be the device's name while connected, else `null`. `subscribe(listener)` SHALL call the listener after every change of state or problem and return a function that removes it.
6. THE link's `output` SHALL have `kind: 'band'`. `available()` SHALL be true only while connected. `play(command)` SHALL write `encodePlay(command)` and `stop()` SHALL write `encodeStop()`, both with a write with response.
7. WRITES SHALL be serialised: one GATT write at a time. WHILE a write is in flight, only the newest frame SHALL wait, and an older waiting frame SHALL be dropped. A write that fails, or a frame that cannot be encoded, SHALL be swallowed, SHALL never throw to the caller and SHALL write nothing to the console. The simulator and the text still show the alert.
8. WHEN not connected, `play` and `stop` SHALL do nothing.

### Requirement 4: Texts

**User story:** As a user, I want plain words that say what the band is doing and what to do next.

#### Acceptance criteria

1. `bandStatusText(state, problem, name)` in `src/band/labels.ts` SHALL be pure and SHALL return exactly: unsupported "This browser has no Bluetooth link (Safari and Firefox do not have Web Bluetooth). Alerts use the phone or the screen. Chrome or Edge can connect the band."; idle "No band connected."; connecting "Connecting…"; connected "Connected to Banshee Band." (the device name in place of "Banshee Band" when it has one); and, for `idle` with a problem, cancelled "No band was chosen.", failed "Could not connect. Check the band is on and close, then try again.", lost "The band disconnected. Alerts use the phone or the screen until it is back."
2. THE texts SHALL imply no protection and SHALL say which fallback is in use where a band is missing.

### Requirement 5: The connect control

**User story:** As a user, I want one clear place to connect and disconnect, in words and not only colour.

#### Acceptance criteria

1. `mountBandConnect(host, link, options?)` in `src/band/connect.ts` SHALL draw a `surface-raised` row with a small band glyph, the heading "Wristband", the status line from `bandStatusText` (`role="status"`, polite) and one pill, and SHALL update on every link change.
2. THE pill SHALL be "Connect band" as the near-black primary pill when idle, "Connecting…" and `disabled` while connecting, and "Disconnect" as a secondary pill when connected. WHEN unsupported, THE row SHALL have no button and only the honest line. The state SHALL be in words, never in colour alone. In the Settings sheet this amends F10 Requirement 7.4 ("no primary pill") for this one control.
3. A press of "Connect band" SHALL call `link.connect()` in the click handler. WHEN the state becomes `connected` after that press, `options.onConnected` SHALL be called once.
4. EVERY target SHALL be at least 44 px, with the 3 px focus ring. `src/band/connect.css` SHALL use design tokens only, under the literal rules of `tests/band/styles.test.ts`, and `tests/band/styles.test.ts` SHALL cover it.

### Requirement 6: Settings and station

**User story:** As a user, I want to choose Wristband, connect it from the same sheet, and have the alerts fall back to the screen if it drops.

#### Acceptance criteria

1. `effectiveOutput` SHALL stay unchanged and the station SHALL pass `band: link.state() === 'connected'`. `outputsFor(effective, { simulator, phone, band })` SHALL return `[simulator, band]` for `'band'`, so the simulator mirrors, and the F10 results for the other choices. `tests/station/settings.test.ts` SHALL cover it.
2. THE Wristband radio SHALL be enabled whenever Bluetooth is supported, with the caption "The band buzzes the pattern, stronger on the side it came from." WHEN unsupported, it SHALL be disabled with the caption "This browser has no Bluetooth. Use Chrome or Edge to connect the band."
3. A chosen Wristband SHALL stay shown as chosen while the band is not connected. The alerts go to the screen meanwhile, and the connect row says so. Other unavailable choices SHALL keep the F10 behaviour (shown as Screen only, the saved choice unchanged).
4. THE Buzz on section SHALL show the connect control. A successful connect from the sheet SHALL set the output to `band`, saved like any change.
5. EVERY link change SHALL re-apply the outputs, so a lost band falls back to the screen at once. Outputs no longer chosen SHALL be stopped.
6. THE header status pill SHALL gain "Band connected" (filled dot glyph, accent tint) when the effective output is `band`, and otherwise keep today's behaviour. "Problem" still wins until reset.
7. THE pipeline view's Band tile SHALL name the wristband when it played (a kind `'band'`), and the simulator SHALL still be named.

### Requirement 7: The band page

**User story:** As a user, I want to try a pattern on the band without opening the station.

#### Acceptance criteria

1. `band.html` SHALL get a "Connect band" card with the same control. Its lede SHALL not say "No band is connected" when one is.
2. "Feel a pattern" SHALL play on the band when connected, as well as on the simulator and the phone.

### Requirement 8: Firmware and guide

**User story:** As a maker, I want a sketch and a wiring guide that match the page.

#### Acceptance criteria

1. `firmware/banshee-band/banshee-band.ino` SHALL be Arduino C++ for the ESP32 (arduino-esp32 core 3.x, its built-in BLE library). It SHALL advertise `Banshee Band` with the service UUID, copy each write into a buffer in the characteristic callback, and parse in `loop()` by the rules and order of Requirement 2.7. A bad frame SHALL be ignored and its error name logged on Serial.
2. THE sketch SHALL play segments without blocking (`millis()`), driving the left motor on GPIO 25 and the right on GPIO 26 with 8-bit LEDC PWM (`ledcAttach`, `ledcWrite`), the level byte as the duty. STOP or a new PLAY SHALL replace what plays. On disconnect both motors SHALL stop and advertising SHALL restart.
3. `firmware/README.md` SHALL list the parts (ESP32 dev board, two 3 V ERM coin motors, two NPN transistors or logic MOSFETs, flyback diodes, resistors, a strap), a wiring table, how to flash (Arduino IDE or arduino-cli, board "ESP32 Dev Module"), and the full byte protocol with a worked example frame in hex: a knock on the left.
4. `tests/band/firmware.test.ts` SHALL read the sketch and the README and check that the UUIDs, the name, the class and side codes, the opcodes, the maximum segment count and the CRC polynomial match `protocol.ts`, and that the README's example bytes equal `encodePlay` of that command.

### Requirement 9: Tests and docs

**User story:** As a maintainer, I want every layer covered and the design doc true.

#### Acceptance criteria

1. UNIT and PROPERTY tests SHALL cover the cases of `design.md` (Testing strategy). PROPERTY tests use fast-check with a fixed seed and at least 200 runs.
2. `e2e/band-link.spec.ts` SHALL run with a mocked `navigator.bluetooth` and no hardware, with no console error or warning, and write the four screenshots of `design.md`. `e2e/settings.spec.ts` SHALL be updated where it expects the Wristband radio to be disabled.
3. `design/DESIGN.md` SHALL describe the connect control and the Wristband option in the Settings and Band simulator sections, and `README.md` SHALL get one line about the band.
4. `bun run typecheck`, `bun run test`, `bun run e2e` and `bun run build` SHALL pass.

## Out of scope

- Pairing, bonding, a stored band id or auto-reconnect: the user presses Connect band each visit.
- Battery level, firmware update, notifications from the band to the page, or more than two motors.
- A band-side side, urgency or intensity rule: the page computes levels, the band plays them.
- Web Bluetooth in Safari and Firefox (they say so and use the phone or the screen).
- Hardware tests in CI: the e2e uses a mock, and the sketch is checked by `firmware.test.ts` for text only.
