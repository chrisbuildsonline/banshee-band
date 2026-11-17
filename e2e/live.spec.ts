import { resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';

const KNOCK_WAV = resolve(import.meta.dirname, '../public/clips/knock-01.wav');
const SCREENSHOTS = resolve(import.meta.dirname, 'screenshots');
const LIVE_TIMEOUT = 120_000;
const DENIED = 'Microphone access was blocked. Allow the microphone in your browser settings, or try a recorded sound instead.';
const NOTE = 'Banshee Band listens through your microphone to tell you about sounds. The sound is processed on this device and is never recorded or sent anywhere.';
/** Chromium's GPU driver note when TF.js WebGL reads scores back (see e2e/station.spec.ts). */
const WEBGL_READPIXELS = /GL Driver Message \(OpenGL, Performance, GL_CLOSE_PATH_NV, High\): GPU stall due to ReadPixels/;

test.use({
  launchOptions: {
    args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', `--use-file-for-fake-audio-capture=${KNOCK_WAV}`],
  },
});

/** Records console errors and warnings, page errors and requests to any other origin. */
function watch(page: Page, origin: string): string[] {
  const problems: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'warning' && WEBGL_READPIXELS.test(msg.text())) return;
    if (msg.type() === 'error' || msg.type() === 'warning') problems.push(`console ${msg.type()}: ${msg.text()}`);
  });
  page.on('pageerror', (error) => problems.push(`page error: ${error.message}`));
  page.on('request', (r) => {
    const url = new URL(r.url());
    if (url.protocol.startsWith('http') && url.origin !== origin) problems.push(`off-origin request: ${r.url()}`);
  });
  return problems;
}

/** Wraps getUserMedia to count calls and keep the streams; `deny` makes it reject as a blocked permission. */
async function recordGetUserMedia(page: Page, deny = false): Promise<void> {
  await page.addInitScript((deny) => {
    const w = window as unknown as { __gum: { calls: number; streams: MediaStream[] } };
    w.__gum = { calls: 0, streams: [] };
    const devices = navigator.mediaDevices;
    const original = devices.getUserMedia.bind(devices);
    devices.getUserMedia = async (constraints?: MediaStreamConstraints) => {
      w.__gum.calls++;
      if (deny) throw new DOMException('', 'NotAllowedError');
      const stream = await original(constraints);
      w.__gum.streams.push(stream);
      return stream;
    };
  }, deny);
}

const gum = (page: Page) => page.evaluate(() => (window as unknown as { __gum: { calls: number; streams: MediaStream[] } }).__gum.calls);
const tracksEnded = (page: Page) =>
  page.evaluate(() => (window as unknown as { __gum: { streams: MediaStream[] } }).__gum.streams.flatMap((s) => s.getTracks()).every((t) => t.readyState === 'ended'));
const listenStatus = (page: Page) => page.locator('[data-card="listen"] [role="status"]');
const start = (page: Page) => page.getByRole('button', { name: 'Start listening' });
const stop = (page: Page) => page.getByRole('button', { name: 'Stop', exact: true });

test.describe('live listening', () => {
  test('Start listening hears the fake microphone: a Knock row, backend and classify time, then Stop releases it', async ({ page, baseURL }) => {
    test.setTimeout(LIVE_TIMEOUT + 60_000);
    const problems = watch(page, new URL(baseURL!).origin);
    await recordGetUserMedia(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');

    // The one primary pill, first in the main content, with the plain sentence; no microphone before the click.
    await expect(page.locator('.bb-pill--primary')).toHaveCount(1);
    await expect(start(page)).toHaveClass(/bb-pill--primary/);
    await expect(page.locator('[data-card="listen"]')).toContainText(NOTE);
    const order = await page.locator('main > *, main > .bb-station-controls > *').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.card ?? e.className));
    expect(order.filter((c) => ['listen', 'try', 'ghosts'].includes(c))).toEqual(['listen', 'try', 'ghosts']);
    expect(await gum(page)).toBe(0);

    // Keyboard: focus the pill and press Enter.
    await start(page).focus();
    await page.keyboard.press('Enter');
    await expect(listenStatus(page)).toHaveText('Listening', { timeout: LIVE_TIMEOUT });
    await expect(stop(page)).toBeFocused();
    expect(await gum(page)).toBe(1);

    const row = page.getByRole('list', { name: 'Recent sounds' }).getByRole('listitem').first();
    await expect(row).toContainText('Knock', { timeout: LIVE_TIMEOUT });
    await expect(row).not.toContainText('simulated');
    const label = page.locator('[data-card="pipeline"] section[data-stage="label"]');
    await expect(label.locator('[data-backend]')).toHaveAttribute('data-backend', /^(webgl|cpu)$/);
    const ms = Number(await label.locator('[data-classify-ms]').getAttribute('data-classify-ms'));
    expect(ms).toBeGreaterThan(0);
    await page.screenshot({ path: resolve(SCREENSHOTS, 'live-1440-day.png') });

    await stop(page).click();
    await expect(listenStatus(page)).toHaveText('Stopped');
    await expect(start(page)).toBeFocused();
    await expect.poll(() => tracksEnded(page)).toBe(true);
    expect(problems).toEqual([]);
  });

  test('a blocked microphone says Mic blocked with a plain message, and Start listening comes back', async ({ page, baseURL }) => {
    const problems = watch(page, new URL(baseURL!).origin);
    await recordGetUserMedia(page, true);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    test.setTimeout(LIVE_TIMEOUT + 30_000);
    await start(page).click();
    // The sound model loads before the microphone is asked for.
    await expect(listenStatus(page)).toHaveText('Mic blocked', { timeout: LIVE_TIMEOUT });
    await expect(page.locator('[data-card="listen"]')).toContainText(DENIED);
    await expect(start(page)).toBeVisible();
    await expect(start(page)).toBeFocused();
    expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
    expect(problems).toEqual([]);
  });

  test('phone: the primary pill sits in the bottom bar, in thumb reach', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    const pill = await start(page).boundingBox();
    expect(pill!.y).toBeGreaterThan(844 * 0.55);
    expect(pill!.height).toBeGreaterThanOrEqual(44);
    await page.screenshot({ path: resolve(SCREENSHOTS, 'live-390-day.png') });
    await page.locator('[data-theme-choice="night"]').click();
    await page.screenshot({ path: resolve(SCREENSHOTS, 'live-390-night.png') });
  });
});
