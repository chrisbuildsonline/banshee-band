import { fetchClip, loadManifest, type ClipInfo } from '../audio';
import { createPhoneOutput, mountBandSimulator, type HapticOutput } from '../band';
import { createClassifier, type Classifier } from '../classify';
import { createGlyph, mountGhostField } from '../ghosts';
import { createHapticEngine, sideOf } from '../haptics';
import { failureText } from './format';
import { mountEventList } from './list';
import { mountPipelineView } from './pipeline-view';
import { runSound } from './runner';
import { mountStatusPill } from './status';
import { mountTrySound } from './try-sound';
import type { RunnerDeps, TrySide } from './types';

const LOADING_MODEL = 'Loading the sound model';
const LISTENING = 'Listening to the clip';
const MODEL_FAILED = 'The sound model could not be loaded. Reload the page to try again.';

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

  const tryCard = card('section', 'bb-card bb-station-try', 'try');
  const ghostCard = card('section', 'bb-card bb-station-ghosts', 'ghosts');
  const side = document.createElement('div');
  side.className = 'bb-station-side-column';
  const alertsCard = card('section', 'bb-card bb-station-alerts', 'alerts');
  alertsCard.setAttribute('aria-labelledby', 'alert-title');
  const simHost = card('div', 'bb-station-sim', 'simulator');
  const pipelineCard = card('section', 'bb-card bb-station-pipeline', 'pipeline');
  side.append(alertsCard, simHost);
  root.append(tryCard, ghostCard, side, pipelineCard);

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

  let classifier: Classifier | null = null;
  let deps: RunnerDeps | null = null;
  let busy = false;

  async function pick(clip: ClipInfo, chosen: TrySide): Promise<void> {
    if (busy) return;
    busy = true;
    try {
      trySound.setBusy(classifier ? LISTENING : LOADING_MODEL, clip.id);
      if (!classifier) {
        try {
          classifier = await createClassifier();
        } catch {
          status.setProblem();
          trySound.setBusy(null);
          trySound.setMessage(MODEL_FAILED);
          return;
        }
        status.reset();
        trySound.setBusy(LISTENING, clip.id);
      }
      // One deps object for the page, so the runner numbers its events station-1, station-2, ...
      deps ??= { loadClip: (id) => fetchClip(id), classifier, engine, outputs, now: () => performance.now(), epoch: () => Date.now() };
      const result = await runSound(deps, clip.id, chosen);
      trySound.setBusy(null);
      if (!result.ok) {
        if (result.code === 'event-invalid') pipeline.failed();
        trySound.setMessage(failureText(result.code));
        return;
      }
      const bearingConfidence = result.bearingConfidence;
      field.show({ event: result.event, bearingConfidence });
      list.add({ cls: result.event.class, side: sideOf(result.event, bearingConfidence), urgency: result.event.urgency, at: result.at });
      pipeline.show(result);
    } finally {
      busy = false;
    }
  }

  const trySound = mountTrySound(tryCard, { onPick: (clip, chosen) => void pick(clip, chosen) });

  loadManifest().then(
    (clips) => trySound.setClips(clips),
    () => trySound.setClipsFailed(),
  );

  // Phone: the Try a sound card is a bar fixed to the bottom; the page keeps its height free below the content.
  new ResizeObserver(() => {
    document.body.style.setProperty('--bb-station-bar', `${Math.ceil(tryCard.getBoundingClientRect().height)}px`);
  }).observe(tryCard);
}
