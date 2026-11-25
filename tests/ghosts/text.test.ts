import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { CLASS_NAMES } from '../../src/ghosts/constants';
import { canvasSummary, dataX, EMPTY_TEXT, listItemText } from '../../src/ghosts/text';

describe('text equivalents (R8)', () => {
  it('writes list item texts in plain words', () => {
    expect(listItemText('knock', 'left', 'high')).toBe('Knock, left, urgent');
    expect(listItemText('voice', 'centre', 'low')).toBe('Voice, centre, low');
    expect(listItemText('baby', 'unknown', 'high')).toBe('Baby, side unknown, urgent');
    expect(listItemText('doorbell', 'right', 'medium')).toBe('Doorbell, right, medium');
    expect(listItemText('other', 'centre', 'low')).toBe('Other, centre, low');
  });

  it('summarises the canvas, or says No sounds yet', () => {
    expect(
      canvasSummary([
        { cls: 'alarm', side: 'right', urgency: 'high' },
        { cls: 'knock', side: 'left', urgency: 'medium' },
      ]),
    ).toBe('Sound field. Now: Alarm, right, urgent; Knock, left, medium');
    expect(canvasSummary([{ cls: 'knock', side: 'left', urgency: 'medium' }], 'Recent:')).toBe('Sound field. Recent: Knock, left, medium');
    expect(canvasSummary([])).toBe('No sounds yet');
    expect(EMPTY_TEXT).toBe('No sounds yet');
  });

  it('writes data-x with at most four decimals', () => {
    expect(dataX(132, 600)).toBe('0.22');
    expect(dataX(300, 600)).toBe('0.5');
    expect(dataX(48, 200)).toBe('0.24');
    expect(dataX(100, 300)).toBe('0.3333');
    fc.assert(
      fc.property(fc.double({ min: 0, max: 3000, noNaN: true }), fc.integer({ min: 200, max: 3000 }), (x, w) => /^\d+(\.\d{1,4})?$/.test(dataX(x, w))),
      { seed: 8, numRuns: 200 },
    );
  });

  it('has the seven class names', () => {
    expect(Object.values(CLASS_NAMES)).toEqual(['Knock', 'Doorbell', 'Alarm', 'Baby', 'Vehicle', 'Voice', 'Other']);
  });
});
