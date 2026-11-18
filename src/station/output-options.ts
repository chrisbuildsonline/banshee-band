import { effectiveOutput, type OutputChoice } from './settings';

/** Phone vibration's caption where `navigator.vibrate` is missing. */
export const PHONE_OFF = 'This browser cannot vibrate.';

/** Wristband's caption where the browser has no Web Bluetooth. */
export const BAND_OFF = 'This browser has no Bluetooth. Use Chrome or Edge to connect the band.';

/** The three Buzz on options, in order, with their names and captions. */
export const OUTPUT_OPTIONS: readonly { value: OutputChoice; name: string; caption: string }[] = [
  { value: 'phone', name: 'Phone vibration', caption: 'The phone buzzes the pattern. The screen shows it too.' },
  { value: 'simulator', name: 'Screen only', caption: 'The pattern plays on the band simulator on this screen.' },
  { value: 'band', name: 'Wristband', caption: 'The band buzzes the pattern, stronger on the side it came from.' },
];

/**
 * The option shown as chosen: a chosen Wristband stays shown where the browser has Web Bluetooth (alerts use the
 * screen until it connects); otherwise the output in use (Screen only when the phone cannot vibrate).
 */
export function shownOutput(choice: OutputChoice, phoneAvailable: boolean, bandSupported: boolean): OutputChoice {
  return choice === 'band' && bandSupported ? 'band' : effectiveOutput(choice, { phone: phoneAvailable, band: false });
}

/** Options of `mountOutputOptions`. */
export interface OutputOptionsConfig {
  /** The radio group name. */
  name: string;
  /** The prefix of the caption and name ids (`<idPrefix>-phone`, `<idPrefix>-name-phone`), so two groups can live on one page. */
  idPrefix: string;
  phoneAvailable: boolean;
  bandSupported: boolean;
  /** Captions that replace the default one of an available option (an unavailable option always says why). */
  captions?: Partial<Record<OutputChoice, string>>;
  /** Called with the option the user checked. */
  onPick(choice: OutputChoice): void;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function checkGlyph(): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'bb-option__check');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', 'M3.5 8.5 6.5 11.5 12.5 4.5');
  svg.append(path);
  return svg;
}

/**
 * Appends the three Buzz on radios to `host` as option tiles (`.bb-option`): each with a check mark, its name (the
 * radio's name) and its caption (the radio's description). Phone vibration is disabled without `navigator.vibrate`
 * and Wristband without Web Bluetooth, each with a caption that says why. `set(output)` checks the option that
 * `shownOutput` gives for the saved choice, without calling `onPick`.
 */
export function mountOutputOptions(host: HTMLElement, config: OutputOptionsConfig): { set(output: OutputChoice): void } {
  const list = el('div', 'bb-settings__options');
  const radios = new Map<OutputChoice, HTMLInputElement>();
  for (const o of OUTPUT_OPTIONS) {
    const off = (o.value === 'phone' && !config.phoneAvailable) || (o.value === 'band' && !config.bandSupported);
    const label = el('label', 'bb-option');
    label.dataset.output = o.value;
    const radio = el('input', 'bb-option__input');
    radio.type = 'radio';
    radio.name = config.name;
    radio.value = o.value;
    radio.disabled = off;
    const caption = el('span', 'bb-option__caption', off ? (o.value === 'phone' ? PHONE_OFF : BAND_OFF) : (config.captions?.[o.value] ?? o.caption));
    caption.id = `${config.idPrefix}-${o.value}`;
    const name = el('span', 'bb-option__name', o.name);
    name.id = `${config.idPrefix}-name-${o.value}`;
    // Named by the option name alone, with the caption as its description.
    radio.setAttribute('aria-labelledby', name.id);
    radio.setAttribute('aria-describedby', caption.id);
    const text = el('span', 'bb-option__text');
    text.append(name, caption);
    label.append(radio, checkGlyph(), text);
    list.append(label);
    radios.set(o.value, radio);
    radio.addEventListener('change', () => {
      if (radio.checked) config.onPick(o.value);
    });
  }
  host.append(list);
  return {
    set(output) {
      const shown = shownOutput(output, config.phoneAvailable, config.bandSupported);
      for (const [value, radio] of radios) radio.checked = value === shown;
    },
  };
}
