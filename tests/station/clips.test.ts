import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { estimateBearing, type BearingResult } from '../../src/bearing';
import type { SoundClass, SoundEvent } from '../../src/events';
import { sideOf, type Side } from '../../src/haptics';
import { buildStereo, toStereoFrames } from '../../src/station/stereo';
import { loudestRmsDb } from '../../src/station/summary';
import type { TrySide } from '../../src/station/types';
import { decodePcm16kWav } from '../../src/station/wav';

const CLIPS = fileURLToPath(new URL('../../public/clips/', import.meta.url));
const manifest = JSON.parse(readFileSync(`${CLIPS}manifest.json`, 'utf8')) as { file: string; class: SoundClass }[];

interface Row {
  cls: SoundClass;
  chosen: TrySide;
  side: Side;
  bearing: BearingResult;
}

/** The side `sideOf` gives the bearing of a clip copied to a stereo pair for the chosen side. */
function measure(mono: Float32Array, cls: SoundClass, chosen: TrySide): Row {
  const bearing = estimateBearing(toStereoFrames(buildStereo(mono, chosen), 16000));
  const event: SoundEvent = { id: 'm', t: 0, class: cls, label: cls, confidence: 1, bearingDeg: bearing.bearingDeg, bearingSource: bearing.source, loudnessDb: 0, urgency: 'low' };
  return { cls, chosen, side: sideOf(event, bearing.confidence), bearing };
}

describe('real clips through the stereo build and the real estimator (R8.3)', () => {
  const clips = manifest.map((m) => {
    const mono = decodePcm16kWav(readFileSync(`${CLIPS}${m.file}`));
    if (!mono) throw new Error(`${m.file} did not decode`);
    return { cls: m.class, mono };
  });
  const rows = clips.flatMap(({ cls, mono }) => (['left', 'right', ...(cls === 'knock' ? ['centre'] : [])] as TrySide[]).map((s) => measure(mono, cls, s)));

  it('prints the measured table', () => {
    const fmt = (r: Row) => `| ${r.cls} | ${r.chosen} | ${r.side} | ${r.bearing.bearingDeg === null ? 'none' : r.bearing.bearingDeg.toFixed(1)} | ${r.bearing.confidence.toFixed(3)} | ${r.bearing.source} |`;
    console.log(['| Clip | Chosen | Side | Bearing (deg) | Confidence | Source |', '|---|---|---|---|---|---|', ...rows.map(fmt)].join('\n'));
    expect(rows.length).toBe(manifest.length * 2 + 1);
  });

  it('(a) Knock: left gives left, right gives right, centre gives centre, from gcc-phat at confidence 0.8 or more', () => {
    for (const chosen of ['left', 'right', 'centre'] as const) {
      const r = rows.find((x) => x.cls === 'knock' && x.chosen === chosen)!;
      expect(r.side, chosen).toBe(chosen);
      expect(r.bearing.source, chosen).toBe('gcc-phat');
      expect(r.bearing.confidence, chosen).toBeGreaterThanOrEqual(0.8);
    }
  });

  it('(b) every clip and side gives the chosen side or unknown, never the opposite', () => {
    for (const r of rows) expect([r.chosen, 'unknown'], `${r.cls} ${r.chosen}`).toContain(r.side);
  });

  it('(c) every clip is at least -50 dBFS loud (the default threshold of the haptic engine)', () => {
    for (const { cls, mono } of clips) expect(loudestRmsDb(mono), cls).toBeGreaterThanOrEqual(-50);
  });
});
