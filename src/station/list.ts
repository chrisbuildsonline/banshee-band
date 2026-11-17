import type { SoundClass, Urgency } from '../events';
import { CLASS_NAMES, URGENCY_STYLE, createGlyph } from '../ghosts';
import type { Side } from '../haptics';
import { MAX_ROWS } from './constants';
import { alertText, formatClock, sideWord } from './format';

/** One sound in the list: the class, the side from `sideOf`, the urgency and the wall-clock time of the run. */
export interface EventRow {
  cls: SoundClass;
  side: Side;
  urgency: Urgency;
  /** Epoch ms. */
  at: number;
}

/** What `mountEventList` returns. */
export interface EventList {
  /** Adds a row at the top (at most `MAX_ROWS`) and replaces the Latest alert text once. */
  add(row: EventRow): void;
  /** Empties the list and the Latest alert. */
  clear(): void;
  /** Removes everything this list added. */
  destroy(): void;
}

const EMPTY_LIST = 'No sounds yet. Choose a sound to try.';
const EMPTY_ALERT = 'No sound yet';
const PILL_TINT: Readonly<Record<Urgency, string>> = { low: 'neutral', medium: 'accent', high: 'strong' };

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** A space between inline parts, so the row reads "Knock Left side Urgent 13:36" and not as one word. */
const gap = () => document.createTextNode(' ');

function rowElement(row: EventRow): HTMLLIElement {
  const li = el('li', 'bb-station-row');
  li.dataset.class = row.cls;
  li.dataset.side = row.side;
  li.dataset.urgency = row.urgency;
  const tile = el('span', 'bb-station-row__tile');
  tile.append(createGlyph(row.cls, row.urgency));
  const text = el('span', 'bb-station-row__text');
  text.append(el('span', 'bb-station-row__name', CLASS_NAMES[row.cls]), gap(), el('span', 'bb-station-row__side', sideWord(row.side)));
  const end = el('span', 'bb-station-row__end');
  end.append(el('span', `bb-status bb-status--${PILL_TINT[row.urgency]}`, URGENCY_STYLE[row.urgency].word), gap(), el('time', 'bb-station-row__time', formatClock(row.at)));
  li.append(tile, gap(), text, gap(), end);
  return li;
}

/**
 * Mounts the Latest alert block and the Recent sounds list into `card`. The Latest alert is one polite,
 * atomic live region that holds `alertText` ("Knock, left side, urgent"), the class name in the `display`
 * step and the side and urgency on a caption line; before the first run it says "No sound yet". Recent
 * sounds is a `<ul>`, newest first, at most 10 rows; empty, the card says "No sounds yet. Choose a sound
 * to try." Nothing here is focusable. The row text never holds the event id, confidence, loudness or degrees.
 */
export function mountEventList(card: HTMLElement): EventList {
  const alertTitle = el('h2', 'bb-station-alerts__eyebrow', 'Latest alert');
  alertTitle.id = 'alert-title';
  const alert = el('div', 'bb-station-alert');
  alert.id = 'latest-alert';
  alert.setAttribute('aria-live', 'polite');
  alert.setAttribute('aria-atomic', 'true');

  const recentHead = el('div', 'bb-station-alerts__head');
  const recentTitle = el('h2', 'bb-heading', 'Recent sounds');
  recentTitle.id = 'recent-title';
  recentHead.append(recentTitle);
  const empty = el('p', 'bb-station-alerts__empty', EMPTY_LIST);
  const list = el('ul', 'bb-station-rows');
  list.setAttribute('aria-labelledby', recentTitle.id);

  const added = [alertTitle, alert, recentHead, empty, list];
  card.append(...added);

  function showEmptyAlert(): void {
    alert.replaceChildren(el('p', 'bb-station-alert__empty', EMPTY_ALERT));
  }
  showEmptyAlert();

  return {
    add(row) {
      // One replacement per run: the class name line, a hidden comma for the reading, the side and urgency line.
      const [name, ...rest] = alertText(row.cls, row.side, row.urgency).split(', ');
      alert.replaceChildren(el('p', 'bb-display bb-station-alert__name', name), el('span', 'bb-station-sr', ', '), el('p', 'bb-station-alert__detail', rest.join(', ')));
      list.prepend(rowElement(row));
      while (list.children.length > MAX_ROWS) list.lastElementChild!.remove();
      empty.hidden = true;
    },
    clear() {
      list.replaceChildren();
      empty.hidden = false;
      showEmptyAlert();
    },
    destroy() {
      for (const node of added) node.remove();
    },
  };
}
