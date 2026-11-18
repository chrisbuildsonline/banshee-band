import { expect, test as base } from '@playwright/test';

/** The intro's flag (src/station/onboarding.ts). */
export const ONBOARDED_KEY = 'banshee-band.onboarded.v1';

/**
 * The shared `test`: by default every page starts as a returning visitor (the first-run intro already done), so the
 * specs that test the station see it at once. `test.use({ onboarded: false })` starts as a first visit.
 */
export const test = base.extend<{ onboarded: boolean }>({
  onboarded: [true, { option: true }],
  page: async ({ page, onboarded }, use) => {
    if (onboarded) {
      await page.addInitScript((key) => {
        try {
          localStorage.setItem(key, 'done');
        } catch {
          // A page without storage (about:blank, a blocked store) has nothing to set.
        }
      }, ONBOARDED_KEY);
    }
    await use(page);
  },
});

export { expect };
