# Banshee Band wristband firmware

The wristband is an ESP32 with two small vibration motors, one on each side of the wrist. The listening station
(or `band.html`) connects to it over Web Bluetooth and sends one short frame per alert: which sound, which side,
and the pulses to play. The band does not listen, classify or store anything. It only plays the frames it gets.

The band is an aid, not a safety device. It can miss or misread sounds, so keep your smoke alarms and other
certified alerting devices.

The sketch is `banshee-band/banshee-band.ino`. It has not been through a hardware test in CI: the browser side
is tested against a mock, and `tests/band/firmware.test.ts` checks that the sketch and this file use the same
constants as `src/band/protocol.ts`.

## Parts

- 1 ESP32 dev board (any ESP32-WROOM-32 "DevKit"; it needs Bluetooth Low Energy, so not an ESP32-S2)
- 2 ERM coin vibration motors, 3 V, 10 mm (the flat kind used in phones)
- 2 NPN transistors (2N2222 or BC337) or 2 logic-level N-channel MOSFETs (AO3400)
- 2 flyback diodes (1N4148 or 1N5819), one across each motor
- 2 resistors of 1 kΩ (base resistors for NPN; for MOSFETs use 100 Ω gate and 100 kΩ pull-down)
- A 3.7 V LiPo with a charger board, or a USB power bank
- A strap (a sports watch band or a sewn elastic strip) with the motors at the left and right of the wrist

## Wiring

Each motor is switched on its low side, so the ESP32 pin only drives the transistor.

| From | To | Note |
| --- | --- | --- |
| GPIO 25 | 1 kΩ, then base of transistor L | Left motor (PWM) |
| GPIO 26 | 1 kΩ, then base of transistor R | Right motor (PWM) |
| Emitter of L and R | GND | |
| Collector of L | Left motor minus | |
| Collector of R | Right motor minus | |
| 3V3 | Both motors plus | Or the battery plus through the charger's output |
| Flyback diode | Across each motor, stripe to plus | Protects the transistor from the motor's back-voltage |

The motors run with 8-bit LEDC PWM at 20 kHz, so a level byte of 0 is off and 255 is full strength.

## Flashing

Arduino IDE: install the "esp32 by Espressif Systems" boards package (core 3.x), open
`banshee-band/banshee-band.ino`, choose the board "ESP32 Dev Module" and the port, then Upload.

arduino-cli:

```sh
arduino-cli core install esp32:esp32
arduino-cli compile --fqbn esp32:esp32:esp32 firmware/banshee-band
arduino-cli upload --fqbn esp32:esp32:esp32 --port /dev/ttyUSB0 firmware/banshee-band
```

Open the serial monitor at 115200 baud: the band says `advertising as Banshee Band`. On the station, open
Settings, choose Wristband and press Connect band (Chrome or Edge; Safari and Firefox have no Web Bluetooth).
A frame the band refuses is logged with its error name, such as `frame ignored: bad-checksum`.

## Bluetooth

| What | Value |
| --- | --- |
| Advertised name | `Banshee Band` |
| GATT service | `b5e0b5e0-0001-4b1d-8a6e-0c0ffee0b0ba` |
| Command characteristic | `b5e0b5e0-0002-4b1d-8a6e-0c0ffee0b0ba`, write with response |

The page writes one frame at a time. A new PLAY or a STOP replaces whatever the band is playing. When the page
disconnects, the band stops both motors and advertises again.

## Byte protocol, version 1

Every frame is:

| Byte | Meaning |
| --- | --- |
| 0 | Version, `0x01` |
| 1 | Opcode: `0x01` PLAY, `0x02` STOP |
| 2 .. n-2 | Payload (PLAY only) |
| n-1 | CRC-8 of every byte before it: polynomial `0x07`, init `0x00`, no reflection, no final xor (`"123456789"` gives `0xF4`) |

PLAY payload:

| Byte | Meaning |
| --- | --- |
| 2 | Class: knock 1, doorbell 2, alarm 3, baby 4, vehicle 5, voice 6 |
| 3 | Side: unknown 0, left 1, centre 2, right 3 |
| 4 | Segment count N, 1 to 64 |
| 5 + 4i, 6 + 4i | Segment i duration in ms, uint16 little-endian, 1 to 65535 |
| 7 + 4i | Segment i left motor level, 0 to 255 |
| 8 + 4i | Segment i right motor level, 0 to 255 |

A PLAY frame is 6 + 4N bytes (at most 262). STOP has no payload and is 3 bytes: `01 02 1B`. A rest between
pulses is a segment with both levels 0. The page computes every level (urgency, side, strength); the band only
plays them. A level in the page (0 to 1) becomes `round(level * 255)`.

The band checks a frame in this order and ignores it at the first failure (the same order as `decodeFrame` in
`src/band/protocol.ts`):

1. fewer than 3 bytes: `too-short`
2. byte 0 is not 1: `bad-version`
3. opcode is not 1 or 2: `bad-opcode`
4. STOP is not 3 bytes, or PLAY is under 6 bytes or not 6 + 4N: `bad-length`
5. the CRC does not match: `bad-checksum`
6. class not 1 to 6: `bad-class`
7. side above 3: `bad-side`
8. N is 0 or above 64: `bad-count`
9. a duration of 0: `bad-duration`

### Worked example: a knock on the left

A knock from the left at high urgency plays 70 ms on, 100 ms rest, 70 ms on, with the left motor at full strength
and the right at 0.3 (77 of 255), so the stronger side points to the sound.

<!-- example-frame -->
```text
01 01 01 01 03 46 00 FF 4D 64 00 00 00 46 00 FF 4D 45
```

| Bytes | Meaning |
| --- | --- |
| `01` | version 1 |
| `01` | PLAY |
| `01` | knock |
| `01` | left |
| `03` | 3 segments |
| `46 00 FF 4D` | 70 ms, left 255, right 77 |
| `64 00 00 00` | 100 ms rest |
| `46 00 FF 4D` | 70 ms, left 255, right 77 |
| `45` | CRC-8 of the 17 bytes before it |
