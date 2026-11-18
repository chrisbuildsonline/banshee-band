import { describe, expect, it } from 'vitest';
import {
  BAND_COMMAND_UUID,
  BAND_NAME,
  BAND_SERVICE_UUID,
  MAX_SEGMENTS,
  crc8,
  decodeFrame,
  encodeFrame,
  encodePlay,
  encodeStop,
} from '../../src/band/protocol';
import type { HapticCommand } from '../../src/haptics';
import { ALARM_CENTRE_HIGH, KNOCK_LEFT_HIGH } from './helpers/commands';

const bytes = (...b: number[]) => Uint8Array.from(b);
/** `body` with its CRC-8 appended. */
const framed = (...body: number[]) => Uint8Array.from([...body, crc8(Uint8Array.from(body))]);
const withSegments = (segments: HapticCommand['segments']): HapticCommand => ({ ...KNOCK_LEFT_HIGH, segments });

/** The knock-on-the-left frame, byte by byte (also the worked example in firmware/README.md). */
const KNOCK_LEFT_FRAME = [0x01, 0x01, 0x01, 0x01, 0x03, 0x46, 0x00, 0xff, 0x4d, 0x64, 0x00, 0x00, 0x00, 0x46, 0x00, 0xff, 0x4d, 0x45];

describe('protocol constants (R2.1)', () => {
  it('names the GATT service, the command characteristic and the band', () => {
    expect(BAND_SERVICE_UUID).toBe('b5e0b5e0-0001-4b1d-8a6e-0c0ffee0b0ba');
    expect(BAND_COMMAND_UUID).toBe('b5e0b5e0-0002-4b1d-8a6e-0c0ffee0b0ba');
    expect(BAND_NAME).toBe('Banshee Band');
    expect(MAX_SEGMENTS).toBe(64);
  });
});

describe('crc8 (R2.2)', () => {
  it('is 0x00 for no bytes and 0xF4 for "123456789"', () => {
    expect(crc8(bytes())).toBe(0x00);
    expect(crc8(new TextEncoder().encode('123456789'))).toBe(0xf4);
  });

  it('matches single bytes of the 0x07 polynomial table', () => {
    expect(crc8(bytes(0x01))).toBe(0x07);
    expect(crc8(bytes(0x80))).toBe(0x89);
    expect(crc8(bytes(0xff))).toBe(0xf3);
  });
});

describe('encodePlay and encodeStop (R2.3-R2.5)', () => {
  it('writes the literal STOP frame', () => {
    expect([...encodeStop()]).toEqual([0x01, 0x02, crc8(bytes(0x01, 0x02))]);
    expect(encodeStop()).toHaveLength(3);
  });

  it('writes the literal knock-on-the-left frame', () => {
    expect([...encodePlay(KNOCK_LEFT_HIGH)]).toEqual(KNOCK_LEFT_FRAME);
  });

  it('makes the alarm, the longest pattern, 98 bytes (23 segments)', () => {
    const frame = encodePlay(ALARM_CENTRE_HIGH);
    expect(frame).toHaveLength(98);
    expect(frame[2]).toBe(3);
    expect(frame[3]).toBe(2);
    expect(frame[4]).toBe(23);
  });

  it('uses the class and side codes', () => {
    const codes = { knock: 1, doorbell: 2, alarm: 3, baby: 4, vehicle: 5, voice: 6 } as const;
    for (const [cls, code] of Object.entries(codes)) expect(encodePlay({ ...KNOCK_LEFT_HIGH, class: cls as HapticCommand['class'] })[2]).toBe(code);
    const sides = { unknown: 0, left: 1, centre: 2, right: 3 } as const;
    for (const [side, code] of Object.entries(sides)) expect(encodePlay({ ...KNOCK_LEFT_HIGH, side: side as HapticCommand['side'] })[3]).toBe(code);
  });

  it('writes ms as uint16 little-endian and rounds levels to 0..255', () => {
    const f = encodePlay(withSegments([{ ms: 65535, left: 0.5, right: 1 / 510 }, { ms: 258, left: 0, right: 0.999 }]));
    expect([...f.slice(5, 13)]).toEqual([0xff, 0xff, 128, 1, 0x02, 0x01, 0, 255]);
  });

  it('throws RangeError for zero or more than 64 segments', () => {
    expect(() => encodePlay(withSegments([]))).toThrow(RangeError);
    const many = Array.from({ length: 65 }, () => ({ ms: 10, left: 1, right: 1 }));
    expect(() => encodePlay(withSegments(many))).toThrow(RangeError);
    expect(encodePlay(withSegments(many.slice(0, 64)))).toHaveLength(262);
  });

  it('throws RangeError for a bad ms', () => {
    for (const ms of [0, -1, 65536, 1.5, NaN, Infinity]) expect(() => encodePlay(withSegments([{ ms, left: 1, right: 1 }])), String(ms)).toThrow(RangeError);
  });

  it('throws RangeError for a bad level', () => {
    for (const level of [-0.01, 1.01, NaN, Infinity, -Infinity]) {
      expect(() => encodePlay(withSegments([{ ms: 10, left: level, right: 0 }])), String(level)).toThrow(RangeError);
      expect(() => encodePlay(withSegments([{ ms: 10, left: 0, right: level }])), String(level)).toThrow(RangeError);
    }
  });

  it('throws RangeError for an unknown class or side', () => {
    expect(() => encodePlay({ ...KNOCK_LEFT_HIGH, class: 'other' as HapticCommand['class'] })).toThrow(RangeError);
    expect(() => encodePlay({ ...KNOCK_LEFT_HIGH, side: 'up' as HapticCommand['side'] })).toThrow(RangeError);
  });
});

describe('decodeFrame (R2.6, R2.7)', () => {
  it('decodes STOP and the knock frame', () => {
    expect(decodeFrame(encodeStop())).toEqual({ ok: true, frame: { op: 'stop' } });
    expect(decodeFrame(bytes(...KNOCK_LEFT_FRAME))).toEqual({
      ok: true,
      frame: {
        op: 'play',
        class: 'knock',
        side: 'left',
        segments: [
          { ms: 70, left: 1, right: 77 / 255 },
          { ms: 100, left: 0, right: 0 },
          { ms: 70, left: 1, right: 77 / 255 },
        ],
      },
    });
  });

  it('reports each error, in the order of R2.7', () => {
    const play = (cls: number, side: number, n: number, segs: number[]) => framed(0x01, 0x01, cls, side, n, ...segs);
    const seg = [10, 0, 255, 255];
    const cases: [string, Uint8Array][] = [
      ['too-short', bytes()],
      ['too-short', bytes(0x01, 0x02)],
      ['bad-version', bytes(0x02, 0x02, 0x00)],
      ['bad-version', framed(0x00, 0x09)],
      ['bad-opcode', framed(0x01, 0x03)],
      ['bad-opcode', framed(0x01, 0x00)],
      ['bad-length', framed(0x01, 0x02, 0x00)],
      ['bad-length', framed(0x01, 0x01)],
      ['bad-length', framed(0x01, 0x01, 1, 1)],
      ['bad-length', framed(0x01, 0x01, 1, 1, 1)],
      ['bad-length', play(1, 1, 2, seg)],
      ['bad-checksum', bytes(0x01, 0x02, 0x00)],
      ['bad-checksum', bytes(...KNOCK_LEFT_FRAME.slice(0, -1), 0x00)],
      ['bad-class', play(0, 1, 1, seg)],
      ['bad-class', play(7, 1, 1, seg)],
      ['bad-side', play(1, 4, 1, seg)],
      ['bad-side', play(1, 255, 1, seg)],
      ['bad-count', framed(0x01, 0x01, 1, 1, 0)],
      ['bad-count', play(1, 1, 65, Array.from({ length: 65 }, () => seg).flat())],
      ['bad-duration', play(1, 1, 2, [...seg, 0, 0, 1, 1])],
    ];
    for (const [error, frame] of cases) expect(decodeFrame(frame), `${error} ${[...frame].join(',')}`).toEqual({ ok: false, error });
  });

  it('checks the class before the side, and the side before the count', () => {
    expect(decodeFrame(framed(0x01, 0x01, 9, 9, 0))).toEqual({ ok: false, error: 'bad-class' });
    expect(decodeFrame(framed(0x01, 0x01, 1, 9, 0))).toEqual({ ok: false, error: 'bad-side' });
  });

  it('accepts 64 segments, 262 bytes', () => {
    const segs = Array.from({ length: 64 }, () => [1, 0, 0, 0]).flat();
    const r = decodeFrame(framed(0x01, 0x01, 6, 0, 64, ...segs));
    expect(r.ok).toBe(true);
  });

  it('re-encodes a decoded frame to the same bytes', () => {
    const r = decodeFrame(bytes(...KNOCK_LEFT_FRAME));
    if (!r.ok) throw new Error(r.error);
    expect([...encodeFrame(r.frame)]).toEqual(KNOCK_LEFT_FRAME);
    expect([...encodeFrame({ op: 'stop' })]).toEqual([...encodeStop()]);
  });
});
