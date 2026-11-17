/** What the status pill can say. The words and the glyph shape carry the state, not the tint. */
export interface StatusPill {
  /** "Problem" with the cross glyph and the strong tint: the sound model could not be loaded. */
  setProblem(): void;
  /** Back to the state read at load ("Band not connected" or "Phone vibration fallback"). */
  reset(): void;
}

const SVG = 'http://www.w3.org/2000/svg';

type State = 'band-off' | 'fallback' | 'problem';

const STATES: Readonly<Record<State, { text: string; tint: string; glyph: string; line: boolean; draw: [string, Record<string, string | number>] }>> = {
  'band-off': { text: 'Band not connected', tint: 'neutral', glyph: 'circle', line: true, draw: ['circle', { cx: 6, cy: 6, r: 3.75 }] },
  fallback: { text: 'Phone vibration fallback', tint: 'neutral', glyph: 'triangle', line: false, draw: ['path', { d: 'M6 1.5 11 10.5H1z' }] },
  problem: { text: 'Problem', tint: 'strong', glyph: 'cross', line: true, draw: ['path', { d: 'M3 3l6 6M9 3l-6 6' }] },
};

function svg(tag: string, attrs: Record<string, string | number>): SVGElement {
  const node = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

/**
 * Mounts the station's status pill (`role="status"`, polite) into `container`. `vibrates` is
 * `createPhoneOutput().available()`, read once at load: true gives "Phone vibration fallback" (triangle),
 * false "Band not connected" (open circle), both in the neutral tint. The text changes only through
 * `setProblem` and `reset`.
 */
export function mountStatusPill(container: HTMLElement, vibrates: boolean): StatusPill {
  const first: State = vibrates ? 'fallback' : 'band-off';
  const pill = document.createElement('span');
  pill.setAttribute('role', 'status');
  container.append(pill);
  let current: State | null = null;

  function render(state: State): void {
    if (state === current) return;
    current = state;
    const s = STATES[state];
    pill.className = `bb-status bb-status--${s.tint}`;
    const glyph = svg('svg', { class: s.line ? 'bb-status__glyph bb-status__glyph--line' : 'bb-status__glyph', viewBox: '0 0 12 12', 'aria-hidden': 'true', 'data-glyph': s.glyph });
    glyph.append(svg(...s.draw));
    pill.replaceChildren(glyph, document.createTextNode(s.text));
  }

  render(first);
  return {
    setProblem: () => render('problem'),
    reset: () => render(first),
  };
}
