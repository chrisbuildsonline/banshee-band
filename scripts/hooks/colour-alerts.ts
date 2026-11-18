// `bun run hooks:colour [tables.json]`: no state of the UI may be told apart by colour alone. Reads the state tables
// the station, Listen pill, ghosts and wristband row draw from (or a JSON file of tables) and checks that every state
// has a word, and that two states with different colours also differ in word and, where the table has shapes, in
// shape. Prints each problem and exits 1 when there is one.
import { readFileSync } from 'node:fs';
import { bandStatusText } from '../../src/band/labels';
import type { BandState } from '../../src/band/types';
import { URGENCY_STYLE } from '../../src/ghosts/constants';
import { LISTEN_STATES } from '../../src/station/listen-status';
import { STATION_PILLS } from '../../src/station/status';

/** One shown state: its colour (tint or token), the word shown with it and its shape, if the table has shapes. */
export interface StateCue {
  state: string;
  colour: string;
  word: string;
  shape?: string;
}

/** Every colour-only state of each table: a missing word, or two states that differ in colour only. */
export function colourOnlyProblems(tables: Record<string, StateCue[]>): string[] {
  const out: string[] = [];
  for (const [name, states] of Object.entries(tables)) {
    for (const s of states) if (s.word.trim() === '') out.push(`${name}: ${s.state} has no word`);
    for (let i = 0; i < states.length; i++) {
      for (let j = i + 1; j < states.length; j++) {
        const a = states[i];
        const b = states[j];
        if (a.colour === b.colour) continue;
        if (a.word.trim() !== '' && a.word === b.word) out.push(`${name}: ${a.state} and ${b.state} differ in colour but have the same word "${a.word}"`);
        if (a.shape !== undefined && a.shape === b.shape) out.push(`${name}: ${a.state} and ${b.state} differ in colour but have the same shape "${a.shape}"`);
      }
    }
  }
  return out;
}

const BAND_STATES: readonly BandState[] = ['unsupported', 'idle', 'connecting', 'connected'];

/** The state tables of the UI, as drawn: tint, word and glyph of each pill; glow, word and size of each urgency. */
export function uiStateTables(): Record<string, StateCue[]> {
  return {
    'station pill': Object.entries(STATION_PILLS).map(([state, p]) => ({ state, colour: p.tint, word: p.text, shape: p.glyph })),
    'listen pill': Object.entries(LISTEN_STATES).map(([state, p]) => ({ state, colour: p.tint, word: p.word, shape: p.glyph })),
    'ghost urgency': Object.entries(URGENCY_STYLE).map(([state, u]) => ({
      state,
      colour: u.glowToken,
      word: u.word,
      shape: `scale ${u.scale}, outline ${u.outlineWidth}`,
    })),
    // connect.css tints the glyph and the status line only for data-state="connected"; the glyph shape never changes.
    'wristband row': BAND_STATES.map((state) => ({
      state,
      colour: state === 'connected' ? 'accent' : 'muted',
      word: bandStatusText(state, null, null),
    })),
  };
}

if (import.meta.main) {
  const file = process.argv[2];
  let problems: string[];
  try {
    problems = colourOnlyProblems(file ? JSON.parse(readFileSync(file, 'utf8')) : uiStateTables());
  } catch (e) {
    problems = [`${file}: ${(e as Error).message}`];
  }
  if (problems.length > 0) {
    console.error(`${problems.length} colour-only state(s):\n${problems.join('\n')}`);
    process.exit(1);
  }
  console.log('every coloured state has its own word (and shape where it has one)');
}
