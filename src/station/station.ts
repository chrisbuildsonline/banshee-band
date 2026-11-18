import { createCapture, fetchClip, loadManifest, type ClipInfo } from '../audio';
import { createBandLink, createPhoneOutput, mountBandSimulator, type HapticOutput } from '../band';
import { createBearingWindow } from '../bearing';
import { createClassifier, type Classifier } from '../classify';
import { createGlyph, mountGhostField } from '../ghosts';
import { sideOf } from '../haptics';
import { failureText, LIVE_FAILURE_TEXT, mutedText } from './format';
import { mountEventList } from './list';
import { mountListenCard } from './listen';
import { createLive, type Live } from './live';
import { markOnboarded, micSupport, shouldShowIntro } from './onboarding';
import { mountOnboarding, type Onboarding } from './onboarding-sheet';
import { mountPipelineView } from './pipeline-view';
import { runSound } from './runner';
import { createSettingsEngine, effectiveOutput, isMuted, loadSettings, outputsFor, type StationSettings } from './settings';
import { browserStorage, mountSettings } from './settings-panel';
import { mountStatusPill } from './status';
import { mountTrySound } from './try-sound';
import type { ListenState, LiveDeps, RunnerDeps, RunResultOk, TrySide } from './types';

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
  // The saved settings, read once; the Settings sheet sends every later change to apply().
  let settings: StationSettings = loadSettings(browserStorage());
  // The wristband: in use only while connected; every link change re-applies the outputs (see below).
  const band = createBandLink();
  const effective = () => effectiveOutput(settings.output, { phone: vibrates, band: band.state() === 'connected' });
  const status = mountStatusPill(document.getElementById('station-status') ?? root, vibrates);
  status.setOutput(effective());

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
  // The Latest alert announces each event; the simulator's line stays visible text, so nothing is said twice.
  const simulator = mountBandSimulator(simHost, { announce: false });
  const outputsNow = (): HapticOutput[] => outputsFor(effective(), { simulator: simulator.output, phone, band: band.output });
  let outputs = outputsNow();
  /** The clocks both paths share: a monotonic one for stage times and the wall clock for event times. */
  const clocks = { now: () => performance.now(), epoch: () => Date.now() };

  let classifier: Classifier | null = null;
  let loading: Promise<Classifier> | null = null;
  // Built once each and changed in place by apply(): the runner numbers its events per deps object, and the
  // live loop keeps the object it was given.
  let deps: RunnerDeps | null = null;
  let liveDeps: LiveDeps | null = null;
  let busy = false;

  /** Makes new settings take effect at once: new engines (they read settings once), outputs and the status pill. */
  function apply(next: StationSettings): void {
    settings = next;
    const before = outputs;
    outputs = outputsNow();
    for (const o of before) if (!outputs.includes(o)) o.stop();
    if (deps) {
      deps.engine = createSettingsEngine(next, { rateLimitMs: 0 });
      deps.outputs = outputs;
    }
    if (liveDeps) {
      liveDeps.engine = createSettingsEngine(next);
      liveDeps.outputs = outputs;
    }
    status.setOutput(effective());
  }
  // A connect or a lost band changes the output in use at once.
  band.subscribe(() => apply(settings));

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

  /**
   * Shows a run, from a clip or a live window, as a ghost, a row and the pipeline view. A run the settings muted
   * (class off or under its level) fills the pipeline view only and raises no alert; then this returns false.
   */
  function show(result: RunResultOk): boolean {
    if (isMuted(result.decision)) {
      pipeline.show(result);
      return false;
    }
    const bearingConfidence = result.bearingConfidence;
    field.show({ event: result.event, bearingConfidence });
    list.add({ cls: result.event.class, side: sideOf(result.event, bearingConfidence), urgency: result.event.urgency, at: result.at });
    pipeline.show(result);
    return true;
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
      deps ??= { loadClip: (id) => fetchClip(id), classifier: c, engine: createSettingsEngine(settings, { rateLimitMs: 0 }), outputs, ...clocks };
      const result = await runSound(deps, clip.id, chosen);
      trySound.setBusy(null);
      if (!result.ok) {
        if (result.code === 'event-invalid') pipeline.failed();
        trySound.setMessage(failureText(result.code));
        return;
      }
      if (!show(result) && result.decision.action === 'drop') {
        const cls = result.event.class;
        trySound.setMessage(mutedText(cls, result.decision.reason === 'disabled-class' ? 'off' : 'too-quiet', settings.sounds[cls].minDb));
      }
    } finally {
      busy = false;
    }
  }

  // Live listening: its own settings engine with the default rate limit, the shared classifier and outputs.
  let live: Live | null = null;
  let starting = false;
  // The Listen state, kept here too so the intro's microphone step can show the same outcome.
  let listenState: ListenState = 'idle';
  const listenWatchers = new Set<(state: ListenState) => void>();

  function setListen(state: ListenState, message: string | null = null): void {
    listenState = state;
    listen.setState(state, message);
    for (const fn of listenWatchers) fn(state);
  }

  async function startListening(): Promise<void> {
    if (starting) return;
    starting = true;
    setListen('starting', classifier ? null : LOADING_MODEL);
    try {
      let c: Classifier;
      try {
        c = await loadClassifier();
      } catch {
        setListen('problem', MODEL_FAILED);
        return;
      }
      liveDeps ??= { capture: createCapture(), classifier: c, bearing: createBearingWindow(), engine: createSettingsEngine(settings), outputs, ...clocks };
      live ??= createLive(
        liveDeps,
        (u) => {
          if (u.kind === 'event') show(u.result);
          else if (u.kind === 'failure') setListen('problem', LIVE_FAILURE_TEXT);
          else if (u.state !== 'starting') setListen(u.state, u.message);
        },
      );
      try {
        await live.start();
      } catch {
        setListen('problem', CAPTURE_FAILED);
      }
    } finally {
      starting = false;
    }
  }

  const listen = mountListenCard(listenCard, { onStart: () => void startListening(), onStop: () => void live?.stop() });

  const trySound = mountTrySound(tryCard, { onPick: (clip, chosen) => void pick(clip, chosen) });

  const settingsTrigger = document.getElementById('settings-open');
  if (settingsTrigger) {
    let intro: Onboarding | null = null;
    let openedFrom: HTMLElement | null = null;
    const panel = mountSettings(settingsTrigger, {
      settings,
      phoneAvailable: vibrates,
      band,
      onChange: apply,
      onShowIntro: () => {
        openedFrom = settingsTrigger;
        intro?.open(settingsTrigger);
      },
    });
    // The first-run intro: its output choice goes through the Settings sheet, its microphone through Start listening.
    intro = mountOnboarding({
      phoneAvailable: vibrates,
      bandSupported: band.state() !== 'unsupported',
      micSupport: micSupport({ hasGetUserMedia: typeof navigator.mediaDevices?.getUserMedia === 'function', isSecureContext: window.isSecureContext }),
      settings: panel.settings,
      setOutput: panel.setOutput,
      listen: {
        state: () => listenState,
        start: () => void startListening(),
        subscribe: (fn) => {
          listenWatchers.add(fn);
          return () => void listenWatchers.delete(fn);
        },
      },
      onClose: () => {
        markOnboarded(browserStorage());
        // The first run: the pill the user needs next, Start listening (or Stop while listening).
        if (!openedFrom) listenCard.querySelector<HTMLElement>('[data-listen]:not([hidden])')?.focus();
        openedFrom = null;
      },
    });
    if (shouldShowIntro(browserStorage())) intro.open(null);
  }

  loadManifest().then(
    (clips) => trySound.setClips(clips),
    () => trySound.setClipsFailed(),
  );

  // Phone: Listen and Try a sound are a bar fixed to the bottom; the page keeps its height free below the content.
  new ResizeObserver(() => {
    document.body.style.setProperty('--bb-station-bar', `${Math.ceil(controls.getBoundingClientRect().height)}px`);
  }).observe(controls);
}
