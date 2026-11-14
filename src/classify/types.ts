import type { SoundClass } from '../events';

export interface ClassMapEntry {
  index: number;
  mid: string;
  name: string;
}

export interface LabelMap {
  /** Display name of each Index, length 521. */
  readonly names: readonly string[];
  /** Sound class of each Index, length 521. */
  readonly classOf: readonly SoundClass[];
  /** Indexes of each sound class, ascending. */
  readonly members: Readonly<Record<SoundClass, readonly number[]>>;
  /** Class of an Index; `other` for anything that is not an integer 0 to 520. */
  classForIndex(index: number): SoundClass;
}

export interface Classification {
  class: SoundClass;
  label: string;
  /** 0..1 */
  confidence: number;
}

export interface ClassifierOptions {
  modelUrl?: string;
  classMapUrl?: string;
  threshold?: number;
  fetchFunc?: typeof fetch;
}

export interface Classifier {
  classify(frame: Float32Array): Promise<Classification>;
  dispose(): void;
}

export type ClassifyErrorCode = 'model-load-failed' | 'class-map-invalid' | 'invalid-frame' | 'inference-failed' | 'disposed';
