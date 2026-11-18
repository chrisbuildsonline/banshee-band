import type { Capture } from '../audio';
import type { HapticOutput } from '../band';
import type { BearingResult, BearingWindow } from '../bearing';
import type { Classification, Classifier } from '../classify';
import type { SoundEvent } from '../events';
import type { Decision, HapticEngine } from '../haptics';

/** The side the user picks for a clip. An input of the simulation, never a measurement. */
export type TrySide = 'left' | 'centre' | 'right';

/** A successful run, from a clip or a live window. */
export type RunResultOk = Extract<RunResult, { ok: true }>;

/** What `createLive` needs from the outside world. */
export interface LiveDeps {
  capture: Pick<Capture, 'start' | 'stop' | 'onMonoFrame' | 'onStereoFrame' | 'onStateChange'>;
  classifier: Pick<Classifier, 'classify' | 'backend'>;
  /** `createBearingWindow()`; emptied after each classified window. */
  bearing: BearingWindow;
  /** The live engine: `createHapticEngine()` with the default rate limit. */
  engine: HapticEngine;
  outputs: readonly HapticOutput[];
  /** Monotonic clock in ms. */
  now(): number;
  /** Wall clock in ms. */
  epoch(): number;
}

/** What the live loop tells the page. */
export type LiveUpdate =
  | { kind: 'event'; result: RunResultOk }
  | { kind: 'failure'; code: 'classify-failed' }
  | { kind: 'state'; state: ListenState; message: string | null };

/** What the Listen card's status pill says (`idle`: before the first Start, pill hidden). */
export type ListenState = 'idle' | 'starting' | 'listening' | 'stopped' | 'blocked' | 'problem';

/** One of the five steps of a run. */
export type StageName = 'waveform' | 'label' | 'bearing' | 'pattern' | 'band';

/** Milliseconds each stage took; each finite and >= 0. */
export type StageTimes = Record<StageName, number>;

/** What `runSound` needs from the outside world. */
export interface RunnerDeps {
  /** Bytes of a clip; the station passes `fetchClip` of `src/audio`. */
  loadClip(id: string): Promise<ArrayBuffer>;
  /** An already loaded classifier; `backend` is copied into the result ('unknown' when missing). */
  classifier: Pick<Classifier, 'classify'> & { backend?: string };
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
      /** The clip id, or `'live'` for a microphone window. */
      clipId: string;
      /** The simulated side of a clip run, or `'live'` for a microphone window (its side is measured). */
      chosen: TrySide | 'live';
      /** The TF.js backend that classified (`'webgl'`, `'cpu'`, ...). */
      backend: string;
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
      /**
       * Onset to output in ms (`latencyMs`): from the onset to the clock read right after the last available
       * output was handed the pattern. Null when no output played (a drop, or no output available).
       */
      latencyMs: number | null;
      /** Where the onset was read: the start of a clip run, or the arrival of a microphone window. */
      onset: 'clip' | 'live';
      /** Epoch ms of the run, for the list time. */
      at: number;
    };
