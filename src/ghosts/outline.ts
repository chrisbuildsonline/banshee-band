// Pure helpers for the parts and the dashed outline of a ghost path (absolute M L H V C Q Z only).

/** Dash periods per unit of outline width: a period is about 6 widths, so the gap (a third) is about 2 widths. */
const PERIODS_PER_WIDTH = 6;
/** Fewest dashes around an outline. */
const MIN_COUNT = 3;
/** Steps per curve when measuring. */
const CURVE_STEPS = 32;

/**
 * Splits a ghost path at its `M` commands. Three or more subpaths: `outer` is the first, `eyes` the last two and
 * `details` the ones in between (the Voice mouth). Fewer: the whole path is `outer`, with no details and no eyes.
 */
export function shapeParts(path: string): { outer: string; details: string[]; eyes: string[] } {
  const parts = path
    .trim()
    .split(/(?=M)/)
    .map((p) => p.trim())
    .filter((p) => p !== '');
  if (parts.length < 3) return { outer: path, details: [], eyes: [] };
  return { outer: parts[0], details: parts.slice(1, -2), eyes: parts.slice(-2) };
}

/** Length of every subpath of `path` in 24-unit box units: curves flattened, closing segments included. */
export function pathLength(path: string): number {
  const tokens = path.match(/[A-Za-z]|-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/g) ?? [];
  let i = 0;
  let length = 0;
  let cur: [number, number] = [0, 0];
  let start: [number, number] = [0, 0];
  const num = () => Number(tokens[i++]);
  const hasNum = () => i < tokens.length && !/[A-Za-z]/.test(tokens[i]);
  const lineTo = (x: number, y: number) => {
    length += Math.hypot(x - cur[0], y - cur[1]);
    cur = [x, y];
  };
  const curve = (at: (u: number) => [number, number]) => {
    for (let s = 1; s <= CURVE_STEPS; s++) lineTo(...at(s / CURVE_STEPS));
  };
  while (i < tokens.length) {
    const c = tokens[i++];
    if (c === 'Z' || c === 'z') {
      lineTo(...start);
      continue;
    }
    while (hasNum()) {
      if (c === 'M') {
        cur = [num(), num()];
        start = cur;
      } else if (c === 'L') lineTo(num(), num());
      else if (c === 'H') lineTo(num(), cur[1]);
      else if (c === 'V') lineTo(cur[0], num());
      else if (c === 'Q') {
        const [x0, y0] = cur;
        const [x1, y1, x2, y2] = [num(), num(), num(), num()];
        curve((u) => {
          const v = 1 - u;
          return [v * v * x0 + 2 * v * u * x1 + u * u * x2, v * v * y0 + 2 * v * u * y1 + u * u * y2];
        });
      } else if (c === 'C') {
        const [x0, y0] = cur;
        const [x1, y1, x2, y2, x3, y3] = [num(), num(), num(), num(), num(), num()];
        curve((u) => {
          const v = 1 - u;
          const [a, b, d, e] = [v * v * v, 3 * v * v * u, 3 * v * u * u, u * u * u];
          return [a * x0 + b * x1 + d * x2 + e * x3, a * y0 + b * y1 + d * y2 + e * y3];
        });
      } else i++;
    }
  }
  return length;
}

/**
 * The `[dash, gap]` of an uncertain outline of `outlineWidth` units around an outline of `lengthUnits`: a whole number
 * of periods (at least 3, about one per 6 widths), so no stub is left where the outline starts; dash two thirds, gap
 * one third. A width or length that is not a positive finite number gives `[0, 0]`, a solid line.
 */
export function dashFor(outlineWidth: number, lengthUnits: number): [number, number] {
  const ok = (n: number) => Number.isFinite(n) && n > 0;
  if (!ok(outlineWidth) || !ok(lengthUnits)) return [0, 0];
  const count = Math.max(MIN_COUNT, Math.round(lengthUnits / (PERIODS_PER_WIDTH * outlineWidth)));
  const period = lengthUnits / count;
  return [(period * 2) / 3, period / 3];
}
