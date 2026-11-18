import { createGlyph } from '../ghosts';
import { INTRO_STEPS, micStepView, type IntroStep, type MicSupport } from './onboarding';
import { mountOutputOptions } from './output-options';
import type { OutputChoice, StationSettings } from './settings';
import { GLYPHS, renderPill } from './status';
import type { ListenState } from './types';

/** The sentence of DESIGN.md Principle 6, word for word. */
export const AID_SENTENCE = 'Banshee Band is an aid, not a safety device. It can miss or misread sounds, so keep your smoke alarms and other certified alerting devices.';

/** The Wristband caption in the intro: honest that the band is hardware the user builds and connects in Settings. */
export const INTRO_BAND_CAPTION = 'Needs the Banshee Band wristband (DIY hardware, not sold). Connect it in Settings. Until then alerts show on the screen.';

/** The Listen card, as the intro sees it: its state, its one start path and its changes. */
export interface ListenHandle {
  state(): ListenState;
  /** The same start the Start listening pill runs. */
  start(): void;
  /** Calls `fn` on every Listen state change; returns the unsubscribe. */
  subscribe(fn: (state: ListenState) => void): () => void;
}

/** Options of `mountOnboarding`. */
export interface OnboardingOptions {
  phoneAvailable: boolean;
  bandSupported: boolean;
  micSupport: MicSupport;
  /** The settings in force (read each time the output step shows). */
  settings(): StationSettings;
  /** Sets Buzz on through the Settings sheet's own save path. */
  setOutput(choice: OutputChoice): void;
  listen: ListenHandle;
  /** Called after every close: Done, Skip intro, Escape or `close()`. */
  onClose(): void;
}

/** What `mountOnboarding` returns. */
export interface Onboarding {
  /** Builds and opens the intro at step 1; when it closes the focus goes back to `returnFocus` if it is still in the page. */
  open(returnFocus?: HTMLElement | null): void;
  close(): void;
  readonly isOpen: boolean;
}

const SVG = 'http://www.w3.org/2000/svg';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function pill(text: string, kind: 'primary' | 'secondary', action: string): HTMLButtonElement {
  const b = el('button', `bb-pill bb-pill--${kind}`, text);
  b.type = 'button';
  b.dataset.intro = action;
  return b;
}

/** A decorative line drawing in a 24-unit box. */
function drawing(paths: string[], className: string, box = 24): SVGSVGElement {
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('class', className);
  svg.setAttribute('viewBox', `0 0 ${box} ${box}`);
  svg.setAttribute('aria-hidden', 'true');
  for (const d of paths) {
    const p = document.createElementNS(SVG, 'path');
    p.setAttribute('d', d);
    svg.append(p);
  }
  return svg;
}

const MIC = ['M12 3.5a3 3 0 0 0-3 3v5a3 3 0 0 0 6 0v-5a3 3 0 0 0-3-3z', 'M6.5 11.5a5.5 5.5 0 0 0 11 0', 'M12 17v3.5M9 20.5h6'];
const BAND = ['M9 2.5h6l.8 4.5H8.2z', 'M9 21.5h6l.8-4.5H8.2z', 'M7.5 7h9a1.5 1.5 0 0 1 1.5 1.5v7a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 6 15.5v-7A1.5 1.5 0 0 1 7.5 7z', 'M10 12h.01M14 12h.01'];
/** The footer's info glyph (index.html), in its 16-unit box. */
const INFO = ['M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13z', 'M8 4.75v4M8 11v.25'];

const POINTS = [
  'It listens for doorbells, knocks, alarms, a baby, vehicles and voices.',
  'It shows each sound as a ghost on the side it came from, with a line of text.',
  'It buzzes a pattern on the phone or the wristband, stronger on that side.',
];

/** One step: its section, `h2` and actions row. */
interface Step {
  section: HTMLElement;
  title: HTMLHeadingElement;
  actions: HTMLElement;
}

function step(name: IntroStep, titleText: string, lede: string): Step {
  const section = el('section', 'bb-intro__step');
  section.dataset.step = name;
  section.hidden = true;
  const disc = el('div', 'bb-intro__disc');
  disc.setAttribute('aria-hidden', 'true');
  disc.append(name === 'welcome' ? createGlyph('other', 'high') : drawing(name === 'microphone' ? MIC : BAND, 'bb-intro__picture'));
  const title = el('h2', 'bb-title bb-intro__title', titleText);
  title.id = `intro-title-${name}`;
  title.tabIndex = -1;
  section.setAttribute('aria-labelledby', title.id);
  const actions = el('div', 'bb-intro__actions');
  section.append(disc, title, el('p', 'bb-intro__lede', lede));
  return { section, title, actions };
}

/** The intro as it is while open: its dialog, steps and the controls the step logic changes. */
interface Built {
  dialog: HTMLDialogElement;
  steps: Record<IntroStep, Step>;
  count: HTMLElement;
  bars: HTMLElement[];
  micPill: HTMLElement;
  micText: HTMLElement;
  allow: HTMLButtonElement;
  notNow: HTMLButtonElement;
  next2: HTMLButtonElement;
  radios: { set(output: OutputChoice): void };
}

/**
 * Mounts the first-run intro. Each `open()` builds a native `<dialog>` (opened with `showModal()`, so the station
 * is inert behind it) with three steps, and each close removes it. Welcome says what Banshee Band is and the aid
 * sentence; Microphone starts listening through the station's one start path and shows the outcome with the
 * Listen pill words and glyphs; Output sets Buzz on through the Settings sheet. Done, Skip intro and Escape close
 * it and call `onClose`. The dialog is labelled by the current step's `h2`, which takes the focus on each step.
 */
export function mountOnboarding(options: OnboardingOptions): Onboarding {
  let built: Built | null = null;
  let current: IntroStep = 'welcome';
  let returnTo: HTMLElement | null = null;
  let unsubscribe: (() => void) | null = null;

  function drawMic(b: Built): void {
    const view = micStepView(options.listen.state(), options.micSupport);
    b.micText.textContent = view.sentence;
    b.micPill.hidden = view.word === null;
    if (view.word !== null && view.glyph !== null && view.tint !== null) {
      renderPill(b.micPill, { text: view.word, tint: view.tint, glyph: view.glyph, ...GLYPHS[view.glyph] });
    }
    const hadFocus = document.activeElement === b.allow || document.activeElement === b.notNow;
    const choosing = !view.showNext && options.micSupport === 'ok';
    b.allow.hidden = !choosing;
    b.notNow.hidden = !choosing;
    b.next2.hidden = !view.showNext;
    if (view.canAllow) b.allow.removeAttribute('aria-disabled');
    else b.allow.setAttribute('aria-disabled', 'true');
    // Allow and Not now are gone once there is an outcome: keep the keyboard user's place on Next.
    if (hadFocus && view.showNext) b.next2.focus();
  }

  function go(b: Built, name: IntroStep, focus = true): void {
    current = name;
    const index = INTRO_STEPS.indexOf(name);
    b.count.textContent = `Step ${index + 1} of ${INTRO_STEPS.length}`;
    b.bars.forEach((bar, i) => (bar.dataset.on = String(i <= index)));
    for (const s of INTRO_STEPS) b.steps[s].section.hidden = s !== name;
    b.dialog.setAttribute('aria-labelledby', b.steps[name].title.id);
    if (name === 'microphone') drawMic(b);
    if (name === 'output') b.radios.set(options.settings().output);
    if (focus) b.steps[name].title.focus();
  }

  function build(): Built {
    const dialog = el('dialog', 'bb-intro');
    dialog.dataset.intro = 'sheet';

    const head = el('div', 'bb-intro__head');
    const progress = el('div', 'bb-intro__progress');
    const count = el('p', 'bb-intro__count');
    const barRow = el('div', 'bb-intro__bars');
    barRow.setAttribute('aria-hidden', 'true');
    const bars = INTRO_STEPS.map(() => el('span', 'bb-intro__bar'));
    barRow.append(...bars);
    progress.append(count, barRow);
    const skip = pill('Skip intro', 'secondary', 'skip');
    head.append(progress, skip);

    // Step 1: what it is, and the honest line.
    const welcome = step('welcome', 'Welcome to Banshee Band', 'Sounds you cannot hear, seen as ghosts and felt as a buzz.');
    const points = el('ol', 'bb-intro__points');
    POINTS.forEach((text, i) => {
      const li = el('li', 'bb-intro__point');
      const num = el('span', 'bb-intro__num', String(i + 1));
      num.setAttribute('aria-hidden', 'true');
      li.append(num, el('span', 'bb-intro__point-text', text));
      points.append(li);
    });
    const aid = el('p', 'bb-intro__aid');
    aid.append(drawing(INFO, 'bb-intro__aid-glyph', 16), el('span', '', AID_SENTENCE));
    const next1 = pill('Next', 'primary', 'next');
    welcome.actions.append(next1);
    welcome.section.append(points, aid, welcome.actions);

    // Step 2: the microphone, through the station's own Start listening.
    const mic = step('microphone', 'Turn on the microphone', 'The microphone is how Banshee Band hears the sounds around you. Your browser asks once.');
    const micBox = el('div', 'bb-intro__mic');
    const micPill = el('span', 'bb-status');
    micPill.setAttribute('role', 'status');
    micPill.hidden = true;
    const micText = el('p', 'bb-intro__mic-text');
    micText.setAttribute('aria-live', 'polite');
    micBox.append(micPill, micText);
    const back2 = pill('Back', 'secondary', 'back');
    const notNow = pill('Not now', 'secondary', 'not-now');
    const allow = pill('Allow microphone', 'primary', 'allow');
    const next2 = pill('Next', 'primary', 'next');
    mic.actions.append(back2, notNow, allow, next2);
    mic.section.append(micBox, mic.actions);

    // Step 3: where alerts buzz, the same radios as Settings, named by the step's heading.
    const out = step('output', 'Where should alerts buzz?', 'You can change this any time in Settings.');
    const group = el('div', 'bb-intro__options');
    group.setAttribute('role', 'radiogroup');
    group.setAttribute('aria-labelledby', out.title.id);
    const radios = mountOutputOptions(group, {
      name: 'intro-output',
      idPrefix: 'intro-output',
      phoneAvailable: options.phoneAvailable,
      bandSupported: options.bandSupported,
      captions: { band: INTRO_BAND_CAPTION },
      onPick: (choice) => {
        options.setOutput(choice);
        radios.set(options.settings().output);
      },
    });
    const back3 = pill('Back', 'secondary', 'back');
    const done = pill('Done', 'primary', 'done');
    out.actions.append(back3, done);
    out.section.append(group, out.actions);

    dialog.append(head, welcome.section, mic.section, out.section);
    const b: Built = { dialog, steps: { welcome, microphone: mic, output: out }, count, bars, micPill, micText, allow, notNow, next2, radios };

    next1.addEventListener('click', () => go(b, 'microphone'));
    back2.addEventListener('click', () => go(b, 'welcome'));
    notNow.addEventListener('click', () => go(b, 'output'));
    next2.addEventListener('click', () => go(b, 'output'));
    back3.addEventListener('click', () => go(b, 'microphone'));
    allow.addEventListener('click', () => {
      if (micStepView(options.listen.state(), options.micSupport).canAllow) options.listen.start();
    });
    done.addEventListener('click', () => dialog.close());
    skip.addEventListener('click', () => dialog.close());
    // Escape fires `cancel` and the dialog closes by itself: the same close as Skip intro.
    dialog.addEventListener('close', () => {
      unsubscribe?.();
      unsubscribe = null;
      dialog.remove();
      built = null;
      const target = returnTo;
      returnTo = null;
      if (target?.isConnected) target.focus();
      options.onClose();
    });
    return b;
  }

  return {
    open(focusAfter = null) {
      if (built) return;
      returnTo = focusAfter;
      const b = build();
      built = b;
      document.body.append(b.dialog);
      unsubscribe = options.listen.subscribe(() => {
        if (built === b && current === 'microphone') drawMic(b);
      });
      go(b, 'welcome', false);
      b.dialog.showModal();
      b.steps.welcome.title.focus();
    },
    close() {
      if (built?.dialog.open) built.dialog.close();
    },
    get isOpen() {
      return built?.dialog.open ?? false;
    },
  };
}
