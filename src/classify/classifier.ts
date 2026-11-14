// The only file that touches TensorFlow.js. It is imported dynamically, so it gets its own chunk.
import type * as TF from '@tensorflow/tfjs';
import { aggregateScores } from './aggregate';
import { parseClassMap } from './classmap';
import { DEFAULT_THRESHOLD, FRAME_SIZE, SCORE_COUNT } from './constants';
import { ClassifyError } from './errors';
import { buildLabelMap } from './labelmap';
import type { Classification, Classifier, ClassifierOptions, LabelMap } from './types';

function isValidFrame(frame: Float32Array): boolean {
  if (!(frame instanceof Float32Array) || frame.length !== FRAME_SIZE) return false;
  for (let i = 0; i < frame.length; i++) if (!Number.isFinite(frame[i])) return false;
  return true;
}

/** Runs the model on one frame and returns the first row of scores, clamped to 0..1. Disposes every tensor. */
async function scoreFrame(tf: typeof TF, model: TF.GraphModel, frame: Float32Array): Promise<number[]> {
  let scores: TF.Tensor;
  try {
    scores = tf.tidy(() => {
      const out = model.predict(tf.tensor1d(frame));
      return Array.isArray(out) ? out[0] : (out as TF.Tensor);
    });
  } catch {
    throw new ClassifyError('inference-failed');
  }
  try {
    if (scores.rank !== 2 || scores.shape[0] < 1 || scores.shape[1] !== SCORE_COUNT) throw new ClassifyError('inference-failed');
    const data = await scores.data();
    const row = new Array<number>(SCORE_COUNT);
    for (let i = 0; i < SCORE_COUNT; i++) {
      const v = data[i];
      if (typeof v !== 'number' || !Number.isFinite(v)) throw new ClassifyError('inference-failed');
      row[i] = Math.min(1, Math.max(0, v));
    }
    return row;
  } catch (e) {
    throw e instanceof ClassifyError ? e : new ClassifyError('inference-failed');
  } finally {
    scores.dispose();
  }
}

/**
 * Loads YAMNet and the class map from the app's own origin and returns a Classifier.
 * Calls run one at a time in call order. Nothing is loaded until this function is called.
 */
export async function createClassifier(options: ClassifierOptions = {}): Promise<Classifier> {
  const modelUrl = options.modelUrl ?? `${import.meta.env.BASE_URL}models/yamnet/model.json`;
  const classMapUrl = options.classMapUrl ?? `${import.meta.env.BASE_URL}models/yamnet/yamnet_class_map.csv`;
  const threshold = options.threshold ?? DEFAULT_THRESHOLD;
  const fetchFunc: typeof fetch = options.fetchFunc ?? ((input, init) => fetch(input, init));

  let tf: typeof TF;
  try {
    tf = await import('@tensorflow/tfjs');
    // Keeps a backend the caller already chose; otherwise TF.js picks its default (WebGL, CPU fallback; CPU in Node).
    await tf.ready();
  } catch {
    throw new ClassifyError('model-load-failed');
  }

  let csv: string;
  try {
    const res = await fetchFunc(classMapUrl);
    if (!res.ok) throw new Error();
    csv = await res.text();
  } catch {
    throw new ClassifyError('model-load-failed');
  }
  let map: LabelMap;
  try {
    map = buildLabelMap(parseClassMap(csv));
  } catch {
    throw new ClassifyError('class-map-invalid');
  }

  let model: TF.GraphModel;
  try {
    model = await tf.loadGraphModel(modelUrl, { fetchFunc });
  } catch {
    throw new ClassifyError('model-load-failed');
  }

  const run = async (frame: Float32Array): Promise<Classification> =>
    aggregateScores(await scoreFrame(tf, model, frame), map, { threshold });

  // Warm-up: pays the first-run cost now and proves the model runs. A bad threshold throws its RangeError here.
  try {
    await run(new Float32Array(FRAME_SIZE));
  } catch (e) {
    model.dispose();
    throw e instanceof ClassifyError ? new ClassifyError('model-load-failed') : e;
  }

  let queue: Promise<unknown> = Promise.resolve();
  let disposed = false;
  return {
    classify(frame: Float32Array): Promise<Classification> {
      if (disposed) return Promise.reject(new ClassifyError('disposed'));
      if (!isValidFrame(frame)) return Promise.reject(new ClassifyError('invalid-frame'));
      const copy = frame.slice();
      const result = queue.then(() => run(copy));
      queue = result.catch(() => undefined);
      return result;
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      // Calls already queued finish first; the weights are released after them.
      queue = queue.then(() => model.dispose());
    },
  };
}
