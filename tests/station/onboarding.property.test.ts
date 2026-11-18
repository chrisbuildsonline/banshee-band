import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { isOnboarded, markOnboarded, ONBOARDED_STORAGE_KEY, shouldShowIntro } from '../../src/station/onboarding';
import type { SettingsStorage } from '../../src/station/settings';

const RUNS = { seed: 15, numRuns: 300 };

describe('onboarded flag properties', () => {
  it('isOnboarded is true only for "done"', () => {
    fc.assert(
      fc.property(fc.oneof(fc.string(), fc.constant('done'), fc.anything().map((v) => JSON.stringify(v) ?? '')), (text) => {
        expect(isOnboarded(text)).toBe(text === 'done');
      }),
      RUNS,
    );
  });

  it('shouldShowIntro never throws, and shows the intro exactly when the stored text is not "done"', () => {
    fc.assert(
      fc.property(fc.option(fc.string(), { nil: null }), (stored) => {
        const store: SettingsStorage = { getItem: (k) => (k === ONBOARDED_STORAGE_KEY ? stored : null), setItem: () => {} };
        expect(shouldShowIntro(store)).toBe(stored !== 'done');
      }),
      RUNS,
    );
  });

  it('a store that throws anything never makes the flag functions throw', () => {
    fc.assert(
      fc.property(fc.anything(), (thrown) => {
        const store: SettingsStorage = {
          getItem: () => {
            throw thrown;
          },
          setItem: () => {
            throw thrown;
          },
        };
        expect(shouldShowIntro(store)).toBe(false);
        expect(markOnboarded(store)).toBe(false);
      }),
      RUNS,
    );
  });
});
