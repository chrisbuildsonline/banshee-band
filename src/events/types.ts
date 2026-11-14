import type { BEARING_SOURCES, SOUND_CLASSES, URGENCY_LEVELS } from './constants';

export type SoundClass = (typeof SOUND_CLASSES)[number];
export type BearingSource = (typeof BEARING_SOURCES)[number];
export type Urgency = (typeof URGENCY_LEVELS)[number];

export interface SoundEvent {
  id: string;
  /** ms timestamp, finite, >= 0 */
  t: number;
  class: SoundClass;
  /** non-empty human text */
  label: string;
  /** 0..1 */
  confidence: number;
  /** [-180, 180], or null when no bearing is known */
  bearingDeg: number | null;
  /** 'none' exactly when bearingDeg is null */
  bearingSource: BearingSource;
  /** dBFS, finite, <= 0 */
  loudnessDb: number;
  urgency: Urgency;
}
