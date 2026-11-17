import { describe, expect, it } from 'vitest';
import { SOUND_CLASSES, type Urgency } from '../../src/events';
import { ghostBasePx, ghostBlock, layoutGhost, layoutGhosts } from '../../src/ghosts/layout';
import { SHAPES } from '../../src/ghosts/shapes';
import { at, ghostInput } from './helpers/inputs';

const FIELD = { width: 600, height: 400 };

describe('layoutGhost: bearing and position (R3)', () => {
  it('maps -90, -45, 0, 45, 90 linearly inside the 72 px padding', () => {
    expect([-90, -45, 0, 45, 90].map((b) => layoutGhost(at(b), FIELD).x)).toEqual([72, 186, 300, 414, 528]);
  });

  it('clamps bearings beyond 90 degrees to the nearer edge', () => {
    expect([91, 180, -91, -180].map((b) => layoutGhost(at(b), FIELD).x)).toEqual([528, 528, 72, 72]);
  });

  it('keeps the padding on a 200 px field', () => {
    expect(layoutGhost(at(-90), { width: 200, height: 400 }).x).toBe(72);
    expect(layoutGhost(at(90), { width: 200, height: 400 }).x).toBe(128);
  });

  it('puts an uncertain ghost at the centre whatever the bearing says', () => {
    const cases = [
      ghostInput({ bearingSource: 'loudness', bearingDeg: -60 }, 1),
      ghostInput({ bearingSource: 'none', bearingDeg: null }, 1),
      at(-60, {}, 0),
      at(-60, {}, 0.5),
      at(-60, {}, 0.79),
      at(-60, {}, Number.NaN),
      at(-60, {}, -0.1),
      at(-60, {}, 1.1),
    ];
    for (const input of cases) {
      const l = layoutGhost(input, FIELD);
      expect(l.x).toBe(300);
      expect(l.uncertain).toBe(true);
      expect(l.side).toBe('unknown');
      expect(l.sideText).toBe('Side unknown');
    }
  });

  it('treats a bearing confidence of 0.8 as certain', () => {
    const l = layoutGhost(at(-60, {}, 0.8), FIELD);
    expect(l.uncertain).toBe(false);
    expect(l.side).toBe('left');
    expect(l.x).toBeLessThan(300);
  });

  it('names the side: Left, Centre, Right, Side unknown', () => {
    expect(layoutGhost(at(-60), FIELD).sideText).toBe('Left');
    expect(layoutGhost(at(0), FIELD).sideText).toBe('Centre');
    expect(layoutGhost(at(60), FIELD).sideText).toBe('Right');
    expect(layoutGhost(at(60, {}, 0.5), FIELD).sideText).toBe('Side unknown');
  });

  it('keeps x linear inside the centre zone: -10 degrees is Centre and slightly left', () => {
    const l = layoutGhost(at(-10), FIELD);
    expect(l.sideText).toBe('Centre');
    expect(l.x).toBeLessThan(300);
    expect(l.x).toBeCloseTo(300 - (10 / 90) * 228, 10);
  });
});

describe('layoutGhost: urgency and text (R4)', () => {
  it('maps the urgency table', () => {
    const low = layoutGhost(at(0, { urgency: 'low' }), FIELD);
    const medium = layoutGhost(at(0, { urgency: 'medium' }), FIELD);
    const high = layoutGhost(at(0, { urgency: 'high' }), FIELD);
    expect([low.scale, low.outlineWidth, low.glowBlur, low.glowToken, low.urgencyWord]).toEqual([1, 1.5, 4, '--bb-ghost-glow-1', 'Low']);
    expect([medium.scale, medium.outlineWidth, medium.glowBlur, medium.glowToken, medium.urgencyWord]).toEqual([1.25, 2.5, 8, '--bb-ghost-glow-2', 'Medium']);
    expect([high.scale, high.outlineWidth, high.glowBlur, high.glowToken, high.urgencyWord]).toEqual([1.5, 3.5, 12, '--bb-ghost-glow-3', 'Urgent']);
    expect([low.boxPx, medium.boxPx, high.boxPx]).toEqual([72, 90, 108]);
  });

  it('builds the label text with middle dots', () => {
    expect(layoutGhost(at(-60, { label: 'Knock', urgency: 'high' }), FIELD).labelText).toBe('Knock · Left · Urgent');
    expect(layoutGhost(ghostInput({ class: 'baby', label: 'Baby crying', urgency: 'high', bearingDeg: null, bearingSource: 'none' }, 0.9), FIELD).labelText).toBe('Baby crying · Side unknown · Urgent');
  });

  it('takes the shape from the class', () => {
    for (const c of SOUND_CLASSES) expect(layoutGhost(at(0, { class: c }), FIELD).shape).toBe(SHAPES[c]);
  });

  it('gives equal results for the same input and does not modify it', () => {
    const input = at(30, { urgency: 'medium' }, 0.9);
    const copy = structuredClone(input);
    expect(layoutGhost(input, FIELD)).toEqual(layoutGhost(input, FIELD));
    expect(input).toEqual(copy);
  });

  it('does not depend on confidence, loudness, id or time', () => {
    const a = layoutGhost(at(30, { confidence: 0.1, loudnessDb: -60, id: 'a', t: 1 }), FIELD);
    const b = layoutGhost(at(30, { confidence: 1, loudnessDb: 0, id: 'b', t: 99999 }), FIELD);
    expect(a).toEqual(b);
  });
});

describe('layoutGhosts: rows (R5)', () => {
  const H360 = { width: 600, height: 360 };

  it('gives one to four ghosts rows 0 to n-1 from the top, newest first', () => {
    for (let n = 1; n <= 4; n++) {
      const inputs = Array.from({ length: n }, (_, i) => at(-60 + i * 30, { label: `G${i}` }));
      const ls = layoutGhosts(inputs, H360);
      expect(ls).toHaveLength(n);
      ls.forEach((l, i) => expect(l.labelText.startsWith(`G${i} `)).toBe(true));
      for (let i = 1; i < n; i++) expect(ls[i].y).toBeGreaterThan(ls[i - 1].y);
    }
  });

  it('drops the oldest beyond four', () => {
    for (const n of [5, 6]) {
      const inputs = Array.from({ length: n }, (_, i) => at(0, { label: `G${i}` }));
      const ls = layoutGhosts(inputs, H360);
      expect(ls.map((l) => l.labelText.split(' ')[0])).toEqual(['G0', 'G1', 'G2', 'G3']);
    }
  });

  it('fits every combination of urgencies in its slot, between the margins, at 360, 480 and 720 px', () => {
    const urgencies: Urgency[] = ['low', 'medium', 'high'];
    for (const height of [360, 480, 720]) {
      for (let n = 1; n <= 4; n++) {
        const combos: Urgency[][] = [[]];
        for (let k = 0; k < n; k++) combos.splice(0, combos.length, ...combos.flatMap((c) => urgencies.map((u) => [...c, u])));
        for (const combo of combos) {
          const ls = layoutGhosts(combo.map((u) => at(0, { urgency: u })), { width: 600, height });
          const blocks = ls.map(ghostBlock);
          blocks.forEach((b, i) => {
            expect(b.top).toBeGreaterThanOrEqual(8 - 1e-9);
            expect(b.bottom).toBeLessThanOrEqual(height - 40 + 1e-9);
            if (i > 0) expect(b.top).toBeGreaterThanOrEqual(blocks[i - 1].bottom - 1e-9);
          });
        }
      }
    }
  });

  it('matches the slot arithmetic with literals', () => {
    const one = layoutGhosts([at(0, { urgency: 'low' })], H360)[0];
    expect(one.boxPx).toBe(72);
    expect(ghostBlock(one).bottom - ghostBlock(one).top).toBe(94);
    expect(one.y).toBe(153);

    const fourLow = layoutGhosts([0, 1, 2, 3].map(() => at(0, { urgency: 'low' })), H360);
    expect(fourLow[0].boxPx).toBe(32);
    expect(ghostBlock(fourLow[0]).bottom - ghostBlock(fourLow[0]).top).toBe(54);
    expect(fourLow[0].y).toBe(36);

    const fourHigh = layoutGhosts([0, 1, 2, 3].map(() => at(0, { urgency: 'high' })), H360);
    expect(fourHigh[0].boxPx).toBe(48);
    expect(ghostBlock(fourHigh[0]).bottom - ghostBlock(fourHigh[0]).top).toBe(78);
    expect(fourHigh[0].y).toBe(32);
    expect(ghostBlock(fourHigh[3]).bottom).toBe(320);

    expect(layoutGhosts([at(0, { urgency: 'high' })], { width: 600, height: 480 })[0].boxPx).toBe(108);
  });

  it('does not modify the input array and keeps x independent of the row', () => {
    const inputs = [at(-60), at(45), at(10)];
    const copy = structuredClone(inputs);
    const ls = layoutGhosts(inputs, H360);
    expect(inputs).toEqual(copy);
    ls.forEach((l, i) => expect(l.x).toBe(layoutGhost(inputs[i], H360).x));
  });
});

describe('ghostBasePx (R5.2)', () => {
  it('follows the formula and its clamps', () => {
    expect(ghostBasePx(360, 4)).toBe(32);
    expect(ghostBasePx(360, 3)).toBe(49);
    expect(ghostBasePx(360, 1)).toBe(72);
    expect(ghostBasePx(480, 1)).toBe(72);
    expect(ghostBasePx(480, 2)).toBe(72);
    expect(ghostBasePx(200, 4)).toBe(32);
    expect(ghostBasePx(408, 4)).toBe(40);
  });

  it('gives four ghosts in a 360 px field boxes of 32, 40 and 48 by urgency', () => {
    const ls = layoutGhosts([at(0, { urgency: 'low' }), at(0, { urgency: 'medium' }), at(0, { urgency: 'high' }), at(0, { urgency: 'low' })], { width: 390, height: 360 });
    expect(ls.map((l) => l.boxPx)).toEqual([32, 40, 48, 32]);
  });
});
