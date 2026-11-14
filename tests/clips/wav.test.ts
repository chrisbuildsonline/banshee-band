import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { readWav } from './wav';

interface MakeWavOptions {
  sampleRate?: number;
  channels?: number;
  bits?: number;
  format?: number;
  silent?: boolean;
  /** Insert a LIST chunk (odd length, so it needs a pad byte) between fmt and data. */
  list?: boolean;
}

function makeWav(frames: number, { sampleRate = 16000, channels = 1, bits = 16, format = 1, silent = false, list = false }: MakeWavOptions = {}): Uint8Array {
  const blockAlign = channels * (bits / 8);
  const dataSize = frames * blockAlign;
  const listBody = list ? 'INFOISFT\x05\x00\x00\x00test\x00' : '';
  const listSize = list ? 8 + listBody.length + (listBody.length & 1) : 0;
  const bytes = new Uint8Array(44 + listSize + dataSize);
  const view = new DataView(bytes.buffer);
  const ascii = (offset: number, s: string) => [...s].forEach((c, i) => (bytes[offset + i] = c.charCodeAt(0)));
  ascii(0, 'RIFF');
  view.setUint32(4, bytes.length - 8, true);
  ascii(8, 'WAVE');
  ascii(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, format, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bits, true);
  let offset = 36;
  if (list) {
    ascii(offset, 'LIST');
    view.setUint32(offset + 4, listBody.length, true);
    ascii(offset + 8, listBody);
    offset += listSize;
  }
  ascii(offset, 'data');
  view.setUint32(offset + 4, dataSize, true);
  if (bits === 16 && !silent) for (let i = 0; i < dataSize / 2; i++) view.setInt16(offset + 8 + i * 2, ((i % 50) - 25) * 400, true);
  return bytes;
}

describe('readWav', () => {
  it('reads a mono 16-bit PCM file', () => {
    const info = readWav(makeWav(8000, { sampleRate: 16000 }));
    expect(info).toMatchObject({ channels: 1, sampleRate: 16000, bitsPerSample: 16, frames: 8000, durationSec: 0.5 });
    expect(info.peak).toBeCloseTo(10000 / 32768, 6);
  });

  it('reads a stereo file', () => {
    expect(readWav(makeWav(441, { sampleRate: 44100, channels: 2 }))).toMatchObject({ channels: 2, frames: 441, durationSec: 0.01 });
  });

  it('skips a LIST chunk (with its pad byte) before data', () => {
    expect(readWav(makeWav(100, { list: true }))).toMatchObject({ frames: 100 });
  });

  it('rejects a truncated file', () => {
    const bytes = makeWav(100);
    expect(() => readWav(bytes.slice(0, bytes.length - 10))).toThrow('Data chunk is truncated');
  });

  it('rejects a file cut inside the header', () => {
    expect(() => readWav(makeWav(100).slice(0, 30))).toThrow('Missing fmt chunk');
    expect(() => readWav(makeWav(100).slice(0, 8))).toThrow('Not a RIFF/WAVE file');
  });

  it('rejects a wrong RIFF or WAVE header', () => {
    const riff = makeWav(100);
    riff[0] = 'X'.charCodeAt(0);
    expect(() => readWav(riff)).toThrow('Not a RIFF/WAVE file');
    const wave = makeWav(100);
    wave[8] = 'X'.charCodeAt(0);
    expect(() => readWav(wave)).toThrow('Not a RIFF/WAVE file');
  });

  it('rejects a non-PCM format', () => {
    expect(() => readWav(makeWav(100, { format: 3 }))).toThrow('Unsupported format: expected 16-bit PCM');
  });

  it('rejects 8-bit samples', () => {
    expect(() => readWav(makeWav(100, { bits: 8 }))).toThrow('Unsupported format: expected 16-bit PCM');
  });

  it('rejects zero channels or a zero sample rate', () => {
    expect(() => readWav(makeWav(100, { channels: 0 }))).toThrow('Invalid fmt chunk');
    expect(() => readWav(makeWav(100, { sampleRate: 0 }))).toThrow('Invalid fmt chunk');
  });

  it('rejects a zero-length data chunk', () => {
    expect(() => readWav(makeWav(0))).toThrow('No audio samples');
  });

  it('rejects a file with no data chunk', () => {
    expect(() => readWav(makeWav(100).slice(0, 36))).toThrow('Missing data chunk');
  });

  it('reports a peak of 0 for all-zero samples', () => {
    expect(readWav(makeWav(100, { silent: true })).peak).toBe(0);
  });

  it('computes durationSec as frames / sampleRate', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 2000 }), fc.integer({ min: 8000, max: 48000 }), fc.integer({ min: 1, max: 2 }), (frames, sampleRate, channels) => {
        const info = readWav(makeWav(frames, { sampleRate, channels }));
        expect(info.frames).toBe(frames);
        expect(info.durationSec).toBe(frames / sampleRate);
      }),
    );
  });
});
