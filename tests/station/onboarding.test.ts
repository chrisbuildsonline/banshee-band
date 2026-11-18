import { describe, expect, it } from 'vitest';
import { LISTEN_STATES } from '../../src/station/listen-status';
import {
  INTRO_STEPS,
  isOnboarded,
  markOnboarded,
  micStepView,
  micSupport,
  ONBOARDED_STORAGE_KEY,
  ONBOARDED_VALUE,
  shouldShowIntro,
  type MicSupport,
} from '../../src/station/onboarding';
import { SETTINGS_STORAGE_KEY, type SettingsStorage } from '../../src/station/settings';
import type { ListenState } from '../../src/station/types';

/** A Map-backed store that records every key read and written. */
function memoryStore(initial: Record<string, string> = {}): SettingsStorage & { data: Map<string, string>; touched: string[] } {
  const data = new Map(Object.entries(initial));
  const touched: string[] = [];
  return {
    data,
    touched,
    getItem(k) {
      touched.push(k);
      return data.has(k) ? data.get(k)! : null;
    },
    setItem(k, v) {
      touched.push(k);
      data.set(k, v);
    },
  };
}

const throwing: SettingsStorage = {
  getItem() {
    throw new DOMException('blocked', 'SecurityError');
  },
  setItem() {
    throw new DOMException('full', 'QuotaExceededError');
  },
};

describe('onboarded flag constants', () => {
  it('uses its own key, separate from the settings', () => {
    expect(ONBOARDED_STORAGE_KEY).toBe('banshee-band.onboarded.v1');
    expect(ONBOARDED_STORAGE_KEY).not.toBe(SETTINGS_STORAGE_KEY);
    expect(ONBOARDED_VALUE).toBe('done');
  });

  it('has three steps in order', () => {
    expect(INTRO_STEPS).toEqual(['welcome', 'microphone', 'output']);
  });
});

describe('isOnboarded', () => {
  it('is true for exactly "done"', () => {
    expect(isOnboarded('done')).toBe(true);
  });

  it.each([null, '', 'Done', ' done', 'done ', 'true', '"done"', '{"done":true}', '1', 'yes', '{not json', 'null', 'undefined'])('is false for %j', (text) => {
    expect(isOnboarded(text)).toBe(false);
  });
});

describe('shouldShowIntro', () => {
  it('shows the intro on a first visit (nothing stored)', () => {
    expect(shouldShowIntro(memoryStore())).toBe(true);
  });

  it('hides it once the flag is set', () => {
    expect(shouldShowIntro(memoryStore({ [ONBOARDED_STORAGE_KEY]: 'done' }))).toBe(false);
  });

  it.each(['', '{not json', 'true', 'DONE', '\u0000'])('shows it again for a corrupt flag %j', (value) => {
    expect(shouldShowIntro(memoryStore({ [ONBOARDED_STORAGE_KEY]: value }))).toBe(true);
  });

  it('a corrupt settings value does not bring it back', () => {
    expect(shouldShowIntro(memoryStore({ [ONBOARDED_STORAGE_KEY]: 'done', [SETTINGS_STORAGE_KEY]: '{not json' }))).toBe(false);
  });

  it('does not show it when the store is missing or throws (it could not remember a dismissal)', () => {
    expect(shouldShowIntro(null)).toBe(false);
    expect(() => shouldShowIntro(throwing)).not.toThrow();
    expect(shouldShowIntro(throwing)).toBe(false);
  });

  it('reads only its own key', () => {
    const store = memoryStore();
    shouldShowIntro(store);
    expect(store.touched).toEqual([ONBOARDED_STORAGE_KEY]);
  });
});

describe('markOnboarded', () => {
  it('writes "done" under its own key, and the intro then stays hidden', () => {
    const store = memoryStore({ [SETTINGS_STORAGE_KEY]: '{"output":"band"}' });
    expect(markOnboarded(store)).toBe(true);
    expect(store.data.get(ONBOARDED_STORAGE_KEY)).toBe('done');
    expect(store.data.get(SETTINGS_STORAGE_KEY)).toBe('{"output":"band"}');
    expect(store.touched).toEqual([ONBOARDED_STORAGE_KEY]);
    expect(shouldShowIntro(store)).toBe(false);
  });

  it('overwrites a corrupt flag', () => {
    const store = memoryStore({ [ONBOARDED_STORAGE_KEY]: '{not json' });
    markOnboarded(store);
    expect(shouldShowIntro(store)).toBe(false);
  });

  it('returns false without throwing when the store is missing or throws', () => {
    expect(markOnboarded(null)).toBe(false);
    expect(() => markOnboarded(throwing)).not.toThrow();
    expect(markOnboarded(throwing)).toBe(false);
  });
});

describe('micSupport (onboarding R3.1)', () => {
  it('is insecure on any page that is not a secure context, else needs getUserMedia', () => {
    expect(micSupport({ hasGetUserMedia: true, isSecureContext: true })).toBe('ok');
    expect(micSupport({ hasGetUserMedia: true, isSecureContext: false })).toBe('insecure');
    expect(micSupport({ hasGetUserMedia: false, isSecureContext: true })).toBe('unsupported');
    expect(micSupport({ hasGetUserMedia: false, isSecureContext: false })).toBe('insecure');
  });
});

describe('micStepView (onboarding R3.2-R3.5)', () => {
  const SUPPORTS: MicSupport[] = ['ok', 'unsupported', 'insecure'];
  const STATES: ListenState[] = ['idle', 'starting', 'listening', 'stopped', 'blocked', 'problem'];
  const SENTENCE: Record<Exclude<ListenState, 'idle'>, string> = {
    starting: 'Getting ready. Your browser may ask you to allow the microphone.',
    listening: 'The microphone is on. Sounds will show on the station as ghosts.',
    blocked: "The microphone is blocked. That is fine: the sample clips work without it, and you can allow it later in your browser's site settings.",
    problem: 'The microphone could not start. The sample clips still work.',
    stopped: 'The microphone is off. Press Start listening on the station when you want it on.',
  };

  it('idle with a microphone: no pill, Allow, no Next', () => {
    expect(micStepView('idle', 'ok')).toEqual({
      word: null,
      glyph: null,
      tint: null,
      sentence: 'Banshee Band asks for the microphone only after you press Allow microphone. The sound is processed on this device and never recorded or sent.',
      canAllow: true,
      showNext: false,
    });
  });

  it('idle without a microphone: no pill, no Allow, Next and why', () => {
    expect(micStepView('idle', 'unsupported')).toEqual({ word: null, glyph: null, tint: null, sentence: 'This browser cannot use a microphone here. The sample clips still work.', canAllow: false, showNext: true });
    expect(micStepView('idle', 'insecure')).toEqual({ word: null, glyph: null, tint: null, sentence: 'The microphone needs a secure page (https or localhost). The sample clips still work.', canAllow: false, showNext: true });
  });

  it.each(Object.keys(SENTENCE) as Exclude<ListenState, 'idle'>[])('%s: the Listen pill look and its sentence, whatever the support', (state) => {
    for (const support of SUPPORTS) {
      const v = micStepView(state, support);
      expect(v.word).toBe(LISTEN_STATES[state].word);
      expect(v.glyph).toBe(LISTEN_STATES[state].glyph);
      expect(v.tint).toBe(LISTEN_STATES[state].tint);
      expect(v.sentence).toBe(SENTENCE[state]);
      expect(v.canAllow).toBe(false);
      expect(v.showNext).toBe(state !== 'starting');
    }
  });

  it('the words of the outcomes', () => {
    expect(micStepView('listening', 'ok')).toMatchObject({ word: 'Listening', glyph: 'dot', tint: 'accent' });
    expect(micStepView('blocked', 'ok')).toMatchObject({ word: 'Mic blocked', glyph: 'cross', tint: 'strong' });
    expect(micStepView('problem', 'ok')).toMatchObject({ word: 'Problem', glyph: 'cross', tint: 'strong' });
    expect(micStepView('starting', 'ok')).toMatchObject({ word: 'Starting', glyph: 'circle', tint: 'neutral' });
    expect(micStepView('stopped', 'ok')).toMatchObject({ word: 'Stopped', glyph: 'square', tint: 'neutral' });
  });

  it('canAllow only for idle with a microphone; never both Allow and Next; every view has a sentence', () => {
    for (const support of SUPPORTS) {
      for (const state of STATES) {
        const v = micStepView(state, support);
        expect(v.canAllow).toBe(state === 'idle' && support === 'ok');
        expect(v.canAllow && v.showNext).toBe(false);
        expect(v.sentence.length).toBeGreaterThan(0);
      }
    }
  });
});
