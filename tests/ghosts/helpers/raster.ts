// Test rasteriser for ghost paths: absolute M L H V C Q Z only, even-odd fill, 48 x 48 pixel centres.

/** Grid edge in pixels; the 24-unit box maps onto it at 2 px per unit. */
export const GRID = 48;
/** Steps per curve when flattening Q and C. */
const STEPS = 16;
const ALLOWED = new Set(['M', 'L', 'H', 'V', 'C', 'Q', 'Z']);

type Token = { cmd: string } | { num: number };
type Point = [number, number];

/** Splits a path into commands and numbers. Throws on any command other than M L H V C Q Z. */
export function tokenize(path: string): Token[] {
  const tokens: Token[] = [];
  const re = /([A-Za-z])|(-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?)|([\s,]+)|(.)/g;
  for (const m of path.matchAll(re)) {
    if (m[1]) {
      if (!ALLOWED.has(m[1])) throw new Error(`command "${m[1]}" is not allowed`);
      tokens.push({ cmd: m[1] });
    } else if (m[2]) tokens.push({ num: Number(m[2]) });
    else if (m[4]) throw new Error(`unexpected "${m[4]}" in path`);
  }
  return tokens;
}

/** Every number of the path paired as points, control points included. */
export function pathPoints(path: string): Point[] {
  const points: Point[] = [];
  let cmd = '';
  let nums: number[] = [];
  const flush = () => {
    if (cmd === 'H') nums.forEach((n) => points.push([n, Number.NaN]));
    else if (cmd === 'V') nums.forEach((n) => points.push([Number.NaN, n]));
    else for (let i = 0; i + 1 < nums.length; i += 2) points.push([nums[i], nums[i + 1]]);
  };
  for (const t of tokenize(path)) {
    if ('cmd' in t) {
      flush();
      cmd = t.cmd;
      nums = [];
    } else nums.push(t.num);
  }
  flush();
  return points;
}

/** The path flattened to closed polygons in unit coordinates. */
export function flatten(path: string): Point[][] {
  const polys: Point[][] = [];
  let poly: Point[] = [];
  let cur: Point = [0, 0];
  let start: Point = [0, 0];
  const tokens = tokenize(path);
  let i = 0;
  const num = (): number => {
    const t = tokens[i++];
    if (!t || !('num' in t)) throw new Error('missing number');
    return t.num;
  };
  const hasNum = () => i < tokens.length && 'num' in tokens[i];
  const close = () => {
    if (poly.length > 2) polys.push(poly);
    poly = [];
  };
  while (i < tokens.length) {
    const t = tokens[i++];
    if (!('cmd' in t)) throw new Error('number without a command');
    const c = t.cmd;
    if (c === 'Z') {
      close();
      cur = start;
      continue;
    }
    do {
      if (c === 'M') {
        close();
        cur = [num(), num()];
        start = cur;
        poly = [cur];
      } else if (c === 'L') {
        cur = [num(), num()];
        poly.push(cur);
      } else if (c === 'H') {
        cur = [num(), cur[1]];
        poly.push(cur);
      } else if (c === 'V') {
        cur = [cur[0], num()];
        poly.push(cur);
      } else if (c === 'Q') {
        const [x0, y0] = cur;
        const x1 = num(), y1 = num(), x2 = num(), y2 = num();
        for (let s = 1; s <= STEPS; s++) {
          const u = s / STEPS, v = 1 - u;
          poly.push([v * v * x0 + 2 * v * u * x1 + u * u * x2, v * v * y0 + 2 * v * u * y1 + u * u * y2]);
        }
        cur = [x2, y2];
      } else if (c === 'C') {
        const [x0, y0] = cur;
        const x1 = num(), y1 = num(), x2 = num(), y2 = num(), x3 = num(), y3 = num();
        for (let s = 1; s <= STEPS; s++) {
          const u = s / STEPS, v = 1 - u;
          poly.push([
            v * v * v * x0 + 3 * v * v * u * x1 + 3 * v * u * u * x2 + u * u * u * x3,
            v * v * v * y0 + 3 * v * v * u * y1 + 3 * v * u * u * y2 + u * u * u * y3,
          ]);
        }
        cur = [x3, y3];
      }
    } while (hasNum());
  }
  close();
  return polys;
}

/** Fills the path with the even-odd rule at the 48 x 48 pixel centres of the 24-unit box. */
export function rasterize(path: string): Uint8Array {
  const polys = flatten(path);
  const out = new Uint8Array(GRID * GRID);
  for (let j = 0; j < GRID; j++) {
    const py = (j + 0.5) / 2;
    for (let i = 0; i < GRID; i++) {
      const px = (i + 0.5) / 2;
      let inside = false;
      for (const poly of polys) {
        for (let a = 0, b = poly.length - 1; a < poly.length; b = a++) {
          const [xa, ya] = poly[a];
          const [xb, yb] = poly[b];
          if (ya > py !== yb > py && px < ((xb - xa) * (py - ya)) / (yb - ya) + xa) inside = !inside;
        }
      }
      out[j * GRID + i] = inside ? 1 : 0;
    }
  }
  return out;
}

/** Share of filled pixels, 0..1. */
export function areaRatio(mask: Uint8Array): number {
  let n = 0;
  for (const v of mask) n += v;
  return n / mask.length;
}

/** Share of pixels that are filled in one mask and not in the other, 0..1. */
export function differenceRatio(a: Uint8Array, b: Uint8Array): number {
  let n = 0;
  for (let k = 0; k < a.length; k++) if (a[k] !== b[k]) n++;
  return n / a.length;
}
