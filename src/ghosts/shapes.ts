import type { SoundClass } from '../events';

/** Edge of the unit box every silhouette is drawn in. */
export const SHAPE_BOX = 24;

const KAPPA = 0.5523;
const round3 = (n: number) => Math.round(n * 1000) / 1000;

/** One eye: a closed oval of four `C` curves around (x, y), `w` wide and `h` high, starting at its top. */
function eye(x: number, y: number, w = 2.2, h = 3): string {
  const [rx, ry] = [w / 2, h / 2];
  const [kx, ky] = [KAPPA * rx, KAPPA * ry];
  const n = (...v: number[]) => v.map(round3).join(' ');
  return [
    `M ${n(x, y - ry)}`,
    `C ${n(x + kx, y - ry, x + rx, y - ky, x + rx, y)}`,
    `C ${n(x + rx, y + ky, x + kx, y + ry, x, y + ry)}`,
    `C ${n(x - kx, y + ry, x - rx, y + ky, x - rx, y)}`,
    `C ${n(x - rx, y - ky, x - kx, y - ry, x, y - ry)} Z`,
  ].join(' ');
}

/** The two eyes of a ghost, at the same height, left eye first. */
function eyes(xLeft: number, xRight: number, y: number, w?: number, h?: number): string {
  return `${eye(xLeft, y, w, h)} ${eye(xRight, y, w, h)}`;
}

/**
 * One silhouette per sound class, as an SVG path of absolute `M L H V C Q Z` commands in the 24-unit box,
 * every point inside [2, 22]. Filled with the even-odd rule, so every extra subpath is a hole. Subpaths in order:
 * the outer outline, any detail (the Voice mouth), then the two eyes, so `shapeParts` can stroke the outline and the
 * details and leave the eyes clean. Every ghost has the same two oval eyes; the outline alone tells the classes apart.
 */
export const SHAPES: Readonly<Record<SoundClass, string>> = Object.freeze({
  // Tall, square shoulders, a flat hem that settles out at the corners.
  knock: `M 5 6 C 5 3.8 6.4 2.6 8.6 2.6 H 15.4 C 17.6 2.6 19 3.8 19 6 C 19 10 18.2 13 18.6 16.6 C 18.9 19 19.8 20.6 21 21.6 H 3 C 4.2 20.6 5.1 19 5.4 16.6 C 5.8 13 5 10 5 6 Z ${eyes(9.6, 14.4, 8.6)}`,
  // Narrow body under a small round chime knob, three round lobes at the hem.
  doorbell: `M 11 6.9 C 9.2 6.3 9.4 2 12 2 C 14.6 2 14.8 6.3 13 6.9 C 15.6 7.4 17 9.4 17 12 V 18.8 C 17 22 13.67 22 13.67 18.8 C 13.67 22 10.33 22 10.33 18.8 C 10.33 22 7 22 7 18.8 V 12 C 7 9.4 8.4 7.4 11 6.9 Z ${eyes(10.2, 13.8, 12.4)}`,
  // Bell: round top, sides flaring to a wide lipped hem, a round clapper under the middle.
  alarm: `M 12 2.5 C 15 2.5 16.6 5 16.6 8.6 C 16.6 12.6 17.4 15.6 20.6 17.6 C 21.6 18.3 21.3 19.6 20 19.6 H 14.2 C 14.2 21 13.2 22 12 22 C 10.8 22 9.8 21 9.8 19.6 H 4 C 2.7 19.6 2.4 18.3 3.4 17.6 C 6.6 15.6 7.4 12.6 7.4 8.6 C 7.4 5 9 2.5 12 2.5 Z ${eyes(10.6, 13.4, 9.6)}`,
  // Small and round, low in the box, one curled tuft rising from the top of the head.
  baby: `M 10.8 10.1 C 10.4 6.6 12.4 3.2 15.8 2.6 C 17.6 2.3 18.4 4.4 17 5.4 C 16.6 4.6 15.8 4.4 15.2 4.8 C 14 5.6 13.4 7.6 13.4 10.1 C 16.6 10.6 18.4 13 18.4 16 V 18.8 C 18.4 22 14.13 22 14.13 18.8 C 14.13 22 9.87 22 9.87 18.8 C 9.87 22 5.6 22 5.6 18.8 V 16 C 5.6 13 7.6 10.5 10.8 10.1 Z ${eyes(10.2, 13.8, 14.6)}`,
  // Wide and low, head in front, a long wavy hem trailing behind.
  vehicle: `M 2.4 10.6 C 4.6 12.4 7.4 12.2 9.6 9.8 C 11.2 8 13 7 15.4 7 C 19 7 21.6 9.6 21.6 12.6 C 21.6 15.2 20.4 17 18.6 17.6 C 18.4 19.6 16 19.6 15.6 17.8 C 15.2 19.6 12.8 19.6 12.4 17.8 C 9.2 18.4 5.2 15.4 2.4 10.6 Z ${eyes(13.2, 17.6, 11.2)}`,
  // Round and wide, four lobes at the hem, an open mouth with a wavy lower lip cut as a hole.
  voice: `M 4 12 C 4 7.6 7.6 4 12 4 C 16.4 4 20 7.6 20 12 V 18.8 C 20 22 16 22 16 18.8 C 16 22 12 22 12 18.8 C 12 22 8 22 8 18.8 C 8 22 4 22 4 18.8 Z M 8 12.2 C 10.5 11.2 13.5 11.2 16 12.2 C 15.8 14.2 15 15.6 13.8 15.2 C 13 14.9 12.6 14.4 12 14.4 C 11.4 14.4 11 14.9 10.2 15.2 C 9 15.6 8.2 14.2 8 12.2 Z ${eyes(9.4, 14.6, 7.6, 2.2, 2.6)}`,
  // Plain round-topped ghost with a smooth wavy hem of three dips.
  other: `M 6 9.6 C 6 5.6 8.7 2.4 12 2.4 C 15.3 2.4 18 5.6 18 9.6 V 19.6 C 18 21 17.4 21.8 16.4 21.8 C 15.4 21.8 15.2 19.4 14.2 19.4 C 13.2 19.4 13 21.8 12 21.8 C 11 21.8 10.8 19.4 9.8 19.4 C 8.8 19.4 8.6 21.8 7.6 21.8 C 6.6 21.8 6 21 6 19.6 Z ${eyes(10.2, 13.8, 9)}`,
});
