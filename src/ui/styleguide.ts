// Styleguide page script: the shared theme control and the Ghosts showcase.
import { SOUND_CLASSES, URGENCY_LEVELS, type SoundEvent } from '../events';
import { CLASS_NAMES, createGlyph, mountGhostField, URGENCY_STYLE } from '../ghosts';
import { initThemeControl } from './theme';

initThemeControl();

/** A demo event built from literals; nothing is heard or read from a clip. */
function demo(id: string, cls: SoundEvent['class'], label: string, urgency: SoundEvent['urgency'], bearingDeg: number | null): SoundEvent {
  return { id, t: 0, class: cls, label, confidence: 0.9, bearingDeg, bearingSource: bearingDeg === null ? 'none' : 'gcc-phat', loudnessDb: -20, urgency };
}

const fieldHost = document.getElementById('ghost-field');
if (fieldHost) {
  const field = mountGhostField(fieldHost, { ttlMs: Number.POSITIVE_INFINITY });
  // Shown oldest first, so the last one (the alarm) is the newest, on the top row.
  for (const event of [
    demo('demo-baby', 'baby', 'Baby crying', 'high', null),
    demo('demo-voice', 'voice', 'Voice', 'low', 0),
    demo('demo-knock', 'knock', 'Knock', 'medium', -55),
    demo('demo-alarm', 'alarm', 'Smoke alarm', 'high', 60),
  ]) {
    field.show({ event, bearingConfidence: 0.9 });
  }
}

const glyphHost = document.getElementById('ghost-glyphs');
if (glyphHost) {
  for (const urgency of URGENCY_LEVELS) {
    const row = document.createElement('div');
    row.className = 'bb-glyphs__row';
    const word = document.createElement('p');
    word.className = 'bb-glyphs__urgency bb-label';
    word.textContent = URGENCY_STYLE[urgency].word;
    const cells = document.createElement('ul');
    cells.className = 'bb-glyphs__cells';
    for (const cls of SOUND_CLASSES) {
      const cell = document.createElement('li');
      cell.className = 'bb-glyphs__cell';
      const tile = document.createElement('span');
      tile.className = 'bb-glyphs__tile';
      tile.append(createGlyph(cls, urgency));
      const name = document.createElement('span');
      name.className = 'bb-glyphs__name bb-caption';
      name.textContent = CLASS_NAMES[cls];
      cell.append(tile, name);
      cells.append(cell);
    }
    row.append(word, cells);
    glyphHost.append(row);
  }
}
