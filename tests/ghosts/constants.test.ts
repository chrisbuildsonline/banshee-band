import { describe, expect, it } from 'vitest';
import {
  ARC_INSET_PX,
  BEARING_RANGE_DEG,
  CLASS_NAMES,
  DASH_UNITS,
  DEFAULT_TTL_MS,
  DRIFT_PX,
  FADE_MS,
  FIELD_BOTTOM_PX,
  FIELD_MIN_HEIGHT_PX,
  FIELD_MIN_WIDTH_PX,
  FIELD_PADDING_X,
  FIELD_TOP_PX,
  GHOST_BOX_MAX_PX,
  GHOST_BOX_MIN_PX,
  GLOW_GAP_PX,
  LABEL_BLOCK_PX,
  LABEL_HEIGHT_PX,
  MAX_GHOSTS,
  URGENCY_STYLE,
} from '../../src/ghosts/constants';

describe('urgency style (R4.1, R4.2)', () => {
  it('maps each urgency to its word, scale, outline, glow blur and glow token', () => {
    expect(URGENCY_STYLE.low).toEqual({ word: 'Low', scale: 1, outlineWidth: 1.5, glowBlur: 4, glowToken: '--bb-ghost-glow-1' });
    expect(URGENCY_STYLE.medium).toEqual({ word: 'Medium', scale: 1.25, outlineWidth: 2.5, glowBlur: 8, glowToken: '--bb-ghost-glow-2' });
    expect(URGENCY_STYLE.high).toEqual({ word: 'Urgent', scale: 1.5, outlineWidth: 3.5, glowBlur: 12, glowToken: '--bb-ghost-glow-3' });
  });

  it('grows strictly with urgency', () => {
    const { low, medium, high } = URGENCY_STYLE;
    for (const key of ['scale', 'outlineWidth', 'glowBlur'] as const) {
      expect(low[key]).toBeLessThan(medium[key]);
      expect(medium[key]).toBeLessThan(high[key]);
    }
  });
});

describe('field constants (R3.3, R5.2, R5.3, R7.2)', () => {
  it('has the fixed values', () => {
    expect(MAX_GHOSTS).toBe(4);
    expect(DEFAULT_TTL_MS).toBe(8000);
    expect(FADE_MS).toBe(400);
    expect(DRIFT_PX).toBe(4);
    expect(GHOST_BOX_MIN_PX).toBe(32);
    expect(GHOST_BOX_MAX_PX).toBe(72);
    expect(FIELD_PADDING_X).toBe(72);
    expect(FIELD_TOP_PX).toBe(8);
    expect(FIELD_BOTTOM_PX).toBe(40);
    expect(FIELD_MIN_WIDTH_PX).toBe(200);
    expect(FIELD_MIN_HEIGHT_PX).toBe(360);
    expect(GLOW_GAP_PX).toBe(2);
    expect(LABEL_HEIGHT_PX).toBe(16);
    expect(BEARING_RANGE_DEG).toBe(90);
    expect(ARC_INSET_PX).toBe(24);
    expect(DASH_UNITS).toEqual([3, 2]);
  });

  it('derives the label block from the largest glow, the gap and the label line: 12 + 2 + 16 = 30', () => {
    expect(LABEL_BLOCK_PX).toBe(30);
    expect(LABEL_BLOCK_PX).toBe(12 + GLOW_GAP_PX + LABEL_HEIGHT_PX);
    expect(LABEL_BLOCK_PX).toBe(URGENCY_STYLE.high.glowBlur + GLOW_GAP_PX + LABEL_HEIGHT_PX);
  });

  it('keeps four urgent ghosts at the minimum size inside a 360 px field: 48 + 30 <= 78', () => {
    const slot = (FIELD_MIN_HEIGHT_PX - FIELD_TOP_PX - FIELD_BOTTOM_PX) / MAX_GHOSTS;
    expect(slot).toBe(78);
    expect(GHOST_BOX_MIN_PX * 1.5 + LABEL_BLOCK_PX).toBe(78);
    expect(GHOST_BOX_MIN_PX * URGENCY_STYLE.high.scale + LABEL_BLOCK_PX).toBeLessThanOrEqual(slot);
  });

  it('pads the bearing map so the largest ghost and its glow never clip: 108 / 2 + 12 <= 72', () => {
    expect(GHOST_BOX_MAX_PX * 1.5 / 2 + 12).toBe(66);
    expect(FIELD_PADDING_X).toBeGreaterThanOrEqual((GHOST_BOX_MAX_PX * URGENCY_STYLE.high.scale) / 2 + URGENCY_STYLE.high.glowBlur);
  });

  it('names the seven classes', () => {
    expect(CLASS_NAMES).toEqual({ knock: 'Knock', doorbell: 'Doorbell', alarm: 'Alarm', baby: 'Baby', vehicle: 'Vehicle', voice: 'Voice', other: 'Other' });
  });
});
