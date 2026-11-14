export type CaptureSource = { kind: 'mic' } | { kind: 'clip'; id: string };

export interface StereoFrame {
  left: Float32Array;
  /** Same length as `left`. */
  right: Float32Array;
  /** Context rate in Hz. */
  sampleRate: number;
  /** Sample frames since capture start. */
  startSample: number;
  /** `startSample / sampleRate`. */
  startSec: number;
}

export interface MonoFrame {
  /** Length 15600. The caller owns it. */
  samples: Float32Array;
  sampleRate: 16000;
  /** 0, 1, 2, ... */
  index: number;
  /** Stream time of `samples[0]`. */
  startSec: number;
}

export type CaptureErrorCode =
  | 'permission-denied'
  | 'no-device'
  | 'device-busy'
  | 'insecure-context'
  | 'unsupported'
  | 'clip-not-found'
  | 'clip-load-failed'
  | 'worklet-failed'
  | 'unknown';

export interface CaptureError {
  code: CaptureErrorCode;
  message: string;
}

export type CaptureState =
  | { status: 'idle' }
  | { status: 'starting'; source: CaptureSource }
  | { status: 'listening'; source: CaptureSource; sampleRate: number; channels: 1 | 2; rawProcessing: boolean }
  | { status: 'ended'; source: CaptureSource }
  | { status: 'error'; error: CaptureError };

export interface ClipInfo {
  id: string;
  file: string;
  class: string;
  label: string;
  durationSec: number;
}

export interface Capture {
  readonly state: CaptureState;
  start(source: CaptureSource): Promise<CaptureState>;
  stop(): Promise<void>;
  onMonoFrame(listener: (frame: MonoFrame) => void): () => void;
  onStereoFrame(listener: (frame: StereoFrame) => void): () => void;
  onStateChange(listener: (state: CaptureState) => void): () => void;
  listClips(): Promise<ClipInfo[]>;
}

export interface CaptureOptions {
  /** Stereo frame length in sample frames. Default 1024. */
  stereoBlock?: number;
}
