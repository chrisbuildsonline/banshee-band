import {
  BEARING_LIMIT_DEG,
  DEFAULT_MIC_SPACING_M,
  DEFAULT_REGULARIZATION,
  ILD_DEAD_ZONE_DB,
  ILD_SATURATION_DB,
  MIN_CONFIDENCE,
  SILENCE_RMS,
  SPEED_OF_SOUND,
} from './constants';
import type { BearingConfig } from './types';

const DEFAULTS: BearingConfig = {
  micSpacingM: DEFAULT_MIC_SPACING_M,
  speedOfSound: SPEED_OF_SOUND,
  silenceRms: SILENCE_RMS,
  minConfidence: MIN_CONFIDENCE,
  regularization: DEFAULT_REGULARIZATION,
  ildSaturationDb: ILD_SATURATION_DB,
  ildDeadZoneDb: ILD_DEAD_ZONE_DB,
};

const DEG = 180 / Math.PI;

/**
 * Fills the defaults and checks every field: a finite number > 0 (`ildDeadZoneDb` >= 0).
 * Throws a RangeError naming the field. Call it at set-up; nothing on the audio path throws.
 */
export function resolveBearingConfig(config?: Partial<BearingConfig>): BearingConfig {
  const out: BearingConfig = { ...DEFAULTS };
  for (const key of Object.keys(DEFAULTS) as (keyof BearingConfig)[]) {
    const value = config?.[key];
    if (value === undefined) continue;
    const ok = typeof value === 'number' && Number.isFinite(value) && (key === 'ildDeadZoneDb' ? value >= 0 : value > 0);
    if (!ok) {
      const need = key === 'ildDeadZoneDb' ? 'a finite number >= 0' : 'a finite number > 0';
      throw new RangeError(`bearing config ${key} must be ${need}, got ${String(value)}`);
    }
    out[key] = value;
  }
  return out;
}

/** Largest whole-sample lag the spacing allows: max(1, floor(spacing / speed · sampleRate)). */
export function maxLagSamples(sampleRate: number, config: BearingConfig): number {
  return Math.max(1, Math.floor((config.micSpacingM / config.speedOfSound) * sampleRate));
}

/** Lag (left delayed, seconds) to bearing in degrees: asin of the clamped path difference. Always in [-90, 90]. */
export function lagToBearingDeg(lagSec: number, config: BearingConfig): number {
  const x = (lagSec * config.speedOfSound) / config.micSpacingM;
  const clamped = x > 1 ? 1 : x < -1 ? -1 : x;
  const deg = Math.asin(clamped) * DEG;
  return Math.max(-BEARING_LIMIT_DEG, Math.min(BEARING_LIMIT_DEG, deg));
}

/** Inverse of `lagToBearingDeg` for bearings in [-90, 90]. Used by tests to build signals. */
export function bearingToLagSec(bearingDeg: number, config: BearingConfig): number {
  return (Math.sin(bearingDeg / DEG) * config.micSpacingM) / config.speedOfSound;
}
