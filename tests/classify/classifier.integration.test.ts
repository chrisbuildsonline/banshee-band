import * as tf from '@tensorflow/tfjs';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi, type MockInstance } from 'vitest';
import { WINDOW_SIZE } from '../../src/audio';
import { createFramer } from '../../src/audio/framer';
import { ClassifyError, createClassifier, DEFAULT_THRESHOLD, type Classification, type Classifier } from '../../src/classify';
import { FRAME_SIZE } from '../../src/classify/constants';
import { RESULTS_FILE, runClips, type ClipReport } from './clip-run';
import { createFsFetch, PUBLIC_DIR, TEST_ORIGIN, type FsFetch } from './fs-fetch';
import { readPcm16k } from './wav';

const MODEL_DIR = join(PUBLIC_DIR, 'models/yamnet');
const MODEL_URL = `${TEST_ORIGIN}/models/yamnet/model.json`;
const CLASS_MAP_URL = `${TEST_ORIGIN}/models/yamnet/yamnet_class_map.csv`;
const urls = (fs: FsFetch) => ({ modelUrl: MODEL_URL, classMapUrl: CLASS_MAP_URL, fetchFunc: fs.fetchFunc });

async function rejection(p: Promise<unknown>): Promise<ClassifyError> {
  try {
    await p;
  } catch (e) {
    expect(e).toBeInstanceOf(ClassifyError);
    return e as ClassifyError;
  }
  throw new Error('expected the promise to reject');
}

function clipFrames(file: string): Float32Array[] {
  const pcm = readPcm16k(new Uint8Array(readFileSync(join(PUBLIC_DIR, 'clips', file))), file);
  return createFramer().push(pcm).map((f) => f.samples);
}

describe('classifier with the real YAMNet model', { timeout: 120_000 }, () => {
  let fs: FsFetch;
  let classifier: Classifier;
  let globalFetch: MockInstance<typeof fetch>;

  beforeAll(async () => {
    if (!existsSync(join(MODEL_DIR, 'model.json'))) {
      throw new Error('The YAMNet model files are missing from public/models/yamnet/. Restore them before running this test.');
    }
    await tf.setBackend('cpu');
    globalFetch = vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
      throw new Error('globalThis.fetch must not be called');
    });
    fs = createFsFetch();
    classifier = await createClassifier(urls(fs));
  }, 120_000);

  afterAll(() => {
    classifier?.dispose();
    globalFetch?.mockRestore();
  });

  it('keeps FRAME_SIZE equal to WINDOW_SIZE from src/audio', () => {
    expect(FRAME_SIZE).toBe(WINDOW_SIZE);
  });

  it('requests only the model, each shard and the class map, by GET, from the given origin', () => {
    const manifest = JSON.parse(readFileSync(join(MODEL_DIR, 'model.json'), 'utf8')) as { weightsManifest: { paths: string[] }[] };
    const shards = manifest.weightsManifest.flatMap((g) => g.paths).map((p) => new URL(p, MODEL_URL).href);
    const allowed = new Set([MODEL_URL, CLASS_MAP_URL, ...shards]);
    expect(fs.requests.length).toBeGreaterThan(0);
    for (const r of fs.requests) {
      const u = new URL(r.url);
      expect(u.origin).toBe(TEST_ORIGIN);
      expect(u.pathname.startsWith('/models/yamnet/'), r.url).toBe(true);
      expect(r.method).toBe('GET');
      expect(allowed.has(r.url), r.url).toBe(true);
    }
    for (const url of allowed) expect(fs.requests.map((r) => r.url), url).toContain(url);
  });

  it('makes no request in classify and never calls globalThis.fetch', async () => {
    const before = fs.requests.length;
    await classifier.classify(new Float32Array(FRAME_SIZE));
    expect(fs.requests.length).toBe(before);
    expect(globalFetch).not.toHaveBeenCalled();
  });

  it('rejects frames of the wrong length or with non-finite samples as invalid-frame', async () => {
    const withNaN = new Float32Array(FRAME_SIZE);
    withNaN[123] = NaN;
    for (const bad of [new Float32Array(15599), new Float32Array(15601), new Float32Array(0), withNaN]) {
      expect((await rejection(classifier.classify(bad))).code).toBe('invalid-frame');
    }
  });

  it('classifies 15600 zeros as other, labelled Silence', async () => {
    const r = await classifier.classify(new Float32Array(FRAME_SIZE));
    expect(r.class).toBe('other');
    expect(r.label).toBe('Silence');
    expect(r.confidence).toBeGreaterThanOrEqual(0);
    expect(r.confidence).toBeLessThanOrEqual(1);
  });

  it('leaves the frame unchanged and gives the same result twice', async () => {
    const [frame] = clipFrames('doorbell-01.wav');
    const copy = frame.slice();
    const a = await classifier.classify(frame);
    const b = await classifier.classify(frame);
    expect(frame).toEqual(copy);
    expect([b.class, b.label]).toEqual([a.class, a.label]);
    expect(Math.abs(a.confidence - b.confidence)).toBeLessThanOrEqual(1e-6);
  });

  it('returns calls started together in call order, each as if classified alone', async () => {
    const frames = [...clipFrames('voice-speech-01.wav').slice(0, 2), ...clipFrames('alarm-smoke-01.wav').slice(0, 2)];
    frames.push(new Float32Array(FRAME_SIZE));
    const alone: Classification[] = [];
    for (const f of frames) alone.push(await classifier.classify(f));
    const order: number[] = [];
    const together = await Promise.all(frames.map((f, i) => classifier.classify(f).then((r) => (order.push(i), r))));
    expect(order).toEqual([0, 1, 2, 3, 4]);
    together.forEach((r, i) => {
      expect([r.class, r.label]).toEqual([alone[i].class, alone[i].label]);
      expect(Math.abs(r.confidence - alone[i].confidence)).toBeLessThanOrEqual(1e-6);
    });
  });

  it('holds the same number of tensors after the 1st and the 50th call', async () => {
    const frame = clipFrames('knock-01.wav')[0];
    await classifier.classify(frame);
    const after1 = tf.memory().numTensors;
    for (let i = 2; i <= 50; i++) await classifier.classify(frame);
    expect(tf.memory().numTensors).toBe(after1);
  });

  it('classifies every clip in the manifest to its expected class', async () => {
    const { report, meanMs } = await runClips(classifier, {
      tfjsVersion: tf.version.tfjs,
      backend: tf.getBackend(),
      threshold: DEFAULT_THRESHOLD,
    });
    for (const c of report.clips) {
      console.log(`clip ${c.id}: ${c.clipClass} (expected ${c.expected}), ${c.frames} frames, mean classify ${meanMs[c.id].toFixed(1)} ms`);
    }
    for (const c of report.clips) {
      expect(c.clipClass, `${c.id}: ${JSON.stringify(c.classCounts)}`).toBe(c.expected);
    }

    // The fresh run must match the committed Results file. Never written here.
    const committed = JSON.parse(readFileSync(RESULTS_FILE, 'utf8')) as ClipReport;
    const hint = 'differs from tests/classify/clip-results.json: run `bun run classify:report` and review the diff';
    expect(report.threshold, `threshold ${hint}`).toBe(committed.threshold);
    expect(report.clips.map((c) => c.id), `clip list ${hint}`).toEqual(committed.clips.map((c) => c.id));
    report.clips.forEach((c, i) => {
      const old = committed.clips[i];
      const exact = ['id', 'file', 'expected', 'clipClass', 'pass', 'frames', 'classCounts', 'topLabel'] as const;
      for (const key of exact) expect(c[key], `${c.id}.${key} ${hint}`).toEqual(old[key]);
      expect(Math.abs(c.frameAccuracy - old.frameAccuracy), `${c.id}.frameAccuracy ${hint}`).toBeLessThanOrEqual(0.01);
      if (c.meanConfidence === null || old.meanConfidence === null) {
        expect(c.meanConfidence, `${c.id}.meanConfidence ${hint}`).toBe(old.meanConfidence);
      } else {
        expect(Math.abs(c.meanConfidence - old.meanConfidence), `${c.id}.meanConfidence ${hint}`).toBeLessThanOrEqual(0.01);
      }
    });
  });

  it('rejects classify after dispose with code disposed', async () => {
    const c = await createClassifier(urls(createFsFetch()));
    c.dispose();
    expect((await rejection(c.classify(new Float32Array(FRAME_SIZE)))).code).toBe('disposed');
  });

  it('rejects with model-load-failed when model.json is missing, with no URL in the message', async () => {
    const fetch404 = createFsFetch((p) => (p.endsWith('/model.json') ? new Response('Not found', { status: 404 }) : undefined));
    const e = await rejection(createClassifier(urls(fetch404)));
    expect(e.code).toBe('model-load-failed');
    expect(e.message).not.toMatch(/https?:|banshee\.test|\/models\//);
  });

  it('rejects with class-map-invalid for a class map of 520 rows, with no URL in the message', async () => {
    const csv = readFileSync(join(MODEL_DIR, 'yamnet_class_map.csv'), 'utf8').trimEnd().split(/\r?\n/).slice(0, -1).join('\n');
    const short = createFsFetch((p) => (p.endsWith('/yamnet_class_map.csv') ? new Response(csv) : undefined));
    const e = await rejection(createClassifier(urls(short)));
    expect(e.code).toBe('class-map-invalid');
    expect(e.message).not.toMatch(/https?:|banshee\.test|\/models\//);
  });
});
