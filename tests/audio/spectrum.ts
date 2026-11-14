// Small pure measuring helpers for the audio tests. No DSP library.

/** A sine of `freq` Hz, `seconds` long at `rate`, peak `amp`. */
export function sine(freq: number, rate: number, seconds: number, amp = 1, phase = 0): Float32Array {
  const n = Math.round(rate * seconds);
  const out = new Float32Array(n);
  const w = (2 * Math.PI * freq) / rate;
  for (let i = 0; i < n; i++) out[i] = amp * Math.sin(w * i + phase);
  return out;
}

/** Hann-windowed correlation of `x[start, end)` with a complex tone; returns the tone's peak amplitude. */
function amplitudeIn(x: Float32Array, start: number, end: number, rate: number, freq: number): number {
  const n = end - start;
  if (n < 2) return 0;
  const w = (2 * Math.PI * freq) / rate;
  const stepRe = Math.cos(w);
  const stepIm = Math.sin(w);
  let oscRe = Math.cos(w * start);
  let oscIm = Math.sin(w * start);
  let re = 0;
  let im = 0;
  let wsum = 0;
  const k = (2 * Math.PI) / (n - 1);
  for (let i = 0; i < n; i++) {
    const win = 0.5 - 0.5 * Math.cos(k * i);
    const v = x[start + i] * win;
    re += v * oscRe;
    im += v * oscIm;
    wsum += win;
    const nextRe = oscRe * stepRe - oscIm * stepIm;
    oscIm = oscRe * stepIm + oscIm * stepRe;
    oscRe = nextRe;
  }
  return (2 * Math.hypot(re, im)) / wsum;
}

/**
 * Peak amplitude of the tone at `freq` in `x`, ignoring `skip` samples at each end
 * (the resampler's edge region). Uses a Hann window, so the span need not hold whole cycles.
 */
export function toneAmplitude(x: Float32Array, rate: number, freq: number, skip = 0): number {
  return amplitudeIn(x, skip, x.length - skip, rate, freq);
}

/**
 * The strongest tone in `x` (ignoring `skip` samples at each end), found on a 10 Hz grid and then
 * refined to 0.01 Hz, with its peak amplitude.
 */
export function dominantFrequency(x: Float32Array, rate: number, skip = 0): { freq: number; amp: number } {
  const start = skip;
  const end = x.length - skip;
  // Coarse pass on a short middle segment, so the window's main lobe (2 * rate / len) covers the 10 Hz grid.
  const coarseLen = Math.min(end - start, Math.floor(0.2 * rate));
  const cStart = start + Math.floor((end - start - coarseLen) / 2);
  let best = 10;
  let bestAmp = -1;
  for (let f = 10; f < rate / 2; f += 10) {
    const a = amplitudeIn(x, cStart, cStart + coarseLen, rate, f);
    if (a > bestAmp) {
      bestAmp = a;
      best = f;
    }
  }
  // Refine on the whole span.
  for (const step of [1, 0.1, 0.01]) {
    const centre = best;
    bestAmp = -1;
    for (let i = -10; i <= 10; i++) {
      const f = centre + i * step;
      if (f <= 0 || f >= rate / 2) continue;
      const a = amplitudeIn(x, start, end, rate, f);
      if (a > bestAmp) {
        bestAmp = a;
        best = f;
      }
    }
  }
  return { freq: best, amp: bestAmp };
}

/** Root-mean-square of `x`, ignoring `skip` samples at each end. */
export function rms(x: Float32Array, skip = 0): number {
  const end = x.length - skip;
  if (end <= skip) return 0;
  let sum = 0;
  for (let i = skip; i < end; i++) sum += x[i] * x[i];
  return Math.sqrt(sum / (end - skip));
}
