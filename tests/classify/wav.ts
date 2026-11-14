/**
 * Decodes a 16 kHz mono 16-bit PCM WAV file to floats (sample / 32768). Walks the RIFF chunks.
 * Throws for any other format; it never resamples.
 */
export function readPcm16k(bytes: Uint8Array, name: string): Float32Array {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (o: number) => String.fromCharCode(...bytes.subarray(o, o + 4));
  if (bytes.length < 12 || tag(0) !== 'RIFF' || tag(8) !== 'WAVE') throw new Error(`${name} is not a RIFF/WAVE file`);

  let fmt: { format: number; channels: number; rate: number; bits: number } | undefined;
  let data: { start: number; size: number } | undefined;
  for (let o = 12; o + 8 <= bytes.length && !data; ) {
    const size = view.getUint32(o + 4, true);
    const body = o + 8;
    if (tag(o) === 'fmt ' && body + 16 <= bytes.length) {
      fmt = {
        format: view.getUint16(body, true),
        channels: view.getUint16(body + 2, true),
        rate: view.getUint32(body + 4, true),
        bits: view.getUint16(body + 14, true),
      };
    } else if (tag(o) === 'data') {
      data = { start: body, size: Math.min(size, bytes.length - body) };
    }
    o = body + size + (size & 1);
  }
  if (!fmt || !data) throw new Error(`${name} has no fmt or data chunk`);
  if (fmt.format !== 1 || fmt.channels !== 1 || fmt.rate !== 16000 || fmt.bits !== 16) {
    throw new Error(
      `${name} is not 16 kHz mono 16-bit PCM (format ${fmt.format}, ${fmt.channels} channels, ${fmt.rate} Hz, ${fmt.bits}-bit). It is not resampled.`,
    );
  }
  const out = new Float32Array(Math.floor(data.size / 2));
  for (let i = 0; i < out.length; i++) out[i] = view.getInt16(data.start + 2 * i, true) / 32768;
  return out;
}
