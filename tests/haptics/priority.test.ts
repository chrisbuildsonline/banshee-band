import { describe, expect, it } from 'vitest';
import type { Urgency } from '../../src/events';
import { priorityOf } from '../../src/haptics/priority';
import type { HapticClass } from '../../src/haptics/types';

const CLASSES: HapticClass[] = ['alarm', 'baby', 'vehicle', 'doorbell', 'knock', 'voice'];
const URGENCIES: Urgency[] = ['high', 'medium', 'low'];

/** The design table, as literals. */
const TABLE: Record<Urgency, number[]> = {
  high: [36, 35, 34, 33, 32, 31],
  medium: [26, 25, 24, 23, 22, 21],
  low: [16, 15, 14, 13, 12, 11],
};

describe('priorityOf (R8.1, R8.2)', () => {
  it('has all 18 values of the design table', () => {
    for (const u of URGENCIES) {
      expect(CLASSES.map((c) => priorityOf(u, c)), u).toEqual(TABLE[u]);
    }
  });

  it('alarm outranks vehicle at each urgency', () => {
    expect(priorityOf('high', 'alarm')).toBe(36);
    expect(priorityOf('high', 'vehicle')).toBe(34);
    for (const u of URGENCIES) expect(priorityOf(u, 'alarm')).toBeGreaterThan(priorityOf(u, 'vehicle'));
  });

  it('a high voice outranks a low alarm', () => {
    expect(priorityOf('high', 'voice')).toBe(31);
    expect(priorityOf('low', 'alarm')).toBe(16);
    expect(priorityOf('high', 'voice')).toBeGreaterThan(priorityOf('low', 'alarm'));
  });

  it('any higher urgency outranks any lower urgency, whatever the classes', () => {
    for (const a of CLASSES) {
      for (const b of CLASSES) {
        expect(priorityOf('high', a)).toBeGreaterThan(priorityOf('medium', b));
        expect(priorityOf('medium', a)).toBeGreaterThan(priorityOf('low', b));
      }
    }
  });

  it('follows the class order alarm > baby > vehicle > doorbell > knock > voice at one urgency', () => {
    for (const u of URGENCIES) {
      const ps = CLASSES.map((c) => priorityOf(u, c));
      for (let i = 1; i < ps.length; i++) expect(ps[i - 1]).toBeGreaterThan(ps[i]);
    }
  });
});
