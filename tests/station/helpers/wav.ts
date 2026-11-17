export interface WavOptions {
  sampleRate?: number;
  channels?: number;
  bits?: number;
  format?: number;
  /** Bytes of a LIST chunk placed before `data` (odd lengths get a pad byte). */
  listBytes?: number;
  /** Size written in the `data` header in place of the real size. */
  dataSizeOverride?: number;
}

/** Builds a RIFF/WAVE file with 16-bit little-endian samples (default 16 kHz mono PCM). */
export function buildWav(samples: readonly number[], opts: WavOptions = {}): Uint8Array {
  const { sampleRate = 16000, channels = 1, bits = 16, format = 1, listBytes, dataSizeOverride } = opts;
  const dataSize = samples.length * 2;
  const list = listBytes === undefined ? 0 : 8 + listBytes + (listBytes & 1);
  const bytes = new Uint8Array(12 + 24 + list + 8 + dataSize);
  const view = new DataView(bytes.buffer);
  const tag = (at: number, s: string) => [...s].forEach((c, i) => (bytes[at + i] = c.charCodeAt(0)));
  tag(0, 'RIFF');
  view.setUint32(4, bytes.length - 8, true);
  tag(8, 'WAVE');
  tag(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, format, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, (sampleRate * channels * bits) / 8, true);
  view.setUint16(32, (channels * bits) / 8, true);
  view.setUint16(34, bits, true);
  let at = 36;
  if (listBytes !== undefined) {
    tag(at, 'LIST');
    view.setUint32(at + 4, listBytes, true);
    bytes.fill(0x41, at + 8, at + 8 + listBytes);
    at += list;
  }
  tag(at, 'data');
  view.setUint32(at + 4, dataSizeOverride ?? dataSize, true);
  samples.forEach((s, i) => view.setInt16(at + 8 + i * 2, s, true));
  return bytes;
}
