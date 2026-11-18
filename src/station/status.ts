import type { OutputChoice } from './settings';

/** What the status pill can say. The words and the glyph shape carry the state, not the tint. */
export interface StatusPill {
  /** "Problem" with the cross glyph and the strong tint: the sound model could not be loaded. */
  setProblem(): void;
  /** Back to the base state ("Band not connected" or "Phone vibration fallback"). */
  reset(): void;
  /** Sets the base state from the output in use (`pillFor`). "Problem" stays until `reset`. */
  setOutput(effective: OutputChoice): void;
}

const SVG = 'http://www.w3.org/2000/svg';

/** The states of the station's status pill. */
export type StationPill = 'band-on' | 'band-off' | 'fallback' | 'problem';

/** The base pill for the output in use: "Band connected" for the wristband, "Phone vibration fallback" for the phone, else "Band not connected". */
export function pillFor(effective: OutputChoice): Exclude<StationPill, 'problem'> {
  return effective === 'band' ? 'band-on' : effective === 'phone' ? 'fallback' : 'band-off';
}

/** The look of each station pill state. */
export const STATION_PILLS: Readonly<Record<StationPill, PillLook>> = {
  'band-on': { text: 'Band connected', tint: 'accent', glyph: 'dot', line: false, draw: ['circle', { cx: 6, cy: 6, r: 4 }] },
  'band-off': { text: 'Band not connected', tint: 'neutral', glyph: 'circle', line: true, draw: ['circle', { cx: 6, cy: 6, r: 3.75 }] },
  fallback: { text: 'Phone vibration fallback', tint: 'neutral', glyph: 'triangle', line: false, draw: ['path', { d: 'M6 1.5 11 10.5H1z' }] },
  problem: { text: 'Problem', tint: 'strong', glyph: 'cross', line: true, draw: ['path', { d: 'M3 3l6 6M9 3l-6 6' }] },
};

function svg(tag: string, attrs: Record<string, string | number>): SVGElement {
  const node = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

/** One status pill look: the word, the tint, the glyph name and its 12px drawing (`line`: stroked, not filled). */
export interface PillLook {
  text: string;
  tint: string;
  glyph: string;
  line: boolean;
  draw: [string, Record<string, string | number>];
}

/** The glyph drawings shared by the station's status pills, by glyph name. */
export const GLYPHS: Readonly<Record<string, { line: boolean; draw: [string, Record<string, string | number>] }>> = {
  circle: { line: true, draw: ['circle', { cx: 6, cy: 6, r: 3.75 }] },
  dot: { line: false, draw: ['circle', { cx: 6, cy: 6, r: 4 }] },
  square: { line: false, draw: ['rect', { x: 2.5, y: 2.5, width: 7, height: 7 }] },
  triangle: { line: false, draw: ['path', { d: 'M6 1.5 11 10.5H1z' }] },
  cross: { line: true, draw: ['path', { d: 'M3 3l6 6M9 3l-6 6' }] },
};

/** Draws `look` into `pill`: the `bb-status` classes, the `aria-hidden` glyph and the word. */
export function renderPill(pill: HTMLElement, look: PillLook): void {
  pill.className = `bb-status bb-status--${look.tint}`;
  const glyph = svg('svg', { class: look.line ? 'bb-status__glyph bb-status__glyph--line' : 'bb-status__glyph', viewBox: '0 0 12 12', 'aria-hidden': 'true', 'data-glyph': look.glyph });
  glyph.append(svg(...look.draw));
  pill.replaceChildren(glyph, document.createTextNode(look.text));
}

/**
 * Mounts the station's status pill (`role="status"`, polite) into `container`. `vibrates` is
 * `createPhoneOutput().available()`, read once at load: true gives "Phone vibration fallback" (triangle),
 * false "Band not connected" (open circle), both in the neutral tint. The text changes only through
 * `setProblem`, `reset` and `setOutput` (the output in use: settings choice and a connected band).
 */
export function mountStatusPill(container: HTMLElement, vibrates: boolean): StatusPill {
  let first: StationPill = vibrates ? 'fallback' : 'band-off';
  const pill = document.createElement('span');
  pill.setAttribute('role', 'status');
  container.append(pill);
  let current: StationPill | null = null;

  function render(state: StationPill): void {
    if (state === current) return;
    current = state;
    renderPill(pill, STATION_PILLS[state]);
  }

  render(first);
  return {
    setProblem: () => render('problem'),
    reset: () => render(first),
    setOutput(effective) {
      first = pillFor(effective);
      if (current !== 'problem') render(first);
    },
  };
}
