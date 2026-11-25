import { drawField, parseDurationMs, type FieldColours } from './draw';
import { acceptInput } from './input';
import { layoutGhosts } from './layout';
import { createGhostSet, resolveTtl } from './life';
import { canvasSummary, dataX, EMPTY_TEXT, listItemText } from './text';
import { trailAlpha } from './trail';
import type { FieldSize, GhostField, GhostFieldOptions, GhostLayout } from './types';
import './field.css';

const GLOW_TOKENS = ['--bb-ghost-glow-1', '--bb-ghost-glow-2', '--bb-ghost-glow-3'];
let fieldCount = 0;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** Colours, font and drift period from the tokens on the canvas. A missing token falls back to a plain neutral here only. */
function readColours(canvas: HTMLCanvasElement): FieldColours {
  const style = getComputedStyle(canvas);
  const read = (name: string) => style.getPropertyValue(name).trim();
  const colour = (name: string) => read(name) || '#000';
  return {
    fill: colour('--bb-ghost-fill'),
    outline: colour('--bb-ghost-outline'),
    glow: Object.fromEntries(GLOW_TOKENS.map((t) => [t, colour(t)])),
    text: colour('--bb-color-text'),
    muted: colour('--bb-color-text-muted'),
    border: colour('--bb-color-border'),
    font: read('--bb-font-family') || 'sans-serif',
    driftMs: parseDurationMs(read('--bb-motion-ghost-drift')),
  };
}

/**
 * Mounts a ghost field into `container`: a transparent canvas (`role="img"`, labelled with a summary of
 * the live ghosts) and, under it, a "Now:" list with one item per ghost. Up to four ghosts, newest on the
 * top row; each lives `ttlMs` (default 8000). With `trail` the latest ghost stays, older ones dim by age and the
 * list says "Recent:". Under reduced motion nothing animates and no animation frame is requested. Holds no
 * focusable element and no live region.
 */
export function mountGhostField(container: HTMLElement, options: GhostFieldOptions = {}): GhostField {
  const trail = options.trail === true;
  const ttl = resolveTtl(options.ttlMs);
  const heading = trail ? 'Recent:' : 'Now:';
  const set = createGhostSet(ttl, trail);
  const id = `bb-ghost-now-${++fieldCount}`;

  const root = el('div', 'bb-ghost-field');
  const canvas = el('canvas', 'bb-ghost-field__canvas');
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', EMPTY_TEXT);
  const listBox = el('div', 'bb-ghost-field__list');
  const now = el('p', 'bb-ghost-field__now', heading);
  now.id = id;
  const list = el('ul', 'bb-ghost-field__items');
  list.setAttribute('aria-labelledby', id);
  listBox.append(now, list);
  root.append(canvas, listBox);
  container.append(root);

  const ctx = canvas.getContext('2d');
  const paths = new Map<string, Path2D>();
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  const dark = window.matchMedia('(prefers-color-scheme: dark)');
  let colours = readColours(canvas);
  let size: FieldSize = { width: canvas.clientWidth, height: canvas.clientHeight };
  let dpr = 0;
  let layouts: GhostLayout[] = [];
  let timer: ReturnType<typeof setTimeout> | undefined;
  let frame = 0;
  let destroyed = false;

  const motionAllowed = () => !reduce.matches;

  function fitBackingStore(): void {
    const ratio = window.devicePixelRatio || 1;
    const w = Math.round(size.width * ratio);
    const h = Math.round(size.height * ratio);
    if (ratio === dpr && canvas.width === w && canvas.height === h) return;
    dpr = ratio;
    canvas.width = w;
    canvas.height = h;
    ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function draw(at: number = performance.now()): void {
    if (destroyed || !ctx || size.width <= 0 || size.height <= 0) return;
    fitBackingStore();
    const items = set.items();
    drawField(ctx, {
      size,
      dpr,
      colours,
      ghosts: layouts.map((layout, i) => ({
        layout,
        shownAt: items[i].shownAt,
        expiresAt: items[i].expiresAt,
        seq: items[i].seq,
        bodyAlpha: trail ? trailAlpha(i, at - items[i].shownAt, ttl) : 1,
      })),
      now: at,
      motion: motionAllowed(),
      paths,
    });
  }

  function relayout(): void {
    layouts = layoutGhosts(set.items().map((g) => g.input), size);
    list.querySelectorAll('li[data-class]').forEach((li, i) => {
      if (layouts[i]) li.setAttribute('data-x', dataX(layouts[i].x, size.width));
    });
  }

  function updateText(): void {
    const items = set.items();
    const texts = items.map((g, i) => ({ cls: g.input.event.class, side: layouts[i].side, urgency: g.input.event.urgency }));
    canvas.setAttribute('aria-label', canvasSummary(texts, heading));
    if (texts.length === 0) {
      list.replaceChildren(el('li', 'bb-ghost-field__item bb-ghost-field__item--empty', EMPTY_TEXT));
      return;
    }
    list.replaceChildren(
      ...texts.map((t, i) => {
        const li = el('li', 'bb-ghost-field__item', listItemText(t.cls, t.side, t.urgency));
        li.dataset.class = t.cls;
        li.dataset.side = t.side;
        li.dataset.urgency = t.urgency;
        li.dataset.x = dataX(layouts[i].x, size.width);
        return li;
      }),
    );
  }

  function stopLoop(): void {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
  }

  // One stable callback per field, so each frame re-registers the same function.
  const tick = (): void => {
    frame = 0;
    if (destroyed || !motionAllowed() || set.items().length === 0) return;
    draw();
    frame = requestAnimationFrame(tick);
  };

  function startLoop(): void {
    if (frame || destroyed || !motionAllowed() || set.items().length === 0) return;
    frame = requestAnimationFrame(tick);
  }

  function scheduleExpiry(): void {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
    const nowMs = performance.now();
    let next = set.nextExpiry();
    // Trail: one more wake-up when the latest ghost turns old, to redraw it at the faintest step.
    const latest = set.items()[0];
    if (trail && latest && latest.shownAt + ttl > nowMs) next = Math.min(next ?? Infinity, latest.shownAt + ttl + 1);
    if (next !== null && Number.isFinite(next)) timer = setTimeout(onExpiry, Math.max(0, next - nowMs));
  }

  function onSetChange(): void {
    relayout();
    updateText();
    scheduleExpiry();
    draw();
    if (set.items().length === 0) stopLoop();
    else startLoop();
  }

  function onExpiry(): void {
    timer = undefined;
    if (set.prune(performance.now())) onSetChange();
    else {
      draw();
      scheduleExpiry();
    }
  }

  function onResize(): void {
    const next = { width: canvas.clientWidth, height: canvas.clientHeight };
    if (next.width === size.width && next.height === size.height && dpr === window.devicePixelRatio) return;
    size = next;
    colours = readColours(canvas);
    relayout();
    draw();
  }

  function onColours(): void {
    colours = readColours(canvas);
    draw();
  }

  function onMotionChange(): void {
    if (!motionAllowed()) stopLoop();
    colours = readColours(canvas);
    draw();
    startLoop();
  }

  const resizeObserver = new ResizeObserver(onResize);
  resizeObserver.observe(canvas);
  const themeObserver = new MutationObserver(onColours);
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  dark.addEventListener('change', onColours);
  reduce.addEventListener('change', onMotionChange);
  updateText();
  draw();

  return {
    show(input) {
      if (destroyed) return false;
      const accepted = acceptInput(input);
      if (!accepted) return false;
      set.add(accepted, performance.now());
      onSetChange();
      return true;
    },
    clear() {
      if (destroyed) return;
      const had = set.items().length > 0;
      set.clear();
      if (had) onSetChange();
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      if (timer !== undefined) clearTimeout(timer);
      timer = undefined;
      stopLoop();
      resizeObserver.disconnect();
      themeObserver.disconnect();
      dark.removeEventListener('change', onColours);
      reduce.removeEventListener('change', onMotionChange);
      root.remove();
    },
    ghosts: () => layouts.map((l) => ({ ...l })),
  };
}
