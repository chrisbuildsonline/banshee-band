import { resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';

const SCREENSHOTS = resolve(import.meta.dirname, 'screenshots');
const VIEWPORTS = [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
] as const;
const THEMES = ['day', 'night'] as const;
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';

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

for (const viewport of VIEWPORTS) {
  for (const theme of THEMES) {
    test(`renders cleanly at ${viewport.width}px in ${theme}`, async ({ page, baseURL }) => {
      await page.setViewportSize(viewport);
      const problems = watch(page, new URL(baseURL!).origin);

      await page.goto('/styleguide.html', { waitUntil: 'load' });
      // Set data-theme through the page's own theme control, so its pressed state matches the screenshot.
      await page.getByRole('button', { name: theme === 'day' ? 'Day' : 'Night' }).click();
      expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe(theme);
      await page.mouse.move(0, 0);
      await page.evaluate(() => document.fonts.ready);
      await page.waitForFunction(() => document.getAnimations().every((a) => !(a instanceof CSSTransition) || a.playState !== 'running'));

      const { scrollWidth, innerWidth } = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
      }));
      expect(scrollWidth, 'page scrolls horizontally').toBeLessThanOrEqual(innerWidth);

      // The theme really changed the canvas (Day and Night canvases differ).
      const canvas = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
      expect(canvas).toBe(theme === 'day' ? 'rgb(238, 240, 244)' : 'rgb(14, 11, 20)');

      await page.screenshot({ path: resolve(SCREENSHOTS, `styleguide-${viewport.width}-${theme}.png`), fullPage: true });
      if (theme === 'day') await page.screenshot({ path: resolve(SCREENSHOTS, `styleguide-${viewport.width}.png`), fullPage: true });

      expect(problems, problems.join('\n')).toEqual([]);
    });
  }
}

test('has the expected structure and content', async ({ page }) => {
  await page.goto('/styleguide.html');
  await expect(page.locator('main')).toHaveCount(1);
  await expect(page.locator('h1')).toHaveCount(1);

  // Headings never skip a level.
  const levels = await page.locator('h1, h2, h3, h4, h5, h6').evaluateAll((els) => els.map((el) => Number(el.tagName[1])));
  expect(levels[0]).toBe(1);
  levels.slice(1).forEach((level, i) => expect(level - levels[i], `heading jumps from h${levels[i]} to h${level}`).toBeLessThanOrEqual(1));

  for (const label of ['Listening', 'Paused', 'Band connected', 'Band not connected', 'Phone vibration fallback', 'Problem']) {
    await expect(page.locator('.bb-status', { hasText: new RegExp(`^\\S*\\s*${label}$`) }).first()).toBeVisible();
  }
  for (const step of ['display', 'title', 'heading', 'body', 'label', 'caption']) {
    await expect(page.getByText(`--bb-type-${step}-size`)).toBeVisible();
  }
  await expect(page.locator('.bb-pill--primary')).toBeVisible();
  await expect(page.locator('.bb-pill--secondary').first()).toBeVisible();
  await expect(page.locator('.bb-pill[disabled]')).toBeVisible();
  await expect(page.locator('.bb-card').first()).toBeVisible();
  await expect(page.locator('.bb-event time').first()).toBeVisible();
  await expect(page.getByText('Banshee Band is an aid, not a safety device.')).toBeVisible();
});

test('every interactive element takes focus in DOM order with a visible ring, and is at least 44px', async ({ page }) => {
  await page.goto('/styleguide.html');
  const count = await page.locator(FOCUSABLE).count();
  expect(count).toBeGreaterThan(0);

  for (let expected = 0; expected < count; expected++) {
    await page.keyboard.press('Tab');
    const focus = await page.evaluate((selector) => {
      const el = document.activeElement as HTMLElement | null;
      const all = [...document.querySelectorAll<HTMLElement>(selector)];
      if (!el) return null;
      const style = getComputedStyle(el);
      const box = el.getBoundingClientRect();
      return {
        index: all.indexOf(el),
        name: el.textContent?.trim() ?? el.tagName,
        ring: style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0 && style.outlineColor !== 'rgba(0, 0, 0, 0)',
        width: box.width,
        height: box.height,
      };
    }, FOCUSABLE);
    expect(focus, `Tab ${expected + 1} focused nothing`).not.toBeNull();
    expect(focus!.index, `Tab ${expected + 1} focused "${focus!.name}" out of DOM order`).toBe(expected);
    expect(focus!.ring, `"${focus!.name}" has no visible focus ring`).toBe(true);
    expect(focus!.width, `"${focus!.name}" is narrower than 44px`).toBeGreaterThanOrEqual(44);
    expect(focus!.height, `"${focus!.name}" is shorter than 44px`).toBeGreaterThanOrEqual(44);
  }
});

test('the theme control works by keyboard', async ({ page }) => {
  await page.goto('/styleguide.html');
  const night = page.getByRole('button', { name: 'Night' });
  const day = page.getByRole('button', { name: 'Day' });
  const theme = () => page.evaluate(() => document.documentElement.dataset.theme);

  await night.focus();
  await page.keyboard.press('Enter');
  expect(await theme()).toBe('night');
  await expect(night).toHaveAttribute('aria-pressed', 'true');
  await expect(day).toHaveAttribute('aria-pressed', 'false');

  await day.focus();
  await page.keyboard.press('Space');
  expect(await theme()).toBe('day');
  await expect(day).toHaveAttribute('aria-pressed', 'true');
  await expect(night).toHaveAttribute('aria-pressed', 'false');
});

test('runs no animation under prefers-reduced-motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/styleguide.html');
  for (const theme of THEMES) {
    await page.getByRole('button', { name: theme === 'day' ? 'Day' : 'Night' }).click();
    const running = await page.evaluate(() =>
      document.getAnimations().filter((a) => a.playState === 'running').map((a) => (a as CSSAnimation).animationName ?? 'transition'),
    );
    expect(running, `running animations in ${theme}`).toEqual([]);
  }
});

test('shows all static content in the Night theme without JavaScript', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, baseURL, colorScheme: 'light' });
  const page = await context.newPage();
  await page.goto('/styleguide.html');
  await expect(page.locator('h1')).toBeVisible();
  await expect(page.locator('.bb-event').first()).toBeVisible();
  await expect(page.getByText('Banshee Band is an aid, not a safety device.')).toBeVisible();
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe('rgb(14, 11, 20)');
  await context.close();
});
