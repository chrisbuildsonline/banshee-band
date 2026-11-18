import { patternName, percentOf, pulseCount } from '../band';
import { CLASS_NAMES } from '../ghosts';
import { sideOf, type Side } from '../haptics';
import { STAGES } from './constants';
import { classifyText, dropText, formatMs, latencyNumber, outputName } from './format';
import type { RunResultOk as Run, StageName } from './types';

/** What `mountPipelineView` returns. */
export interface PipelineView {
  /** Fills the latency figure and the five stages from a run and keeps them until the next one. */
  show(result: Run): void;
  /** A run gave no valid event: keeps the previous result (figure included), or says "Not played" when there was none. */
  failed(): void;
  /** Back to the empty figure and stages ("— ms"). */
  clear(): void;
}

const SVG = 'http://www.w3.org/2000/svg';
const HEADINGS: Readonly<Record<StageName, string>> = { waveform: 'Waveform', label: 'Label', bearing: 'Bearing', pattern: 'Pattern', band: 'Band' };
const SIDE_TEXT: Readonly<Record<Side, string>> = { left: 'Left', centre: 'Centre', right: 'Right', unknown: 'Side unknown' };
/** Dial geometry in a 64 x 36 box: the half circle's centre and radius, and the needle length. */
const DIAL = { cx: 32, cy: 32, r: 26, needle: 21 };

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function svg<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

/** 64 bars, each as high as the peak of its slice, centred on the middle line. Decoration: the text says the length. */
function waveformSvg(peaks: readonly number[]): SVGSVGElement {
  const box = svg('svg', { class: 'bb-stage__wave', viewBox: `0 0 ${peaks.length} 24`, preserveAspectRatio: 'none', 'aria-hidden': 'true' });
  peaks.forEach((p, i) => {
    const h = Math.max(0.5, p * 24);
    box.append(svg('rect', { x: i + 0.15, y: (12 - h / 2).toFixed(2), width: 0.7, height: h.toFixed(2) }));
  });
  return box;
}

/** A half-circle dial from L to R with a needle at the bearing; dashed and without a needle when the side is unknown. */
function dialSvg(side: Side, bearingDeg: number | null): SVGSVGElement {
  const { cx, cy, r, needle } = DIAL;
  const box = svg('svg', { class: 'bb-stage__dial', viewBox: '0 0 64 42', 'aria-hidden': 'true' });
  const unknown = side === 'unknown' || bearingDeg === null;
  box.dataset.side = side;
  box.append(svg('path', { class: unknown ? 'bb-stage__arc bb-stage__arc--unknown' : 'bb-stage__arc', d: `M${cx - r} ${cy} A${r} ${r} 0 0 1 ${cx + r} ${cy}` }));
  box.append(svg('text', { class: 'bb-stage__dial-end', x: cx - r, y: cy + 9, 'text-anchor': 'middle' }), svg('text', { class: 'bb-stage__dial-end', x: cx + r, y: cy + 9, 'text-anchor': 'middle' }));
  box.children[1].textContent = 'L';
  box.children[2].textContent = 'R';
  if (!unknown) {
    const a = ((side === 'centre' ? 0 : bearingDeg) * Math.PI) / 180;
    box.append(svg('line', { class: 'bb-stage__needle', x1: cx, y1: cy, x2: (cx + needle * Math.sin(a)).toFixed(2), y2: (cy - needle * Math.cos(a)).toFixed(2) }));
  }
  box.append(svg('circle', { class: 'bb-stage__hub', cx, cy, r: 2.5 }));
  return box;
}

/** What the latency note says: before a run, after a clip or live run with a number, and when nothing buzzed. */
const LATENCY_NOTES = {
  none: 'Run a sound to measure it.',
  clip: 'From the press to the buzz: fetch, classify, side, pattern and output. The one-time model load and the screen paint are not counted.',
  live: 'From the end of a 0.975 s microphone window to the buzz. Microphone buffering, and the time the sound sat in the window, are not counted.',
  nothing: 'Nothing buzzed this time, so there is no output to time.',
} as const;

/**
 * The latency figure: a muted label, the number in display type with its muted unit, and a muted note. The
 * figure's text reads as one sentence ("Onset to output: 41 ms", the colon visually hidden); `data-latency-ms`
 * holds the number to one decimal while there is one, and the wrapper's `data-latency-source` says `clip` or
 * `live` after a run. Not a live region, not focusable.
 */
function mountLatency(): { root: HTMLDivElement; set(ms: number | null, source: 'clip' | 'live' | null): void } {
  const root = el('div', 'bb-latency');
  const figure = el('p', 'bb-latency__figure');
  const number = el('span', 'bb-latency__number');
  figure.append(el('span', 'bb-latency__label', 'Onset to output'), el('span', 'bb-station-sr', ': '), number, document.createTextNode(' '), el('span', 'bb-latency__unit', 'ms'));
  const note = el('p', 'bb-latency__note');
  root.append(figure, note);
  return {
    root,
    set(ms, source) {
      const measured = typeof ms === 'number' && latencyNumber(ms) !== '—';
      number.textContent = latencyNumber(measured ? ms : null);
      if (measured) figure.dataset.latencyMs = String(Math.round(ms * 10) / 10);
      else figure.removeAttribute('data-latency-ms');
      if (source) root.dataset.latencySource = source;
      else root.removeAttribute('data-latency-source');
      note.textContent = source === null ? LATENCY_NOTES.none : measured ? LATENCY_NOTES[source] : LATENCY_NOTES.nothing;
    },
  };
}

/**
 * Mounts the pipeline card's latency figure and five stages into `card`: Waveform, Label, Bearing, Pattern and
 * Band, each a `<section data-stage>` tile with its stage time ("— ms" before the first run, then `formatMs`
 * with the number in `data-ms`). Bars and the dial are `aria-hidden`; their values are in the text beside them.
 * No focusable element and no live region (the Latest alert is the one announcement). Shows no degrees.
 */
export function mountPipelineView(card: HTMLElement): PipelineView {
  const row = el('div', 'bb-stages');
  const parts = new Map<StageName, { time: HTMLParagraphElement; body: HTMLDivElement }>();
  STAGES.forEach((stage, i) => {
    const section = el('section', 'bb-stage');
    section.dataset.stage = stage;
    const head = el('div', 'bb-stage__head');
    const h = el('h3', 'bb-stage__title');
    h.append(el('span', 'bb-stage__num', String(i + 1)), document.createTextNode(` ${HEADINGS[stage]}`));
    const time = el('p', 'bb-stage__time');
    head.append(h, time);
    const body = el('div', 'bb-stage__body');
    section.append(head, body);
    row.append(section);
    parts.set(stage, { time, body });
  });
  const latency = mountLatency();
  card.append(latency.root, row);
  let shown = false;

  function line(text: string, strong = false): HTMLParagraphElement {
    return el('p', strong ? 'bb-stage__value' : 'bb-stage__detail', text);
  }

  function fill(stage: StageName, ms: number | null, ...content: Node[]): void {
    const { time, body } = parts.get(stage)!;
    time.textContent = ms === null ? '— ms' : formatMs(ms);
    if (ms === null) time.removeAttribute('data-ms');
    else time.dataset.ms = String(ms);
    body.replaceChildren(...content);
  }

  function clear(): void {
    shown = false;
    latency.set(null, null);
    fill('waveform', null, line('No clip yet'));
    fill('label', null, line('No label yet'));
    fill('bearing', null, line('No side yet'));
    fill('pattern', null, line('No pattern yet'));
    fill('band', null, line('Nothing played yet'));
  }

  clear();

  return {
    show(r) {
      shown = true;
      const side = sideOf(r.event, r.bearingConfidence);
      fill('waveform', r.times.waveform, waveformSvg(r.peaks), line(`${r.seconds.toFixed(1)} s`, true), line('16 kHz'));
      const backend = line(`Backend: ${r.backend}`);
      backend.dataset.backend = r.backend;
      const perWindow = r.times.label / Math.max(1, r.frames);
      const classify = line(classifyText(perWindow));
      classify.dataset.classifyMs = String(Math.round(perWindow * 10) / 10);
      fill('label', r.times.label, line(`${r.classification.label}, ${percentOf(r.classification.confidence)}%`, true), line(`Class: ${CLASS_NAMES[r.classification.class]}`), backend, classify);
      fill('bearing', r.times.bearing, dialSvg(side, r.event.bearingDeg), line(SIDE_TEXT[side], true), line(`Confidence ${percentOf(r.bearingConfidence)}%`));
      if (r.decision.action === 'play') {
        const pulses = pulseCount(r.decision.command.segments);
        fill('pattern', r.times.pattern, line(patternName(r.decision.command), true), line(`${pulses} ${pulses === 1 ? 'pulse' : 'pulses'}`));
      } else {
        fill('pattern', r.times.pattern, line(`No buzz: ${dropText(r.decision.reason)}`, true));
      }
      const played = r.played.map(outputName);
      fill('band', r.times.band, ...(played.length > 0 ? played.map((p, i) => line(p, i === 0)) : [line('No buzz', true)]));
      latency.set(r.latencyMs, r.onset);
    },
    failed() {
      if (!shown) parts.get('pattern')!.body.replaceChildren(line('Not played', true));
    },
    clear,
  };
}
