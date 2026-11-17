import { resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';

const SCREENSHOTS = resolve(import.meta.dirname, 'screenshots');
const MODULE = '/src/ghosts/index.ts';
const START = new Date('2026-10-31T12:00:00Z');
const PAUSED = new Date('2026-10-31T12:05:00Z');
const FOCUSABLE = 'a[href], button, input, select, textarea, [tabindex], [contenteditable]';

/** Records console errors and warnings, page errors, failed requests and requests to any other origin. */
function watch(page: Page, origin: string): string[] {
  const problems: string[] = [];
  page.on('console', (msg) => {
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

/** Counts requestAnimationFrame callbacks; callbacks registered while `__tag` is set are counted apart. */
async function countFrames(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as { __rafRuns: number; __taggedRuns: number; __tag: boolean; __tagged: Set<unknown> };
    w.__rafRuns = 0;
    w.__taggedRuns = 0;
    w.__tag = false;
    w.__tagged = new Set();
    const original = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (cb: FrameRequestCallback) => {
      if (w.__tag) w.__tagged.add(cb);
      return original((t) => {
        w.__rafRuns++;
        if (w.__tagged.has(cb)) w.__taggedRuns++;
        cb(t);
      });
    };
  });
}

interface Ev {
  class?: string;
  label?: string;
  urgency?: string;
  bearingDeg?: number | null;
  bearingSource?: string;
}

/** Mounts a fresh 600 px test field through the dev server's module graph, as `window.__field`. */
async function mountTestField(page: Page, options?: { ttlMs?: number }): Promise<void> {
  await page.evaluate(
    async ({ url, options }) => {
      const { mountGhostField } = await import(url);
      const host = document.createElement('div');
      host.id = 'test-field';
      host.style.width = '600px';
      document.body.append(host);
      (window as unknown as { __field: unknown }).__field = mountGhostField(host, options);
    },
    { url: MODULE, options },
  );
}

/** Calls `__field.show` with a valid event built from overrides (or a raw value when `raw` is set). */
function show(page: Page, ev: Ev = {}, bearingConfidence: number = 0.95, tag = false): Promise<boolean> {
  return page.evaluate(
    ({ ev, bearingConfidence, tag }) => {
      const w = window as unknown as { __field: { show(v: unknown): boolean }; __tag: boolean };
      const event = { id: 'e', t: 0, class: 'knock', label: 'Knock', confidence: 0.9, bearingDeg: -60, bearingSource: 'gcc-phat', loudnessDb: -20, urgency: 'medium', ...ev };
      w.__tag = tag;
      const r = w.__field.show({ event, bearingConfidence });
      w.__tag = false;
      return r;
    },
    { ev, bearingConfidence, tag },
  );
}

const showRaw = (page: Page, value: unknown) => page.evaluate((v) => (window as unknown as { __field: { show(v: unknown): boolean } }).__field.show(v), value);
const items = (page: Page) => page.locator('#test-field li');
const canvas = (page: Page) => page.locator('#test-field canvas');

/** Pixels within 24 per channel of the computed ghost fill or outline, in thirds of the canvas: [left, middle, right]. */
function accentThirds(page: Page): Promise<number[]> {
  return page.locator('#test-field canvas').evaluate((c: HTMLCanvasElement) => {
    const style = getComputedStyle(c);
    const hex = (name: string) => {
      const v = style.getPropertyValue(name).trim().replace('#', '');
      return [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16));
    };
    const targets = [hex('--bb-ghost-fill'), hex('--bb-ghost-outline')];
    const { data, width, height } = c.getContext('2d')!.getImageData(0, 0, c.width, c.height);
    const thirds = [0, 0, 0];
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        if (data[i + 3] <= 200) continue;
        if (targets.some((t) => Math.abs(data[i] - t[0]) <= 24 && Math.abs(data[i + 1] - t[1]) <= 24 && Math.abs(data[i + 2] - t[2]) <= 24)) thirds[Math.min(2, Math.floor((x / width) * 3))]++;
      }
    }
    return thirds;
  });
}

test.describe('ghost field', () => {
  test('a knock at -60 degrees is drawn on the left and listed as left', async ({ page, baseURL }) => {
    const problems = watch(page, new URL(baseURL!).origin);
    await page.goto('/styleguide.html');
    await mountTestField(page);
    expect(await show(page, { bearingDeg: -60 }, 0.95)).toBe(true);
    await expect(items(page)).toHaveCount(1);
    const li = items(page).first();
    await expect(li).toHaveAttribute('data-class', 'knock');
    await expect(li).toHaveAttribute('data-side', 'left');
    await expect(li).toHaveAttribute('data-urgency', 'medium');
    await expect(li).toHaveText('Knock, left, medium');
    expect(Number(await li.getAttribute('data-x'))).toBeLessThan(0.5);
    // Wait out the 400 ms fade-in, so the pixels are at full strength.
    await page.waitForTimeout(600);
    const [left, , right] = await accentThirds(page);
    expect(left).toBeGreaterThan(0);
    expect(right).toBe(0);
    await expect(canvas(page)).toHaveAttribute('role', 'img');
    await expect(canvas(page)).toHaveAttribute('aria-label', 'Sound field. Now: Knock, left, medium');
    expect(problems, problems.join('\n')).toEqual([]);
  });

  test('an uncertain ghost is centred and says side unknown', async ({ page }) => {
    await page.goto('/styleguide.html');
    await mountTestField(page);
    expect(await show(page, { class: 'baby', label: 'Baby crying', urgency: 'high', bearingDeg: -60 }, 0.5)).toBe(true);
    const li = items(page).first();
    await expect(li).toHaveAttribute('data-side', 'unknown');
    await expect(li).toContainText('side unknown');
    await expect(canvas(page)).toHaveAttribute('aria-label', /side unknown/);
    const g = await page.evaluate(() => {
      const f = (window as unknown as { __field: { ghosts(): { sideText: string; x: number; labelText: string }[] } }).__field;
      return { ghost: f.ghosts()[0], width: document.querySelector<HTMLCanvasElement>('#test-field canvas')!.clientWidth };
    });
    expect(g.ghost.sideText).toBe('Side unknown');
    expect(g.ghost.labelText).toBe('Baby crying · Side unknown · Urgent');
    expect(g.ghost.x).toBe(g.width / 2);
  });

  test('invalid input returns false and changes nothing; show after destroy is false', async ({ page }) => {
    await page.goto('/styleguide.html');
    await mountTestField(page);
    await show(page, { bearingDeg: 40 });
    const before = { list: await items(page).allTextContents(), label: await canvas(page).getAttribute('aria-label') };
    expect(await showRaw(page, null)).toBe(false);
    expect(await showRaw(page, {})).toBe(false);
    expect(await showRaw(page, 42)).toBe(false);
    expect(await showRaw(page, { event: { id: 'x', t: 0, class: 'ghoul', label: 'X', confidence: 1, bearingDeg: 0, bearingSource: 'gcc-phat', loudnessDb: -1, urgency: 'low' }, bearingConfidence: 1 })).toBe(false);
    expect(await showRaw(page, { event: { id: 'x', t: 0, class: 'knock', label: '', confidence: 1, bearingDeg: 0, bearingSource: 'gcc-phat', loudnessDb: -1, urgency: 'low' }, bearingConfidence: 1 })).toBe(false);
    expect(await showRaw(page, { event: { id: 'x', t: 0, class: 'knock', label: 'K', confidence: 1, bearingDeg: 200, bearingSource: 'gcc-phat', loudnessDb: -1, urgency: 'low' }, bearingConfidence: 1 })).toBe(false);
    expect(await showRaw(page, { event: { id: 'x', t: 0, class: 'knock', label: 'K', confidence: 1, bearingDeg: 10, bearingSource: 'none', loudnessDb: -1, urgency: 'low' }, bearingConfidence: 1 })).toBe(false);
    expect(await items(page).allTextContents()).toEqual(before.list);
    expect(await canvas(page).getAttribute('aria-label')).toBe(before.label);
    await page.evaluate(() => (window as unknown as { __field: { destroy(): void } }).__field.destroy());
    expect(await show(page)).toBe(false);
  });

  test('a fifth ghost drops the oldest; the newest is first', async ({ page }) => {
    await page.goto('/styleguide.html');
    await mountTestField(page);
    for (const cls of ['knock', 'doorbell', 'alarm', 'baby', 'vehicle']) expect(await show(page, { class: cls })).toBe(true);
    await expect(items(page)).toHaveCount(4);
    expect(await items(page).evaluateAll((els) => els.map((e) => e.getAttribute('data-class')))).toEqual(['vehicle', 'baby', 'alarm', 'doorbell']);
  });

  test('an 80 character label is drawn and the canvas label still names the class', async ({ page, baseURL }) => {
    const problems = watch(page, new URL(baseURL!).origin);
    await page.goto('/styleguide.html');
    await mountTestField(page);
    expect(await show(page, { class: 'vehicle', label: 'V'.repeat(80), bearingDeg: 80 })).toBe(true);
    await expect(canvas(page)).toHaveAttribute('aria-label', 'Sound field. Now: Vehicle, right, medium');
    expect(problems).toEqual([]);
  });

  test('has no focusable element, no live region, and a canvas with role img', async ({ page }) => {
    await page.goto('/styleguide.html');
    const before = await page.locator(FOCUSABLE).count();
    await mountTestField(page);
    await show(page);
    const field = page.locator('#test-field');
    await expect(field.locator(FOCUSABLE)).toHaveCount(0);
    await expect(field.locator('[aria-live], [role="alert"], [role="status"]')).toHaveCount(0);
    await expect(canvas(page)).toHaveAttribute('role', 'img');
    await expect(canvas(page)).not.toHaveAttribute('tabindex');
    expect(await page.locator(FOCUSABLE).count()).toBe(before);
    await expect(field.locator('ul')).not.toHaveAttribute('tabindex');
    await expect(field.getByText('Now:')).toBeVisible();
  });

  test('clear empties the list; destroy removes the elements and stops the frames', async ({ page }) => {
    await countFrames(page);
    await page.goto('/styleguide.html');
    await mountTestField(page);
    await show(page, {}, 0.95, true);
    await page.evaluate(() => (window as unknown as { __field: { clear(): void } }).__field.clear());
    await expect(items(page)).toHaveText(['No sounds yet']);
    await expect(items(page).first()).not.toHaveAttribute('data-class');
    await expect(canvas(page)).toHaveAttribute('aria-label', 'No sounds yet');
    await show(page, {}, 0.95, true);
    await page.waitForTimeout(200);
    expect(await page.evaluate(() => (window as unknown as { __taggedRuns: number }).__taggedRuns)).toBeGreaterThan(0);
    await page.evaluate(() => (window as unknown as { __field: { destroy(): void } }).__field.destroy());
    const after = await page.evaluate(() => (window as unknown as { __taggedRuns: number }).__taggedRuns);
    await expect(page.locator('#test-field *')).toHaveCount(0);
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => (window as unknown as { __taggedRuns: number }).__taggedRuns)).toBe(after);
    await page.evaluate(() => {
      const f = (window as unknown as { __field: { destroy(): void; clear(): void; ghosts(): unknown[] } }).__field;
      f.destroy();
      f.clear();
      return f.ghosts();
    });
  });

  test('clicking Night redraws the canvas in the Night ghost colours', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: 'light' });
    await page.goto('/styleguide.html');
    await mountTestField(page);
    await show(page, { bearingDeg: -60 });
    expect((await accentThirds(page))[0]).toBeGreaterThan(0);
    const dayFill = await canvas(page).evaluate((c) => getComputedStyle(c).getPropertyValue('--bb-ghost-fill').trim());
    await page.getByRole('button', { name: 'Night' }).click();
    const nightFill = await canvas(page).evaluate((c) => getComputedStyle(c).getPropertyValue('--bb-ghost-fill').trim());
    expect(nightFill.toLowerCase()).not.toBe(dayFill.toLowerCase());
    // accentThirds reads the current (Night) tokens, so Night pixels prove the redraw.
    await expect.poll(async () => (await accentThirds(page))[0]).toBeGreaterThan(0);
  });
});

test.describe('motion', () => {
  test('under reduced motion the canvas is still and no frame is requested', async ({ page }) => {
    await countFrames(page);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/styleguide.html');
    await mountTestField(page);
    await page.evaluate(() => ((window as unknown as { __rafRuns: number }).__rafRuns = 0));
    await show(page, { bearingDeg: -60 });
    await show(page, { class: 'alarm', urgency: 'high', bearingDeg: 50 });
    const first = await canvas(page).evaluate((c: HTMLCanvasElement) => c.toDataURL());
    await page.waitForTimeout(500);
    const second = await canvas(page).evaluate((c: HTMLCanvasElement) => c.toDataURL());
    expect(second).toBe(first);
    expect(await page.evaluate(() => (window as unknown as { __rafRuns: number }).__rafRuns)).toBe(0);
  });

  test('with motion allowed frames run, and the ghost keeps its position', async ({ page }) => {
    await countFrames(page);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto('/styleguide.html');
    await mountTestField(page);
    await page.evaluate(() => ((window as unknown as { __rafRuns: number }).__rafRuns = 0));
    await show(page, {}, 0.95, true);
    const pos = () => page.evaluate(() => (window as unknown as { __field: { ghosts(): { x: number; y: number }[] } }).__field.ghosts()[0]);
    const before = await pos();
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => (window as unknown as { __taggedRuns: number }).__taggedRuns)).toBeGreaterThan(0);
    expect(await page.evaluate(() => (window as unknown as { __rafRuns: number }).__rafRuns)).toBeGreaterThan(0);
    expect(await pos()).toEqual(before);
  });

  test('switching to reduced motion while a ghost is live stops the frames', async ({ page }) => {
    await countFrames(page);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto('/styleguide.html');
    await mountTestField(page);
    await show(page, {}, 0.95, true);
    await page.waitForTimeout(200);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.waitForTimeout(100);
    const stopped = await page.evaluate(() => (window as unknown as { __taggedRuns: number }).__taggedRuns);
    await page.waitForTimeout(400);
    expect(await page.evaluate(() => (window as unknown as { __taggedRuns: number }).__taggedRuns)).toBe(stopped);
  });
});

test.describe('life', () => {
  test('a ghost is listed at 7999 ms and gone at 8000 ms', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.clock.install({ time: START });
    await page.goto('/styleguide.html');
    await page.clock.pauseAt(PAUSED);
    await mountTestField(page);
    await show(page);
    await page.clock.runFor(7999);
    await expect(items(page)).toHaveCount(1);
    await expect(items(page).first()).toHaveAttribute('data-class', 'knock');
    await page.clock.runFor(1);
    await expect(items(page)).toHaveText(['No sounds yet']);
    await expect(canvas(page)).toHaveAttribute('aria-label', 'No sounds yet');
  });

  test('ttlMs 1000 leaves at 1000 ms; a second ghost keeps its own expiry', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.clock.install({ time: START });
    await page.goto('/styleguide.html');
    await page.clock.pauseAt(PAUSED);
    await mountTestField(page, { ttlMs: 1000 });
    await show(page);
    await page.clock.runFor(999);
    await expect(items(page).first()).toHaveAttribute('data-class', 'knock');
    await page.clock.runFor(1);
    await expect(items(page)).toHaveText(['No sounds yet']);

    await page.evaluate(() => (window as unknown as { __field: { destroy(): void } }).__field.destroy());
    await page.evaluate(() => document.getElementById('test-field')!.remove());
    await mountTestField(page);
    await show(page, { class: 'knock' });
    await page.clock.runFor(3000);
    await show(page, { class: 'alarm' });
    await page.clock.runFor(5000);
    await expect(items(page)).toHaveCount(1);
    await expect(items(page).first()).toHaveAttribute('data-class', 'alarm');
    await page.clock.runFor(2999);
    await expect(items(page).first()).toHaveAttribute('data-class', 'alarm');
    await page.clock.runFor(1);
    await expect(items(page)).toHaveText(['No sounds yet']);
  });
});

test.describe('device scale factor 2', () => {
  test.use({ deviceScaleFactor: 2 });

  test('the backing store is twice the CSS size', async ({ page }) => {
    await page.goto('/styleguide.html');
    await mountTestField(page);
    await show(page);
    await expect
      .poll(() => canvas(page).evaluate((c: HTMLCanvasElement) => [c.width - Math.round(c.clientWidth * 2), c.height - Math.round(c.clientHeight * 2)]))
      .toEqual([0, 0]);
    expect(await canvas(page).evaluate((c: HTMLCanvasElement) => c.clientHeight)).toBeGreaterThanOrEqual(360);
  });
});

test.describe('styleguide showcase', () => {
  test('shows the four demo ghosts and the 21 glyphs', async ({ page, baseURL }) => {
    const problems = watch(page, new URL(baseURL!).origin);
    await page.goto('/styleguide.html');
    const section = page.locator('#ghosts');
    await expect(section.getByRole('heading', { level: 2, name: 'Ghosts' })).toBeVisible();
    const demo = section.locator('.bb-ghost-field li');
    await expect(demo).toHaveCount(4);
    const rows = await demo.evaluateAll((els) => els.map((e) => [e.getAttribute('data-class'), e.getAttribute('data-side'), e.getAttribute('data-urgency')]));
    expect(rows).toEqual([
      ['alarm', 'right', 'high'],
      ['knock', 'left', 'medium'],
      ['voice', 'centre', 'low'],
      ['baby', 'unknown', 'high'],
    ]);
    await expect(section.locator('canvas')).toHaveAttribute('aria-label', 'Sound field. Now: Alarm, right, urgent; Knock, left, medium; Voice, centre, low; Baby, side unknown, urgent');

    const glyphs = section.locator('svg.bb-ghost-glyph');
    await expect(glyphs).toHaveCount(21);
    await expect(glyphs.first()).toHaveAttribute('aria-hidden', 'true');
    for (const name of ['Knock', 'Doorbell', 'Alarm', 'Baby', 'Vehicle', 'Voice', 'Other']) await expect(section.locator('.bb-glyphs__name', { hasText: new RegExp(`^${name}$`) })).toHaveCount(3);
    for (const word of ['Low', 'Medium', 'Urgent']) await expect(section.locator('.bb-glyphs__urgency', { hasText: new RegExp(`^${word}$`) })).toHaveCount(1);
    const sizes = await section.locator('.bb-glyphs__row').evaluateAll((rs) => rs.map((r) => [...r.querySelectorAll('svg')].map((s) => [s.getAttribute('width'), s.querySelector('path')!.getAttribute('stroke-width')])[0]));
    expect(sizes).toEqual([['24', '1.5'], ['32', '2.5'], ['40', '3.5']]);
    await expect(section.locator(FOCUSABLE)).toHaveCount(0);
    await expect(section).toContainText('Nothing else carries meaning.');
    expect(problems, problems.join('\n')).toEqual([]);
  });

  for (const width of [1440, 390] as const) {
    for (const theme of ['day', 'night'] as const) {
      test(`screenshot of the Ghosts section at ${width}px in ${theme}`, async ({ page, baseURL }) => {
        const problems = watch(page, new URL(baseURL!).origin);
        await page.setViewportSize({ width, height: width === 1440 ? 900 : 844 });
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await page.goto('/styleguide.html');
        await page.getByRole('button', { name: theme === 'day' ? 'Day' : 'Night' }).click();
        await page.mouse.move(0, 0);
        await page.evaluate(() => document.fonts.ready);
        const { scrollWidth, innerWidth } = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth }));
        expect(scrollWidth, 'page scrolls horizontally').toBeLessThanOrEqual(innerWidth);
        await expect(page.locator('#ghosts .bb-ghost-field li')).toHaveCount(4);
        await page.locator('#ghosts').screenshot({ path: resolve(SCREENSHOTS, `ghosts-${width}-${theme}.png`) });
        expect(problems, problems.join('\n')).toEqual([]);
      });
    }
  }
});
