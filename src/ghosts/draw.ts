import { ARC_INSET_PX, DASH_UNITS, DRIFT_PX, FADE_MS } from './constants';
import { labelTop } from './layout';
import { SHAPE_BOX } from './shapes';
import type { FieldSize, GhostLayout } from './types';

/** Colours, font and drift period read from the design tokens. */
export interface FieldColours {
  fill: string;
  outline: string;
  /** Glow colour by token name (`--bb-ghost-glow-1` ...). */
  glow: Readonly<Record<string, string>>;
  text: string;
  muted: string;
  border: string;
  font: string;
  /** Drift period in ms; 0 means no drift. */
  driftMs: number;
}

/** One ghost to draw: its layout and its life. */
export interface DrawnGhost {
  layout: GhostLayout;
  shownAt: number;
  expiresAt: number;
  seq: number;
}

/** Everything `drawField` needs. The path cache belongs to the field. */
export interface DrawState {
  size: FieldSize;
  dpr: number;
  colours: FieldColours;
  ghosts: readonly DrawnGhost[];
  now: number;
  motion: boolean;
  paths: Map<string, Path2D>;
}

/** Shading offset inside the body, in 24-unit box units: a thin crescent of outline colour along the lower edge. */
const SHADE_OFFSET = { x: -0.7, y: -1.1 };
const SHADE_ALPHA = 0.22;
const ARROW_LENGTH = 5;
const ARROW_WIDTH = 6;
const ARC_SAG = 12;

function pathOf(state: DrawState, shape: string): Path2D {
  let p = state.paths.get(shape);
  if (!p) {
    p = new Path2D(shape);
    state.paths.set(shape, p);
  }
  return p;
}

/** Cuts `text` with an ellipsis until it is at most `max` px wide (binary search on the length). */
export function fitLabel(ctx: CanvasRenderingContext2D, text: string, max: number): string {
  if (ctx.measureText(text).width <= max) return text;
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (ctx.measureText(`${text.slice(0, mid).trimEnd()}…`).width <= max) lo = mid;
    else hi = mid - 1;
  }
  return `${text.slice(0, lo).trimEnd()}…`;
}

function furniture(ctx: CanvasRenderingContext2D, { size, colours }: DrawState): void {
  const { width: W, height: H } = size;
  ctx.fillStyle = colours.muted;
  ctx.font = `600 12px ${colours.font}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('L', 14, H / 2);
  ctx.fillText('R', W - 14, H / 2);

  ctx.beginPath();
  ctx.arc(W / 2, H - 10, 24, Math.PI, 2 * Math.PI);
  ctx.strokeStyle = colours.border;
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.setLineDash([]);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(W / 2, H - 10, 4, 0, 2 * Math.PI);
  ctx.fill();
}

function arrowHead(ctx: CanvasRenderingContext2D, tipX: number, tipY: number, dx: number, dy: number): void {
  const len = Math.hypot(dx, dy);
  const ux = dx / len;
  const uy = dy / len;
  const bx = tipX - ux * ARROW_LENGTH;
  const by = tipY - uy * ARROW_LENGTH;
  ctx.beginPath();
  ctx.moveTo(tipX, tipY);
  ctx.lineTo(bx - uy * (ARROW_WIDTH / 2), by + ux * (ARROW_WIDTH / 2));
  ctx.lineTo(bx + uy * (ARROW_WIDTH / 2), by - ux * (ARROW_WIDTH / 2));
  ctx.closePath();
  ctx.fill();
}

/** The wide, thin, double-headed arc of an uncertain ghost, from the L side to the R side, at the body's height. */
function uncertainArc(ctx: CanvasRenderingContext2D, W: number, y: number, colour: string): void {
  const x0 = ARC_INSET_PX;
  const x1 = W - ARC_INSET_PX;
  const cx = W / 2;
  const cy = y + ARC_SAG;
  ctx.strokeStyle = colour;
  ctx.fillStyle = colour;
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.setLineDash([]);
  // Stop the line where the heads start, so the tips stay sharp.
  const t = ARROW_LENGTH / Math.hypot(cx - x0, cy - y);
  ctx.beginPath();
  ctx.moveTo(x0 + (cx - x0) * t, y + (cy - y) * t);
  ctx.quadraticCurveTo(cx, cy, x1 - (x1 - cx) * t, y + (cy - y) * t);
  ctx.stroke();
  arrowHead(ctx, x0, y, x0 - cx, y - cy);
  arrowHead(ctx, x1, y, x1 - cx, y - cy);
}

function ghost(ctx: CanvasRenderingContext2D, state: DrawState, g: DrawnGhost): void {
  const { layout: l } = g;
  const { colours, size, now, motion } = state;
  const remaining = g.expiresAt - now;
  const alpha = motion ? Math.max(0, Math.min(1, (now - g.shownAt) / FADE_MS, remaining / FADE_MS)) : 1;
  if (alpha <= 0) return;
  const dy = motion && colours.driftMs > 0 ? DRIFT_PX * Math.sin(2 * Math.PI * (now / colours.driftMs + g.seq * 0.37)) : 0;

  ctx.save();
  ctx.globalAlpha = alpha;
  if (l.uncertain) uncertainArc(ctx, size.width, l.y, colours.border);

  const path = pathOf(state, l.shape);
  const k = l.boxPx / SHAPE_BOX;
  ctx.save();
  ctx.translate(l.x, l.y + dy);
  ctx.scale(k, k);
  ctx.translate(-SHAPE_BOX / 2, -SHAPE_BOX / 2);

  // Glow and body: the canvas shadow of the fill. shadowBlur is in device pixels, so scale it by dpr.
  ctx.shadowColor = colours.glow[l.glowToken] ?? colours.outline;
  ctx.shadowBlur = l.glowBlur * state.dpr;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
  ctx.fillStyle = colours.fill;
  ctx.fill(path, 'evenodd');
  ctx.shadowBlur = 0;

  // Volume: a soft crescent of the outline colour along the lower edge, inside the body.
  ctx.save();
  ctx.clip(path, 'evenodd');
  ctx.globalAlpha = alpha * SHADE_ALPHA;
  ctx.fillStyle = colours.outline;
  ctx.fill(path, 'evenodd');
  ctx.globalAlpha = alpha;
  ctx.translate(SHADE_OFFSET.x, SHADE_OFFSET.y);
  ctx.fillStyle = colours.fill;
  ctx.fill(path, 'evenodd');
  ctx.restore();

  ctx.lineWidth = l.outlineWidth;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'butt';
  ctx.setLineDash(l.uncertain ? [...DASH_UNITS] : []);
  ctx.strokeStyle = colours.outline;
  ctx.stroke(path);
  ctx.restore();

  ctx.font = `500 13px ${colours.font}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillStyle = colours.text;
  const text = fitLabel(ctx, l.labelText, size.width - 16);
  const w = ctx.measureText(text).width;
  const lx = Math.min(Math.max(l.x, 8 + w / 2), size.width - 8 - w / 2);
  ctx.fillText(text, lx, labelTop(l));
  ctx.restore();
}

/** Draws the whole field: furniture, then each ghost (arc, glow and fill, outline, label). Canvas only, no state. */
export function drawField(ctx: CanvasRenderingContext2D, state: DrawState): void {
  const { width: W, height: H } = state.size;
  ctx.clearRect(0, 0, W, H);
  furniture(ctx, state);
  for (let i = state.ghosts.length - 1; i >= 0; i--) ghost(ctx, state, state.ghosts[i]);
}

/** Reads a CSS duration ("6s", "150ms") as ms; anything else is 0. */
export function parseDurationMs(value: string): number {
  const m = /^\s*(\d*\.?\d+)\s*(ms|s)\s*$/.exec(value);
  if (!m) return 0;
  return Number(m[1]) * (m[2] === 's' ? 1000 : 1);
}
