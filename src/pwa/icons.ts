/** The two colours of every icon: the Day accent (`#6236E0`) and the Day canvas (`#EEF0F4`). */
export const ICON_COLOURS = Object.freeze({ accent: [0x62, 0x36, 0xe0] as const, canvas: [0xee, 0xf0, 0xf4] as const });

/** The icon files `scripts/make-icons.ts` writes into `public/icons/`. */
export const ICON_SPECS = Object.freeze([
  { file: 'icon-192.png', size: 192, kind: 'any' },
  { file: 'icon-512.png', size: 512, kind: 'any' },
  { file: 'icon-maskable-512.png', size: 512, kind: 'maskable' },
] as const);

const SS = 4; // 4 x 4 samples per pixel
const HEM_R = 0.0867;

/** 0 outside, 1 accent, 2 canvas, at a point in unit coordinates. The ghost is scaled by `scale` about the centre. */
function sample(x: number, y: number, kind: 'any' | 'maskable', scale: number): 0 | 1 | 2 {
  if (kind === 'any' && Math.hypot(x - 0.5, y - 0.5) > 0.5) return 0;
  const gx = 0.5 + (x - 0.5) / scale;
  const gy = 0.5 + (y - 0.5) / scale;
  if (Math.hypot(gx - 0.42, gy - 0.45) <= 0.045 || Math.hypot(gx - 0.58, gy - 0.45) <= 0.045) return 1;
  const head = Math.hypot(gx - 0.5, gy - 0.42) <= 0.26;
  const body = gx >= 0.24 && gx <= 0.76 && gy >= 0.42 && gy <= 0.74;
  let hem = false;
  for (const cx of [0.24 + HEM_R, 0.5, 0.76 - HEM_R]) if (Math.hypot(gx - cx, gy - 0.74) <= HEM_R) hem = true;
  return head || body || hem ? 2 : 1;
}

/**
 * The app icon as RGBA pixels, row by row: a canvas-colour ghost with two accent eyes on an accent disc
 * (`any`, transparent outside the disc) or on a full accent square with the ghost at 0.8 scale, inside the
 * central 80% circle (`maskable`). Signed-distance shapes with 4 x 4 supersampling; the same input gives the
 * same bytes. Pure.
 */
export function renderIcon(size: number, kind: 'any' | 'maskable'): Uint8ClampedArray {
  const out = new Uint8ClampedArray(size * size * 4);
  const scale = kind === 'maskable' ? 0.8 : 1;
  const colours = [null, ICON_COLOURS.accent, ICON_COLOURS.canvas] as const;
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const c = colours[sample((px + (sx + 0.5) / SS) / size, (py + (sy + 0.5) / SS) / size, kind, scale)];
          if (!c) continue;
          r += c[0];
          g += c[1];
          b += c[2];
          a++;
        }
      }
      const i = (py * size + px) * 4;
      if (a > 0) {
        out[i] = Math.round(r / a);
        out[i + 1] = Math.round(g / a);
        out[i + 2] = Math.round(b / a);
      }
      out[i + 3] = Math.round((a / (SS * SS)) * 255);
    }
  }
  return out;
}
