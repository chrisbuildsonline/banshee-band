/**
 * The largest absolute sample of each of `buckets` equal slices (slice `i` covers `floor(i * n / buckets)` up to
 * `floor((i + 1) * n / buckets)`), clamped to 0..1, `NaN` counted as 0, an empty slice 0. Throws a `RangeError`
 * for a `buckets` that is not a positive integer. Pure.
 */
export function waveformPeaks(samples: Float32Array, buckets: number): number[] {
  if (!Number.isInteger(buckets) || buckets <= 0) throw new RangeError(`buckets must be a positive integer, got ${buckets}`);
  const n = samples.length;
  const peaks: number[] = [];
  for (let i = 0; i < buckets; i++) {
    let peak = 0;
    for (let j = Math.floor((i * n) / buckets); j < Math.floor(((i + 1) * n) / buckets); j++) {
      const a = Math.abs(samples[j]);
      if (a > peak) peak = a;
    }
    peaks.push(Math.min(1, peak));
  }
  return peaks;
}
