import { resolve } from 'node:path';
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

const SCREENSHOTS = resolve(import.meta.dirname, 'screenshots');
/** The first run loads the sound model in the browser, which can take a while. */
const MODEL_TIMEOUT = 120_000;
const FOCUSABLE = 'a[href], button, input, select, textarea, [tabindex], [contenteditable]';
const AID = 'Banshee Band is an aid, not a safety device. It can miss or misread sounds, so keep your smoke alarms and other certified alerting devices.';
const CHIP_NAMES = ['Knock', 'Doorbell', 'Alarm', 'Baby', 'Vehicle', 'Voice'];
const NAME_OF: Readonly<Record<string, string>> = { knock: 'Knock', doorbell: 'Doorbell', alarm: 'Alarm', baby: 'Baby', vehicle: 'Vehicle', voice: 'Voice' };

/** Requests the page may make (R16.1): the app's own files, the clip manifest, the clips and the model files. */
const ALLOWED_PATHS = [
  /^\/$/,
  /^\/index\.html$/,
  /^\/favicon\.svg$/,
  /^\/manifest\.webmanifest$/,
  /^\/icons\/[\w-]+\.png$/,
  /^\/src\//,
  /^\/@vite\/client$/,
  /^\/node_modules\//,
  /^\/clips\/manifest\.json$/,
  /^\/clips\/[\w-]+\.wav$/,
  /^\/models\/yamnet\/[\w.-]+$/,
];

/**
 * The one console warning the page cannot avoid (R16.4): Chromium's GPU driver reports a stall when TF.js's
 * WebGL backend reads the scores back with readPixels. Only the GL context address in the brackets varies.
 * Avoiding it would mean choosing the TF.js backend, which this spec leaves out of scope.
 */
const WEBGL_READPIXELS = /^\[\.WebGL-0x[0-9a-f]+\]GL Driver Message \(OpenGL, Performance, GL_CLOSE_PATH_NV, High\): GPU stall due to ReadPixels( \(this message will no longer repeat\))?$/;

/** Records console errors and warnings, page errors, failed requests and requests to any other origin. */
function watch(page: Page, origin: string): string[] {
  const problems: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'warning' && WEBGL_READPIXELS.test(msg.text())) return;
    if (msg.type() === 'error' || msg.type() === 'warning') problems.push(`console ${msg.type()}: ${msg.text()}`);
  });
  page.on('pageerror', (error) => problems.push(`page error: ${error.message}`));
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.protocol.startsWith('http') && url.origin !== origin) problems.push(`off-origin request: ${request.url()}`);
  });
  page.on('requestfailed', (request) => problems.push(`failed request: ${request.url()} (${request.failure()?.errorText})`));
  page.on('response', (response) => {
    if (response.status() >= 400) problems.push(`HTTP ${response.status()}: ${response.url()}`);
  });
  return problems;
}

/** Records every change of `data-level` on the two motor cards in `window.__levels`, from before the page loads. */
async function recordMotors(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as { __levels: { left: number[]; right: number[] } };
    w.__levels = { left: [], right: [] };
    new MutationObserver((records) => {
      for (const r of records) {
        const el = r.target as HTMLElement;
        const side = el.dataset?.motor;
        if (side === 'left' || side === 'right') w.__levels[side].push(Number(el.dataset.level));
      }
    }).observe(document, { subtree: true, attributes: true, attributeFilter: ['data-level'] });
  });
}

const motorLevels = (page: Page) => page.evaluate(() => (window as unknown as { __levels: { left: number[]; right: number[] } }).__levels);
const chip = (page: Page, name: string) => page.getByRole('button', { name, exact: true });
const rows = (page: Page) => page.getByRole('list', { name: 'Recent sounds' }).getByRole('listitem');
const ghostItems = (page: Page) => page.locator('.bb-ghost-field__items li[data-class]');
const message = (page: Page) => page.locator('[data-card="try"] [aria-live="polite"]');
const stages = (page: Page) => page.locator('[data-card="pipeline"] section[data-stage]');
const idle = (page: Page) => page.locator('[data-card="ghosts"] .bb-station-ghosts__idle');

/** Checks the side radio by its label. */
async function pickSide(page: Page, name: 'Left' | 'Centre' | 'Right'): Promise<void> {
  await page.getByLabel(name, { exact: true }).check();
}

/** Clicks a chip and waits for its row at the top of Recent sounds (the first run loads the model). */
async function runChip(page: Page, name: string): Promise<void> {
  const before = await rows(page).count();
  await chip(page, name).click();
  await expect(rows(page)).toHaveCount(before + 1, { timeout: MODEL_TIMEOUT });
}

async function box(page: Page, selector: string) {
  const b = await page.locator(selector).boundingBox();
  expect(b, `${selector} is laid out`).not.toBeNull();
  return b!;
}

test.describe('listening station', () => {
  test('the first screen: title, header, chips in manifest order, side control and the aid sentence', async ({ page, request }) => {
    const requests: string[] = [];
    page.on('request', (r) => requests.push(new URL(r.url()).pathname));
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Listening station');
    await expect(page.locator('main')).toHaveCount(1);
    await expect(page.locator('h1')).toHaveCount(1);
    await expect(page.getByText('The listening station arrives in a later build')).toHaveCount(0);

    const brand = page.getByRole('link', { name: 'Banshee Band' });
    await expect(brand).toHaveAttribute('href', '/index.html');
    await expect(page.getByRole('status').first()).toBeVisible();

    const manifest = (await (await request.get('/clips/manifest.json')).json()) as { class: string }[];
    const sound = page.getByRole('group', { name: 'Sound' });
    await expect(sound.getByRole('button')).toHaveText(manifest.map((c) => NAME_OF[c.class]));
    for (const name of CHIP_NAMES) {
      const c = chip(page, name);
      await expect(c).toHaveAttribute('type', 'button');
      await expect(c.locator('svg.bb-ghost-glyph')).toHaveAttribute('width', '24');
      await expect(c.locator('svg.bb-ghost-glyph')).toHaveAttribute('aria-hidden', 'true');
      const b = (await c.boundingBox())!;
      expect(b.height).toBeGreaterThanOrEqual(44);
      expect(b.width).toBeGreaterThanOrEqual(44);
    }

    const side = page.getByRole('group', { name: 'Side' });
    await expect(side.getByRole('radio')).toHaveCount(3);
    await expect(page.getByLabel('Centre', { exact: true })).toBeChecked();
    await expect(page.locator('[data-card="try"]')).toContainText('simulated');

    // Headings in order: one h1, then h2s, never a skipped level.
    const levels = await page.locator('h1, h2, h3, h4').evaluateAll((els) => els.map((e) => Number(e.tagName[1])));
    expect(levels[0]).toBe(1);
    for (let i = 1; i < levels.length; i++) expect(levels[i] - levels[i - 1]).toBeLessThanOrEqual(1);

    await expect(page.locator('footer')).toContainText(AID);
    await expect(page.locator('footer').getByRole('link')).toHaveAttribute('href', '/styleguide.html');
    await expect(page.locator('main')).toContainText('sample clips');
    await expect(page.locator('main')).toContainText('Without a wristband, the band is shown on screen.');
    await expect(page.locator('main')).toContainText('microphone');

    // One primary pill (Start listening), and nothing loads the model before a chip or Start is used.
    // (The Settings sheet, closed, holds the Connect band pill; it is not on the page until opened.)
    await expect(page.locator('main .bb-pill--primary')).toHaveCount(1);
    await expect(page.locator('main .bb-pill--primary')).toHaveText('Start listening');
    expect(requests.filter((p) => p.startsWith('/models/'))).toEqual([]);
  });

  test('Given the first screen, When I choose Left and click Knock, Then a ghost, a row and the left motor follow', async ({ page, baseURL }) => {
    test.setTimeout(MODEL_TIMEOUT + 60_000);
    const problems = watch(page, new URL(baseURL!).origin);
    await recordMotors(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await page.getByRole('button', { name: 'Day', exact: true }).click();

    await pickSide(page, 'Left');
    await runChip(page, 'Knock');

    const ghost = ghostItems(page).first();
    await expect(ghost).toHaveAttribute('data-class', 'knock');
    await expect(ghost).toHaveAttribute('data-side', 'left');
    expect(Number(await ghost.getAttribute('data-x'))).toBeLessThan(0.5);
    await expect(idle(page)).toBeHidden();

    const first = rows(page).first();
    await expect(first).toContainText('Knock');
    await expect(first).toHaveAttribute('data-class', 'knock');
    await expect(first).toHaveAttribute('data-side', 'left');
    await expect(first).toHaveAttribute('data-urgency', 'medium');

    await expect.poll(async () => Math.max(0, ...(await motorLevels(page)).left)).toBeGreaterThanOrEqual(75);
    const { left, right } = await motorLevels(page);
    const rightMax = Math.max(0, ...right);
    expect(Math.max(...left)).toBeGreaterThan(rightMax);
    expect(rightMax).toBeGreaterThan(0);

    await expect(page.locator('#latest-alert')).toHaveText('Knock, left side, medium');

    // The pipeline view shows five stage times, in stage order.
    await expect(stages(page)).toHaveCount(5);
    expect(await stages(page).evaluateAll((els) => els.map((e) => e.getAttribute('data-stage')))).toEqual(['waveform', 'label', 'bearing', 'pattern', 'band']);
    const ms = await stages(page).evaluateAll((els) => els.map((e) => e.querySelector('[data-ms]')?.getAttribute('data-ms') ?? null));
    for (const v of ms) {
      expect(v).not.toBeNull();
      expect(Number.isFinite(Number(v)) && Number(v) >= 0, `data-ms ${v}`).toBe(true);
    }
    expect(problems, problems.join('\n')).toEqual([]);

    // Screenshots (R18.4): 1440 Day, then 390 Night, with the result of the same run on screen.
    await page.mouse.move(0, 0);
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: resolve(SCREENSHOTS, 'station-1440-day.png'), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('button', { name: 'Night', exact: true }).click();
    await page.mouse.move(0, 0);
    await expect(ghostItems(page)).toHaveCount(1);
    // The viewport, not the full page: a full-page capture paints the fixed bottom bar mid-page.
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: resolve(SCREENSHOTS, 'station-390-night.png') });
  });

  test('every chip classifies to its manifest class in the browser (one page, the model loaded once)', async ({ page, request }) => {
    test.setTimeout(MODEL_TIMEOUT + 180_000);
    const modelLoads: string[] = [];
    page.on('request', (r) => {
      if (new URL(r.url()).pathname.endsWith('/models/yamnet/model.json')) modelLoads.push(r.url());
    });
    const manifest = (await (await request.get('/clips/manifest.json')).json()) as { file: string; class: string }[];
    await page.goto('/');
    const found: string[] = [];
    for (const clip of manifest) {
      await runChip(page, NAME_OF[clip.class]);
      found.push((await rows(page).first().getAttribute('data-class')) ?? '');
    }
    expect(found).toEqual(manifest.map((c) => c.class));
    expect(modelLoads).toHaveLength(1);
  });

  test('a page load and a run make only allowed same-origin GET requests, with no console problem', async ({ page, baseURL }) => {
    test.setTimeout(MODEL_TIMEOUT + 60_000);
    const origin = new URL(baseURL!).origin;
    const problems = watch(page, origin);
    const bad: string[] = [];
    page.on('request', (r) => {
      const url = new URL(r.url());
      if (!url.protocol.startsWith('http')) return;
      if (r.method() !== 'GET' || url.origin !== origin || !ALLOWED_PATHS.some((p) => p.test(url.pathname))) bad.push(`${r.method()} ${r.url()}`);
    });
    await page.goto('/');
    await runChip(page, 'Knock');
    expect(bad).toEqual([]);
    expect(problems, problems.join('\n')).toEqual([]);
  });

  test('keyboard: tab order, arrow keys on the side control play nothing, Enter and Space on a chip run it', async ({ page, request }) => {
    test.setTimeout(MODEL_TIMEOUT + 60_000);
    const manifest = (await (await request.get('/clips/manifest.json')).json()) as { class: string }[];
    await recordMotors(page);
    await page.goto('/');
    await expect(chip(page, 'Voice')).toBeVisible();
    const names: string[] = [];
    for (let i = 0; i < 14; i++) {
      await page.keyboard.press('Tab');
      names.push(
        await page.evaluate(() => {
          const el = document.activeElement as HTMLElement;
          if (el instanceof HTMLInputElement) return `radio:${el.labels?.[0]?.textContent?.trim()}`;
          return `${el.tagName.toLowerCase()}:${el.textContent?.trim()}`;
        }),
      );
    }
    expect(names).toEqual([
      'a:Banshee Band',
      'a:Band simulator',
      'button:Settings',
      'button:Day',
      'button:Night',
      'button:Start listening',
      'radio:Centre',
      // The chips follow the manifest order (R4.1).
      ...manifest.map((c) => `button:${NAME_OF[c.class]}`),
      'a:Styleguide',
    ]);

    // The ghost field, the alert, the list and the simulator hold nothing focusable.
    for (const card of ['ghosts', 'alerts', 'simulator', 'pipeline']) await expect(page.locator(`[data-card="${card}"]`).locator(FOCUSABLE)).toHaveCount(0);

    await page.getByLabel('Centre', { exact: true }).focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByLabel('Right', { exact: true })).toBeChecked();
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');
    await expect(page.getByLabel('Left', { exact: true })).toBeChecked();
    await expect(rows(page)).toHaveCount(0);
    expect(await motorLevels(page)).toEqual({ left: [], right: [] });

    await chip(page, 'Knock').focus();
    await page.keyboard.press('Enter');
    await expect(rows(page)).toHaveCount(1, { timeout: MODEL_TIMEOUT });
    await expect(rows(page).first()).toHaveAttribute('data-class', 'knock');
    await chip(page, 'Doorbell').focus();
    await page.keyboard.press('Space');
    await expect(rows(page)).toHaveCount(2, { timeout: 60_000 });
    await expect(rows(page).first()).toHaveAttribute('data-class', 'doorbell');
  });

  test('reduced motion: no animation or transition runs after a run', async ({ page }) => {
    test.setTimeout(MODEL_TIMEOUT + 60_000);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await runChip(page, 'Knock');
    expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
  });

  test('layout at 1440 px: ghost field left of the list, pipeline below both and as wide as the content', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await expect(chip(page, 'Voice')).toBeVisible();
    const title = await box(page, 'h1');
    const tryCard = await box(page, '[data-card="try"]');
    const ghosts = await box(page, '[data-card="ghosts"]');
    const alerts = await box(page, '[data-card="alerts"]');
    const sim = await box(page, '[data-card="simulator"]');
    const pipeline = await box(page, '[data-card="pipeline"]');

    expect(tryCard.y).toBeGreaterThan(title.y + title.height);
    expect(ghosts.y).toBeGreaterThanOrEqual(tryCard.y + tryCard.height);
    expect(ghosts.x + ghosts.width).toBeLessThanOrEqual(alerts.x);
    expect(ghosts.width).toBeGreaterThan(alerts.width);
    expect(Math.abs(ghosts.y - alerts.y)).toBeLessThanOrEqual(1);
    expect(ghosts.height).toBeGreaterThanOrEqual(480);
    expect(sim.y).toBeGreaterThanOrEqual(alerts.y + alerts.height);
    expect(pipeline.y).toBeGreaterThanOrEqual(Math.max(ghosts.y + ghosts.height, sim.y + sim.height));
    expect(Math.abs(pipeline.width - tryCard.width)).toBeLessThanOrEqual(1);
    expect(Math.abs(pipeline.x - tryCard.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(pipeline.x - ghosts.x)).toBeLessThanOrEqual(1);
    expect(await page.locator('[data-card="ghosts"] canvas').evaluate((c) => c.clientHeight)).toBeGreaterThanOrEqual(360);
  });

  test('layout at 390 px: one column, no sideways scroll, chips in the lower 45%, nothing behind the bar', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await expect(chip(page, 'Voice')).toBeVisible();
    const { scrollWidth, innerWidth } = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth }));
    expect(scrollWidth, 'page scrolls horizontally').toBeLessThanOrEqual(innerWidth);

    const title = await box(page, 'h1');
    const ghosts = await box(page, '[data-card="ghosts"]');
    const alerts = await box(page, '[data-card="alerts"]');
    const sim = await box(page, '[data-card="simulator"]');
    const pipeline = await box(page, '[data-card="pipeline"]');
    expect(ghosts.y).toBeGreaterThan(title.y);
    expect(ghosts.y + ghosts.height).toBeLessThanOrEqual(alerts.y);
    expect(alerts.y + alerts.height).toBeLessThanOrEqual(sim.y);
    expect(sim.y + sim.height).toBeLessThanOrEqual(pipeline.y);

    // The bar is compact: the Start listening row, one row for the side, one sideways-scrolling row of chips,
    // the simulated-side sentence.
    const bar0 = await box(page, '.bb-station-controls');
    expect(bar0.height).toBeLessThanOrEqual(240);
    expect(await page.locator('.bb-station-controls').evaluate((b) => b.scrollWidth - b.clientWidth), 'the bar overflows sideways').toBeLessThanOrEqual(0);
    const chipTops = await Promise.all(CHIP_NAMES.map(async (n) => Math.round((await chip(page, n).boundingBox())!.y)));
    expect(new Set(chipTops).size, `chip rows at ${chipTops.join(', ')}`).toBe(1);
    // First view: a lone ghost and its label sit in the top 240 px of the 360 px field (urgent block 8 + (312 - 138) / 2 + 138 = 233).
    const canvas = await box(page, '[data-card="ghosts"] canvas');
    expect(canvas.y + 240).toBeLessThanOrEqual(bar0.y);

    const lowest45 = 844 * 0.55;
    const targets = [...CHIP_NAMES.map((n) => chip(page, n)), ...['Left', 'Centre', 'Right'].map((n) => page.locator('label', { has: page.getByLabel(n, { exact: true }) }))];
    for (const t of targets) {
      const b = (await t.boundingBox())!;
      expect(b.y).toBeGreaterThanOrEqual(lowest45);
      expect(b.y + b.height).toBeLessThanOrEqual(844);
    }

    // Scrolled to the end, the footer clears the fixed bar.
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    const bar = await box(page, '.bb-station-controls');
    const footer = await box(page, 'footer');
    expect(footer.y + footer.height).toBeLessThanOrEqual(bar.y);
  });

  test('the Band simulator link leads to the band simulator page', async ({ page }) => {
    await page.goto('/');
    const link = page.getByRole('banner').getByRole('link', { name: 'Band simulator' });
    await expect(link).toHaveAttribute('href', '/band.html');
    await link.click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Band simulator');
  });

  test('empty states before the first run, and the status pill for a phone that can vibrate', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('No sounds yet. Choose a sound to try.', { exact: true })).toBeVisible();
    await expect(rows(page)).toHaveCount(0);
    await expect(page.locator('#latest-alert')).toHaveText('No sound yet');
    await expect(idle(page)).toBeVisible();
    await expect(idle(page)).toContainText('All quiet');
    await expect(page.getByRole('list', { name: 'Urgency key' }).getByRole('listitem')).toHaveText(['Low', 'Medium', 'Urgent']);
    await expect(stages(page)).toHaveCount(5);
    await expect(stages(page).getByText('— ms', { exact: true })).toHaveCount(5);
    await expect(stages(page).locator('[data-ms]')).toHaveCount(0);
    await expect(page.locator('#station-status [role="status"]')).toHaveText('Phone vibration fallback');
    await expect(page.locator('#station-status svg')).toHaveAttribute('data-glyph', 'triangle');
    await expect(message(page)).toHaveText('');
  });

  test('without navigator.vibrate the status pill says the band is not connected', async ({ page }) => {
    await page.addInitScript(() => {
      delete (Navigator.prototype as { vibrate?: unknown }).vibrate;
    });
    await page.goto('/');
    await expect(page.locator('#station-status [role="status"]')).toHaveText('Band not connected');
    await expect(page.locator('#station-status svg')).toHaveAttribute('data-glyph', 'circle');
  });

  test('a failed clip request says the clip could not be loaded and adds no row', async ({ page }) => {
    test.setTimeout(MODEL_TIMEOUT + 60_000);
    await page.route('**/clips/knock-01.wav', (route) => route.abort());
    await page.goto('/');
    await chip(page, 'Knock').click();
    await expect(message(page)).toHaveText('Loading the sound model');
    await expect(chip(page, 'Knock')).toHaveAttribute('aria-disabled', 'true');
    await expect(chip(page, 'Knock')).not.toHaveAttribute('disabled');
    await expect(message(page)).toHaveText('The clip could not be loaded.', { timeout: MODEL_TIMEOUT });
    await expect(chip(page, 'Knock')).not.toHaveAttribute('aria-disabled', 'true');
    await expect(rows(page)).toHaveCount(0);
    await expect(ghostItems(page)).toHaveCount(0);
    await expect(page.locator('#latest-alert')).toHaveText('No sound yet');
  });
});
