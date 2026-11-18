import type { HapticClass, HapticCommand, Segment, Side } from '../haptics';

/**
 * The byte protocol between the page and the wristband, version 1. Pure: no DOM, `navigator`, clock or
 * console. The firmware (`firmware/banshee-band/banshee-band.ino`) parses frames by the same rules in the same
 * order, so `decodeFrame` is the reference for it. `firmware/README.md` documents the layout.
 *
 * Frame: version `0x01`, opcode, payload, CRC-8 (poly 0x07, init 0, no reflection, no final xor) over every byte
 * before it. PLAY (`0x01`): class code, side code, segment count N (1..64), then N times: ms (uint16 LE),
 * left level, right level (0..255); 6 + 4N bytes. STOP (`0x02`): no payload, 3 bytes.
 */

/** The GATT service the band advertises. */
export const BAND_SERVICE_UUID = 'b5e0b5e0-0001-4b1d-8a6e-0c0ffee0b0ba';
/** The one characteristic the page writes frames to (write with response). */
export const BAND_COMMAND_UUID = 'b5e0b5e0-0002-4b1d-8a6e-0c0ffee0b0ba';
/** The name the band advertises. */
export const BAND_NAME = 'Banshee Band';
/** Byte 0 of every frame. */
export const PROTOCOL_VERSION = 0x01;
/** The opcodes of byte 1. */
export const OPCODES = { play: 0x01, stop: 0x02 } as const;
/** The most segments one PLAY frame carries (262 bytes, under the 512-byte attribute limit). */
export const MAX_SEGMENTS = 64;
/** The CRC-8 polynomial. */
export const CRC_POLYNOMIAL = 0x07;
/** Byte 2 of a PLAY frame. 0 is not a class. */
export const CLASS_CODES: Readonly<Record<HapticClass, number>> = Object.freeze({ knock: 1, doorbell: 2, alarm: 3, baby: 4, vehicle: 5, voice: 6 });
/** Byte 3 of a PLAY frame. */
export const SIDE_CODES: Readonly<Record<Side, number>> = Object.freeze({ unknown: 0, left: 1, centre: 2, right: 3 });

/** Why a frame was refused, in the order the checks run. */
export type DecodeError = 'too-short' | 'bad-version' | 'bad-opcode' | 'bad-length' | 'bad-checksum' | 'bad-class' | 'bad-side' | 'bad-count' | 'bad-duration';

/** What a valid frame says. */
export type Frame = { op: 'play'; class: HapticClass; side: Side; segments: Segment[] } | { op: 'stop' };

/** Result of `decodeFrame`. */
export type DecodeResult = { ok: true; frame: Frame } | { ok: false; error: DecodeError };

const CLASS_BY_CODE = new Map(Object.entries(CLASS_CODES).map(([k, v]) => [v, k as HapticClass]));
const SIDE_BY_CODE = new Map(Object.entries(SIDE_CODES).map(([k, v]) => [v, k as Side]));

/** CRC-8 of `bytes`: polynomial 0x07, init 0x00, no reflection, no final xor ("123456789" gives 0xF4). */
export function crc8(bytes: Uint8Array): number {
  let crc = 0;
  for (const b of bytes) {
    crc ^= b;
    for (let i = 0; i < 8; i++) crc = crc & 0x80 ? ((crc << 1) ^ CRC_POLYNOMIAL) & 0xff : (crc << 1) & 0xff;
  }
  return crc;
}

/** `body` with its CRC-8 as the last byte. */
function seal(body: Uint8Array): Uint8Array {
  const out = new Uint8Array(body.length + 1);
  out.set(body);
  out[body.length] = crc8(body);
  return out;
}

function levelByte(level: number, which: string): number {
  if (!Number.isFinite(level) || level < 0 || level > 1) throw new RangeError(`${which} level must be from 0 to 1, got ${level}`);
  return Math.round(level * 255);
}

/** The bytes of a frame. Throws `RangeError` when a PLAY frame cannot be encoded (see `encodePlay`). */
export function encodeFrame(frame: Frame): Uint8Array {
  if (frame.op === 'stop') return seal(Uint8Array.of(PROTOCOL_VERSION, OPCODES.stop));
  const { segments } = frame;
  if (segments.length < 1 || segments.length > MAX_SEGMENTS) throw new RangeError(`a frame carries 1 to ${MAX_SEGMENTS} segments, got ${segments.length}`);
  const cls = CLASS_CODES[frame.class];
  const side = SIDE_CODES[frame.side];
  if (!Object.hasOwn(CLASS_CODES, frame.class)) throw new RangeError(`no class code for ${String(frame.class)}`);
  if (!Object.hasOwn(SIDE_CODES, frame.side)) throw new RangeError(`no side code for ${String(frame.side)}`);
  const body = new Uint8Array(5 + 4 * segments.length);
  body.set([PROTOCOL_VERSION, OPCODES.play, cls, side, segments.length]);
  segments.forEach((s, i) => {
    if (!Number.isInteger(s.ms) || s.ms < 1 || s.ms > 0xffff) throw new RangeError(`segment ms must be a whole number from 1 to 65535, got ${s.ms}`);
    const at = 5 + 4 * i;
    body[at] = s.ms & 0xff;
    body[at + 1] = s.ms >> 8;
    body[at + 2] = levelByte(s.left, 'left');
    body[at + 3] = levelByte(s.right, 'right');
  });
  return seal(body);
}

/** The PLAY frame of a command: its class, side and segments only. Throws `RangeError` for 0 or more than 64 segments, a bad ms or level. */
export function encodePlay(command: HapticCommand): Uint8Array {
  return encodeFrame({ op: 'play', class: command.class, side: command.side, segments: command.segments });
}

/** The 3-byte STOP frame. */
export function encodeStop(): Uint8Array {
  return encodeFrame({ op: 'stop' });
}

/** Reads a frame. Never throws: any bytes give a frame or the first failed check, in the documented order. */
export function decodeFrame(bytes: Uint8Array): DecodeResult {
  const fail = (error: DecodeError): DecodeResult => ({ ok: false, error });
  const n = bytes.length;
  if (n < 3) return fail('too-short');
  if (bytes[0] !== PROTOCOL_VERSION) return fail('bad-version');
  const op = bytes[1];
  if (op !== OPCODES.play && op !== OPCODES.stop) return fail('bad-opcode');
  if (op === OPCODES.stop ? n !== 3 : n < 6 || n !== 6 + 4 * bytes[4]) return fail('bad-length');
  if (crc8(bytes.subarray(0, n - 1)) !== bytes[n - 1]) return fail('bad-checksum');
  if (op === OPCODES.stop) return { ok: true, frame: { op: 'stop' } };
  const cls = CLASS_BY_CODE.get(bytes[2]);
  if (cls === undefined) return fail('bad-class');
  const side = SIDE_BY_CODE.get(bytes[3]);
  if (side === undefined) return fail('bad-side');
  const count = bytes[4];
  if (count < 1 || count > MAX_SEGMENTS) return fail('bad-count');
  const segments: Segment[] = [];
  for (let i = 0; i < count; i++) {
    const at = 5 + 4 * i;
    const ms = bytes[at] | (bytes[at + 1] << 8);
    if (ms === 0) return fail('bad-duration');
    segments.push({ ms, left: bytes[at + 2] / 255, right: bytes[at + 3] / 255 });
  }
  return { ok: true, frame: { op: 'play', class: cls, side, segments } };
}
