/**
 * Samples of a RIFF/WAVE file with PCM format 1, one channel, 16000 Hz and 16 bits, each as `int16 / 32768`.
 * Walks the chunks (skipping e.g. `LIST`, with the pad byte of an odd chunk) and reads at most the bytes that
 * exist. Returns `null`, never throws, for anything else. Does not keep or change its input. Pure.
 */
export function decodePcm16kWav(bytes: ArrayBuffer | Uint8Array): Float32Array | null {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const view = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  const tag = (at: number) => String.fromCharCode(u8[at], u8[at + 1], u8[at + 2], u8[at + 3]);
  if (u8.length < 12 || tag(0) !== 'RIFF' || tag(8) !== 'WAVE') return null;
  let fmtOk = false;
  for (let at = 12; at + 8 <= u8.length; ) {
    const id = tag(at);
    const size = view.getUint32(at + 4, true);
    const body = at + 8;
    if (id === 'fmt ') {
      if (size < 16 || body + 16 > u8.length) return null;
      fmtOk =
        view.getUint16(body, true) === 1 &&
        view.getUint16(body + 2, true) === 1 &&
        view.getUint32(body + 4, true) === 16000 &&
        view.getUint16(body + 14, true) === 16;
      if (!fmtOk) return null;
    } else if (id === 'data') {
      if (!fmtOk) return null;
      const n = Math.floor(Math.min(size, u8.length - body) / 2);
      if (n === 0) return null;
      const out = new Float32Array(n);
      for (let i = 0; i < n; i++) out[i] = view.getInt16(body + i * 2, true) / 32768;
      return out;
    }
    at = body + size + (size & 1);
  }
  return null;
}
