// `bun run classify:report [out.json]`: runs every clip through the real model and writes the Results file.
import * as tf from '@tensorflow/tfjs';
import { writeFileSync } from 'node:fs';
import { createClassifier } from '../../src/classify';
import { DEFAULT_THRESHOLD } from '../../src/classify/constants';
import { RESULTS_FILE, runClips } from './clip-run';
import { createFsFetch, TEST_ORIGIN } from './fs-fetch';

await tf.setBackend('cpu');
const classifier = await createClassifier({
  modelUrl: `${TEST_ORIGIN}/models/yamnet/model.json`,
  classMapUrl: `${TEST_ORIGIN}/models/yamnet/yamnet_class_map.csv`,
  fetchFunc: createFsFetch().fetchFunc,
});
const { report, meanMs, frames } = await runClips(classifier, {
  tfjsVersion: tf.version.tfjs,
  backend: tf.getBackend(),
  threshold: DEFAULT_THRESHOLD,
});
classifier.dispose();

for (const c of report.clips) {
  console.log(`${c.pass ? 'PASS' : 'FAIL'} ${c.id}: expected ${c.expected}, got ${c.clipClass}, frames ${c.frames}, ` +
    `accuracy ${c.frameAccuracy}, ${meanMs[c.id].toFixed(1)} ms/frame`);
  for (const f of frames[c.id]) console.log(`    ${f.class.padEnd(8)} ${f.confidence.toFixed(4)}  ${f.label}`);
}
console.log(`passed ${report.overall.passed}/${report.overall.clips}, mean frame accuracy ${report.overall.meanFrameAccuracy}`);

const out = process.argv[2] ? new URL(process.argv[2], `file://${process.cwd()}/`) : RESULTS_FILE;
writeFileSync(out, JSON.stringify(report, null, 2) + '\n');
console.log(`wrote ${out.pathname}`);
