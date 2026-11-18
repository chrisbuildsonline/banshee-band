import { describe, expect, it, vi } from 'vitest';
import type { HapticOutput } from '../../src/band';
import { estimateBearing } from '../../src/bearing';
import type { Classification } from '../../src/classify';
import type { SoundClass } from '../../src/events';
import { createHapticEngine, type HapticEngine } from '../../src/haptics';
import { runSound } from '../../src/station/runner';
import { createSettingsEngine, isMuted, outputsFor, resolveSettings } from '../../src/station/settings';
import { buildStereo, toStereoFrames } from '../../src/station/stereo';
import type { RunnerDeps, RunResult } from '../../src/station/types';
import { decodePcm16kWav } from '../../src/station/wav';
import { scriptedClock } from './helpers/clock';
import { buildWav } from './helpers/wav';

const CLOCK = [0, 1.5, 10, 14, 20, 20.25, 30, 33, 40, 40.5];

/** Seeded noise as int16, about -12 dBFS. */
function noiseInts(n: number, seed = 777): number[] {
  let s = seed;
  return Array.from({ length: n }, () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return Math.round((s / 4294967296 - 0.5) * 16000);
  });
}

const WAV = buildWav(noiseInts(40000));
const MONO = decodePcm16kWav(WAV)!;
const c = (cls: SoundClass, label: string, confidence: number): Classification => ({ class: cls, label, confidence });
const KNOCKS = [c('knock', 'Knock', 0.6), c('knock', 'Tap', 0.5), c('other', 'Silence', 0.9), c('knock', 'Tap', 0.7)];

const output = (kind: HapticOutput['kind']) => ({ kind, available: () => true, play: vi.fn(), stop: vi.fn() });

function deps(over: Partial<RunnerDeps> & { results?: Classification[] } = {}) {
  const results = over.results ?? KNOCKS;
  const classify = vi.fn(async (_frame: Float32Array) => results[classify.mock.calls.length - 1] ?? results[results.length - 1]);
  let t = 0;
  const d: RunnerDeps = {
    loadClip: async () => WAV.slice().buffer,
    classifier: { classify },
    engine: createHapticEngine({ rateLimitMs: 0 }),
    outputs: [output('simulator'), output('phone')],
    now: () => t++,
    epoch: () => 1_763_000_000_000,
    ...over,
  };
  return { d, classify };
}

const ok = (r: RunResult) => {
  if (!r.ok) throw new Error(`run failed: ${r.code}`);
  return r;
};

describe('runSound (R10.1 to R10.3, R10.5, R10.7)', () => {
  it('times each stage with the scripted clock and stamps the event at the pattern start', async () => {
    const now = scriptedClock(CLOCK);
    const { d } = deps({ now });
    const r = ok(await runSound(d, 'knock-01', 'left'));
    expect(r.times).toEqual({ waveform: 1.5, label: 4, bearing: 0.25, pattern: 3, band: 0.5 });
    expect(r.event.t).toBe(30);
    expect(r.event.id).toBe('station-1');
    expect(now.calls).toBe(10);
    expect([r.clipId, r.chosen, r.at, r.backend]).toEqual(['knock-01', 'left', 1_763_000_000_000, 'unknown']);
  });

  it('counts runs from 1 in the event id', async () => {
    const { d } = deps();
    expect(ok(await runSound(d, 'knock-01', 'left')).event.id).toBe('station-1');
    expect(ok(await runSound(d, 'knock-01', 'left')).event.id).toBe('station-2');
  });

  it('a 40000-sample clip gives 4 frames, classified in order', async () => {
    const { d, classify } = deps();
    const r = ok(await runSound(d, 'knock-01', 'left'));
    expect(r.frames).toBe(4);
    expect(classify).toHaveBeenCalledTimes(4);
    classify.mock.calls.forEach(([frame], i) => {
      expect(frame.length, `frame ${i}`).toBe(15600);
      expect(Array.from(frame), `frame ${i}`).toEqual(Array.from(MONO.subarray(i * 7800, i * 7800 + 15600)));
    });
  });

  it('the waveform stage gives 64 peaks and the clip length', async () => {
    const r = ok(await runSound(deps().d, 'knock-01', 'left'));
    expect(r.peaks).toHaveLength(64);
    expect(r.seconds).toBe(2.5);
  });

  it('the classification is the summary of the frames', async () => {
    const r = ok(await runSound(deps().d, 'knock-01', 'left'));
    expect(r.classification).toEqual({ class: 'knock', label: 'Tap', confidence: expect.closeTo(0.6, 10) });
    expect([r.event.class, r.event.label]).toEqual(['knock', 'Tap']);
  });

  it('the bearing is the real estimate of the stereo pair, as it came', async () => {
    for (const side of ['left', 'centre', 'right'] as const) {
      const r = ok(await runSound(deps().d, 'knock-01', side));
      const expected = estimateBearing(toStereoFrames(buildStereo(MONO, side), 16000));
      expect(r.bearing, side).toEqual(expected);
      expect(r.bearingConfidence, side).toBe(expected.confidence);
      expect([r.event.bearingDeg, r.event.bearingSource], side).toEqual([expected.bearingDeg, expected.source]);
    }
  });

  it('a valid Knock plays the same command once on every output', async () => {
    const sim = output('simulator');
    const phone = output('phone');
    const r = ok(await runSound(deps({ outputs: [sim, phone] }).d, 'knock-01', 'left'));
    expect(r.decision.action).toBe('play');
    if (r.decision.action !== 'play') return;
    expect(r.decision.command.side).toBe('left');
    expect(sim.play).toHaveBeenCalledTimes(1);
    expect(phone.play).toHaveBeenCalledTimes(1);
    expect(sim.play).toHaveBeenCalledWith(r.decision.command);
    expect(phone.play.mock.calls[0][0]).toBe(sim.play.mock.calls[0][0]);
    expect(r.played).toEqual(['simulator', 'phone']);
  });

  it('a dropped event calls no output and carries the reason', async () => {
    const sim = output('simulator');
    const r = ok(await runSound(deps({ outputs: [sim], results: [c('other', 'Silence', 0.9)] }).d, 'knock-01', 'left'));
    expect(r.decision).toEqual({ action: 'drop', reason: 'no-pattern' });
    expect(sim.play).not.toHaveBeenCalled();
    expect(r.played).toEqual([]);
  });

  it('the phone output is called only when it is in the list', async () => {
    const sim = output('simulator');
    const phone = output('phone');
    const r = ok(await runSound(deps({ outputs: [sim] }).d, 'knock-01', 'left'));
    expect(phone.play).not.toHaveBeenCalled();
    expect(sim.play).toHaveBeenCalledTimes(1);
    expect(r.played).toEqual(['simulator']);
  });

  it('clip-load-failed when loadClip rejects or throws', async () => {
    expect(await runSound(deps({ loadClip: () => Promise.reject(new Error('404')) }).d, 'x', 'left')).toEqual({ ok: false, code: 'clip-load-failed' });
    const throws = () => {
      throw new Error('boom');
    };
    expect(await runSound(deps({ loadClip: throws }).d, 'x', 'left')).toEqual({ ok: false, code: 'clip-load-failed' });
  });

  it('clip-unreadable for bytes that are not a WAV and for a WAV shorter than one frame', async () => {
    const notWav = new TextEncoder().encode('not a wav file at all').buffer as ArrayBuffer;
    expect(await runSound(deps({ loadClip: async () => notWav }).d, 'x', 'left')).toEqual({ ok: false, code: 'clip-unreadable' });
    const short = buildWav(noiseInts(15599)).buffer as ArrayBuffer;
    const { d, classify } = deps({ loadClip: async () => short });
    expect(await runSound(d, 'x', 'left')).toEqual({ ok: false, code: 'clip-unreadable' });
    expect(classify).not.toHaveBeenCalled();
  });

  it('classify-failed when classify rejects', async () => {
    const { d } = deps();
    d.classifier = { classify: () => Promise.reject(new Error('inference')) };
    expect(await runSound(d, 'x', 'left')).toEqual({ ok: false, code: 'classify-failed' });
  });

  it('event-invalid when the classifier returns confidence NaN, with no decide and no output', async () => {
    const decide = vi.fn<HapticEngine['decide']>();
    const sim = output('simulator');
    const { d } = deps({ engine: { decide }, outputs: [sim], results: [c('knock', 'Knock', Number.NaN)] });
    expect(await runSound(d, 'x', 'left')).toEqual({ ok: false, code: 'event-invalid' });
    expect(decide).not.toHaveBeenCalled();
    expect(sim.play).not.toHaveBeenCalled();
  });
});

describe('runSound with the settings engine (settings R4.5, R5.3, R6.1, R12.2)', () => {
  const defaults = () => resolveSettings(undefined);
  const knockOff = () => {
    const s = defaults();
    s.sounds.knock.on = false;
    return s;
  };

  it('a switched-off class gives a muted decision and plays on no output', async () => {
    const sim = output('simulator');
    const phone = output('phone');
    const { d } = deps({ engine: createSettingsEngine(knockOff(), { rateLimitMs: 0 }), outputs: [sim, phone] });
    const r = ok(await runSound(d, 'knock-01', 'left'));
    expect(r.event.class).toBe('knock');
    expect(r.decision).toEqual({ action: 'drop', reason: 'disabled-class' });
    expect(isMuted(r.decision)).toBe(true);
    expect(r.played).toEqual([]);
    expect(sim.play).not.toHaveBeenCalled();
    expect(phone.play).not.toHaveBeenCalled();
  });

  it('a sound under its class level gives a muted decision and plays on no output', async () => {
    const s = defaults();
    s.sounds.knock.minDb = -10; // the noise clip is about -12 dBFS at its loudest
    const sim = output('simulator');
    const { d } = deps({ engine: createSettingsEngine(s, { rateLimitMs: 0 }), outputs: [sim] });
    const r = ok(await runSound(d, 'knock-01', 'left'));
    expect(r.event.loudnessDb).toBeLessThan(-10);
    expect(r.decision).toEqual({ action: 'drop', reason: 'too-quiet' });
    expect(sim.play).not.toHaveBeenCalled();
  });

  it('Screen only plays on the simulator alone', async () => {
    const simulator = output('simulator');
    const phone = output('phone');
    const { d } = deps({ engine: createSettingsEngine(defaults(), { rateLimitMs: 0 }), outputs: outputsFor('simulator', { simulator, phone }) });
    const r = ok(await runSound(d, 'knock-01', 'left'));
    expect(r.played).toEqual(['simulator']);
    expect(simulator.play).toHaveBeenCalledTimes(1);
    expect(phone.play).not.toHaveBeenCalled();
  });

  it('a new engine and outputs set on the same deps take effect at the next run, and the numbering goes on', async () => {
    const simulator = output('simulator');
    const phone = output('phone');
    const { d } = deps({ engine: createSettingsEngine(knockOff(), { rateLimitMs: 0 }), outputs: outputsFor('simulator', { simulator, phone }) });
    const first = ok(await runSound(d, 'knock-01', 'left'));
    expect(isMuted(first.decision)).toBe(true);
    d.engine = createSettingsEngine(defaults(), { rateLimitMs: 0 });
    d.outputs = outputsFor('phone', { simulator, phone });
    const second = ok(await runSound(d, 'knock-01', 'left'));
    expect([first.event.id, second.event.id]).toEqual(['station-1', 'station-2']);
    expect(second.decision.action).toBe('play');
    expect(second.played).toEqual(['simulator', 'phone']);
  });
});

describe('runSound onset to output (latency R4.1 to R4.4)', () => {
  it('is the last clock read minus the first, with no extra read', async () => {
    const now = scriptedClock(CLOCK);
    const { d } = deps({ now });
    const r = ok(await runSound(d, 'knock-01', 'left'));
    expect(r.latencyMs).toBe(40.5);
    expect(r.onset).toBe('clip');
    expect(r.times.band).toBe(0.5);
    expect(now.calls).toBe(10);
  });

  it('includes the wait for a slow clip load and classifier', async () => {
    let t = 0;
    const { d } = deps({
      now: () => t,
      loadClip: async () => {
        t += 120;
        return WAV.slice().buffer;
      },
      classifier: {
        classify: async () => {
          t += 30;
          return c('knock', 'Knock', 0.7);
        },
      },
    });
    const r = ok(await runSound(d, 'knock-01', 'left'));
    expect(r.latencyMs).toBe(120 + 4 * 30);
  });

  it('is null when a switched-off class drops the event', async () => {
    const s = resolveSettings(undefined);
    s.sounds.knock.on = false;
    const { d } = deps({ engine: createSettingsEngine(s, { rateLimitMs: 0 }) });
    const r = ok(await runSound(d, 'knock-01', 'left'));
    expect(r.decision.action).toBe('drop');
    expect(r.latencyMs).toBeNull();
    expect(r.onset).toBe('clip');
  });

  it('is null when no output was available', async () => {
    const off = { ...output('simulator'), available: () => false };
    const { d } = deps({ outputs: [off] });
    const r = ok(await runSound(d, 'knock-01', 'left'));
    expect(r.decision.action).toBe('play');
    expect(r.played).toEqual([]);
    expect(r.latencyMs).toBeNull();
  });

  it('is null when the output read is before the onset or not a number, never a made-up number', async () => {
    const back = deps({ now: scriptedClock([...CLOCK.slice(0, 9), -1]) });
    expect(ok(await runSound(back.d, 'knock-01', 'left')).latencyMs).toBeNull();
    const nan = deps({ now: scriptedClock([...CLOCK.slice(0, 9), Number.NaN]) });
    expect(ok(await runSound(nan.d, 'knock-01', 'left')).latencyMs).toBeNull();
  });
});
