import { describe, expect, it } from 'vitest';
import { createGhostSet } from '../../src/ghosts/life';
import { at } from './helpers/inputs';

const label = (s: ReturnType<typeof createGhostSet>) => s.items().map((g) => g.input.event.label);

describe('createGhostSet (R7.2-R7.7)', () => {
  it('puts the newest first', () => {
    const s = createGhostSet(8000);
    s.add(at(0, { label: 'A' }), 0);
    s.add(at(0, { label: 'B' }), 10);
    expect(label(s)).toEqual(['B', 'A']);
  });

  it('drops the oldest on the fifth add', () => {
    const s = createGhostSet(8000);
    for (const [i, l] of ['A', 'B', 'C', 'D', 'E'].entries()) s.add(at(0, { label: l }), i);
    expect(label(s)).toEqual(['E', 'D', 'C', 'B']);
  });

  it('expires a ghost at exactly ttl, not before', () => {
    const s = createGhostSet(8000);
    s.add(at(0), 1000);
    expect(s.items()[0].expiresAt).toBe(9000);
    expect(s.prune(8999)).toBe(false);
    expect(s.items()).toHaveLength(1);
    expect(s.prune(9000)).toBe(true);
    expect(s.items()).toHaveLength(0);
  });

  it('reports the next expiry, or null when empty or all infinite', () => {
    const s = createGhostSet(8000);
    expect(s.nextExpiry()).toBeNull();
    s.add(at(0), 1000);
    s.add(at(0), 3000);
    expect(s.nextExpiry()).toBe(9000);
    const inf = createGhostSet(Number.POSITIVE_INFINITY);
    inf.add(at(0), 0);
    expect(inf.nextExpiry()).toBeNull();
  });

  it('never prunes an infinite ttl', () => {
    const s = createGhostSet(Number.POSITIVE_INFINITY);
    s.add(at(0), 0);
    expect(s.prune(1e15)).toBe(false);
    expect(s.items()).toHaveLength(1);
    expect(s.items()[0].expiresAt).toBe(Number.POSITIVE_INFINITY);
  });

  it('uses 8000 for a ttl of 0, -5 or NaN', () => {
    for (const ttl of [0, -5, Number.NaN]) {
      const s = createGhostSet(ttl);
      s.add(at(0), 100);
      expect(s.items()[0].expiresAt).toBe(8100);
    }
  });

  it('clears, counts seq upwards, and prunes nothing to false', () => {
    const s = createGhostSet(8000);
    expect(s.prune(0)).toBe(false);
    s.add(at(0), 0);
    s.add(at(0), 1);
    const [b, a] = s.items();
    expect(b.seq).toBeGreaterThan(a.seq);
    s.clear();
    expect(s.items()).toEqual([]);
    s.add(at(0), 2);
    expect(s.items()[0].seq).toBeGreaterThan(b.seq);
  });
});
