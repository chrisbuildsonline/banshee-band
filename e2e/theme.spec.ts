import { expect, test } from './fixtures';

const PAGES = ['/', '/band.html', '/styleguide.html'];
const pressed = (page: import('@playwright/test').Page, name: 'Day' | 'Night') => page.getByRole('button', { name, exact: true });

test.describe('theme', () => {
  test('every page opens in Night, even when the OS asks for light', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    for (const path of PAGES) {
      await page.goto(path);
      await expect(page.locator('html'), path).toHaveAttribute('data-theme', 'night');
      await expect(pressed(page, 'Night'), path).toHaveAttribute('aria-pressed', 'true');
      await expect(pressed(page, 'Day'), path).toHaveAttribute('aria-pressed', 'false');
      const canvas = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--bb-color-canvas').trim());
      expect(canvas.toUpperCase(), path).toBe('#0E0B14');
    }
  });

  test('a chosen Day is saved and wins on reload and on the other pages', async ({ page }) => {
    await page.goto('/');
    await pressed(page, 'Day').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'day');
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'day');
    await expect(pressed(page, 'Day')).toHaveAttribute('aria-pressed', 'true');
    await page.goto('/band.html');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'day');
    await pressed(page, 'Night').click();
    await page.goto('/styleguide.html');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'night');
  });

  test('without JavaScript every page still opens in Night', async ({ browser, baseURL }) => {
    const context = await browser.newContext({ baseURL, javaScriptEnabled: false, colorScheme: 'light' });
    const page = await context.newPage();
    for (const path of PAGES) {
      await page.goto(path);
      expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor), path).toBe('rgb(14, 11, 20)');
    }
    await context.close();
  });

  test('a saved choice wins over the OS setting', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.addInitScript(() => localStorage.setItem('banshee-band.theme.v1', 'day'));
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'day');
    await expect(pressed(page, 'Day')).toHaveAttribute('aria-pressed', 'true');
  });

  test('with storage blocked the toggle still works for the page', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, 'localStorage', {
        get() {
          throw new Error('blocked');
        },
      });
    });
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/band.html');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'night');
    await pressed(page, 'Day').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'day');
    expect(errors).toEqual([]);
  });
});
