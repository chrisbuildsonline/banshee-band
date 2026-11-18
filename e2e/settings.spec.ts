import { resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';

const SCREENSHOTS = resolve(import.meta.dirname, 'screenshots');
const KNOCK_WAV = resolve(import.meta.dirname, '../public/clips/knock-01.wav');
/** The first run loads the sound model in the browser, which can take a while. */
const MODEL_TIMEOUT = 120_000;
const KEY = 'banshee-band.settings.v1';
const CLASS_NAMES = ['Knock', 'Doorbell', 'Alarm', 'Baby', 'Vehicle', 'Voice', 'Other'];
const WRISTBAND = 'This browser has no Bluetooth. Use Chrome or Edge to connect the band.';
/** Chromium's GPU driver note when TF.js WebGL reads scores back (see e2e/station.spec.ts). */
const WEBGL_READPIXELS = /GL Driver Message \(OpenGL, Performance, GL_CLOSE_PATH_NV, High\): GPU stall due to ReadPixels/;

// A fake microphone that plays the knock clip, for the live test (no other test here opens the microphone).
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

const openButton = (page: Page) => page.getByRole('button', { name: 'Settings', exact: true });
const sheet = (page: Page) => page.getByRole('dialog', { name: 'Settings' });
const toggle = (page: Page, name: string) => sheet(page).getByRole('switch', { name, exact: true });
const level = (page: Page, name: string) => sheet(page).getByRole('slider', { name: `${name} Alerts from` });
const radio = (page: Page, name: string) => sheet(page).getByRole('radio', { name, exact: true });
const tile = (page: Page, cls: string) => sheet(page).locator(`.bb-settings-tile[data-class="${cls}"]`);
const chip = (page: Page, name: string) => page.locator('[data-card="try"]').getByRole('button', { name, exact: true });
const rows = (page: Page) => page.getByRole('list', { name: 'Recent sounds' }).getByRole('listitem');
const ghostItems = (page: Page) => page.locator('.bb-ghost-field__items li[data-class]');
const tryMessage = (page: Page) => page.locator('[data-card="try"] [aria-live="polite"]');
const stage = (page: Page, name: string) => page.locator(`[data-card="pipeline"] section[data-stage="${name}"]`);
const headerPill = (page: Page) => page.locator('#station-status [role="status"]');

async function openSheet(page: Page): Promise<void> {
  await openButton(page).click();
  await expect(sheet(page)).toBeVisible();
}

async function closeSheet(page: Page): Promise<void> {
  await sheet(page).getByRole('button', { name: 'Done' }).click();
  await expect(sheet(page)).toBeHidden();
}

/** Expects every class on at −50 dB and the given output selected. */
async function expectDefaults(page: Page, output = 'Phone vibration'): Promise<void> {
  for (const name of CLASS_NAMES) {
    await expect(toggle(page, name)).toBeChecked();
    await expect(level(page, name)).toHaveValue('-50');
    await expect(level(page, name)).toHaveAttribute('aria-valuetext', '−50 dB');
  }
  await expect(radio(page, output)).toBeChecked();
}

test.describe('settings sheet', () => {
  test('opens from the header, changes by keyboard, applies at once and persists after a reload', async ({ page }) => {
    const problems = watch(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await expect(openButton(page)).toHaveAttribute('aria-haspopup', 'dialog');
    await expect(headerPill(page)).toHaveText('Phone vibration fallback');

    await openButton(page).focus();
    await page.keyboard.press('Enter');
    await expect(sheet(page)).toBeVisible();
    await expect(sheet(page).getByRole('button', { name: 'Done' })).toBeFocused();
    await expect(sheet(page).getByRole('heading', { level: 2 })).toHaveText('Settings');
    await expect(sheet(page)).toContainText('Changes apply right away and stay on this device.');
    // No Save button: the only primary pill the sheet may have is Connect band (when the browser has Bluetooth).
    await expect(sheet(page).locator('.bb-pill--primary').filter({ hasNotText: 'Connect band' })).toHaveCount(0);
    await expect(sheet(page).getByRole('button', { name: /save/i })).toHaveCount(0);
    await expectDefaults(page);
    await expect(sheet(page).getByRole('listitem')).toHaveText(CLASS_NAMES.map((n) => new RegExp(`^${n}`)));

    // Knock off with Space: the word says Off and its slider is disabled.
    await page.keyboard.press('Tab');
    await expect(toggle(page, 'Knock')).toBeFocused();
    await page.keyboard.press('Space');
    await expect(toggle(page, 'Knock')).not.toBeChecked();
    await expect(tile(page, 'knock')).toContainText('Off');
    await expect(tile(page, 'knock')).toHaveAttribute('data-on', 'false');
    await expect(level(page, 'Knock')).toBeDisabled();

    // Voice level down 5 dB with the arrow keys.
    await level(page, 'Voice').focus();
    for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowLeft');
    await expect(level(page, 'Voice')).toHaveValue('-55');
    await expect(level(page, 'Voice')).toHaveAttribute('aria-valuetext', '−55 dB');
    await expect(tile(page, 'voice')).toContainText('−55 dB');

    // Screen only with an arrow key: the header pill follows at once.
    await radio(page, 'Phone vibration').focus();
    await page.keyboard.press('ArrowDown');
    await expect(radio(page, 'Screen only')).toBeChecked();
    await expect(radio(page, 'Screen only')).toBeFocused();
    await expect(headerPill(page)).toHaveText('Band not connected');

    await page.mouse.move(0, 0);
    await sheet(page).evaluate((d) => d.scrollTo(0, 0));
    await page.screenshot({ path: resolve(SCREENSHOTS, 'settings-1440-day.png') });

    // Escape closes and the focus goes back to the Settings pill.
    await page.keyboard.press('Escape');
    await expect(sheet(page)).toBeHidden();
    await expect(openButton(page)).toBeFocused();

    const saved = JSON.parse((await page.evaluate((k) => localStorage.getItem(k), KEY)) ?? 'null');
    expect(saved.sounds.knock).toEqual({ on: false, minDb: -50 });
    expect(saved.sounds.voice).toEqual({ on: true, minDb: -55 });
    expect(saved.output).toBe('simulator');

    await page.reload();
    await expect(headerPill(page)).toHaveText('Band not connected');
    await openSheet(page);
    await expect(toggle(page, 'Knock')).not.toBeChecked();
    await expect(level(page, 'Knock')).toBeDisabled();
    await expect(level(page, 'Voice')).toHaveValue('-55');
    await expect(radio(page, 'Screen only')).toBeChecked();

    // Reset to defaults puts every field back, and saves it.
    await sheet(page).getByRole('button', { name: 'Reset to defaults' }).click();
    await expectDefaults(page);
    await expect(headerPill(page)).toHaveText('Phone vibration fallback');
    expect(JSON.parse((await page.evaluate((k) => localStorage.getItem(k), KEY)) ?? 'null').output).toBe('phone');
    expect(problems, problems.join('\n')).toEqual([]);
  });

  test('tab order inside the sheet: Done, then switch and slider per class, the radios as one stop, then Reset', async ({ page }) => {
    await page.goto('/');
    await openSheet(page);
    await toggle(page, 'Voice').click(); // a disabled slider is skipped
    await sheet(page).getByRole('button', { name: 'Done' }).focus();
    const names: string[] = [];
    for (let i = 0; i < 15; i++) {
      await page.keyboard.press('Tab');
      names.push(
        await page.evaluate(() => {
          const el = document.activeElement as HTMLElement;
          const role = el.getAttribute('role') ?? (el instanceof HTMLInputElement ? el.type : el.tagName.toLowerCase());
          const labelled = el.getAttribute('aria-labelledby');
          const name = labelled ? labelled.split(' ').map((id) => document.getElementById(id)?.textContent?.trim()).join(' ') : (el.textContent?.trim() ?? '');
          return el instanceof HTMLInputElement && el.type === 'radio' ? `radio:${el.value}` : `${role}:${name}`;
        }),
      );
    }
    expect(names).toEqual([
      'switch:Knock', 'range:Knock Alerts from',
      'switch:Doorbell', 'range:Doorbell Alerts from',
      'switch:Alarm', 'range:Alarm Alerts from',
      'switch:Baby', 'range:Baby Alerts from',
      'switch:Vehicle', 'range:Vehicle Alerts from',
      'switch:Voice',
      'switch:Other', 'range:Other Alerts from',
      'radio:phone',
      'button:Reset to defaults',
    ]);
  });

  test('a corrupt saved value opens with the defaults and no console output', async ({ page }) => {
    const problems = watch(page);
    await page.addInitScript((k) => localStorage.setItem(k, '{not json'), KEY);
    await page.goto('/');
    await openSheet(page);
    await expectDefaults(page);
    expect(problems, problems.join('\n')).toEqual([]);
  });

  test('saved values of the wrong types fall back field by field', async ({ page }) => {
    const problems = watch(page);
    const value = JSON.stringify({ sounds: { knock: { on: 'no', minDb: 'loud' }, voice: { on: false, minDb: -200 }, baby: { on: true, minDb: -31 } }, output: 'wristband' });
    await page.addInitScript(([k, v]) => localStorage.setItem(k, v), [KEY, value]);
    await page.goto('/');
    await openSheet(page);
    await expect(toggle(page, 'Knock')).toBeChecked();
    await expect(level(page, 'Knock')).toHaveValue('-50');
    await expect(toggle(page, 'Voice')).not.toBeChecked();
    await expect(level(page, 'Voice')).toHaveValue('-50');
    await expect(level(page, 'Baby')).toHaveValue('-31');
    await expect(radio(page, 'Phone vibration')).toBeChecked();
    expect(problems, problems.join('\n')).toEqual([]);
  });

  test('blocked storage: the page works with the defaults and a change still applies', async ({ page }) => {
    const problems = watch(page);
    await page.addInitScript(() => {
      Object.defineProperty(window, 'localStorage', { get: () => { throw new DOMException('blocked', 'SecurityError'); } });
    });
    await page.goto('/');
    await openSheet(page);
    await expectDefaults(page);
    await radio(page, 'Screen only').check();
    await expect(headerPill(page)).toHaveText('Band not connected');
    expect(problems, problems.join('\n')).toEqual([]);
  });

  test('without Web Bluetooth the Wristband option is shown but disabled, with its honest caption', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(Navigator.prototype, 'bluetooth', { configurable: true, get: () => undefined });
    });
    await page.goto('/');
    await openSheet(page);
    await expect(radio(page, 'Wristband')).toBeDisabled();
    await expect(radio(page, 'Wristband')).toHaveAccessibleDescription(WRISTBAND);
    await expect(sheet(page).locator('[data-output="band"]')).toContainText(WRISTBAND);
    await expect(radio(page, 'Phone vibration')).toHaveAccessibleDescription('The phone buzzes the pattern. The screen shows it too.');
    await expect(page.getByRole('button', { name: /connect/i })).toHaveCount(0);
  });

  test('without navigator.vibrate, Phone vibration is disabled and Screen only is in use', async ({ page }) => {
    await page.addInitScript(() => {
      delete (Navigator.prototype as { vibrate?: unknown }).vibrate;
    });
    await page.goto('/');
    await expect(headerPill(page)).toHaveText('Band not connected');
    await openSheet(page);
    await expect(radio(page, 'Phone vibration')).toBeDisabled();
    await expect(radio(page, 'Phone vibration')).toHaveAccessibleDescription('This browser cannot vibrate.');
    await expect(radio(page, 'Screen only')).toBeChecked();
  });

  test('Try a sound obeys the settings: off, too quiet and Screen only', async ({ page }) => {
    test.setTimeout(MODEL_TIMEOUT + 90_000);
    const problems = watch(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await expect(chip(page, 'Knock')).toBeVisible();

    // Knock off: the run fills the pipeline view, and raises no ghost, row, alert or buzz.
    await openSheet(page);
    await toggle(page, 'Knock').click();
    await closeSheet(page);
    await chip(page, 'Knock').click();
    await expect(tryMessage(page)).toHaveText('Knock is switched off in Settings, so it raised no alert.', { timeout: MODEL_TIMEOUT });
    await expect(stage(page, 'label')).toContainText('Class: Knock');
    await expect(stage(page, 'pattern')).toContainText('No buzz: This sound is switched off');
    await expect(stage(page, 'band')).toContainText('No buzz');
    await expect(rows(page)).toHaveCount(0);
    await expect(ghostItems(page)).toHaveCount(0);
    await expect(page.locator('#latest-alert')).toHaveText('No sound yet');
    await expect(page.locator('[data-card="simulator"]')).toContainText('No pattern yet');

    // Knock back on: it alerts again.
    await openSheet(page);
    await toggle(page, 'Knock').click();
    await closeSheet(page);
    await chip(page, 'Knock').click();
    await expect(rows(page)).toHaveCount(1, { timeout: MODEL_TIMEOUT });
    await expect(rows(page).first()).toContainText('Knock');
    await expect(stage(page, 'band')).toContainText('Phone vibration');

    // Knock level at −10 dB (the End key): the clip, about −24 dB at its loudest, is too quiet.
    await openSheet(page);
    await level(page, 'Knock').focus();
    await page.keyboard.press('End');
    await expect(level(page, 'Knock')).toHaveValue('-10');
    await closeSheet(page);
    await chip(page, 'Knock').click();
    await expect(tryMessage(page)).toHaveText('Knock was quieter than its Settings level (−10 dB), so it raised no alert.', { timeout: MODEL_TIMEOUT });
    await expect(rows(page)).toHaveCount(1);

    // Defaults, then Screen only: the buzz goes to the simulator alone.
    await openSheet(page);
    await sheet(page).getByRole('button', { name: 'Reset to defaults' }).click();
    await radio(page, 'Screen only').check();
    await closeSheet(page);
    await chip(page, 'Knock').click();
    await expect(rows(page)).toHaveCount(2, { timeout: MODEL_TIMEOUT });
    await expect(stage(page, 'band')).toContainText('Band simulator');
    await expect(stage(page, 'band')).not.toContainText('Phone vibration');
    await expect(headerPill(page)).toHaveText('Band not connected');
    expect(problems, problems.join('\n')).toEqual([]);
  });

  test('screenshots: 1440 Night, 390 Day and Night, no sideways scroll and 44px targets on the phone', async ({ page }) => {
    const problems = watch(page);
    // Reduced motion: the switch changes at once, so the shot never catches it halfway.
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await page.getByRole('button', { name: 'Night', exact: true }).click();
    await openSheet(page);
    await toggle(page, 'Voice').click();
    await page.mouse.move(0, 0);
    // The lower half of the sheet: the Voice tile switched off, Buzz on and Reset.
    await sheet(page).evaluate((d) => d.scrollTo(0, d.scrollHeight));
    await page.screenshot({ path: resolve(SCREENSHOTS, 'settings-1440-night.png') });
    const desk = (await sheet(page).boundingBox())!;
    expect(desk.width).toBeLessThanOrEqual(480);
    expect(Math.round(1440 - (desk.x + desk.width))).toBe(16);
    await closeSheet(page);

    await page.setViewportSize({ width: 390, height: 844 });
    for (const theme of ['Day', 'Night']) {
      await page.getByRole('button', { name: theme, exact: true }).click();
      await openSheet(page);
      const phone = (await sheet(page).boundingBox())!;
      expect(phone.width).toBe(390);
      expect(Math.round(phone.y + phone.height)).toBe(844);
      expect(await sheet(page).evaluate((d) => d.scrollWidth <= d.clientWidth)).toBe(true);
      for (const target of [sheet(page).getByRole('button', { name: 'Done' }), toggle(page, 'Knock'), level(page, 'Knock'), radio(page, 'Screen only')]) {
        const b = (await target.boundingBox())!;
        expect(b.height).toBeGreaterThanOrEqual(44);
        expect(b.width).toBeGreaterThanOrEqual(44);
      }
      await page.mouse.move(0, 0);
      await page.screenshot({ path: resolve(SCREENSHOTS, `settings-390-${theme.toLowerCase()}.png`) });
      await closeSheet(page);
    }
    expect(problems, problems.join('\n')).toEqual([]);
  });
});

test.describe('settings while listening', () => {
  test('with Knock off the live knock fills the pipeline but raises no row; turned on while listening, it alerts', async ({ page }) => {
    test.setTimeout(MODEL_TIMEOUT + 90_000);
    const problems = watch(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await openSheet(page);
    await toggle(page, 'Knock').click();
    await closeSheet(page);

    await page.getByRole('button', { name: 'Start listening' }).click();
    await expect(page.locator('[data-card="listen"] [role="status"]')).toHaveText('Listening', { timeout: MODEL_TIMEOUT });
    await expect(stage(page, 'label')).toContainText('Class: Knock', { timeout: MODEL_TIMEOUT });
    await expect(stage(page, 'pattern')).toContainText('No buzz: This sound is switched off');
    await expect(rows(page)).toHaveCount(0);
    await expect(ghostItems(page)).toHaveCount(0);

    // A change applies to the next window without stopping the microphone.
    await openSheet(page);
    await toggle(page, 'Knock').click();
    await closeSheet(page);
    await expect(rows(page).first()).toContainText('Knock', { timeout: 60_000 });
    await expect(page.locator('[data-card="listen"] [role="status"]')).toHaveText('Listening');

    await page.getByRole('button', { name: 'Stop', exact: true }).click();
    await expect(page.locator('[data-card="listen"] [role="status"]')).toHaveText('Stopped');
    expect(problems, problems.join('\n')).toEqual([]);
  });
});
