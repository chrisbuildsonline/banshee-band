import { mountBandConnect, type BandLink } from '../band';
import { SOUND_CLASSES, type SoundClass } from '../events';
import { CLASS_NAMES, createGlyph } from '../ghosts';
import { dbText } from './format';
import {
  effectiveOutput,
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
}

/** What `mountSettings` returns. */
export interface SettingsPanel {
  open(): void;
  close(): void;
}

/** `window.localStorage`, or null when the browser blocks it (a throwing getter). */
export function browserStorage(): SettingsStorage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

const SVG = 'http://www.w3.org/2000/svg';
const SOUNDS_NOTE = 'A sound alerts you when it is on and at least as loud as its level. −80 dB is very quiet, −10 dB is very loud.';
const PHONE_OFF = 'This browser cannot vibrate.';
const BAND_OFF = 'This browser has no Bluetooth. Use Chrome or Edge to connect the band.';

const OPTIONS: readonly { value: OutputChoice; name: string; caption: string }[] = [
  { value: 'phone', name: 'Phone vibration', caption: 'The phone buzzes the pattern. The screen shows it too.' },
  { value: 'simulator', name: 'Screen only', caption: 'The pattern plays on the band simulator on this screen.' },
  { value: 'band', name: 'Wristband', caption: 'The band buzzes the pattern, stronger on the side it came from.' },
];

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function checkGlyph(): SVGSVGElement {
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('class', 'bb-option__check');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(SVG, 'path');
  path.setAttribute('d', 'M3.5 8.5 6.5 11.5 12.5 4.5');
  svg.append(path);
  return svg;
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
  const optionList = el('div', 'bb-settings__options');
  const radios = new Map<OutputChoice, HTMLInputElement>();
  for (const o of OPTIONS) {
    const label = el('label', 'bb-option');
    label.dataset.output = o.value;
    const radio = el('input', 'bb-option__input');
    radio.type = 'radio';
    radio.name = 'output';
    radio.value = o.value;
    const caption = el('span', 'bb-option__caption', o.value === 'phone' && !options.phoneAvailable ? PHONE_OFF : o.value === 'band' && !bandSupported ? BAND_OFF : o.caption);
    caption.id = `settings-output-${o.value}`;
    const name = el('span', 'bb-option__name', o.name);
    name.id = `settings-output-name-${o.value}`;
    // Named by the option name alone, with the caption as its description.
    radio.setAttribute('aria-labelledby', name.id);
    radio.setAttribute('aria-describedby', caption.id);
    radio.disabled = (o.value === 'band' && !bandSupported) || (o.value === 'phone' && !options.phoneAvailable);
    const text = el('span', 'bb-option__text');
    text.append(name, caption);
    label.append(radio, checkGlyph(), text);
    optionList.append(label);
    radios.set(o.value, radio);
    radio.addEventListener('change', () => {
      if (radio.checked) commit({ ...current, output: o.value });
    });
  }
  output.append(optionList);
  // The connect row, where the browser has Bluetooth (else the Wristband caption already says why not).
  // A connect from here also makes the wristband the output.
  if (bandSupported) mountBandConnect(output, options.band, { onConnected: () => commit({ ...current, output: 'band' }) });

  const foot = el('div', 'bb-settings__foot');
  const reset = el('button', 'bb-pill bb-pill--secondary', 'Reset to defaults');
  reset.type = 'button';
  reset.dataset.settings = 'reset';
  foot.append(reset);

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
    const shown = current.output === 'band' && bandSupported ? 'band' : effectiveOutput(current.output, { phone: options.phoneAvailable, band: false });
    for (const [value, radio] of radios) radio.checked = value === shown;
  }

  function commit(next: StationSettings): void {
    current = next;
    saveSettings(browserStorage(), next);
    render();
    options.onChange(next);
  }

  done.addEventListener('click', () => dialog.close());
  reset.addEventListener('click', () => commit(resolveSettings(undefined)));
  dialog.addEventListener('close', () => trigger.focus());
  trigger.addEventListener('click', () => {
    if (!dialog.open) dialog.showModal();
  });
  render();

  return {
    open: () => {
      if (!dialog.open) dialog.showModal();
    },
    close: () => dialog.close(),
  };
}
