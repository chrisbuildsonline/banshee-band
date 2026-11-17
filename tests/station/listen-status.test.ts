import { describe, expect, it } from 'vitest';
import { CAPTURE_MESSAGES } from '../../src/audio/errors';
import { LISTEN_STATES, listenStateFor } from '../../src/station/listen-status';

describe('LISTEN_STATES', () => {
  it('gives each state a word, a glyph shape and a tint', () => {
    expect(LISTEN_STATES).toEqual({
      starting: { word: 'Starting', glyph: 'circle', tint: 'neutral' },
      listening: { word: 'Listening', glyph: 'dot', tint: 'accent' },
      stopped: { word: 'Stopped', glyph: 'square', tint: 'neutral' },
      blocked: { word: 'Mic blocked', glyph: 'cross', tint: 'strong' },
      problem: { word: 'Problem', glyph: 'cross', tint: 'strong' },
    });
  });
});

describe('listenStateFor', () => {
  const mic = { kind: 'mic' } as const;

  it('maps the capture states', () => {
    expect(listenStateFor({ status: 'idle' }, false)).toEqual({ state: 'idle', message: null });
    expect(listenStateFor({ status: 'idle' }, true)).toEqual({ state: 'stopped', message: null });
    expect(listenStateFor({ status: 'ended', source: mic }, true)).toEqual({ state: 'stopped', message: null });
    expect(listenStateFor({ status: 'starting', source: mic }, true)).toEqual({ state: 'starting', message: null });
    expect(listenStateFor({ status: 'listening', source: mic, sampleRate: 48000, channels: 2, rawProcessing: true }, true)).toEqual({ state: 'listening', message: null });
  });

  it('says Mic blocked for a denied permission and Problem for the rest, with the audio message', () => {
    const denied = { code: 'permission-denied', message: CAPTURE_MESSAGES['permission-denied'] } as const;
    expect(listenStateFor({ status: 'error', error: denied }, true)).toEqual({ state: 'blocked', message: CAPTURE_MESSAGES['permission-denied'] });
    const busy = { code: 'device-busy', message: 'The microphone stopped.' } as const;
    expect(listenStateFor({ status: 'error', error: busy }, true)).toEqual({ state: 'problem', message: 'The microphone stopped.' });
  });
});
