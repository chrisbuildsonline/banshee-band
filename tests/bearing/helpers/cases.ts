// The accuracy cases of Requirement 9, shared by accuracy.test.ts, report.ts and report-fresh.test.ts.
import { MIN_CONFIDENCE } from '../../../src/bearing/constants';
import { estimateBearing } from '../../../src/bearing/estimate';
import { bearingToLagSec, lagToBearingDeg, resolveBearingConfig } from '../../../src/bearing/geometry';
import type { BearingSource } from '../../../src/events';
import { makeStereo, type SignalKind } from './synth';

const cfg = resolveBearingConfig();

/**
 * How a case is graded: a hard bound (R9.3), the tone rule (R9.7), the low-SNR rule (R9.6), the clap
 * rule (R9.8: every Window within 6°, the 4° share is graded over `buildClapSet`), or report only (16 kHz).
 */
export type Rule = 'bound' | 'tone' | 'low-snr' | 'clap' | 'report';

export interface Case {
  id: string;
  group: string;
  signal: SignalKind;
  sampleRate: number;
  snrDb: number;
  trueBearingDeg: number;
  /** Degrees for 'bound', 'tone' and 'low-snr'; null for 'report'. */
  boundDeg: number | null;
  rule: Rule;
  seed: number;
}

export interface Row {
  id: string;
  group: string;
  signal: SignalKind;
  sampleRate: number;
  snrDb: number;
  trueBearingDeg: number;
  trueLagSamples: number;
  estimatedBearingDeg: number | null;
  estimatedLagSamples: number | null;
  signedErrorDeg: number | null;
  absErrorDeg: number | null;
  bearingSource: BearingSource;
  confidence: number;
  rule: Rule;
  boundDeg: number | null;
  boundMet: boolean;
}

const CENTRE = [-60, -45, -30, -15, 0, 15, 30, 45, 60];
const EDGE = [-85, -75, -65, 65, 75, 85];
/** Integer and half-sample lags, as delays in samples. */
const LAGS = [-7, -2, 3, 9, -6.5, -0.5, 0.5, 4.5];

/** The fixed case list: R9.3 rows at 48000 and 44100 Hz, the same rows at 16000 Hz for the report only. */
export function buildCases(): Case[] {
  const cases: Case[] = [];
  for (const sampleRate of [48000, 44100, 16000]) {
    const add = (group: string, signal: SignalKind, snrDb: number, bearings: number[], rule: Rule, boundDeg: number | null) => {
      for (const b of bearings) {
        const report = sampleRate === 16000 || rule === 'report';
        cases.push({
          id: `${group}/${sampleRate}/${b.toFixed(3)}`,
          group,
          signal,
          sampleRate,
          snrDb,
          trueBearingDeg: b,
          rule: report ? 'report' : rule,
          boundDeg: report ? null : boundDeg,
          seed: 1000 + cases.length * 7919,
        });
      }
    };
    const lagBearings = LAGS.map((lag) => lagToBearingDeg(lag / sampleRate, cfg));
    add('white 20 dB', 'white', 20, [...CENTRE, ...lagBearings.filter((b) => Math.abs(b) <= 60)], 'bound', 1.5);
    add('white 20 dB edge', 'white', 20, EDGE, 'bound', 5);
    // R9.3 bounds 60 to 85°; ±90 is in the set (R9.5) and reported without a bound.
    add('white 20 dB ±90', 'white', 20, [-90, 90], 'report', null);
    add('white 40 dB', 'white', 40, [-45, 0, 45], 'bound', 1.5);
    add('white 0 dB', 'white', 0, CENTRE, 'bound', 4);
    add('tones 10 dB', 'tones', 10, CENTRE, 'tone', 4);
    add('tones 0 dB', 'tones', 0, CENTRE, 'tone', 4);
    add('clap 10 dB', 'clap', 10, CENTRE, 'clap', CLAP_MAX_DEG);
    add('hum 20 dB', 'hum', 20, CENTRE, 'bound', 4);
    add('white -5 dB', 'white', -5, [-45, -15, 0, 30, 60], 'low-snr', 10);
    add('white -10 dB', 'white', -10, [-45, -15, 0, 30, 60], 'low-snr', 10);
  }
  return cases;
}

/** R9.8: share of clap Windows that must be within CLAP_BOUND_DEG, and the bound no Window may exceed. */
export const CLAP_MIN_SHARE = 0.995;
export const CLAP_BOUND_DEG = 4;
export const CLAP_MAX_DEG = 6;
/** Clap Windows per sample rate in `buildClapSet` (2 rates, so 1008 in total). */
export const CLAP_SET_PER_RATE = 504;

/**
 * The seeded clap set of R9.8: CLAP_SET_PER_RATE Windows at each of 48000 and 44100 Hz, 10 dB, bearings
 * evenly spaced over -60..60°. Seeds follow `5000011 + 7919 · index` and are not chosen to pass.
 */
export function buildClapSet(): Case[] {
  const cases: Case[] = [];
  for (const sampleRate of [48000, 44100]) {
    for (let j = 0; j < CLAP_SET_PER_RATE; j++) {
      const b = -60 + (120 * j) / (CLAP_SET_PER_RATE - 1);
      cases.push({
        id: `clap set/${sampleRate}/${b.toFixed(3)}`,
        group: 'clap set 10 dB',
        signal: 'clap',
        sampleRate,
        snrDb: 10,
        trueBearingDeg: b,
        rule: 'clap',
        boundDeg: CLAP_MAX_DEG,
        seed: 5000011 + cases.length * 7919,
      });
    }
  }
  return cases;
}

/** Whether a result meets its case's rule. */
export function meets(c: Case, absErr: number | null, source: BearingSource, confidence: number): boolean {
  switch (c.rule) {
    case 'report':
      return true;
    case 'bound':
    case 'clap':
      return absErr !== null && absErr <= c.boundDeg!;
    case 'tone':
      return confidence < 0.8 || (absErr !== null && absErr <= c.boundDeg!);
    case 'low-snr':
      return (absErr !== null && absErr <= c.boundDeg!) || (confidence < MIN_CONFIDENCE && source !== 'gcc-phat');
  }
}

/** Builds the case's Window, estimates its bearing and grades it. */
export function evaluateCase(c: Case): Row {
  const lagSec = bearingToLagSec(c.trueBearingDeg, cfg);
  const { frames } = makeStereo({ signal: c.signal, sampleRate: c.sampleRate, snrDb: c.snrDb, lagSec, seed: c.seed });
  const r = estimateBearing(frames);
  const signed = r.bearingDeg === null ? null : r.bearingDeg - c.trueBearingDeg;
  const abs = signed === null ? null : Math.abs(signed);
  return {
    id: c.id,
    group: c.group,
    signal: c.signal,
    sampleRate: c.sampleRate,
    snrDb: c.snrDb,
    trueBearingDeg: c.trueBearingDeg,
    trueLagSamples: lagSec * c.sampleRate,
    estimatedBearingDeg: r.bearingDeg,
    estimatedLagSamples: r.lagSec === null ? null : r.lagSec * c.sampleRate,
    signedErrorDeg: signed,
    absErrorDeg: abs,
    bearingSource: r.source,
    confidence: r.confidence,
    rule: c.rule,
    boundDeg: c.boundDeg,
    boundMet: meets(c, abs, r.source, r.confidence),
  };
}

/** Rounds every number of a row to 3 decimals for the committed file. */
export function roundRow(row: Row): Row {
  const out = { ...row } as Record<string, unknown>;
  for (const [k, v] of Object.entries(out)) if (typeof v === 'number') out[k] = Math.round(v * 1000) / 1000 + 0;
  return out as unknown as Row;
}
