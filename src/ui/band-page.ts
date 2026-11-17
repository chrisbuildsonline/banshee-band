// Band simulator page: the phone status pill, the Feel a pattern card, and the wiring from a chosen sound
// through the real haptics engine to the simulator and, when it can vibrate, the phone.
// No microphone, no clip, no log, no network, no permission.
import { classLabel, createPhoneOutput, mountBandSimulator } from '../band';
import type { SoundEvent, Urgency } from '../events';
import { PATTERN_CLASSES, createHapticEngine, loadPatterns, type HapticClass, type HapticCommand, type Side } from '../haptics';
import { initThemeControl } from './theme';

/** Demo urgency per class: what a user with default settings feels for that sound. */
const URGENCY: Readonly<Record<HapticClass, Urgency>> = {
  alarm: 'high',
  baby: 'high',
  vehicle: 'medium',
  doorbell: 'medium',
  knock: 'medium',
  voice: 'low',
};

/** Demo bearing per side. Unknown takes the real pipeline's path for a weak bearing: confidence 0.5. */
const BEARING: Readonly<Record<Side, { deg: number; confidence: number }>> = {
  left: { deg: -45, confidence: 0.9 },
  centre: { deg: 0, confidence: 0.9 },
  right: { deg: 45, confidence: 0.9 },
  unknown: { deg: 0, confidence: 0.5 },
};

/**
 * Builds the command for a class and side with the real engine and builder, not a copy of the patterns.
 * A fresh engine per call, so an earlier choice's rate limit or priority cannot swallow this one.
 * Returns null only if the engine drops the event, which would be a coding error.
 */
export function buildDemoCommand(cls: HapticClass, side: Side): HapticCommand | null {
  const b = BEARING[side];
  const event: SoundEvent = {
    id: `demo-${cls}-${side}`,
    t: 0,
    class: cls,
    label: classLabel(cls),
    confidence: 1,
    bearingDeg: b.deg,
    bearingSource: 'gcc-phat',
    loudnessDb: -20,
    urgency: URGENCY[cls],
  };
  const decision = createHapticEngine().decide({ event, bearingConfidence: b.confidence }, 0);
  return decision.action === 'play' ? decision.command : null;
}

const SVG = 'http://www.w3.org/2000/svg';

function svg(tag: string, attrs: Record<string, string | number>): SVGElement {
  const node = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

/** The phone status pill: the label carries the meaning, the glyph differs in shape. */
function statusPill(vibrates: boolean): HTMLElement {
  const pill = document.createElement('span');
  pill.id = 'phone-status';
  pill.className = `bb-status ${vibrates ? 'bb-status--accent' : 'bb-status--neutral'}`;
  const glyph = svg('svg', { class: vibrates ? 'bb-status__glyph' : 'bb-status__glyph bb-status__glyph--line', viewBox: '0 0 12 12', 'aria-hidden': 'true', 'data-glyph': vibrates ? 'triangle' : 'circle' });
  glyph.append(vibrates ? svg('path', { d: 'M6 1.5 11 10.5H1z' }) : svg('circle', { cx: 6, cy: 6, r: 3.75 }));
  pill.append(glyph, document.createTextNode(vibrates ? 'Phone vibration on' : 'No phone vibration here'));
  return pill;
}

/** A small picture of a class's rhythm (one pass of its pulses), decoration beside the chip label. */
function rhythmGlyph(cls: HapticClass): SVGElement {
  const pattern = loadPatterns().find((p) => p.class === cls)!;
  const total = pattern.pulses.reduce((sum, p) => sum + p.onMs + p.gapMs, 0);
  const width = 28;
  const box = svg('svg', { class: 'bb-chip__rhythm', viewBox: `0 0 ${width} 10`, 'aria-hidden': 'true' });
  let x = 0;
  for (const p of pattern.pulses) {
    const w = Math.max(2, (p.onMs / total) * width);
    box.append(svg('rect', { x: x.toFixed(2), y: 2, width: w.toFixed(2), height: 6, rx: 1.5 }));
    x += ((p.onMs + p.gapMs) / total) * width;
  }
  return box;
}

function start(): void {
  initThemeControl();

  const phone = createPhoneOutput();
  const vibrates = phone.available(); // read once at load
  document.getElementById('phone-status-slot')!.append(statusPill(vibrates));

  const simulator = mountBandSimulator(document.getElementById('band-simulator')!);
  const message = document.querySelector<HTMLElement>('.bb-feel__message')!;
  const chips = document.getElementById('sound-chips')!;
  const selectedSide = (): Side => (document.querySelector<HTMLInputElement>('input[name="side"]:checked')?.value ?? 'centre') as Side;

  for (const cls of PATTERN_CLASSES) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'bb-pill bb-pill--secondary bb-chip';
    chip.dataset.sound = cls;
    chip.append(rhythmGlyph(cls), document.createTextNode(classLabel(cls)));
    chip.addEventListener('click', () => {
      const command = buildDemoCommand(cls, selectedSide());
      if (command === null) {
        message.textContent = 'This pattern could not be played';
        return;
      }
      message.textContent = '';
      simulator.output.play(command);
      if (phone.available()) phone.play(command);
    });
    chips.append(chip);
  }
}

start();
