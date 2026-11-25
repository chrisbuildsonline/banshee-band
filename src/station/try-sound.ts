import type { ClipInfo } from '../audio';
import { SOUND_CLASSES, type SoundClass } from '../events';
import { CLASS_NAMES, createGlyph } from '../ghosts';
import type { TrySide } from './types';

/** What `mountTrySound` returns. */
export interface TrySound {
  /** Adds one chip per clip, in the given (manifest) order. */
  setClips(clips: readonly ClipInfo[]): void;
  /** Says that the sample clips could not be loaded; no chip is shown. */
  setClipsFailed(): void;
  /** `text` marks every chip `aria-disabled` and shows the text in the live region; `null` ends the busy state and empties the region. */
  setBusy(text: string | null, clipId?: string): void;
  /** Shows a plain-words message (an error) in the live region. */
  setMessage(text: string): void;
}

/** Options of `mountTrySound`. */
export interface TrySoundOptions {
  /** Called when a chip is activated and no run is busy. */
  onPick(clip: ClipInfo, side: TrySide): void;
}

const SIDES: readonly { value: TrySide; label: string }[] = [
  { value: 'left', label: 'Left' },
  { value: 'centre', label: 'Centre' },
  { value: 'right', label: 'Right' },
];

const SVG = 'http://www.w3.org/2000/svg';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function checkGlyph(): SVGSVGElement {
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('class', 'bb-station-side__check');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(SVG, 'path');
  path.setAttribute('d', 'M3.5 8.5 6.5 11.5 12.5 4.5');
  svg.append(path);
  return svg;
}

const isSoundClass = (c: string): c is SoundClass => (SOUND_CLASSES as readonly string[]).includes(c);

/**
 * Mounts the Try a sound card body into `card`: the heading, the sentence that the side is simulated, the
 * Side fieldset (native radios Left, Centre, Right, default Centre; arrow keys move it and play nothing),
 * the Sound group of chips and a polite live region. A chip is a secondary pill `<button>` with a 24 px
 * low-urgency glyph; while busy every chip is `aria-disabled` (never `disabled`, so focus stays) and a
 * click does nothing. Plays no sound.
 */
export function mountTrySound(card: HTMLElement, options: TrySoundOptions): TrySound {
  const head = el('div', 'bb-station-try__head');
  const title = el('h2', 'bb-heading', 'Try a sound');
  title.id = 'try-title';
  card.setAttribute('aria-labelledby', title.id);
  const note = el('p', 'bb-station-try__note', 'The side is simulated: the clip is copied to two channels with a small delay.');
  head.append(title, note);

  const side = el('fieldset', 'bb-station-side');
  side.append(el('legend', 'bb-station-try__label', 'Side'));
  const track = el('div', 'bb-station-side__track');
  for (const s of SIDES) {
    const label = el('label', 'bb-station-side__option');
    const input = el('input', '');
    input.type = 'radio';
    input.name = 'side';
    input.value = s.value;
    input.checked = s.value === 'centre';
    label.append(input, checkGlyph(), el('span', '', s.label));
    track.append(label);
  }
  side.append(track);

  const sounds = el('div', 'bb-station-try__sounds');
  const soundLabel = el('p', 'bb-station-try__label', 'Sound');
  soundLabel.setAttribute('aria-hidden', 'true');
  const chips = el('div', 'bb-station-chips');
  chips.setAttribute('role', 'group');
  chips.setAttribute('aria-label', 'Sound');
  sounds.append(soundLabel, chips);

  const message = el('p', 'bb-station-try__message');
  message.setAttribute('aria-live', 'polite');

  card.append(head, side, sounds, message);

  let busy = false;
  const chosenSide = (): TrySide => (side.querySelector<HTMLInputElement>('input[name="side"]:checked')?.value ?? 'centre') as TrySide;

  return {
    setClips(clips) {
      chips.replaceChildren(
        ...clips.filter((c) => isSoundClass(c.class)).map((clip) => {
          const cls = clip.class as SoundClass;
          const chip = el('button', 'bb-pill bb-pill--secondary bb-station-chip');
          chip.type = 'button';
          chip.dataset.clip = clip.id;
          chip.append(createGlyph(cls, 'low'), document.createTextNode(CLASS_NAMES[cls]));
          chip.addEventListener('click', () => {
            if (!busy) options.onPick(clip, chosenSide());
          });
          return chip;
        }),
      );
    },
    setClipsFailed() {
      chips.replaceChildren();
      message.textContent = 'The sample clips could not be loaded.';
    },
    setBusy(text, clipId) {
      busy = text !== null;
      for (const chip of chips.querySelectorAll<HTMLButtonElement>('button')) {
        if (busy) chip.setAttribute('aria-disabled', 'true');
        else chip.removeAttribute('aria-disabled');
        chip.toggleAttribute('data-running', busy && chip.dataset.clip === clipId);
      }
      message.textContent = text ?? '';
    },
    setMessage(text) {
      message.textContent = text;
    },
  };
}
