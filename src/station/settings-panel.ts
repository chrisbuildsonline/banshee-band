import { mountBandConnect, type BandLink } from '../band';
import { SOUND_CLASSES, type SoundClass } from '../events';
import { CLASS_NAMES, createGlyph } from '../ghosts';
import { dbText } from './format';
import { keepTabInside, mountOutputOptions } from './output-options';
import {
  MIN_DB_CEILING,
  MIN_DB_FLOOR,
  resolveSettings,
  saveSettings,
  type OutputChoice,
  type SettingsStorage,
  type StationSettings,
} from './settings';

/** Options of `mountSettings`. */
export interface SettingsOptions {
  /** The settings in force when the page loaded. */
  settings: StationSettings;
  /** Whether `navigator.vibrate` exists; without it Phone vibration is disabled. */
  phoneAvailable: boolean;
  /** The wristband link; without Web Bluetooth (state `unsupported`) the Wristband option is disabled. */
  band: BandLink;
  /** Called with a new settings object after every change, once it is saved (or failed to save). */
  onChange(s: StationSettings): void;
  /** Show intro again: called after the sheet has closed itself. Without it the sheet has no Show intro again pill. */
  onShowIntro?(): void;
}

/** What `mountSettings` returns. */
export interface SettingsPanel {
  open(): void;
  close(): void;
  /** The settings in force. */
  settings(): StationSettings;
  /** Sets Buzz on, the same way a press on its radio does: save, show, `onChange`. */
  setOutput(choice: OutputChoice): void;
}

/** `window.localStorage`, or null when the browser blocks it (a throwing getter). */
export function browserStorage(): SettingsStorage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

const SOUNDS_NOTE = 'A sound alerts you when it is on and at least as loud as its level. −80 dB is very quiet, −10 dB is very loud.';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** The controls of one class tile. */
interface Tile {
  tile: HTMLLIElement;
  toggle: HTMLInputElement;
  word: HTMLSpanElement;
  level: HTMLInputElement;
  value: HTMLSpanElement;
}

function classTile(cls: SoundClass): Tile {
  const tile = el('li', 'bb-settings-tile');
  tile.dataset.class = cls;
  const top = el('div', 'bb-settings-tile__top');
  const glyph = el('span', 'bb-settings-tile__glyph');
  glyph.append(createGlyph(cls, 'low'));
  const name = el('span', 'bb-settings-tile__name', CLASS_NAMES[cls]);
  name.id = `settings-name-${cls}`;
  const sw = el('label', 'bb-switch');
  const toggle = el('input', 'bb-switch__input');
  toggle.type = 'checkbox';
  toggle.setAttribute('role', 'switch');
  toggle.setAttribute('aria-labelledby', name.id);
  const track = el('span', 'bb-switch__track');
  track.setAttribute('aria-hidden', 'true');
  track.append(el('span', 'bb-switch__thumb'));
  const word = el('span', 'bb-switch__word');
  word.setAttribute('aria-hidden', 'true');
  sw.append(toggle, track, word);
  top.append(glyph, name, sw);

  const levelRow = el('div', 'bb-settings-tile__level');
  const from = el('label', 'bb-settings-tile__from', 'Alerts from');
  from.id = `settings-from-${cls}`;
  from.htmlFor = `settings-level-${cls}`;
  const value = el('span', 'bb-settings-tile__value');
  value.setAttribute('aria-hidden', 'true');
  const level = el('input', 'bb-settings-tile__range');
  level.type = 'range';
  level.id = from.htmlFor;
  level.min = String(MIN_DB_FLOOR);
  level.max = String(MIN_DB_CEILING);
  level.step = '1';
  level.setAttribute('aria-labelledby', `${name.id} ${from.id}`);
  levelRow.append(from, value, level);
  tile.append(top, levelRow);
  return { tile, toggle, word, level, value };
}

/**
 * Mounts the Settings sheet: a native `<dialog>` opened by `trigger` with `showModal()`. It holds the Sounds
 * section (one tile per class with a switch and a level slider), the Buzz on radios (Phone vibration, Screen
 * only, and Wristband, disabled only where the browser has no Web Bluetooth), the connect row under them and
 * Reset to defaults. Every change builds a new settings object, saves it and calls `onChange`; there is no Save
 * button. Done and Escape close the sheet and return the focus to `trigger`.
 */
export function mountSettings(trigger: HTMLElement, options: SettingsOptions): SettingsPanel {
  let current = resolveSettings(options.settings);
  const bandSupported = options.band.state() !== 'unsupported';

  const dialog = el('dialog', 'bb-settings');
  dialog.setAttribute('aria-labelledby', 'settings-title');

  const head = el('div', 'bb-settings__head');
  const titles = el('div', 'bb-settings__titles');
  const title = el('h2', 'bb-heading', 'Settings');
  title.id = 'settings-title';
  titles.append(title, el('p', 'bb-settings__note', 'Changes apply right away and stay on this device.'));
  const done = el('button', 'bb-pill bb-pill--secondary', 'Done');
  done.type = 'button';
  done.autofocus = true;
  done.dataset.settings = 'done';
  head.append(titles, done);

  const sounds = el('section', 'bb-settings__section');
  sounds.setAttribute('aria-labelledby', 'settings-sounds');
  const soundsTitle = el('h3', 'bb-settings__h3', 'Sounds');
  soundsTitle.id = 'settings-sounds';
  const list = el('ul', 'bb-settings__tiles');
  const tiles = new Map<SoundClass, Tile>();
  for (const cls of SOUND_CLASSES) {
    const t = classTile(cls);
    tiles.set(cls, t);
    list.append(t.tile);
    t.toggle.addEventListener('change', () => commit({ ...current, sounds: { ...current.sounds, [cls]: { ...current.sounds[cls], on: t.toggle.checked } } }));
    t.level.addEventListener('input', () => commit({ ...current, sounds: { ...current.sounds, [cls]: { ...current.sounds[cls], minDb: Number(t.level.value) } } }));
  }
  sounds.append(soundsTitle, el('p', 'bb-settings__note', SOUNDS_NOTE), list);

  const output = el('fieldset', 'bb-settings__section bb-settings__output');
  output.append(el('legend', 'bb-settings__h3', 'Buzz on'));
  const radios = mountOutputOptions(output, {
    name: 'output',
    idPrefix: 'settings-output',
    phoneAvailable: options.phoneAvailable,
    bandSupported,
    onPick: (choice) => commit({ ...current, output: choice }),
  });
  // The connect row, where the browser has Bluetooth (else the Wristband caption already says why not).
  // A connect from here also makes the wristband the output.
  if (bandSupported) mountBandConnect(output, options.band, { onConnected: () => commit({ ...current, output: 'band' }) });

  const foot = el('div', 'bb-settings__foot');
  const reset = el('button', 'bb-pill bb-pill--secondary', 'Reset to defaults');
  reset.type = 'button';
  reset.dataset.settings = 'reset';
  foot.append(reset);
  let skipFocusReturn = false;
  if (options.onShowIntro) {
    const showIntro = options.onShowIntro;
    const intro = el('button', 'bb-pill bb-pill--secondary', 'Show intro again');
    intro.type = 'button';
    intro.dataset.settings = 'intro';
    foot.append(intro);
    intro.addEventListener('click', () => {
      // Close first, so the intro is the only modal; it returns the focus to the Settings pill when it closes.
      skipFocusReturn = true;
      dialog.close();
      showIntro();
    });
  }

  dialog.append(head, sounds, output, foot);
  document.body.append(dialog);

  /** Sets every control from `current`. */
  function render(): void {
    for (const [cls, t] of tiles) {
      const s = current.sounds[cls];
      t.toggle.checked = s.on;
      t.word.textContent = s.on ? 'On' : 'Off';
      t.tile.dataset.on = String(s.on);
      t.level.value = String(s.minDb);
      t.level.disabled = !s.on;
      t.level.setAttribute('aria-valuetext', dbText(s.minDb));
      t.value.textContent = dbText(s.minDb);
    }
    // A chosen Wristband stays shown while it is not connected (the connect row says the screen is in use).
    radios.set(current.output);
  }

  function commit(next: StationSettings): void {
    current = next;
    saveSettings(browserStorage(), next);
    render();
    options.onChange(next);
  }

  done.addEventListener('click', () => dialog.close());
  keepTabInside(dialog);
  reset.addEventListener('click', () => commit(resolveSettings(undefined)));
  dialog.addEventListener('close', () => {
    if (skipFocusReturn) skipFocusReturn = false;
    else trigger.focus();
  });
  trigger.addEventListener('click', () => {
    if (!dialog.open) dialog.showModal();
  });
  render();

  return {
    open: () => {
      if (!dialog.open) dialog.showModal();
    },
    close: () => dialog.close(),
    settings: () => current,
    setOutput: (choice) => commit({ ...current, output: choice }),
  };
}
