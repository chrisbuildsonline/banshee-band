import { bandStatusText } from './labels';
import type { BandLink } from './types';
import './connect.css';

const SVG = 'http://www.w3.org/2000/svg';

/** A small wristband: the strap and the case with two motor dots. Decoration only. */
function bandGlyph(): SVGSVGElement {
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  for (const [tag, attrs] of [
    ['path', { d: 'M9 3h6l1 4M9 3 8 7M9 21h6l1-4M9 21l-1-4' }],
    ['rect', { x: 5, y: 7, width: 14, height: 10, rx: 3 }],
    ['circle', { cx: 9.5, cy: 12, r: 1.25 }],
    ['circle', { cx: 14.5, cy: 12, r: 1.25 }],
  ] as const) {
    const node = document.createElementNS(SVG, tag);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
    svg.append(node);
  }
  return svg;
}

/** What `mountBandConnect` returns. */
export interface BandConnect {
  /** The row element. */
  readonly element: HTMLElement;
}

/**
 * Mounts the Wristband connect row into `host`: a band glyph, the heading "Wristband", the status line
 * (`role="status"`, polite) and one pill. Idle: the near-black "Connect band" primary pill; connecting: a
 * disabled "Connecting…"; connected: a "Disconnect" secondary pill. Without Web Bluetooth there is no button,
 * only the honest line. The press calls `link.connect()` inside the click, as the chooser needs. When the state
 * becomes `connected` after a press here, `options.onConnected` is called once.
 */
export function mountBandConnect(host: HTMLElement, link: BandLink, options: { onConnected?(): void } = {}): BandConnect {
  const row = document.createElement('div');
  row.className = 'bb-connect';
  const glyph = document.createElement('span');
  glyph.className = 'bb-connect__glyph';
  glyph.append(bandGlyph());
  const text = document.createElement('div');
  text.className = 'bb-connect__text';
  const title = document.createElement('p');
  title.className = 'bb-connect__title';
  title.textContent = 'Wristband';
  const status = document.createElement('p');
  status.className = 'bb-connect__status';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  text.append(title, status);
  const action = document.createElement('button');
  action.type = 'button';
  action.dataset.band = 'action';
  row.append(glyph, text, action);
  host.append(row);

  let pressed = false;

  function render(): void {
    const state = link.state();
    row.dataset.state = state;
    status.textContent = bandStatusText(state, link.problem(), link.deviceName());
    // No Bluetooth: no button at all, only the honest line (a hidden pill would still take up a tab stop's look).
    if (state === 'unsupported') action.remove();
    action.disabled = state === 'connecting';
    action.className = `bb-pill ${state === 'connected' ? 'bb-pill--secondary' : 'bb-pill--primary'} bb-connect__action`;
    action.textContent = state === 'connected' ? 'Disconnect' : state === 'connecting' ? 'Connecting…' : 'Connect band';
    if (state === 'connected' && pressed) {
      pressed = false;
      options.onConnected?.();
    } else if (state === 'idle') pressed = false;
  }

  action.addEventListener('click', () => {
    if (link.state() === 'connected') {
      link.disconnect();
      return;
    }
    pressed = true;
    void link.connect();
  });
  link.subscribe(render);
  render();
  return { element: row };
}
