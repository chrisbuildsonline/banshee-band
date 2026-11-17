import type { HapticOutput } from '../band';
import type { BearingResult } from '../bearing';
import type { Classification, Classifier } from '../classify';
import type { SoundEvent } from '../events';
import type { Decision, HapticEngine } from '../haptics';

/** The side the user picks for a clip. An input of the simulation, never a measurement. */
export type TrySide = 'left' | 'centre' | 'right';

/** One of the five steps of a run. */
export type StageName = 'waveform' | 'label' | 'bearing' | 'pattern' | 'band';

/** Milliseconds each stage took; each finite and >= 0. */
export type StageTimes = Record<StageName, number>;

/** What `runSound` needs from the outside world. */
export interface RunnerDeps {
  /** Bytes of a clip; the station passes `fetchClip` of `src/audio`. */
  loadClip(id: string): Promise<ArrayBuffer>;
  /** An already loaded classifier. */
  classifier: Pick<Classifier, 'classify'>;
  /** The station's engine: `createHapticEngine({ rateLimitMs: 0 })`. */
  engine: HapticEngine;
  /** The simulator, plus the phone output when it can vibrate. */
  outputs: readonly HapticOutput[];
  /** Monotonic clock in ms; the station passes `performance.now()`. */
  now(): number;
  /** Wall clock in ms; the station passes `Date.now()`. */
  epoch(): number;
}

/** Why a run failed. */
export type RunFailure = 'clip-load-failed' | 'clip-unreadable' | 'classify-failed' | 'event-invalid';

/** The plain-data outcome of one run. */
export type RunResult =
  | { ok: false; code: RunFailure }
  | {
      ok: true;
      clipId: string;
      chosen: TrySide;
      /** Waveform stage: bar heights and clip length. */
      peaks: number[];
      seconds: number;
      /** Label stage: the summary and the number of frames classified. */
      classification: Classification;
      frames: number;
      /** Bearing stage, as the estimator returned it. */
      bearing: BearingResult;
      /** Pattern stage. */
      event: SoundEvent;
      bearingConfidence: number;
      decision: Decision;
      /** Band stage: the kinds of the outputs that were called. */
      played: HapticOutput['kind'][];
      times: StageTimes;
      /** Epoch ms of the run, for the list time. */
      at: number;
    };
