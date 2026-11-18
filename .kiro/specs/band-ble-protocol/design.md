# Design: Bluetooth band link (F11)

Requirement numbers refer to `requirements.md`.

## Overview

The page turns a `HapticCommand` into bytes. A GATT write carries them to the ESP32, which plays the two motors. The link is one more `HapticOutput`, so the engine, the runner and the live loop do not change.

```
runSound / createLive -> decision -> outputs[]  (deps.outputs, set by station apply())
                                      |-- simulator.output       always first, mirrors on screen
                                      |-- phone output           when effective is 'phone'
                                      '-- link.output (band)     when effective is 'band' and connected
                                              encodePlay(command) -> one write at a time -> BAND_COMMAND_UUID
ESP32: write callback copies bytes -> loop() parses (same rules as decodeFrame) -> millis() segments -> LEDC PWM on GPIO 25 / 26

Settings sheet: Buzz on -> Wristband radio, then [Wristband row: status line, Connect band | Disconnect]
link.subscribe(() => apply(settings))    a lost band falls back to the screen at once
```

## Files

```
src/band/
  protocol.ts       BAND_SERVICE_UUID, BAND_COMMAND_UUID, BAND_NAME, crc8, encodePlay, encodeStop, decodeFrame   pure
  ble-output.ts     createBandLink, BluetoothLike, BandLink, BandState, BandProblem                              the only file with `bluetooth`
  connect.ts        mountBandConnect: the Wristband row                                                          DOM
  connect.css       connect row styles, tokens only
  labels.ts         + bandStatusText(state, problem, name) (edit)
  types.ts          kind: 'simulator' | 'phone' | 'band' (edit)
  index.ts          + exports (edit)
src/station/
  settings.ts       outputsFor gains band (edit)
  settings-panel.ts Wristband option enabled when supported, connect control under Buzz on, link option (edit)
  station.ts        creates the link, band availability, subscribe -> apply, pill state (edit)
  status.ts         + 'band' state; setFallback takes 'band' | 'phone' | 'none' (edit)
  pipeline-view.ts  Band tile names the wristband for kind 'band' (edit)
src/ui/band-page.ts  Connect band card, Feel a pattern also plays on the band (edit)
band.html            Connect band card slot, lede (edit)
firmware/banshee-band/banshee-band.ino, firmware/README.md   (new)
design/DESIGN.md     Settings, Band simulator, connect control (edit)    README.md  one line (edit)
tests/band/   protocol.test.ts protocol.property.test.ts ble-output.test.ts firmware.test.ts (new)
              boundaries.test.ts styles.test.ts labels.test.ts (edit)
tests/station/ settings.test.ts status and runner cases (edit)
e2e/          band-link.spec.ts (new)   settings.spec.ts band.spec.ts (edit)
```

## Protocol (`protocol.ts`)

```ts
export const BAND_SERVICE_UUID = 'b5e0b5e0-0001-4b1d-8a6e-0c0ffee0b0ba';
export const BAND_COMMAND_UUID = 'b5e0b5e0-0002-4b1d-8a6e-0c0ffee0b0ba';
export const BAND_NAME = 'Banshee Band';
export type DecodeError = 'too-short' | 'bad-version' | 'bad-opcode' | 'bad-length' | 'bad-checksum' | 'bad-class' | 'bad-side' | 'bad-count' | 'bad-duration';
export type DecodeResult =
  | { ok: true; frame: { op: 'play'; class: HapticClass; side: Side; segments: Segment[] } | { op: 'stop' } }
  | { ok: false; error: DecodeError };
export function crc8(bytes: ArrayLike<number>): number;
export function encodePlay(command: HapticCommand): Uint8Array;   // RangeError on invalid input
export function encodeStop(): Uint8Array;
export function decodeFrame(bytes: Uint8Array): DecodeResult;     // never throws
```

```
PLAY  01 01 <class> <side> <N> { <ms lo> <ms hi> <left> <right> } x N  <crc>      6 + 4N bytes, N 1..64, at most 262
STOP  01 02 <crc>                                                                  3 bytes
class: knock 1, doorbell 2, alarm 3, baby 4, vehicle 5, voice 6      side: unknown 0, left 1, centre 2, right 3
```

- CRC-8: polynomial 0x07, init 0x00, MSB first, no reflection, no final xor. Check values: `crc8([])` is 0x00 and `crc8` of "123456789" is 0xF4. The sketch uses the same bitwise loop.
- Code tables are `as const` records keyed by class and side; decode inverts them. A class not in the table is `bad-class`, so a future code is rejected instead of guessed.
- `encodePlay` reads only `class`, `side` and `segments`. `vibrate`, `totalMs`, `priority` and `eventId` are not sent. It validates before it writes any byte.
- `decodeFrame` takes the checks in the order of Requirement 2.7. It reads bytes only after the length check, so no read goes past the end. It never throws (no allocation proportional to a claimed `N` before the length matches).
- Level round trip: `Math.round(l * 255) / 255` differs from `l` by at most 1/510. Decode then encode is exact because `Math.round((b / 255) * 255)` is `b` for every byte `b`; a property test covers all 256 values.
- The alarm, the longest pattern, is 23 segments and 98 bytes. 64 segments cap a frame at 262 bytes, under the 512-byte attribute limit, so one write is one frame.

## Link (`ble-output.ts`)

```ts
export interface BluetoothLike { requestDevice(options: { filters: { services: string[] }[] }): Promise<DeviceLike> }
// DeviceLike: { name?: string; gatt?: { connect(): Promise<ServerLike>; disconnect(): void; connected?: boolean };
//               addEventListener(type: 'gattserverdisconnected', fn: () => void): void; removeEventListener(...) }
// ServerLike: { getPrimaryService(uuid: string): Promise<{ getCharacteristic(uuid: string): Promise<CharacteristicLike> }> }
// CharacteristicLike: { writeValueWithResponse(value: BufferSource): Promise<void> }
export type BandState = 'unsupported' | 'idle' | 'connecting' | 'connected';
export type BandProblem = 'cancelled' | 'failed' | 'lost' | null;
export interface BandLink {
  output: HapticOutput;            // kind 'band'
  state(): BandState; problem(): BandProblem; deviceName(): string | null;
  subscribe(listener: () => void): () => void;
  connect(): Promise<void>; disconnect(): void;
}
export function createBandLink(host?: { bluetooth?: BluetoothLike }): BandLink;
```

- `host` is read once. Unsupported means `bluetooth` is missing or `typeof bluetooth.requestDevice !== 'function'`; then every action is a no-op and the state never changes.
- `connect()` is `async` but calls `requestDevice` before its first `await`, in the same turn as the click. State goes to `connecting` before the call, to `connected` after `getCharacteristic`, and to `idle` with a problem on failure. A second `connect()` while `connecting` or `connected` returns at once. A `NotFoundError` (`error.name`) means the user closed the chooser.
- The `gattserverdisconnected` listener is attached to the device when it is chosen. If it fires while connected, the link clears its characteristic and goes to `idle` with `lost`. The listener is removed on `disconnect()` and on any failed connect.
- `disconnect()` writes nothing (the band's own disconnect handler stops the motors). It calls `gatt.disconnect()` and goes to `idle` with no problem.
- Write queue: `inFlight: boolean` and `pending: Uint8Array | null`. `send(frame)` sets `pending = frame` (replacing any older one) and starts `drain()` if nothing is in flight. `drain` takes `pending`, writes it with `writeValueWithResponse`, swallows a failure, and loops until `pending` is empty. A STOP is a frame like any other, so it replaces a waiting PLAY and a later PLAY replaces a waiting STOP: the last call wins, as "play replaces what plays" says.
- `play` encodes inside a `try`; a `RangeError` is swallowed. A write that lands after a disconnect is swallowed. Nothing logs.
- Listeners get a snapshot call after every change. A listener that throws does not stop the others.

## Texts and the connect control

`bandStatusText(state, problem, name)` is a total function with the literals of Requirement 4.1 in a table. `problem` only matters when `state` is `idle`.

`mountBandConnect(host, link, options?)` builds, and rebuilds only the text and the button on each change:

```
<div class="bb-band-connect" data-state="idle">
  [24px band glyph, aria-hidden]  <h3 class="bb-band-connect__title">Wristband</h3>
  <p class="bb-band-connect__status" role="status" aria-live="polite">No band connected.</p>
  <button type="button" class="bb-pill bb-pill--primary" data-band="connect">Connect band</button>
</div>
```

- The button is `bb-pill--primary` when idle, `disabled` with "Connecting…" while connecting, `bb-pill--secondary` "Disconnect" when connected, and absent when unsupported. The glyph is a wristband loop with two dots, filled when connected and dashed when not, so the state is not colour alone.
- Conflict to confirm: the owner's decision makes "Connect band" the primary pill when idle. DESIGN.md allows at most one primary pill per screen, and F10 says the Settings sheet has no primary pill. The station page already has "Start listening" as its primary pill, and the sheet is a modal dialog, so while it is open the page behind it is inert. This design follows the decision as written and amends the F10 rule for this one control (Requirement 5.2), and DESIGN.md says so in task 7. The fallback, if the owner says no, is one option, `options.primary` (default `true`), which `settings-panel.ts` sets to `false` so the sheet shows a secondary pill. It is listed under "Choices" below.
- `onConnected` runs once when a press ends in `connected`. The connect press handler sets a flag that the next `connected` change consumes.
- Styles in `connect.css`: `surface-raised`, `radius-control`, rows at least `var(--bb-target-min)`, `text-muted` status caption at the caption step, focus ring from the shared pill rule. Literals follow `tests/band/styles.test.ts`: tokens only, 1 to 3 px, no `@keyframes`, no remote resource.

## Station wiring

- `station.ts` creates `const link = createBandLink()` at mount. `available` for `effectiveOutput` is `{ phone: vibrates, band: link.state() === 'connected' }`, read at each `apply()`.
- `outputsNow()` returns `outputsFor(effective(), { simulator: simulator.output, phone, band: link.output })`.
- `link.subscribe(() => apply(settings))` re-applies the outputs on every link change. A lost band makes `effective()` `'simulator'`, so the band output leaves `outputs`, is stopped by `apply`, and the next alert plays on the screen. The saved choice stays `'band'`.
- Settings panel: `mountSettings` gets `link`. The Wristband radio is enabled when `link.state() !== 'unsupported'`. Its checked state follows `effectiveOutput` except for `'band'`, which stays shown while not connected (this differs from phone only for the shown tile; the saved choice is never rewritten). The connect control is mounted under the radios with `onConnected: () => commit({ ...current, output: 'band' })`. Phone-only unavailable behaviour is unchanged.
- Status pill: `setFallback(active)` becomes `setOutput(effective: OutputChoice)`: `'band'` shows "Band connected" (filled dot, accent tint, a `GLYPHS.dot` already exists), `'phone'` shows "Phone vibration fallback", else "Band not connected". "Problem" still wins until `reset()`. The existing callers and tests move to the new name in the same task.
- `pipeline-view.ts` line 131 maps `'phone'` to "Phone vibration" and everything else to "Band simulator". It gains `'band'` to "Wristband". The played list keeps the order the outputs ran in (simulator first).
- `band-page.ts`: a "Connect band" card slot and a link made with `createBandLink()`. "Feel a pattern" plays on `simulator.output`, the phone when it can vibrate, and `link.output` when connected. The lede reads "A simulator of the wrist band. Each pattern plays here on screen, motor by motor, and on the band when it is connected."

## Firmware (`banshee-band.ino`)

- Setup: `BLEDevice::init("Banshee Band")`, one service with the command characteristic (`PROPERTY_WRITE`), a callback class with `onWrite` and a server callback class with `onConnect` and `onDisconnect`. `ledcAttach(25, 1000, 8)` and `ledcAttach(26, 1000, 8)` (core 3.x signature: pin, frequency, resolution).
- `onWrite` copies up to 262 bytes into `rx[]` and sets `rxLen` and `rxFresh`. It does no parsing and no motor work.
- `loop()` takes a fresh frame, parses it with the rules and order of Requirement 2.7 (`parseFrame` returns an error name or null), logs a bad frame with `Serial.println(errorName)`, and starts the segments. `tick()` uses `millis()`: when the current segment's duration has passed it moves on, and when the last one ends it sets both duties to 0. Duty 255 is full on.
- `onDisconnect` sets both duties to 0, clears the play state and calls `BLEDevice::startAdvertising()`.
- Constants are named in one block (`SERVICE_UUID`, `COMMAND_UUID`, `DEVICE_NAME`, `OP_PLAY`, `OP_STOP`, `MAX_SEGMENTS`, `CRC_POLY`, `LEFT_PIN`, `RIGHT_PIN`) with the class and side code lists in comments or `enum`s that `firmware.test.ts` can read.
- `firmware/README.md`: parts, a wiring table (ESP32 GPIO 25 and 26 each to a transistor base through a resistor, motor between 3 V and the collector, a flyback diode across each motor, common ground), flashing steps, the protocol tables of this file, and a worked example.

Worked example, a knock on the left with segments `{70 ms, left 1, right 0.4}`, `{100 ms, 0, 0}`, `{70 ms, left 1, right 0.4}`:

```
01 01 01 01 03  46 00 FF 66  64 00 00 00  46 00 FF 66  <crc>
ver op  cls side N  seg 70ms   seg 100ms    seg 70ms
```

The builder writes the final CRC byte by running `crc8` once and checks it against a second, hand-computed value in the test; `firmware.test.ts` parses the README bytes and compares them with `encodePlay` of this command.

## Playwright (`e2e/band-link.spec.ts`, dev server on 5287)

An init script replaces `navigator.bluetooth` with a mock whose `requestDevice` resolves a fake device (name "Banshee Band", a GATT server, one characteristic whose `writeValueWithResponse` pushes the bytes to `window.__bandWrites`, and `dispatchEvent` access for `gattserverdisconnected`). `watch(page)` as in `e2e/settings.spec.ts` fails on console output and page errors.

1. **Connect and buzz**: Settings, choose Wristband, press Connect band, see "Connected to Banshee Band." and the header pill "Band connected". Close the sheet, press Knock in Try a sound: the last write has version 1, opcode 1, class 1, a valid CRC (checked in the page with the same CRC loop) and the simulator still shows the pattern.
2. **Lost**: fire `gattserverdisconnected`. The line shows "The band disconnected. Alerts use the phone or the screen until it is back." and the pill falls back. The Wristband radio stays chosen. A Knock press then writes nothing.
3. **Cancelled**: the mock rejects with a `NotFoundError`; the line shows "No band was chosen."
4. **Unsupported**: with `navigator.bluetooth` deleted, the Wristband radio is disabled with its caption and the unsupported line shows, with no button.
5. **band.html**: Connect band, then a chip press writes a frame with the chip's class code.
6. **Keyboard**: the connect button is reachable in the tab order after the radios and before Reset to defaults, and Enter presses it.
7. **Screenshots** with the sheet open and connected: `band-link-1440-day.png`, `band-link-1440-night.png`, `band-link-390-day.png`, `band-link-390-night.png`. At 390 px `scrollWidth <= clientWidth` for the dialog.

## Decisions (made by the owner, not to be reopened)

- Byte protocol version 1 as in Requirement 2: UUIDs, name, opcodes, codes, CRC-8 (0x07), 64 segments at most, `decodeFrame` as the reference for the firmware.
- `createBandLink` with a structural `BluetoothLike` type and no `@types/web-bluetooth`; `connect()` never rejects; writes are serialised and keep only the newest waiting frame; a failed write is swallowed.
- A new output kind `'band'`. `effectiveOutput` is unchanged; `outputsFor` gives `[simulator, band]`, so the simulator always mirrors.
- The Wristband radio is enabled whenever Bluetooth is supported and stays shown as chosen while the band is not connected.
- The connect control is in the Settings sheet under Buzz on and on `band.html`. A connect from the sheet sets the output to `band`. Every link change re-applies the outputs.
- The firmware and its README, with a test that keeps them in step with `protocol.ts`.

Choices of this design inside those decisions, which need a yes or no: "Connect band" is a primary pill inside the Settings sheet, which amends F10's "no primary pill in the sheet" (see the conflict note above; the fallback is a secondary pill there); the pill state API becomes `setOutput(choice)`; the pipeline Band tile says "Wristband" for kind `'band'`; the boundaries test allows `bluetooth` in `ble-output.ts` only; the README example uses levels 1 and 0.4 so that the bytes do not depend on the engine's urgency scaling.

## Testing strategy

| Layer | What | Where |
|---|---|---|
| Unit: protocol | CRC-8 values (`[]` 0x00, "123456789" 0xF4); literal STOP frame and the knock-left frame; every `DecodeError` from a hand-made bad frame, in the order of 2.7; encoder `RangeError`s (0 and 65 segments, ms 0, 65536 and 1.5, level -0.1, 1.1, `NaN`, `Infinity`); the longest real pattern (alarm, 23 segments, 98 bytes) | `tests/band/protocol.test.ts` |
| Property | round trip for every valid command (class, side and ms exact, levels within 1/510); decode then encode equals the bytes for every ok decode; `decodeFrame` never throws for any `Uint8Array`; any single flipped bit in a valid frame is an error; fixed seed, at least 200 runs | `tests/band/protocol.property.test.ts` |
| Unit: link | fake `BluetoothLike`: unsupported (no `bluetooth`, `requestDevice` not a function); connect success and the calls made, in order, with the service filter; cancelled, failed, lost; disconnect writes nothing; a second connect is a no-op; `play` writes `encodePlay` bytes; serialised writes keep only the newest waiting frame; a failing write and an encode `RangeError` do not throw; `available()` follows the state; listeners fire and unsubscribe; `bandStatusText` literals | `tests/band/ble-output.test.ts`, `labels.test.ts` |
| Firmware | sketch and README against `protocol.ts`: UUIDs, name, class and side codes, opcodes, max segments, CRC polynomial, README example bytes | `tests/band/firmware.test.ts` |
| Station | `outputsFor` with the band; status pill `setOutput`; runner: a band output named in `played` | `tests/station/settings.test.ts`, runner and status cases |
| Boundaries and styles | `protocol.ts` pure; `bluetooth` only in `ble-output.ts`; `connect.css` tokens only, no `@keyframes` | `tests/band/boundaries.test.ts`, `styles.test.ts` |
| e2e | the seven cases above, both themes, 1440 and 390 | `e2e/band-link.spec.ts` |
