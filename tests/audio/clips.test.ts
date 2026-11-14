import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseManifest } from '../../src/audio/clips';

const good = { file: 'doorbell-01.wav', class: 'doorbell', label: 'Doorbell', durationSec: 3.7 };

describe('parseManifest', () => {
  it('maps an entry to ClipInfo with the id taken from the file name', () => {
    expect(parseManifest([{ ...good, source: 'https://example.org' }])).toEqual([
      { id: 'doorbell-01', file: 'doorbell-01.wav', class: 'doorbell', label: 'Doorbell', durationSec: 3.7 },
    ]);
  });

  it('drops malformed entries and keeps the rest', () => {
    const bad: unknown[] = [
      null,
      'doorbell-01.wav',
      { ...good, file: undefined },
      { ...good, file: 'doorbell-01.mp3' },
      { ...good, file: '../secret.wav' },
      { ...good, file: 'sub/dir.wav' },
      { ...good, file: 'https://other.example/x.wav' },
      { ...good, class: 3 },
      { ...good, label: null },
      { ...good, durationSec: '3.7' },
      { ...good, durationSec: Number.NaN },
      { ...good, durationSec: -1 },
    ];
    expect(parseManifest([...bad, good]).map((c) => c.id)).toEqual(['doorbell-01']);
  });

  it('returns no clips for a manifest that is not a list', () => {
    expect(parseManifest({ clips: [good] })).toEqual([]);
    expect(parseManifest(null)).toEqual([]);
  });

  it('reads every entry of the real manifest', () => {
    const raw: unknown = JSON.parse(readFileSync(resolve(import.meta.dirname, '../../public/clips/manifest.json'), 'utf8'));
    const clips = parseManifest(raw);
    expect(clips.length).toBe((raw as unknown[]).length);
    expect(clips.map((c) => c.id)).toContain('doorbell-01');
  });
});
