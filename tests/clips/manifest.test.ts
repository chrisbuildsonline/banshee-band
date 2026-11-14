import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SOUND_CLASSES, validateSoundEvent } from '../../src/events';
import { parseLicence, type LicenceEntry } from './licence';
import { readWav } from './wav';

const dir = resolve(import.meta.dirname, '../../public/clips');
const REQUIRED_CLASSES = ['doorbell', 'knock', 'alarm', 'baby', 'vehicle', 'voice'];
const CLIP_CLASSES: readonly string[] = SOUND_CLASSES.filter((c) => c !== 'other');
const KEYS = ['class', 'durationSec', 'file', 'label', 'source'];
const LICENCE = /^(CC0( 1\.0 Universal)?|Public Domain)$/i;
const MAX_SECONDS = 10;
const MAX_TOTAL_BYTES = 8 * 1024 * 1024;
const DURATION_TOLERANCE = 0.05;

function read<T>(name: string, parse: (text: string) => T, problems: string[]): T | undefined {
  try {
    return parse(readFileSync(resolve(dir, name), 'utf8'));
  } catch (error) {
    problems.push(`${name}: ${(error as Error).message}`);
    return undefined;
  }
}

describe('public/clips', () => {
  it('holds a licensed, decodable, non-silent clip for every required class, and nothing unlisted', () => {
    const problems: string[] = [];
    const manifest = read('manifest.json', JSON.parse, problems) as unknown;
    if (!Array.isArray(manifest) || manifest.length === 0) problems.push('manifest.json: must be a non-empty array');
    const entries: Record<string, unknown>[] = Array.isArray(manifest) ? manifest : [];
    const licences = read('LICENSE.txt', parseLicence, problems) ?? ([] as LicenceEntry[]);
    const present = existsSync(dir) ? readdirSync(dir) : [];

    const listed: string[] = [];
    const classes = new Set<string>();
    entries.forEach((entry, i) => {
      if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) return problems.push(`manifest entry ${i}: must be an object`);
      const name = typeof entry.file === 'string' ? entry.file : `entry ${i}`;
      const keys = Object.keys(entry).sort();
      if (keys.join() !== KEYS.join()) problems.push(`${name}: keys must be exactly ${KEYS.join(', ')} (got ${keys.join(', ')})`);
      if (typeof entry.file !== 'string' || !/^[a-z0-9][a-z0-9-]*\.wav$/.test(entry.file)) problems.push(`${name}: file must be a lowercase .wav name in public/clips`);
      if (typeof entry.class !== 'string' || !CLIP_CLASSES.includes(entry.class)) problems.push(`${name}: class must be one of ${CLIP_CLASSES.join(', ')}`);
      else classes.add(entry.class);
      const event = validateSoundEvent({ id: 'clip', t: 0, class: entry.class, label: entry.label, confidence: 1, bearingDeg: null, bearingSource: 'none', loudnessDb: -20, urgency: 'low' });
      if (!event.ok) problems.push(`${name}: not a valid SoundEvent class and label (${event.errors.join('; ')})`);
      if (typeof entry.durationSec !== 'number' || !(entry.durationSec > 0)) problems.push(`${name}: durationSec must be a positive number`);
      if (typeof entry.source !== 'string' || !/^https:\/\/\S+$/.test(entry.source)) problems.push(`${name}: source must be an https URL`);
      if (typeof entry.file !== 'string') return;
      if (listed.includes(entry.file)) problems.push(`${name}: listed twice`);
      listed.push(entry.file);

      if (!present.includes(entry.file)) return problems.push(`${name}: listed but not in public/clips`);
      try {
        const wav = readWav(readFileSync(resolve(dir, entry.file)));
        if (wav.sampleRate < 8000) problems.push(`${name}: sample rate ${wav.sampleRate} Hz is below 8000 Hz`);
        if (wav.peak === 0) problems.push(`${name}: every sample is 0`);
        if (wav.durationSec > MAX_SECONDS) problems.push(`${name}: ${wav.durationSec.toFixed(2)} s is longer than ${MAX_SECONDS} s`);
        if (typeof entry.durationSec === 'number' && !(Math.abs(wav.durationSec - entry.durationSec) <= DURATION_TOLERANCE)) problems.push(`${name}: durationSec ${entry.durationSec} differs from decoded ${wav.durationSec.toFixed(3)} s`);
      } catch (error) {
        problems.push(`${name}: ${(error as Error).message}`);
      }

      const licence = licences.find((l) => l.file === entry.file);
      if (!licence) problems.push(`${name}: no LICENSE.txt entry`);
      else {
        if (licence.source !== entry.source) problems.push(`${name}: LICENSE.txt source differs from manifest source`);
        if (!LICENCE.test(licence.licence)) problems.push(`${name}: licence "${licence.licence}" is not CC0 or Public Domain`);
      }
    });

    for (const file of present) {
      if (file === 'manifest.json' || file === 'LICENSE.txt') continue;
      if (!file.endsWith('.wav')) problems.push(`${file}: unexpected file in public/clips (only .wav, manifest.json and LICENSE.txt)`);
      else if (!listed.includes(file)) problems.push(`${file}: in public/clips but not in manifest.json`);
    }
    const totalBytes = present.reduce((sum, file) => sum + statSync(resolve(dir, file)).size, 0);
    if (totalBytes > MAX_TOTAL_BYTES) problems.push(`public/clips: ${totalBytes} bytes is over 8 MB`);
    const missing = REQUIRED_CLASSES.filter((c) => !classes.has(c));
    if (missing.length > 0) problems.push(`missing classes: ${missing.join(', ')}`);

    expect(problems).toEqual([]);
  });
});
