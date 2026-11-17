import { LISTEN_STATES } from './listen-status';
import { GLYPHS, renderPill } from './status';
import type { ListenState } from './types';

/** The sentence that says why the microphone is needed and what happens to the sound. */
export const LISTEN_NOTE = 'Banshee Band listens through your microphone to tell you about sounds. The sound is processed on this device and is never recorded or sent anywhere.';

/** What `mountListenCard` returns. */
export interface ListenCard {
  /** Shows a Listen state: the status pill, the Start or Stop pill, and `message` (or none) in the live region. */
  setState(state: ListenState, message?: string | null): void;
  /** Shows a plain message (e.g. "Loading the sound model") without changing the state. */
  setMessage(text: string | null): void;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/**
 * Mounts the Listen card into `card`: the heading, the muted sentence, the "Start listening" primary pill (the
 * one near-black pill of the screen) or the "Stop" secondary pill, the Listen status pill (`role="status"`,
 * hidden until the first Start) and a polite message line. While starting, Start is `aria-disabled` and a
 * second press does nothing. The pill that appears takes the focus, so keyboard users keep their place.
 */
export function mountListenCard(card: HTMLElement, options: { onStart(): void; onStop(): void }): ListenCard {
  card.setAttribute('aria-labelledby', 'listen-title');
  const head = el('div', 'bb-station-listen__head');
  const title = el('h2', 'bb-heading', 'Listen');
  title.id = 'listen-title';
  head.append(title, el('p', 'bb-station-listen__note', LISTEN_NOTE));

  const row = el('div', 'bb-station-listen__row');
  const start = el('button', 'bb-pill bb-pill--primary bb-station-listen__start', 'Start listening');
  start.type = 'button';
  start.dataset.listen = 'start';
  const stop = el('button', 'bb-pill bb-pill--secondary bb-station-listen__stop', 'Stop');
  stop.type = 'button';
  stop.dataset.listen = 'stop';
  stop.hidden = true;
  const pill = el('span', 'bb-status');
  pill.setAttribute('role', 'status');
  pill.hidden = true;
  // The phone bar has no room for the sentence: a short caption says the same, beside the pill.
  const short = el('span', 'bb-station-listen__short', 'Processed on this device. Never recorded or sent.');
  row.append(start, stop, pill, short);

  const message = el('p', 'bb-station-listen__message');
  message.setAttribute('aria-live', 'polite');
  card.append(head, row, message);

  let state: ListenState = 'idle';
  start.addEventListener('click', () => {
    if (state !== 'starting' && state !== 'listening') options.onStart();
  });
  stop.addEventListener('click', () => {
    if (state === 'listening') options.onStop();
  });

  return {
    setState(next, text = null) {
      const was = state;
      state = next;
      message.textContent = text ?? '';
      if (next === 'starting') start.setAttribute('aria-disabled', 'true');
      else start.removeAttribute('aria-disabled');
      pill.hidden = next === 'idle';
      if (next !== 'idle') {
        const look = LISTEN_STATES[next];
        renderPill(pill, { text: look.word, tint: look.tint, glyph: look.glyph, ...GLYPHS[look.glyph] });
        pill.dataset.listenState = next;
      }
      const listening = next === 'listening';
      start.hidden = listening;
      stop.hidden = !listening;
      if (listening && was !== 'listening') stop.focus();
      else if (!listening && was === 'listening') start.focus();
      else if ((next === 'blocked' || next === 'problem') && document.activeElement === document.body) start.focus();
    },
    setMessage(text) {
      message.textContent = text ?? '';
    },
  };
}
