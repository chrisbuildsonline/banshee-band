import { describe, expect, it } from 'vitest';
import { buildCases, buildClapSet, CLAP_BOUND_DEG, CLAP_MAX_DEG, CLAP_MIN_SHARE, evaluateCase } from './helpers/cases';

const cases = buildCases();
const rows = cases.map(evaluateCase);
const graded = rows.filter((r) => r.rule !== 'report');

describe('accuracy on synthetic signals (R9)', () => {
  it('covers 0, ±45, ±90, integer and half-sample lags at 48000 and 44100 Hz, plus 16000 Hz report rows', () => {
    for (const fs of [48000, 44100]) {
      const at = rows.filter((r) => r.sampleRate === fs);
      for (const b of [0, 45, -45, 90, -90]) expect(at.some((r) => r.trueBearingDeg === b), `${fs} Hz ${b}°`).toBe(true);
      expect(at.some((r) => Math.abs(r.trueLagSamples - Math.round(r.trueLagSamples)) < 1e-9 && r.trueLagSamples !== 0)).toBe(true);
      expect(at.some((r) => Math.abs(Math.abs(r.trueLagSamples % 1) - 0.5) < 1e-9)).toBe(true);
    }
    expect(rows.filter((r) => r.sampleRate === 16000).every((r) => r.rule === 'report')).toBe(true);
  });

  for (const group of [...new Set(graded.map((r) => r.group))]) {
    it(`${group}: every result meets its rule at 48000 and 44100 Hz`, () => {
      for (const r of graded.filter((x) => x.group === group)) {
        expect(r.boundMet, `${r.id}: estimated ${r.estimatedBearingDeg}, ${r.bearingSource}, confidence ${r.confidence.toFixed(3)}`).toBe(true);
      }
    });
  }

  it('no high-confidence result is far off (tones within 4°, below 0 dB within 10°)', () => {
    for (const r of graded.filter((x) => x.confidence >= 0.8)) {
      expect(r.absErrorDeg!, r.id).toBeLessThanOrEqual(r.rule === 'low-snr' ? 10 : r.boundDeg!);
    }
  });

  it(
    'clap set (R9.8): at least 1000 seeded Windows, 99.5% within 4°, none over 6°',
    () => {
      const set = buildClapSet();
      expect(set.length).toBeGreaterThanOrEqual(1000);
      expect(new Set(set.map((c) => c.sampleRate))).toEqual(new Set([48000, 44100]));
      expect(set.every((c) => c.snrDb === 10 && Math.abs(c.trueBearingDeg) <= 60)).toBe(true);
      const clap = set.map(evaluateCase);
      const worst = clap.reduce((w, r) => ((r.absErrorDeg ?? Infinity) > (w.absErrorDeg ?? Infinity) ? r : w));
      expect(worst.absErrorDeg ?? Infinity, `${worst.id}: ${worst.estimatedBearingDeg}, ${worst.bearingSource}`).toBeLessThanOrEqual(CLAP_MAX_DEG);
      const within = clap.filter((r) => r.absErrorDeg !== null && r.absErrorDeg <= CLAP_BOUND_DEG).length;
      expect(within / clap.length).toBeGreaterThanOrEqual(CLAP_MIN_SHARE);
    },
    60_000,
  );
});
