import { createCapture, fetchClip, loadManifest, type ClipInfo } from '../audio';
import { createPhoneOutput, mountBandSimulator, type HapticOutput } from '../band';
import { createBearingWindow } from '../bearing';
import { createClassifier, type Classifier } from '../classify';
import { createGlyph, mountGhostField } from '../ghosts';
import { createHapticEngine, sideOf } from '../haptics';
import { failureText, LIVE_FAILURE_TEXT } from './format';
import { mountEventList } from './list';
import { mountListenCard } from './listen';
import { createLive, type Live } from './live';
import { mountPipelineView } from './pipeline-view';
import { runSound } from './runner';
import { mountStatusPill } from './status';
import { mountTrySound } from './try-sound';
import type { RunnerDeps, RunResultOk, TrySide } from './types';

const LOADING_MODEL = 'Loading the sound model';
const LISTENING = 'Listening to the clip';
const MODEL_FAILED = 'The sound model could not be loaded. Reload the page to try again.';
const CAPTURE_FAILED = 'Audio could not start because of an unexpected problem. Reload the page and try again.';

function card(tag: 'section' | 'div', className: string, name: string): HTMLElement {
  const node = document.createElement(tag);
  node.className = className;
  node.dataset.card = name;
  return node;
}

function heading(text: string, id: string): HTMLHeadingElement {
  const h = document.createElement('h2');
  h.className = 'bb-heading';
  h.id = id;
  h.textContent = text;
  return h;
}

/**
 * The idle hint over an empty ghost field: a faint ghost, "All quiet" and where a ghost will appear. CSS hides
 * it while the field's "Now:" list names a ghost. Decorative (`aria-hidden`): the list says the same in words.
 */
function idleHint(): HTMLElement {
  const hint = document.createElement('div');
  hint.className = 'bb-station-ghosts__idle';
  hint.setAttribute('aria-hidden', 'true');
  const title = document.createElement('p');
  title.className = 'bb-station-ghosts__idle-title';
  title.textContent = 'All quiet';
  const text = document.createElement('p');
  text.className = 'bb-station-ghosts__idle-text';
  text.textContent = 'Try a sound and its ghost appears here, on the side it came from.';
  hint.append(createGlyph('other', 'low'), title, text);
  return hint;
}

/**
 * The urgency key under the ghost field: the same ghost at the three urgency sizes, each with its word, so
 * size and outline weight read as urgency before the first sound arrives.
 */
function urgencyKey(): HTMLElement {
  const key = document.createElement('ul');
  key.className = 'bb-station-key';
  key.setAttribute('aria-label', 'Urgency key');
  for (const [urgency, word] of [['low', 'Low'], ['medium', 'Medium'], ['high', 'Urgent']] as const) {
    const item = document.createElement('li');
    item.className = 'bb-station-key__item';
    const label = document.createElement('span');
    label.textContent = word;
    item.append(createGlyph('other', urgency), label);
    key.append(item);
  }
  return key;
}

/**
 * Builds the listening station inside `root` (the page's `<main>`, after its title block): the Try a sound
 * card, the ghost field, the Latest alert and Recent sounds card, the band simulator and the pipeline card,
 * plus the status pill in `#station-status`. On load it reads the clip list only. The first chip press
 * loads the sound model (`createClassifier`); every press runs the clip through `runSound` and shows the
 * result as a ghost, a row, the Latest alert and the simulator's pattern. Nothing records or plays audio.
 */
export function mountStation(root: HTMLElement): void {
  const phone = createPhoneOutput();
  const vibrates = phone.available(); // read once at load
  const status = mountStatusPill(document.getElementById('station-status') ?? root, vibrates);

  const controls = document.createElement('div');
  controls.className = 'bb-station-controls';
  const listenCard = card('section', 'bb-card bb-station-listen', 'listen');
  const tryCard = card('section', 'bb-card bb-station-try', 'try');
  controls.append(listenCard, tryCard);
  const ghostCard = card('section', 'bb-card bb-station-ghosts', 'ghosts');
  const side = document.createElement('div');
  side.className = 'bb-station-side-column';
  const alertsCard = card('section', 'bb-card bb-station-alerts', 'alerts');
  alertsCard.setAttribute('aria-labelledby', 'alert-title');
  const simHost = card('div', 'bb-station-sim', 'simulator');
  const pipelineCard = card('section', 'bb-card bb-station-pipeline', 'pipeline');
  side.append(alertsCard, simHost);
  root.append(controls, ghostCard, side, pipelineCard);

  const ghostHead = document.createElement('div');
  ghostHead.className = 'bb-station-ghosts__head';
  const ghostNote = document.createElement('p');
  ghostNote.className = 'bb-station-ghosts__note';
  ghostNote.textContent = 'Shape is the sound, place is the side, glow is how urgent.';
  ghostHead.append(heading('Ghost field', 'ghosts-title'), ghostNote);
  ghostCard.setAttribute('aria-labelledby', 'ghosts-title');
  ghostCard.append(ghostHead);
  const field = mountGhostField(ghostCard);
  ghostCard.querySelector('.bb-ghost-field')?.append(idleHint());
  ghostCard.append(urgencyKey());

  pipelineCard.setAttribute('aria-labelledby', 'pipeline-title');
  const pipelineNote = document.createElement('p');
  pipelineNote.className = 'bb-station-pipeline__note';
  pipelineNote.textContent = 'Each step of a run and how long it took.';
  pipelineCard.append(heading('Pipeline', 'pipeline-title'), pipelineNote);
  const pipeline = mountPipelineView(pipelineCard);

  const list = mountEventList(alertsCard);
  const simulator = mountBandSimulator(simHost);
  const outputs: HapticOutput[] = vibrates ? [simulator.output, phone] : [simulator.output];
  const engine = createHapticEngine({ rateLimitMs: 0 });
  /** The clocks both paths share: a monotonic one for stage times and the wall clock for event times. */
  const clocks = { now: () => performance.now(), epoch: () => Date.now() };

  let classifier: Classifier | null = null;
  let loading: Promise<Classifier> | null = null;
  let deps: RunnerDeps | null = null;
  let busy = false;

  /** The page's one classifier, shared by Try a sound and Listen; a failed load can be tried again. */
  async function loadClassifier(): Promise<Classifier> {
    if (classifier) return classifier;
    loading ??= createClassifier().then(
      (c) => (classifier = c),
      (e) => {
        loading = null;
        status.setProblem();
        throw e;
      },
    );
    const c = await loading;
    status.reset();
    return c;
  }

  /** Shows a run, from a clip or a live window, as a ghost, a row and the pipeline view. */
  function show(result: RunResultOk): void {
    const bearingConfidence = result.bearingConfidence;
    field.show({ event: result.event, bearingConfidence });
    list.add({ cls: result.event.class, side: sideOf(result.event, bearingConfidence), urgency: result.event.urgency, at: result.at });
    pipeline.show(result);
  }

  async function pick(clip: ClipInfo, chosen: TrySide): Promise<void> {
    if (busy) return;
    busy = true;
    try {
      trySound.setBusy(classifier ? LISTENING : LOADING_MODEL, clip.id);
      let c: Classifier;
      try {
        c = await loadClassifier();
      } catch {
        trySound.setBusy(null);
        trySound.setMessage(MODEL_FAILED);
        return;
      }
      trySound.setBusy(LISTENING, clip.id);
      // One deps object for the page, so the runner numbers its events station-1, station-2, ...
      deps ??= { loadClip: (id) => fetchClip(id), classifier: c, engine, outputs, ...clocks };
      const result = await runSound(deps, clip.id, chosen);
      trySound.setBusy(null);
      if (!result.ok) {
        if (result.code === 'event-invalid') pipeline.failed();
        trySound.setMessage(failureText(result.code));
        return;
      }
      show(result);
    } finally {
      busy = false;
    }
  }

  // Live listening: its own engine with the default rate limit, the shared classifier and outputs.
  let live: Live | null = null;
  let starting = false;

  async function startListening(): Promise<void> {
    if (starting) return;
    starting = true;
    listen.setState('starting', classifier ? null : LOADING_MODEL);
    try {
      let c: Classifier;
      try {
        c = await loadClassifier();
      } catch {
        listen.setState('problem', MODEL_FAILED);
        return;
      }
      live ??= createLive(
        { capture: createCapture(), classifier: c, bearing: createBearingWindow(), engine: createHapticEngine(), outputs, ...clocks },
        (u) => {
          if (u.kind === 'event') show(u.result);
          else if (u.kind === 'failure') listen.setState('problem', LIVE_FAILURE_TEXT);
          else if (u.state !== 'starting') listen.setState(u.state, u.message);
        },
      );
      try {
        await live.start();
      } catch {
        listen.setState('problem', CAPTURE_FAILED);
      }
    } finally {
      starting = false;
    }
  }

  const listen = mountListenCard(listenCard, { onStart: () => void startListening(), onStop: () => void live?.stop() });

  const trySound = mountTrySound(tryCard, { onPick: (clip, chosen) => void pick(clip, chosen) });

  loadManifest().then(
    (clips) => trySound.setClips(clips),
    () => trySound.setClipsFailed(),
  );

  // Phone: Listen and Try a sound are a bar fixed to the bottom; the page keeps its height free below the content.
  new ResizeObserver(() => {
    document.body.style.setProperty('--bb-station-bar', `${Math.ceil(controls.getBoundingClientRect().height)}px`);
  }).observe(controls);
}
