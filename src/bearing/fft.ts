/** Twiddle and bit-reversal tables for one power-of-two size, built once and reused. */
export interface FftPlan {
  readonly n: number;
  /** cos(2πk/n) for k < n/2. */
  readonly cos: Float64Array;
  /** sin(2πk/n) for k < n/2. */
  readonly sin: Float64Array;
  /** Bit-reversed index of every position. */
  readonly rev: Uint32Array;
}

/** Builds the tables for size `n`. Throws a RangeError unless `n` is a power of two >= 2. */
export function createFftPlan(n: number): FftPlan {
  if (!Number.isInteger(n) || n < 2 || n > 2 ** 30 || (n & (n - 1)) !== 0) {
    throw new RangeError(`FFT size must be a power of two >= 2, got ${n}`);
  }
  const half = n / 2;
  const cos = new Float64Array(half);
  const sin = new Float64Array(half);
  for (let k = 0; k < half; k++) {
    cos[k] = Math.cos((2 * Math.PI * k) / n);
    sin[k] = Math.sin((2 * Math.PI * k) / n);
  }
  const bits = Math.log2(n);
  const rev = new Uint32Array(n);
  for (let i = 0; i < n; i++) {
    let r = 0;
    for (let b = 0, x = i; b < bits; b++, x >>= 1) r = (r << 1) | (x & 1);
    rev[i] = r;
  }
  return { n, cos, sin, rev };
}

/** In-place iterative radix-2 transform; `sign` -1 is the forward DFT, +1 the unscaled inverse. */
function transform(plan: FftPlan, re: Float64Array, im: Float64Array, sign: -1 | 1): void {
  const { n, cos, sin, rev } = plan;
  if (re.length !== n || im.length !== n) {
    throw new RangeError(`FFT arrays must have length ${n}, got ${re.length} and ${im.length}`);
  }
  for (let i = 0; i < n; i++) {
    const j = rev[i];
    if (j > i) {
      const tr = re[i];
      re[i] = re[j];
      re[j] = tr;
      const ti = im[i];
      im[i] = im[j];
      im[j] = ti;
    }
  }
  for (let size = 2; size <= n; size *= 2) {
    const half = size / 2;
    const step = n / size;
    for (let start = 0; start < n; start += size) {
      for (let j = 0, k = 0; j < half; j++, k += step) {
        const wr = cos[k];
        const wi = sign * sin[k];
        const a = start + j;
        const b = a + half;
        const tr = wr * re[b] - wi * im[b];
        const ti = wr * im[b] + wi * re[b];
        re[b] = re[a] - tr;
        im[b] = im[a] - ti;
        re[a] += tr;
        im[a] += ti;
      }
    }
  }
}

/** Forward DFT in place: X[k] = sum x[t]·e^{-j2πkt/n}. */
export function fft(plan: FftPlan, re: Float64Array, im: Float64Array): void {
  transform(plan, re, im, -1);
}

/** Inverse DFT in place, scaled by 1/n, so ifft(fft(x)) = x. */
export function ifft(plan: FftPlan, re: Float64Array, im: Float64Array): void {
  transform(plan, re, im, 1);
  const scale = 1 / plan.n;
  for (let i = 0; i < plan.n; i++) {
    re[i] *= scale;
    im[i] *= scale;
  }
}
