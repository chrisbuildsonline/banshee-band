export interface WavInfo {
  channels: number;
  sampleRate: number;
  bitsPerSample: 16;
  frames: number;
  durationSec: number;
  /** Largest absolute sample, 0..1. */
  peak: number;
}

/** Reads a 16-bit PCM WAV file. Walks the RIFF chunks, so extra chunks such as LIST are fine. Throws on anything else. */
export function readWav(bytes: Uint8Array): WavInfo {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (offset: number) => String.fromCharCode(...bytes.subarray(offset, offset + 4));
  if (bytes.length < 12 || tag(0) !== 'RIFF' || tag(8) !== 'WAVE') throw new Error('Not a RIFF/WAVE file');

  let fmt: { format: number; channels: number; sampleRate: number; bits: number } | undefined;
  let data: { start: number; size: number } | undefined;
  for (let offset = 12; offset + 8 <= bytes.length; ) {
    const id = tag(offset);
    const size = view.getUint32(offset + 4, true);
    const body = offset + 8;
    if (id === 'fmt ' && size >= 16 && body + 16 <= bytes.length) {
      fmt = { format: view.getUint16(body, true), channels: view.getUint16(body + 2, true), sampleRate: view.getUint32(body + 4, true), bits: view.getUint16(body + 14, true) };
    } else if (id === 'data') {
      if (body + size > bytes.length) throw new Error('Data chunk is truncated');
      data = { start: body, size };
      break;
    }
    offset = body + size + (size & 1);
  }

  if (!fmt) throw new Error('Missing fmt chunk');
  if (fmt.format !== 1 || fmt.bits !== 16) throw new Error('Unsupported format: expected 16-bit PCM');
  if (fmt.channels < 1 || fmt.sampleRate < 1) throw new Error('Invalid fmt chunk');
  if (!data) throw new Error('Missing data chunk');
  const frames = Math.floor(data.size / (2 * fmt.channels));
  if (frames === 0) throw new Error('No audio samples');

  let peak = 0;
  for (let i = 0; i < frames * fmt.channels; i++) peak = Math.max(peak, Math.abs(view.getInt16(data.start + i * 2, true)));
  return { channels: fmt.channels, sampleRate: fmt.sampleRate, bitsPerSample: 16, frames, durationSec: frames / fmt.sampleRate, peak: peak / 32768 };
}
