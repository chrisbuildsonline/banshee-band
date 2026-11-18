import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { colourOnlyProblems, uiStateTables, type StateCue } from '../../../scripts/hooks/colour-alerts';
import { runScript } from './helpers';

const good: StateCue[] = [
  { state: 'on', colour: 'accent', word: 'Band connected', shape: 'dot' },
  { state: 'off', colour: 'neutral', word: 'Band not connected', shape: 'circle' },
  { state: 'bad', colour: 'strong', word: 'Problem', shape: 'cross' },
  { state: 'blocked', colour: 'strong', word: 'Mic blocked', shape: 'cross' },
];

describe('colourOnlyProblems', () => {
  it('passes states that pair every colour with a word and a shape', () => {
    expect(colourOnlyProblems({ pill: good })).toEqual([]);
  });

  it('flags two states that differ in colour but share the word', () => {
    const t = [good[0], { ...good[1], word: 'Band connected' }];
    expect(colourOnlyProblems({ pill: t })).toEqual(['pill: on and off differ in colour but have the same word "Band connected"']);
  });

  it('flags two states that differ in colour but share the shape', () => {
    const t = [good[0], { ...good[1], shape: 'dot' }];
    expect(colourOnlyProblems({ pill: t })).toEqual(['pill: on and off differ in colour but have the same shape "dot"']);
  });

  it('flags a state with no word', () => {
    expect(colourOnlyProblems({ pill: [{ state: 'x', colour: 'accent', word: ' ' }] })).toEqual(['pill: x has no word']);
  });

  it('allows a table without shapes when the words differ', () => {
    expect(colourOnlyProblems({ row: [{ state: 'a', colour: 'accent', word: 'A' }, { state: 'b', colour: 'neutral', word: 'B' }] })).toEqual([]);
  });
});

describe('uiStateTables', () => {
  it('reads the station pill, the Listen pill, the ghost urgencies and the wristband row', () => {
    const t = uiStateTables();
    expect(Object.keys(t).sort()).toEqual(['ghost urgency', 'listen pill', 'station pill', 'wristband row']);
    expect(t['station pill'].map((s) => s.state).sort()).toEqual(['band-off', 'band-on', 'fallback', 'problem']);
    expect(t['ghost urgency'].find((s) => s.state === 'high')).toMatchObject({ word: 'Urgent', colour: '--bb-ghost-glow-3' });
  });

  it('has no colour-only state today', () => {
    expect(colourOnlyProblems(uiStateTables())).toEqual([]);
  });
});

describe('bun scripts/hooks/colour-alerts.ts', () => {
  it('exits 0 on the UI', () => {
    const r = runScript('scripts/hooks/colour-alerts.ts');
    expect(r.code, r.out).toBe(0);
  });

  it('exits non-zero on tables with a colour-only state', () => {
    const file = join(mkdtempSync(join(tmpdir(), 'bb-colour-')), 'tables.json');
    writeFileSync(file, JSON.stringify({ pill: [good[0], { ...good[1], word: 'Band connected', shape: 'dot' }] }));
    const r = runScript('scripts/hooks/colour-alerts.ts', [file]);
    expect(r.code).toBe(1);
    expect(r.out).toContain('pill: on and off differ in colour');
  });
});
