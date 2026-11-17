import { describe, expect, it } from 'vitest';
import { decodePcm16kWav } from '../../src/station/wav';
import { buildWav } from './helpers/wav';

const BASIC = [0, 16384, -16384, 32767, -32768];
const EXPECTED = [0, 0.5, -0.5, 32767 / 32768, -1];
const arr = (x: Float32Array | null) => (x ? Array.from(x) : x);

describe('decodePcm16kWav (R5)', () => {
  it('decodes int16 / 32768', () => {
    expect(arr(decodePcm16kWav(buildWav(BASIC)))).toEqual(EXPECTED);
  });

  it('accepts an ArrayBuffer', () => {
    expect(arr(decodePcm16kWav(buildWav(BASIC).buffer as ArrayBuffer))).toEqual(EXPECTED);
  });

  it('skips a LIST chunk of odd length before data', () => {
    expect(arr(decodePcm16kWav(buildWav(BASIC, { listBytes: 7 })))).toEqual(EXPECTED);
  });

  it('reads only the bytes that exist when data claims more', () => {
    expect(arr(decodePcm16kWav(buildWav(BASIC, { dataSizeOverride: 1000 })))).toEqual(EXPECTED);
  });

  it('works on a Uint8Array view with an offset', () => {
    const wav = buildWav(BASIC);
    const big = new Uint8Array(wav.length + 5);
    big.set(wav, 3);
    expect(arr(decodePcm16kWav(big.subarray(3, 3 + wav.length)))).toEqual(EXPECTED);
  });

  it('returns null for anything else', () => {
    const rifx = buildWav(BASIC);
    rifx.set([0x52, 0x49, 0x46, 0x58], 0);
    const noData = buildWav(BASIC);
    noData.set([0x64, 0x61, 0x74, 0x41], 36); // 'datA'
    const cases: [string, Uint8Array][] = [
      ['empty', new Uint8Array(0)],
      ['RIFX', rifx],
      ['no data chunk', noData],
      ['44100 Hz', buildWav(BASIC, { sampleRate: 44100 })],
      ['stereo', buildWav([0, 1, 2, 3], { channels: 2 })],
      ['8 bits', buildWav(BASIC, { bits: 8 })],
      ['format 3', buildWav(BASIC, { format: 3 })],
      ['20 bytes', buildWav(BASIC).subarray(0, 20)],
      ['empty data', buildWav([])],
    ];
    for (const [name, bytes] of cases) expect(decodePcm16kWav(bytes), name).toBeNull();
  });

  it('does not change its input', () => {
    const wav = buildWav(BASIC, { listBytes: 3 });
    const copy = wav.slice();
    decodePcm16kWav(wav);
    expect(wav).toEqual(copy);
  });
});
