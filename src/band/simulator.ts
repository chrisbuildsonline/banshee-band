import type { HapticCommand, Side } from '../haptics';
import { patternName, percentOf, pulseCount } from './labels';
import { browserScheduler, createSegmentPlayer, type Levels } from './segment-player';
import type { HapticOutput } from './types';
import './simulator.css';

/** What `mountBandSimulator` returns: the simulator as an output, and a way to remove it. */
export interface BandSimulator {
  /** Always available. `play` shows the pattern and runs the motor cards; `stop` sets both to 0. */
  output: HapticOutput;
  /** Stops without announcing, cancels every timer and removes the simulator. Safe to call twice. */
  destroy(): void;
}

const SVG = 'http://www.w3.org/2000/svg';
/** Lane geometry in px; x positions and widths are percentages of the lane width, so corners never stretch. */
const LANE_HEIGHT = 52;
const LANE_GAP = 16;
const LANES_HEIGHT = LANE_HEIGHT * 2 + LANE_GAP;
const MIN_MARK_PERCENT = 0.6;

/** Glyph paths in a 16 x 16 box, stroked in `currentColor`. */
const GLYPHS: Readonly<Record<Side, { name: string; d: string }>> = {
  left: { name: 'left', d: 'M13 8H3.5M7.5 3.5 3 8l4.5 4.5' },
  right: { name: 'right', d: 'M3 8h9.5M8.5 3.5 13 8l-4.5 4.5' },
  centre: { name: 'centre', d: 'M2.5 3.5v9M13.5 3.5v9M8 6.25a1.75 1.75 0 1 1 0 3.5 1.75 1.75 0 0 1 0-3.5z' },
  unknown: { name: 'question', d: 'M5.75 5.75a2.25 2.25 0 1 1 3.4 1.95c-.7.4-1.15.9-1.15 1.7v.6M8 12.5v.25' },
};

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function svgEl<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

/** One motor card: heading, display number with a muted `%`, and a decorative bar. */
function motorCard(side: 'left' | 'right') {
  const card = el('section', 'bb-card bb-motor');
  card.dataset.motor = side;
  card.dataset.level = '0';
  const head = el('div', 'bb-motor__head');
  const title = el('h2', 'bb-heading bb-motor__title', side === 'left' ? 'Left motor' : 'Right motor');
  const tag = el('span', 'bb-motor__tag', side === 'left' ? 'L' : 'R');
  tag.setAttribute('aria-hidden', 'true');
  head.append(title, tag);
  const value = el('p', 'bb-motor__value');
  const num = el('span', 'bb-motor__num', '0');
  const unit = el('span', 'bb-motor__unit', '%');
  value.append(num, unit);
  const bar = el('div', 'bb-motor__bar');
  bar.setAttribute('aria-hidden', 'true');
  const fill = el('div', 'bb-motor__fill');
  fill.style.width = '0%';
  bar.append(fill);
  card.append(head, value, bar);
  return { card, num, fill };
}

/**
 * Mounts the band simulator into `container`: a left and a right motor card with the level as a number,
 * a pattern timeline card that names the pattern and draws its pulses, and one polite live region that
 * announces each pattern once. It holds no focusable element and plays no sound. Under
 * `prefers-reduced-motion: reduce` the bars change without a transition; numbers and bars still follow
 * every segment.
 */
export function mountBandSimulator(container: HTMLElement): BandSimulator {
  const root = el('div', 'bb-sim');

  const motors = el('div', 'bb-sim__motors');
  const left = motorCard('left');
  const right = motorCard('right');
  motors.append(left.card, right.card);

  const timeline = el('section', 'bb-card bb-timeline');
  const head = el('div', 'bb-timeline__head');
  const title = el('h2', 'bb-heading', 'Pattern');
  const count = el('p', 'bb-timeline__count', 'Choose a sound to see its pulses');
  head.append(title, count);
  const name = el('p', 'bb-timeline__name');
  const glyphBox = el('span', 'bb-timeline__glyph');
  const glyph = svgEl('svg', { viewBox: '0 0 16 16', 'aria-hidden': 'true' });
  const glyphPath = svgEl('path', { d: '' });
  glyph.append(glyphPath);
  glyphBox.append(glyph);
  const nameText = el('span', 'bb-timeline__label', 'No pattern yet');
  name.append(glyphBox, nameText);

  const plot = el('div', 'bb-timeline__plot');
  const laneLabels = el('div', 'bb-timeline__lane-labels');
  laneLabels.setAttribute('aria-hidden', 'true');
  laneLabels.append(el('span', '', 'L'), el('span', '', 'R'));
  const lanes = svgEl('svg', { class: 'bb-timeline__lanes', width: '100%', height: LANES_HEIGHT, 'aria-hidden': 'true' });
  for (const y of [0, LANE_HEIGHT + LANE_GAP]) {
    lanes.append(svgEl('rect', { class: 'bb-lane__track', x: 0, y, width: '100%', height: LANE_HEIGHT, rx: 10 }));
  }
  const marks = svgEl('g', {});
  lanes.append(marks);
  plot.append(laneLabels, lanes);

  const scale = el('p', 'bb-timeline__scale');
  const scaleStart = el('span', '', '0 ms');
  const scaleEnd = el('span', '', '');
  scale.append(scaleStart, scaleEnd);
  scale.hidden = true;
  timeline.append(head, name, plot, scale);

  const live = el('p', 'bb-sim__live');
  live.setAttribute('aria-live', 'polite');

  root.append(motors, timeline, live);
  container.append(root);

  let destroyed = false;

  /** The one writer of a motor's number, `data-level` and bar width, so the three always agree (R4.4). */
  function setMotor(motor: { card: HTMLElement; num: HTMLElement; fill: HTMLElement }, level: number): void {
    const percent = String(percentOf(level));
    motor.num.textContent = percent;
    motor.card.dataset.level = percent;
    motor.fill.style.width = `${percent}%`;
  }

  function show(levels: Levels): void {
    setMotor(left, levels.left);
    setMotor(right, levels.right);
  }

  const player = createSegmentPlayer(show, browserScheduler);

  function drawPattern(command: HapticCommand): void {
    root.dataset.side = command.side;
    const g = GLYPHS[command.side];
    glyph.dataset.glyph = g.name;
    glyphPath.setAttribute('d', g.d);
    nameText.textContent = patternName(command);
    const pulses = pulseCount(command.segments);
    count.textContent = `${pulses} ${pulses === 1 ? 'pulse' : 'pulses'}, ${command.totalMs} ms`;
    scaleEnd.textContent = `${command.totalMs} ms`;
    scale.hidden = false;

    marks.replaceChildren();
    const total = command.totalMs > 0 ? command.totalMs : 1;
    let start = 0;
    for (const seg of command.segments) {
      const x = (start / total) * 100;
      const w = Math.max(MIN_MARK_PERCENT, (seg.ms / total) * 100);
      for (const [lane, value, bottom] of [
        ['left', seg.left, LANE_HEIGHT],
        ['right', seg.right, LANES_HEIGHT],
      ] as const) {
        const h = Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0)) * LANE_HEIGHT;
        if (h <= 0) continue;
        marks.append(svgEl('rect', { class: 'bb-lane__mark', 'data-lane': lane, x: `${x.toFixed(3)}%`, y: (bottom - h).toFixed(2), width: `${w.toFixed(3)}%`, height: h.toFixed(2), rx: Math.min(6, h / 2).toFixed(2) }));
      }
      start += seg.ms;
    }
  }

  function announce(text: string): void {
    live.textContent = '';
    queueMicrotask(() => {
      if (!destroyed) live.textContent = text;
    });
  }

  const output: HapticOutput = {
    kind: 'simulator',
    available: () => true,
    play(command) {
      if (destroyed) return;
      drawPattern(command);
      announce(patternName(command));
      player.play(command);
    },
    stop() {
      if (destroyed) return;
      player.stop();
    },
  };

  return {
    output,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      player.stop();
      root.remove();
    },
  };
}
