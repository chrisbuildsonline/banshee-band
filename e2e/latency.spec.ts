import { resolve } from 'node:path';
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

const KNOCK_WAV = resolve(import.meta.dirname, '../public/clips/knock-01.wav');
const SCREENSHOTS = resolve(import.meta.dirname, 'screenshots');
/** The first run loads the sound model in the browser, which can take a while. */
const MODEL_TIMEOUT = 120_000;
/** Chromium's GPU driver note when TF.js WebGL reads scores back (see e2e/station.spec.ts). */
const WEBGL_READPIXELS = /GL Driver Message \(OpenGL, Performance, GL_CLOSE_PATH_NV, High\): GPU stall due to ReadPixels/;
const FIGURE = /^Onset to output: \d+(\.\d)? ms$/;
const NOTES = {
  none: 'Run a sound to measure it.',
  clip: 'From the press to the buzz: fetch, classify, side, pattern and output. The one-time model load and the screen paint are not counted.',
  live: 'From the end of a 0.975 s microphone window to the buzz. Microphone buffering, and the time the sound sat in the window, are not counted.',
  nothing: 'Nothing buzzed this time, so there is no output to time.',
};

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

/** The figure's text, number, source and note, read at one instant (a later live event can replace them). */
const read = (page: Page) =>
  page.evaluate(() => {
    const fig = document.querySelector<HTMLElement>('[data-card="pipeline"] .bb-latency__figure')!;
    const wrap = fig.closest<HTMLElement>('.bb-latency')!;
    return {
      text: fig.textContent ?? '',
      ms: fig.dataset.latencyMs,
      source: wrap.dataset.latencySource,
      note: wrap.querySelector('.bb-latency__note')?.textContent ?? '',
      inert: [fig, wrap].every((e) => !e.hasAttribute('tabindex') && !e.hasAttribute('role') && !e.hasAttribute('aria-live')),
      focusables: wrap.querySelectorAll('a, button, input, select, textarea, [tabindex]').length,
    };
  });

/** Checks a measured figure: the sentence, a plausible number that the text shows by the formatMs rules. */
function expectMeasured(f: Awaited<ReturnType<typeof read>>, source: 'clip' | 'live'): number {
  expect(f.text).toMatch(FIGURE);
  const ms = Number(f.ms);
  expect(Number.isFinite(ms)).toBe(true);
  expect(ms).toBeGreaterThan(0);
  expect(ms).toBeLessThan(10_000);
  expect(f.text).toBe(`Onset to output: ${ms >= 10 ? String(Math.round(ms)) : ms.toFixed(1)} ms`);
  expect(f.source).toBe(source);
  expect(f.note).toBe(NOTES[source]);
  expect(f.inert).toBe(true);
  expect(f.focusables).toBe(0);
  return ms;
}

const chip = (page: Page, name: string) => page.locator('[data-card="try"]').getByRole('button', { name, exact: true });
const rows = (page: Page) => page.getByRole('list', { name: 'Recent sounds' }).getByRole('listitem');
const backendOf = (page: Page) => page.locator('[data-card="pipeline"] section[data-stage="label"] [data-backend]').getAttribute('data-backend');
const sheet = (page: Page) => page.getByRole('dialog', { name: 'Settings' });

test.describe('onset to output latency', () => {
  test('Try a sound shows a measured clip number in the pipeline card (1440 Day)', async ({ page }) => {
    test.setTimeout(MODEL_TIMEOUT + 30_000);
    const problems = watch(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await page.locator('[data-theme-choice="day"]').click();

    const before = await read(page);
    expect([before.text, before.ms, before.source, before.note]).toEqual(['Onset to output: — ms', undefined, undefined, NOTES.none]);

    await chip(page, 'Knock').click();
    await expect(rows(page).first()).toContainText('Knock', { timeout: MODEL_TIMEOUT });
    const ms = expectMeasured(await read(page), 'clip');
    test.info().annotations.push({ type: 'latency-clip', description: `${await backendOf(page)}, ${ms} ms` });

    const card = page.locator('[data-card="pipeline"]');
    await card.evaluate((e) => e.scrollIntoView({ block: 'end' }));
    // Desktop: the figure sits to the right of the Pipeline heading, and the card paints over the sticky ghost field.
    const fig = await page.locator('.bb-latency').boundingBox();
    const heading = await card.getByRole('heading', { name: 'Pipeline' }).boundingBox();
    expect(fig!.x).toBeGreaterThan(heading!.x + heading!.width);
    const top = await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.closest('[data-card]')?.getAttribute('data-card'), [heading!.x + 4, heading!.y + 4]);
    expect(top).toBe('pipeline');
    await page.screenshot({ path: resolve(SCREENSHOTS, 'latency-1440-day.png') });
    expect(problems).toEqual([]);
  });

  test('Start listening shows a measured live number (390 Night)', async ({ page }) => {
    test.setTimeout(MODEL_TIMEOUT + 60_000);
    const problems = watch(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await page.locator('[data-theme-choice="night"]').click();
    await page.getByRole('button', { name: 'Start listening' }).click();
    await expect(page.locator('[data-card="listen"] [role="status"]')).toHaveText('Listening', { timeout: MODEL_TIMEOUT });
    await expect(rows(page).first()).toContainText('Knock', { timeout: MODEL_TIMEOUT });
    // The fake microphone loops the knock; wait until the figure holds a live number.
    await expect.poll(async () => (await read(page)).source, { timeout: MODEL_TIMEOUT }).toBe('live');
    await expect.poll(async () => (await read(page)).ms, { timeout: MODEL_TIMEOUT }).not.toBeUndefined();
    const ms = expectMeasured(await read(page), 'live');
    test.info().annotations.push({ type: 'latency-live', description: `${await backendOf(page)}, ${ms} ms` });

    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await page.locator('[data-card="pipeline"]').evaluate((e) => e.scrollIntoView({ block: 'start' }));
    await page.screenshot({ path: resolve(SCREENSHOTS, 'latency-390-night.png') });
    await page.getByRole('button', { name: 'Stop', exact: true }).click();
    await expect(page.locator('[data-card="listen"] [role="status"]')).toHaveText('Stopped');
    expect(problems).toEqual([]);
  });

  test('a muted run says nothing buzzed and shows no number', async ({ page }) => {
    test.setTimeout(MODEL_TIMEOUT + 30_000);
    const problems = watch(page);
    await page.goto('/');
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await sheet(page).getByRole('switch', { name: 'Knock', exact: true }).click();
    await sheet(page).getByRole('button', { name: 'Done' }).click();
    await expect(sheet(page)).toBeHidden();

    await chip(page, 'Knock').click();
    await expect(page.locator('[data-card="try"] [aria-live="polite"]')).toContainText('Knock is switched off in Settings', { timeout: MODEL_TIMEOUT });
    const f = await read(page);
    expect([f.text, f.ms, f.source, f.note]).toEqual(['Onset to output: — ms', undefined, 'clip', NOTES.nothing]);
    expect(problems).toEqual([]);
  });
});
