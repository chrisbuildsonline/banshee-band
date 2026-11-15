import type { StereoFrame } from '../audio/types';
import { CHUNK, IDENTICAL_TOLERANCE, MAX_SAMPLE_ABS, NFFT } from './constants';
import { correlationPeak, createPhatWorkspace, peakConfidence, phatSpectrum } from './gcc-phat';
import { lagToBearingDeg, maxLagSamples, resolveBearingConfig } from './geometry';
import { ildToBearingDeg, levelDifferenceDb, loudnessConfidence } from './loudness';
import type { BearingConfig, BearingResult, BearingWindow } from './types';

/**
 * Streaming estimator for one sound event. Samples are buffered into full chunks across Frames; every
 * buffer is allocated here, once. Throws a RangeError for a bad configuration (set-up only).
 */
export function createBearingWindow(config?: Partial<BearingConfig>): BearingWindow {
  const cfg = resolveBearingConfig(config);
  const ws = createPhatWorkspace(CHUNK);
  const accRe = new Float64Array(NFFT);
  const accIm = new Float64Array(NFFT);
  const scratchRe = new Float64Array(NFFT);
  const scratchIm = new Float64Array(NFFT);
  const bufL = new Float64Array(CHUNK);
  const bufR = new Float64Array(CHUNK);
  const silence2 = cfg.silenceRms * cfg.silenceRms;
  let fill = 0;
  let rate = 0;
  let samples = 0;
  let sumL2 = 0;
  let sumR2 = 0;
  let maxDiff = 0;
  let used = 0;
  let skipped = 0;

  /** Adds the first `len` buffered samples as one chunk when both channels are above silence. */
  function addChunk(len: number, re: Float64Array, im: Float64Array): void {
    let eL = 0;
    let eR = 0;
    for (let i = 0; i < len; i++) {
      eL += bufL[i] * bufL[i];
      eR += bufR[i] * bufR[i];
    }
    if (eL / len > silence2 && eR / len > silence2) phatSpectrum(ws, bufL, bufR, len, cfg.regularization, re, im);
  }

  function accept(frame: StereoFrame): boolean {
    const { left, right, sampleRate } = frame;
    const n = left.length;
    if (n === 0 || right.length !== n) return false;
    if (typeof sampleRate !== 'number' || !Number.isFinite(sampleRate) || sampleRate <= 0) return false;
    if (rate !== 0 && sampleRate !== rate) return false;
    for (let i = 0; i < n; i++) {
      const l = left[i];
      const r = right[i];
      // Also false for NaN: the comparison fails.
      if (!(Math.abs(l) <= MAX_SAMPLE_ABS && Math.abs(r) <= MAX_SAMPLE_ABS)) return false;
    }
    return true;
  }

  function noneResult(): BearingResult {
    return { bearingDeg: null, source: 'none', confidence: 0, lagSec: null, ildDb: null, usedFrames: used, skippedFrames: skipped };
  }

  return {
    // Review (task 5.3): allocates nothing; samples are copied into the fixed chunk buffers, no Frame array is kept or written.
    push(frame: StereoFrame): void {
      if (!accept(frame)) {
        skipped++;
        return;
      }
      if (rate === 0) rate = frame.sampleRate;
      used++;
      const { left, right } = frame;
      for (let i = 0; i < left.length; i++) {
        const l = left[i];
        const r = right[i];
        sumL2 += l * l;
        sumR2 += r * r;
        const d = Math.abs(l - r);
        if (d > maxDiff) maxDiff = d;
        bufL[fill] = l;
        bufR[fill] = r;
        if (++fill === CHUNK) {
          addChunk(CHUNK, accRe, accIm);
          fill = 0;
        }
      }
      samples += left.length;
    },

    result(): BearingResult {
      if (used === 0 || samples === 0) return noneResult();
      const rmsL = Math.sqrt(sumL2 / samples);
      const rmsR = Math.sqrt(sumR2 / samples);
      if (!(rmsL >= cfg.silenceRms && rmsR >= cfg.silenceRms)) return noneResult();
      const ildDb = levelDifferenceDb(sumL2, sumR2);
      const base = { ildDb, usedFrames: used, skippedFrames: skipped };
      if (maxDiff <= IDENTICAL_TOLERANCE * Math.min(rmsL, rmsR)) {
        return { bearingDeg: 0, source: 'loudness', confidence: 0, lagSec: null, ...base };
      }
      scratchRe.set(accRe);
      scratchIm.set(accIm);
      if (fill > 0) addChunk(fill, scratchRe, scratchIm);
      const limit = (cfg.micSpacingM / cfg.speedOfSound) * rate;
      const peak = correlationPeak(ws, scratchRe, scratchIm, maxLagSamples(rate, cfg), limit);
      const confidence = peakConfidence(scratchRe, peak.peakIndex, peak.peak);
      if (confidence >= cfg.minConfidence) {
        const lagSec = peak.lagSamples / rate;
        return { bearingDeg: lagToBearingDeg(lagSec, cfg), source: 'gcc-phat', confidence, lagSec, ...base };
      }
      return { bearingDeg: ildToBearingDeg(ildDb, cfg), source: 'loudness', confidence: loudnessConfidence(ildDb, cfg), lagSec: null, ...base };
    },

    reset(): void {
      accRe.fill(0);
      accIm.fill(0);
      fill = 0;
      rate = 0;
      samples = 0;
      sumL2 = 0;
      sumR2 = 0;
      maxDiff = 0;
      used = 0;
      skipped = 0;
    },
  };
}

/** Bearing of a whole Window; equal to pushing the Frames one by one and reading `result()`. */
export function estimateBearing(frames: readonly StereoFrame[], config?: Partial<BearingConfig>): BearingResult {
  const w = createBearingWindow(config);
  for (const f of frames) w.push(f);
  return w.result();
}
