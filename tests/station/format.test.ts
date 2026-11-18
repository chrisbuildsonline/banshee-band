import { describe, expect, it } from 'vitest';
import { alertText, classifyText, dbText, dropText, failureText, formatClock, formatMs, LIVE_FAILURE_TEXT, mutedText, sideWord } from '../../src/station/format';

describe('classify and live text', () => {
  it('says the classify time per window and why listening stopped', () => {
    expect(classifyText(3.14)).toBe('Classify: 3.1 ms per window');
    expect(classifyText(42.4)).toBe('Classify: 42 ms per window');
    expect(LIVE_FAILURE_TEXT).toBe('The sound could not be classified. Listening stopped.');
  });
});

describe('formatMs (R13.7)', () => {
  it('one decimal below 10, whole from 10, a dash for bad values', () => {
    const cases: [number, string][] = [
      [0, '0.0 ms'],
      [0.04, '0.0 ms'],
      [3.456, '3.5 ms'],
      [9.96, '10 ms'],
      [12.5, '13 ms'],
      [124.4, '124 ms'],
      [1234.5, '1235 ms'],
      [Number.NaN, '—'],
      [-1, '—'],
      [Infinity, '—'],
    ];
    for (const [ms, text] of cases) expect(formatMs(ms), String(ms)).toBe(text);
  });
});

describe('formatClock (R11.7)', () => {
  it('24-hour local HH:MM', () => {
    expect(formatClock(new Date(2026, 10, 17, 9, 5).getTime())).toBe('09:05');
    expect(formatClock(new Date(2026, 10, 17, 13, 36).getTime())).toBe('13:36');
    expect(formatClock(new Date(2026, 10, 17, 0, 0).getTime())).toBe('00:00');
  });
});

describe('alertText and sideWord (R11.3, R11.7)', () => {
  it('alertText literals', () => {
    expect(alertText('knock', 'left', 'high')).toBe('Knock, left side, urgent');
    expect(alertText('voice', 'centre', 'low')).toBe('Voice, centre, low');
    expect(alertText('baby', 'unknown', 'high')).toBe('Baby, side unknown, urgent');
    expect(alertText('doorbell', 'right', 'medium')).toBe('Doorbell, right side, medium');
  });

  it('sideWord literals', () => {
    expect(sideWord('left')).toBe('Left side');
    expect(sideWord('right')).toBe('Right side');
    expect(sideWord('centre')).toBe('Centre');
    expect(sideWord('unknown')).toBe('Side unknown');
  });
});

describe('dropText and failureText (R4.7, R10.5)', () => {
  it('the five drop reasons in plain words', () => {
    expect(dropText('no-pattern')).toBe('This sound has no vibration pattern');
    expect(dropText('too-quiet')).toBe('Too quiet to buzz');
    expect(dropText('lower-priority')).toBe('A stronger alert is still playing');
    expect(dropText('disabled-class')).toBe('This sound is switched off');
    expect(dropText('rate-limited')).toBe('Played a moment ago');
  });

  it('the four failure messages', () => {
    expect(failureText('clip-load-failed')).toBe('The clip could not be loaded.');
    expect(failureText('clip-unreadable')).toBe('The clip could not be read.');
    expect(failureText('classify-failed')).toBe('The sound could not be classified.');
    expect(failureText('event-invalid')).toBe('The sound could not be turned into an alert.');
  });
});

describe('dbText and mutedText (settings R4.6, R8.4)', () => {
  it('writes a level with a real minus sign', () => {
    expect(dbText(-50)).toBe('−50 dB');
    expect(dbText(-10)).toBe('−10 dB');
    expect(dbText(-80)).toBe('−80 dB');
    expect(dbText(0)).toBe('0 dB');
  });

  it('says why a sound raised no alert', () => {
    expect(mutedText('knock', 'off', -50)).toBe('Knock is switched off in Settings, so it raised no alert.');
    expect(mutedText('knock', 'too-quiet', -40)).toBe('Knock was quieter than its Settings level (−40 dB), so it raised no alert.');
    expect(mutedText('baby', 'off', -50)).toBe('Baby is switched off in Settings, so it raised no alert.');
    expect(mutedText('other', 'too-quiet', -10)).toBe('Other was quieter than its Settings level (−10 dB), so it raised no alert.');
  });
});
