import type { SoundEvent } from '../events';
import { CENTRE_DEG, UNCERTAIN_CONFIDENCE } from './constants';
import type { Side } from './types';

/**
 * The side of the sound for the band. Only a `'gcc-phat'` bearing with a bearing confidence of at least
 * `UNCERTAIN_CONFIDENCE` gives a side: left below `-CENTRE_DEG`, right above `CENTRE_DEG`, centre in
 * between (edges included). Every other input, including a loudness bearing, bad numbers or a
 * confidence outside [0, 1], gives `'unknown'`. Never throws.
 */
export function sideOf(event: SoundEvent, bearingConfidence: number): Side {
  if (event.bearingSource !== 'gcc-phat') return 'unknown';
  if (!Number.isFinite(bearingConfidence) || bearingConfidence < 0 || bearingConfidence > 1) return 'unknown';
  if (bearingConfidence < UNCERTAIN_CONFIDENCE) return 'unknown';
  const d = event.bearingDeg;
  if (d === null || !Number.isFinite(d)) return 'unknown';
  if (d < -CENTRE_DEG) return 'left';
  if (d > CENTRE_DEG) return 'right';
  return 'centre';
}
