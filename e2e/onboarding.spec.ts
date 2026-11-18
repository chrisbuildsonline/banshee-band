import { resolve } from 'node:path';
import type { Page } from '@playwright/test';
import { expect, ONBOARDED_KEY, test } from './fixtures';

const SCREENSHOTS = resolve(import.meta.dirname, 'screenshots');
const KNOCK_WAV = resolve(import.meta.dirname, '../public/clips/knock-01.wav');
/** The first Allow microphone loads the sound model before it opens the microphone. */
const MODEL_TIMEOUT = 120_000;
const SETTINGS_KEY = 'banshee-band.settings.v1';
const AID = 'Banshee Band is an aid, not a safety device. It can miss or misread sounds, so keep your smoke alarms and other certified alerting devices.';
const INTRO_BAND = 'Needs the Banshee Band wristband (DIY hardware, not sold). Connect it in Settings. Until then alerts show on the screen.';
const BAND_OFF = 'This browser has no Bluetooth. Use Chrome or Edge to connect the band.';
const BLOCKED = "The microphone is blocked. That is fine: the sample clips work without it, and you can allow it later in your browser's site settings.";
const UNSUPPORTED = 'This browser cannot use a microphone here. The sample clips still work.';
/** Chromium's GPU driver note when TF.js WebGL reads scores back (see e2e/station.spec.ts). */
const WEBGL_READPIXELS = /GL Driver Message \(OpenGL, Performance, GL_CLOSE_PATH_NV, High\): GPU stall due to ReadPixels/;

// A fake microphone that plays the knock clip, as in e2e/live.spec.ts.
test.use({
  launchOptions: {
    args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', `--use-file-for-fake-audio-capture=${KNOCK_WAV}`],
  },
});

/** Records console errors and warnings and page errors. */
function watch(page: Page): string[] {
  const problems: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'warning' && WEBGL_READPIXELS.test(msg.text())) return;
    if (msg.type() === 'error' || msg.type() === 'warning') problems.push(`console ${msg.type()}: ${msg.text()}`);
  });
  page.on('pageerror', (error) => problems.push(`page error: ${error.message}`));
  return problems;
}

/** Wraps getUserMedia to count calls; `deny` makes it reject as a blocked permission. */
async function recordGetUserMedia(page: Page, deny = false): Promise<void> {
  await page.addInitScript((deny) => {
    const w = window as unknown as { __gum: number };
    w.__gum = 0;
    const devices = navigator.mediaDevices;
    const original = devices.getUserMedia.bind(devices);
    devices.getUserMedia = async (constraints?: MediaStreamConstraints) => {
      w.__gum++;
      if (deny) throw new DOMException('', 'NotAllowedError');
      return original(constraints);
    };
  }, deny);
}

/** A `navigator.bluetooth` that is there but never finds a band, so the Wristband option is enabled. */
async function fakeBluetooth(page: Page): Promise<void> {
  await page.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, 'bluetooth', { configurable: true, get: () => ({ requestDevice: () => new Promise(() => {}) }) });
  });
}

const gum = (page: Page) => page.evaluate(() => (window as unknown as { __gum: number }).__gum);
const sheet = (page: Page) => page.locator('dialog[data-intro="sheet"]');
const button = (page: Page, name: string) => sheet(page).getByRole('button', { name, exact: true });
const heading = (page: Page, name: string) => sheet(page).getByRole('heading', { name, exact: true });
const radio = (page: Page, name: string) => sheet(page).getByRole('radio', { name, exact: true });
const micStatus = (page: Page) => sheet(page).locator('[role="status"]');
const micText = (page: Page) => sheet(page).locator('[aria-live="polite"]');
const listenStatus = (page: Page) => page.locator('[data-card="listen"] [role="status"]');
const settingsPill = (page: Page) => page.getByRole('button', { name: 'Settings', exact: true });
const stored = (page: Page, key: string) => page.evaluate((k) => localStorage.getItem(k), key);

/** Waits for the station to be mounted (the clip chips come from the manifest). */
async function stationReady(page: Page): Promise<void> {
  await expect(page.locator('[data-card="try"]').getByRole('button', { name: 'Knock', exact: true })).toBeAttached();
}

/** The visible pills of the sheet: every one at least 44px tall, and at most one primary. */
async function checkPills(page: Page): Promise<void> {
  const pills = sheet(page).locator('.bb-pill:visible');
  const n = await pills.count();
  expect(n).toBeGreaterThan(0);
  for (let i = 0; i < n; i++) {
    const box = await pills.nth(i).boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
  }
  expect(await sheet(page).locator('.bb-pill--primary:visible').count()).toBe(1);
}

/** Nothing scrolls sideways: not the page, not the sheet. */
async function noSideScroll(page: Page): Promise<void> {
  const widths = await page.evaluate(() => {
    const d = document.querySelector('dialog[data-intro="sheet"]') as HTMLElement;
    return { page: document.documentElement.scrollWidth, view: window.innerWidth, sheet: d.scrollWidth, sheetClient: d.clientWidth };
  });
  expect(widths.page).toBeLessThanOrEqual(widths.view);
  expect(widths.sheet).toBeLessThanOrEqual(widths.sheetClient);
}

test.describe('first-run intro', () => {
  test.use({ onboarded: false });

  test('1440 Day: what it is, Allow microphone through Start listening, Screen only, Done; a reload does not show it', async ({ page }) => {
    test.setTimeout(MODEL_TIMEOUT + 60_000);
    const problems = watch(page);
    await recordGetUserMedia(page);
    await fakeBluetooth(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');

    // Step 1: a modal named by its heading, the heading focused, the honest line, one primary.
    await expect(page.getByRole('dialog', { name: 'Welcome to Banshee Band' })).toBeVisible();
    await expect(heading(page, 'Welcome to Banshee Band')).toBeFocused();
    await expect(sheet(page)).toContainText('Step 1 of 3');
    await expect(sheet(page)).toContainText(AID);
    await expect(sheet(page).getByRole('listitem')).toHaveCount(3);
    await checkPills(page);
    expect(await gum(page)).toBe(0);
    const card = await sheet(page).boundingBox();
    expect(card!.width).toBeLessThanOrEqual(560);
    expect(Math.abs(card!.x + card!.width / 2 - 720)).toBeLessThan(2);
    await page.screenshot({ path: resolve(SCREENSHOTS, 'onboarding-1440-day.png'), animations: 'disabled' });

    // Step 2: nothing asked until the press; then the real Start listening path and its outcome.
    await button(page, 'Next').click();
    await expect(heading(page, 'Turn on the microphone')).toBeFocused();
    await expect(page.getByRole('dialog', { name: 'Turn on the microphone' })).toBeVisible();
    await expect(sheet(page)).toContainText('Step 2 of 3');
    await expect(micStatus(page)).toBeHidden();
    await checkPills(page);
    expect(await gum(page)).toBe(0);
    await button(page, 'Allow microphone').click();
    await expect(micStatus(page)).toHaveText('Listening', { timeout: MODEL_TIMEOUT });
    await expect(micStatus(page).locator('svg')).toHaveAttribute('data-glyph', 'dot');
    await expect(micText(page)).toHaveText('The microphone is on. Sounds will show on the station as ghosts.');
    await expect(button(page, 'Allow microphone')).toBeHidden();
    await expect(button(page, 'Next')).toBeFocused();
    expect(await gum(page)).toBe(1);
    await expect(listenStatus(page)).toHaveText('Listening');

    // Step 3: the Settings output choice, saved and applied at once.
    await button(page, 'Next').click();
    await expect(heading(page, 'Where should alerts buzz?')).toBeFocused();
    await expect(sheet(page)).toContainText('Step 3 of 3');
    await expect(radio(page, 'Phone vibration')).toBeChecked();
    await expect(radio(page, 'Wristband')).toHaveAccessibleDescription(INTRO_BAND);
    await radio(page, 'Screen only').check();
    await expect(page.locator('#station-status [role="status"]')).toHaveText('Band not connected');
    expect(JSON.parse((await stored(page, SETTINGS_KEY))!).output).toBe('simulator');
    expect(await stored(page, ONBOARDED_KEY)).toBeNull();

    await button(page, 'Done').click();
    await expect(sheet(page)).toHaveCount(0);
    // Closing never stops the microphone; the focus goes to the pill the user needs next.
    await expect(listenStatus(page)).toHaveText('Listening');
    await expect(page.getByRole('button', { name: 'Stop', exact: true })).toBeFocused();
    expect(await stored(page, ONBOARDED_KEY)).toBe('done');
    // A closed intro leaves no pill in the page: one primary, Stop replaced Start listening, so none shows.
    await expect(page.locator('.bb-pill--primary:visible')).toHaveCount(0);

    await page.reload();
    await stationReady(page);
    await expect(sheet(page)).toBeHidden();
    await settingsPill(page).click();
    await expect(page.getByRole('dialog', { name: 'Settings' }).getByRole('radio', { name: 'Screen only', exact: true })).toBeChecked();
    expect(problems, problems.join('\n')).toEqual([]);
  });

  test('390 Night: a bottom sheet with stacked 44px pills, the honest Wristband, Skip intro; a reload does not show it', async ({ page }) => {
    const problems = watch(page);
    await recordGetUserMedia(page);
    await fakeBluetooth(page);
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await expect(heading(page, 'Welcome to Banshee Band')).toBeFocused();
    await noSideScroll(page);
    await checkPills(page);
    // A bottom sheet: full width, at the bottom, the primary full width.
    // Measured once the short rise on open has settled.
    await expect.poll(async () => {
      const b = (await sheet(page).boundingBox())!;
      return [b.width, Math.round(b.y + b.height)];
    }).toEqual([390, 844]);
    const next = (await button(page, 'Next').boundingBox())!;
    expect(next.width).toBeGreaterThan(300);

    await button(page, 'Next').click();
    await noSideScroll(page);
    await checkPills(page);
    await page.screenshot({ path: resolve(SCREENSHOTS, 'onboarding-390-night.png'), animations: 'disabled' });
    // Stacked in DOM order, the primary last, nearest the thumb.
    const back = (await button(page, 'Back').boundingBox())!;
    const allow = (await button(page, 'Allow microphone').boundingBox())!;
    expect(allow.y).toBeGreaterThan(back.y);
    expect(Math.abs(allow.width - back.width)).toBeLessThan(1);
    await button(page, 'Not now').click();
    await expect(heading(page, 'Where should alerts buzz?')).toBeFocused();
    await expect(radio(page, 'Wristband')).toBeEnabled();
    await expect(radio(page, 'Wristband')).toHaveAccessibleDescription(INTRO_BAND);
    await expect(sheet(page).locator('[data-output="band"]')).toContainText('DIY hardware, not sold');
    await expect(sheet(page).getByRole('button', { name: /connect/i })).toHaveCount(0);
    for (const option of await sheet(page).locator('.bb-option').all()) expect((await option.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await noSideScroll(page);
    await page.screenshot({ path: resolve(SCREENSHOTS, 'onboarding-output-390-night.png'), animations: 'disabled' });

    await button(page, 'Skip intro').click();
    await expect(sheet(page)).toBeHidden();
    await expect(page.getByRole('button', { name: 'Start listening' })).toBeFocused();
    expect(await gum(page)).toBe(0);
    expect(await stored(page, ONBOARDED_KEY)).toBe('done');

    await page.reload();
    await stationReady(page);
    await expect(sheet(page)).toBeHidden();
    expect(problems, problems.join('\n')).toEqual([]);
  });

  test('1440 Night at step 2 and 390 Day at step 1: screenshots', async ({ page }) => {
    const problems = watch(page);
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await button(page, 'Next').click();
    await expect(heading(page, 'Turn on the microphone')).toBeFocused();
    await checkPills(page);
    await page.screenshot({ path: resolve(SCREENSHOTS, 'onboarding-1440-night.png'), animations: 'disabled' });
    await button(page, 'Back').click();
    await expect(heading(page, 'Welcome to Banshee Band')).toBeFocused();
    await page.emulateMedia({ colorScheme: 'light' });
    await page.setViewportSize({ width: 390, height: 844 });
    await noSideScroll(page);
    await page.screenshot({ path: resolve(SCREENSHOTS, 'onboarding-390-day.png'), animations: 'disabled' });
    expect(problems, problems.join('\n')).toEqual([]);
  });

  test('without Web Bluetooth the Wristband is disabled with its reason; no connect button', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(Navigator.prototype, 'bluetooth', { configurable: true, get: () => undefined });
    });
    await page.goto('/');
    await button(page, 'Next').click();
    await button(page, 'Not now').click();
    await expect(radio(page, 'Wristband')).toBeDisabled();
    await expect(radio(page, 'Wristband')).toHaveAccessibleDescription(BAND_OFF);
    await expect(sheet(page).getByRole('button', { name: /connect/i })).toHaveCount(0);
  });

  test('without navigator.vibrate, Phone vibration is disabled and Screen only shows as chosen', async ({ page }) => {
    await page.addInitScript(() => {
      delete (Navigator.prototype as { vibrate?: unknown }).vibrate;
    });
    await page.goto('/');
    await button(page, 'Next').click();
    await button(page, 'Not now').click();
    await expect(radio(page, 'Phone vibration')).toBeDisabled();
    await expect(radio(page, 'Phone vibration')).toHaveAccessibleDescription('This browser cannot vibrate.');
    await expect(radio(page, 'Screen only')).toBeChecked();
  });

  test('Escape closes it like Skip intro and it stays closed', async ({ page }) => {
    const problems = watch(page);
    await page.goto('/');
    await expect(heading(page, 'Welcome to Banshee Band')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(sheet(page)).toBeHidden();
    await expect(page.getByRole('button', { name: 'Start listening' })).toBeFocused();
    expect(await stored(page, ONBOARDED_KEY)).toBe('done');
    await page.reload();
    await stationReady(page);
    await expect(sheet(page)).toBeHidden();
    expect(problems, problems.join('\n')).toEqual([]);
  });

  test('a denied microphone shows Mic blocked, and the sample clips still work', async ({ page }) => {
    test.setTimeout(MODEL_TIMEOUT + 60_000);
    const problems = watch(page);
    await recordGetUserMedia(page, true);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await button(page, 'Next').click();
    await button(page, 'Allow microphone').click();
    await expect(micStatus(page)).toHaveText('Mic blocked', { timeout: MODEL_TIMEOUT });
    await expect(micStatus(page).locator('svg')).toHaveAttribute('data-glyph', 'cross');
    await expect(micText(page)).toHaveText(BLOCKED);
    await expect(button(page, 'Next')).toBeFocused();
    expect(await gum(page)).toBe(1);
    await button(page, 'Next').click();
    await button(page, 'Done').click();
    await expect(sheet(page)).toBeHidden();
    await expect(listenStatus(page)).toHaveText('Mic blocked');

    // The zero-key path: a sample clip still raises an alert.
    await page.locator('[data-card="try"]').getByRole('button', { name: 'Knock', exact: true }).click();
    await expect(page.getByRole('list', { name: 'Recent sounds' }).getByRole('listitem')).toHaveCount(1, { timeout: MODEL_TIMEOUT });
    expect(problems.filter((p) => !p.includes('NotAllowedError')), problems.join('\n')).toEqual([]);
  });

  test('without a microphone API there is no Allow button, only why and Next', async ({ page }) => {
    const problems = watch(page);
    await page.addInitScript(() => {
      Object.defineProperty(Navigator.prototype, 'mediaDevices', { configurable: true, get: () => undefined });
    });
    await page.goto('/');
    await button(page, 'Next').click();
    await expect(micText(page)).toHaveText(UNSUPPORTED);
    await expect(button(page, 'Allow microphone')).toBeHidden();
    await expect(button(page, 'Not now')).toBeHidden();
    await expect(button(page, 'Next')).toBeVisible();
    await checkPills(page);
    await button(page, 'Next').click();
    await expect(heading(page, 'Where should alerts buzz?')).toBeFocused();
    expect(problems, problems.join('\n')).toEqual([]);
  });

  test('keyboard only: Tab order, Enter, arrow keys on the output, Done', async ({ page }) => {
    const problems = watch(page);
    await page.goto('/');
    await expect(heading(page, 'Welcome to Banshee Band')).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(button(page, 'Skip intro')).toBeFocused();
    // The heading takes the focus from the script only (tabindex -1), so Tab goes on to Next.
    await page.keyboard.press('Tab');
    await expect(button(page, 'Next')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(heading(page, 'Turn on the microphone')).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(button(page, 'Back')).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(button(page, 'Not now')).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(button(page, 'Allow microphone')).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Enter');
    await expect(heading(page, 'Where should alerts buzz?')).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(radio(page, 'Phone vibration')).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(radio(page, 'Screen only')).toBeChecked();
    expect(JSON.parse((await stored(page, SETTINGS_KEY))!).output).toBe('simulator');
    await page.keyboard.press('Tab');
    await expect(button(page, 'Back')).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(button(page, 'Done')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(sheet(page)).toBeHidden();
    await expect(page.getByRole('button', { name: 'Start listening' })).toBeFocused();
    expect(problems, problems.join('\n')).toEqual([]);
  });

  test('reduced motion: the sheet and steps do not move', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await expect(sheet(page)).toBeVisible();
    const durations = await page.evaluate(() => {
      const d = document.querySelector('dialog[data-intro="sheet"]')!;
      const s = d.querySelector('.bb-intro__step:not([hidden])')!;
      return [getComputedStyle(d).transitionDuration, getComputedStyle(s).transitionDuration];
    });
    expect(durations.every((d) => d.split(',').every((v) => v.trim() === '0s'))).toBe(true);
  });

  test('with motion allowed the sheet fades in on the slow motion token', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto('/');
    await expect(sheet(page)).toBeVisible();
    const duration = await sheet(page).evaluate((d) => getComputedStyle(d).transitionDuration);
    expect(duration.split(',')[0].trim()).toBe('0.4s');
  });

  test('a corrupt flag shows the intro, and closing writes done over it', async ({ page }) => {
    const problems = watch(page);
    await page.goto('/');
    await page.evaluate((k) => localStorage.setItem(k, 'yes'), ONBOARDED_KEY);
    await page.reload();
    await expect(heading(page, 'Welcome to Banshee Band')).toBeVisible();
    await button(page, 'Skip intro').click();
    expect(await stored(page, ONBOARDED_KEY)).toBe('done');
    await page.reload();
    await stationReady(page);
    await expect(sheet(page)).toHaveCount(0);
    expect(problems, problems.join('\n')).toEqual([]);
  });

  test('a corrupt settings value does not touch the flag: the intro shows once and the defaults apply', async ({ page }) => {
    const problems = watch(page);
    await page.addInitScript((k) => localStorage.setItem(k, '{not json'), SETTINGS_KEY);
    await page.goto('/');
    await button(page, 'Next').click();
    await button(page, 'Not now').click();
    await expect(radio(page, 'Phone vibration')).toBeChecked();
    expect(problems, problems.join('\n')).toEqual([]);
  });

  test('blocked storage: no intro (it could not be remembered), the aid sentence stays, and the station works', async ({ page }) => {
    test.setTimeout(MODEL_TIMEOUT + 60_000);
    const problems = watch(page);
    await page.addInitScript(() => {
      Object.defineProperty(window, 'localStorage', { get: () => { throw new DOMException('blocked', 'SecurityError'); } });
    });
    await page.goto('/');
    await stationReady(page);
    await expect(sheet(page)).toHaveCount(0);
    await expect(page.locator('footer')).toContainText(AID);
    await page.locator('[data-card="try"]').getByRole('button', { name: 'Knock', exact: true }).click();
    await expect(page.getByRole('list', { name: 'Recent sounds' }).getByRole('listitem')).toHaveCount(1, { timeout: MODEL_TIMEOUT });
    // Show intro again still opens it, and closing it writes nothing and says nothing.
    await settingsPill(page).click();
    await page.getByRole('dialog', { name: 'Settings' }).getByRole('button', { name: 'Show intro again' }).click();
    await expect(heading(page, 'Welcome to Banshee Band')).toBeFocused();
    await button(page, 'Skip intro').click();
    await expect(settingsPill(page)).toBeFocused();
    expect(problems, problems.join('\n')).toEqual([]);
  });
});

test.describe('Show intro again', () => {
  test('opens step 1 from Settings, and closing returns the focus to the Settings pill', async ({ page }) => {
    const problems = watch(page);
    await page.goto('/');
    await stationReady(page);
    await expect(sheet(page)).toBeHidden();
    await settingsPill(page).click();
    const settings = page.getByRole('dialog', { name: 'Settings' });
    await settings.getByRole('button', { name: 'Show intro again' }).click();
    await expect(settings).toBeHidden();
    await expect(heading(page, 'Welcome to Banshee Band')).toBeFocused();
    await expect(sheet(page)).toContainText('Step 1 of 3');
    await button(page, 'Next').click();
    await button(page, 'Not now').click();
    await button(page, 'Done').click();
    await expect(sheet(page)).toHaveCount(0);
    await expect(settingsPill(page)).toBeFocused();
    // Opened again, it starts at step 1; Escape returns the focus the same way.
    await settingsPill(page).click();
    await settings.getByRole('button', { name: 'Show intro again' }).click();
    await expect(heading(page, 'Welcome to Banshee Band')).toBeFocused();
    await expect(sheet(page)).toContainText('Step 1 of 3');
    await page.keyboard.press('Escape');
    await expect(sheet(page)).toHaveCount(0);
    await expect(settingsPill(page)).toBeFocused();
    await page.reload();
    await stationReady(page);
    await expect(sheet(page)).toHaveCount(0);
    expect(problems, problems.join('\n')).toEqual([]);
  });

  test('opened while listening, the microphone step shows Listening and Next at once', async ({ page }) => {
    test.setTimeout(MODEL_TIMEOUT + 60_000);
    const problems = watch(page);
    await page.goto('/');
    await page.getByRole('button', { name: 'Start listening' }).click();
    await expect(listenStatus(page)).toHaveText('Listening', { timeout: MODEL_TIMEOUT });
    await settingsPill(page).click();
    await page.getByRole('dialog', { name: 'Settings' }).getByRole('button', { name: 'Show intro again' }).click();
    await button(page, 'Next').click();
    await expect(micStatus(page)).toHaveText('Listening');
    await expect(button(page, 'Allow microphone')).toBeHidden();
    await expect(button(page, 'Not now')).toBeHidden();
    await expect(button(page, 'Next')).toBeVisible();
    await button(page, 'Skip intro').click();
    // Closing does not stop the microphone.
    await expect(listenStatus(page)).toHaveText('Listening');
    expect(problems, problems.join('\n')).toEqual([]);
  });
});
