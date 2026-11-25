import { resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';

// Pattern timings come from src/haptics/patterns.json (haptics design, pattern table):
// knock is 70 on, 100 off, 70 on, so a knock command lasts 240 ms.
const KNOCK_VIBRATE = [70, 100, 70];
const KNOCK_TOTAL_MS = 240;

const SCREENSHOTS = resolve(import.meta.dirname, 'screenshots');
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]';
const START = new Date('2026-10-31T12:00:00Z');
const PAUSED = new Date('2026-10-31T12:05:00Z');

type Vibrate = 'stub' | 'none' | 'native';

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

/**
 * Opens band.html with fake timers paused, so the simulator only moves when the test runs the clock.
 * `vibrate`: 'stub' records every navigator.vibrate call in window.__vibrateCalls, 'none' removes it.
 */
async function open(page: Page, vibrate: Vibrate = 'stub'): Promise<void> {
  await page.addInitScript((mode) => {
    const w = window as unknown as { __vibrateCalls: unknown[]; __micAsked: boolean };
    w.__vibrateCalls = [];
    w.__micAsked = false;
    if (mode === 'stub') {
      Object.defineProperty(Navigator.prototype, 'vibrate', {
        configurable: true,
        writable: true,
        value(this: Navigator, p: unknown) {
          if (this !== navigator) throw new TypeError('Illegal invocation');
          w.__vibrateCalls.push(Array.isArray(p) ? [...p] : p);
          return true;
        },
      });
    } else if (mode === 'none') {
      delete (Navigator.prototype as { vibrate?: unknown }).vibrate;
    }
    if (navigator.mediaDevices) {
      navigator.mediaDevices.getUserMedia = () => {
        w.__micAsked = true;
        return Promise.reject(new Error('not allowed in this test'));
      };
    }
  }, vibrate);
  await page.clock.install({ time: START });
  await page.goto('/band.html');
  await page.clock.pauseAt(PAUSED);
}

const level = (page: Page, side: 'left' | 'right') => page.locator(`[data-motor="${side}"]`).getAttribute('data-level').then(Number);
const levels = async (page: Page) => ({ left: await level(page, 'left'), right: await level(page, 'right') });
const fillWidth = (page: Page, side: 'left' | 'right') => page.locator(`[data-motor="${side}"] .bb-motor__fill`).evaluate((el) => (el as HTMLElement).style.width);
const vibrateCalls = (page: Page) => page.evaluate(() => (window as unknown as { __vibrateCalls: unknown[] }).__vibrateCalls);
const chip = (page: Page, name: string) => page.getByRole('group', { name: 'Sound' }).getByRole('button', { name, exact: true });
const side = (page: Page, name: string) => page.getByRole('radio', { name, exact: true });

async function choose(page: Page, sideName: string, sound: string): Promise<void> {
  await side(page, sideName).check();
  await chip(page, sound).click();
}

test.describe('band simulator page', () => {
  test('has one main, one h1 and the regions in reading order', async ({ page }) => {
    await open(page);
    await expect(page.locator('main')).toHaveCount(1);
    await expect(page.locator('h1')).toHaveCount(1);
    await expect(page.locator('h1')).toHaveText('Band simulator');
    await expect(page).toHaveTitle('Band simulator - Banshee Band');

    const levelsOf = await page.locator('h1, h2, h3, h4, h5, h6').evaluateAll((els) => els.map((el) => Number(el.tagName[1])));
    expect(levelsOf[0]).toBe(1);
    levelsOf.slice(1).forEach((l, i) => expect(l - levelsOf[i], `heading jumps from h${levelsOf[i]} to h${l}`).toBeLessThanOrEqual(1));

    const order = await page.evaluate(() => {
      const pick = (s: string) => document.querySelector(s);
      const parts = [pick('header'), pick('.bb-title-block'), pick('.bb-feel'), pick('[data-motor="left"]'), pick('[data-motor="right"]'), pick('.bb-timeline'), pick('footer')];
      if (parts.some((p) => p === null)) return 'missing';
      return parts.every((p, i) => i === 0 || (parts[i - 1]!.compareDocumentPosition(p!) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0);
    });
    expect(order).toBe(true);

    await expect(page.locator('footer')).toContainText(
      'Banshee Band is an aid, not a safety device. It can miss or misread sounds, so keep your smoke alarms and other certified alerting devices.',
    );
    await expect(page.locator('.bb-title-block')).toContainText('simulator of the wrist band');
    await expect(page.locator('.bb-title-block')).toContainText('on the wristband too when you connect one.');
    await expect(page.getByRole('heading', { name: 'Feel a pattern' })).toBeVisible();
    // The only primary action is Connect band, and only where the browser has Bluetooth (e2e/band-link.spec.ts).
    await expect(page.locator('.bb-pill--primary').filter({ hasNotText: 'Connect band' })).toHaveCount(0);
    // Nothing says a band is connected before one is.
    await expect(page.getByText(/band connected\b(?!\.)|connected to/i)).toHaveCount(0);
    await expect(page.locator('a.bb-brand')).toHaveAttribute('href', /index\.html$/);
  });

  test('shows 0 and "No pattern yet" before anything plays', async ({ page }) => {
    await open(page);
    expect(await levels(page)).toEqual({ left: 0, right: 0 });
    await expect(page.locator('[data-motor="left"] .bb-motor__num')).toHaveText('0');
    await expect(page.locator('.bb-timeline__name')).toHaveText('No pattern yet');
    await expect(page.locator('.bb-timeline__lanes rect.bb-lane__mark')).toHaveCount(0);
    await expect(page.locator('.bb-sim')).not.toHaveAttribute('data-side');
    await expect(side(page, 'Centre')).toBeChecked();
  });

  test('Knock with Left: the left motor is stronger and the text says so', async ({ page }) => {
    await open(page);
    await choose(page, 'Left', 'Knock');
    const l = await levels(page);
    expect(l.left).toBeGreaterThan(l.right);
    expect(l.right).toBeGreaterThan(0);
    await expect(page.locator('.bb-timeline__name')).toContainText('left stronger');
    await expect(page.locator('.bb-timeline__name')).toHaveText('Knock, left stronger');
    await expect(page.locator('.bb-sim')).toHaveAttribute('data-side', 'left');
    await expect(page.locator('[data-motor="left"] .bb-motor__num')).toHaveText(String(l.left));
    await expect(page.locator('[data-motor="right"] .bb-motor__num')).toHaveText(String(l.right));
    await expect(page.locator('.bb-timeline__count')).toHaveText('2 pulses, 240 ms');
    await expect(page.locator('.bb-timeline__scale')).toContainText('0 ms');
    await expect(page.locator('.bb-timeline__scale')).toContainText('240 ms');
    // Two pulses on each lane, the left marks taller than the right ones.
    const marks = await page.locator('rect.bb-lane__mark').evaluateAll((els) => els.map((el) => ({ lane: el.getAttribute('data-lane'), h: Number(el.getAttribute('height')) })));
    expect(marks.filter((m) => m.lane === 'left')).toHaveLength(2);
    expect(marks.filter((m) => m.lane === 'right')).toHaveLength(2);
    expect(Math.min(...marks.filter((m) => m.lane === 'left').map((m) => m.h))).toBeGreaterThan(Math.max(...marks.filter((m) => m.lane === 'right').map((m) => m.h)));
    await expect(page.locator('[data-motor="left"]')).toHaveCSS('outline-style', 'none');
  });

  test('Unknown: equal levels, its own words and glyph, dashed outline on both motor cards', async ({ page }) => {
    await open(page);
    await choose(page, 'Unknown', 'Knock');
    const l = await levels(page);
    expect(l.left).toBe(l.right);
    expect(l.left).toBeGreaterThan(0);
    await expect(page.locator('.bb-timeline__name')).toContainText('Side unknown');
    await expect(page.locator('.bb-sim')).toHaveAttribute('data-side', 'unknown');
    await expect(page.locator('[data-motor="left"]')).toHaveCSS('outline-style', 'dashed');
    await expect(page.locator('[data-motor="right"]')).toHaveCSS('outline-style', 'dashed');
    await expect(page.locator('.bb-timeline__glyph svg')).toHaveAttribute('data-glyph', 'question');
    await expect(page.locator('.bb-timeline__glyph svg')).toHaveAttribute('aria-hidden', 'true');
  });

  test('Centre: equal levels, "both motors, centre", a solid or no outline', async ({ page }) => {
    await open(page);
    await choose(page, 'Centre', 'Doorbell');
    const l = await levels(page);
    expect(l.left).toBe(l.right);
    expect(l.left).toBeGreaterThan(0);
    await expect(page.locator('.bb-timeline__name')).toHaveText('Doorbell, both motors, centre');
    await expect(page.locator('.bb-sim')).toHaveAttribute('data-side', 'centre');
    await expect(page.locator('.bb-timeline__glyph svg')).toHaveAttribute('data-glyph', 'centre');
    for (const motor of ['left', 'right']) {
      const style = await page.locator(`[data-motor="${motor}"]`).evaluate((el) => getComputedStyle(el).outlineStyle);
      expect(['none', 'solid']).toContain(style);
    }
  });

  test('Right: the right motor is stronger', async ({ page }) => {
    await open(page);
    await choose(page, 'Right', 'Vehicle');
    const l = await levels(page);
    expect(l.right).toBeGreaterThan(l.left);
    await expect(page.locator('.bb-timeline__name')).toHaveText('Vehicle, right stronger');
    await expect(page.locator('.bb-timeline__glyph svg')).toHaveAttribute('data-glyph', 'right');
  });

  test('the levels return to 0 at totalMs and not before', async ({ page }) => {
    await open(page);
    await choose(page, 'Left', 'Knock');
    const first = await levels(page);
    await page.clock.runFor(KNOCK_TOTAL_MS - 1);
    expect(await levels(page)).toEqual(first);
    await page.clock.runFor(1);
    expect(await levels(page)).toEqual({ left: 0, right: 0 });
    // The last pattern stays on screen after the end.
    await expect(page.locator('.bb-timeline__name')).toHaveText('Knock, left stronger');
    await expect(page.locator('rect.bb-lane__mark')).toHaveCount(4);
  });

  test('the levels follow each segment on the page clock', async ({ page }) => {
    await open(page);
    await choose(page, 'Right', 'Baby');
    // Baby: 100 on, 80 off, four times (420 + 3 * 80 = 640 ms).
    const on = await levels(page);
    expect(on.right).toBeGreaterThan(0);
    const seen: { left: number; right: number }[] = [on];
    for (const step of [100, 80, 100, 80, 100, 80, 100]) {
      await page.clock.runFor(step);
      seen.push(await levels(page));
    }
    expect(seen.map((l) => l.right > 0)).toEqual([true, false, true, false, true, false, true, false]);
    await expect(page.locator('.bb-timeline__count')).toHaveText('4 pulses, 640 ms');
  });

  test('a second chip while the first plays replaces it, with no stale 0', async ({ page }) => {
    await open(page);
    await choose(page, 'Centre', 'Alarm');
    await page.clock.runFor(100);
    await choose(page, 'Left', 'Knock');
    const knock = await levels(page);
    expect(knock.left).toBeGreaterThan(knock.right);
    // At 150 ms after the alarm started its first rest would begin; the knock is still on.
    await page.clock.runFor(50);
    expect(await levels(page)).toEqual(knock);
    await page.clock.runFor(KNOCK_TOTAL_MS - 50 - 1);
    expect(await levels(page)).toEqual(knock);
    await page.clock.runFor(1);
    expect(await levels(page)).toEqual({ left: 0, right: 0 });
    // Nothing of the alarm comes back later.
    for (let i = 0; i < 8; i++) {
      await page.clock.runFor(500);
      expect(await levels(page)).toEqual({ left: 0, right: 0 });
    }
    await expect(page.locator('.bb-timeline__name')).toHaveText('Knock, left stronger');
  });

  test('the phone vibrates the knock array once per choice, and a play never calls vibrate(0)', async ({ page }) => {
    await open(page, 'stub');
    await expect(page.locator('#phone-status')).toHaveText('Phone vibration on');
    await expect(page.locator('#phone-status')).toHaveClass(/bb-status--accent/);
    await expect(page.locator('#phone-status svg')).toHaveAttribute('data-glyph', 'triangle');
    expect(await vibrateCalls(page)).toEqual([]);
    await choose(page, 'Left', 'Knock');
    expect(await vibrateCalls(page)).toEqual([KNOCK_VIBRATE]);
    await page.clock.runFor(KNOCK_TOTAL_MS);
    await chip(page, 'Knock').click();
    expect(await vibrateCalls(page)).toEqual([KNOCK_VIBRATE, KNOCK_VIBRATE]);
    // Changing the side plays nothing.
    await side(page, 'Right').check();
    expect(await vibrateCalls(page)).toEqual([KNOCK_VIBRATE, KNOCK_VIBRATE]);
  });

  test('without navigator.vibrate the pill says so and a choice still plays on the simulator', async ({ page, baseURL }) => {
    const problems = watch(page, new URL(baseURL!).origin);
    await open(page, 'none');
    await expect(page.locator('#phone-status')).toHaveText('No phone vibration here');
    await expect(page.locator('#phone-status')).toHaveClass(/bb-status--neutral/);
    await expect(page.locator('#phone-status svg')).toHaveAttribute('data-glyph', 'circle');
    await choose(page, 'Left', 'Knock');
    expect((await levels(page)).left).toBeGreaterThan(0);
    await expect(page.locator('.bb-feel__message')).toHaveText('');
    expect(problems, problems.join('\n')).toEqual([]);
  });

  test('the live region is set once per choice and does not change while the segments run', async ({ page }) => {
    await open(page);
    await page.evaluate(() => {
      const w = window as unknown as { __live: string[] };
      w.__live = [];
      const live = document.querySelector('.bb-sim__live')!;
      new MutationObserver(() => w.__live.push(live.textContent ?? '')).observe(live, { childList: true, characterData: true, subtree: true });
    });
    const announced = () => page.evaluate(() => (window as unknown as { __live: string[] }).__live.filter((t) => t !== ''));

    await expect(page.locator('.bb-sim__live')).toHaveAttribute('aria-live', 'polite');
    // The simulator, the Feel a pattern message and the Wristband status line; only the first speaks per choice.
    await expect(page.locator('[aria-live]')).toHaveCount(3);
    await expect(page.locator('.bb-connect [aria-live]')).toHaveCount(1);
    await choose(page, 'Left', 'Knock');
    await expect.poll(announced).toEqual(['Knock, left stronger']);
    await page.clock.runFor(KNOCK_TOTAL_MS + 500);
    expect(await announced()).toEqual(['Knock, left stronger']);

    // The same pattern again is announced again.
    await chip(page, 'Knock').click();
    await expect.poll(announced).toEqual(['Knock, left stronger', 'Knock, left stronger']);
    await choose(page, 'Unknown', 'Alarm');
    await expect.poll(announced).toEqual(['Knock, left stronger', 'Knock, left stronger', 'Alarm. Side unknown, both motors equal']);
    await page.clock.runFor(5000);
    expect(await announced()).toHaveLength(3);
  });

  test('keyboard: tab order, arrow keys on the side control, Enter and Space on chips', async ({ page }) => {
    await open(page);
    const names: string[] = [];
    for (let i = 0; i < 10; i++) {
      await page.keyboard.press('Tab');
      names.push(
        await page.evaluate(() => {
          const el = document.activeElement as HTMLElement;
          if (el instanceof HTMLInputElement) return `radio:${el.labels?.[0]?.textContent?.trim()}`;
          return `${el.tagName.toLowerCase()}:${el.textContent?.trim()}`;
        }),
      );
    }
    expect(names).toEqual(['a:Banshee Band', 'button:Day', 'button:Night', 'radio:Centre', 'button:Knock', 'button:Doorbell', 'button:Alarm', 'button:Baby', 'button:Vehicle', 'button:Voice']);

    // Arrow keys change the side and play nothing.
    await side(page, 'Centre').focus();
    await page.keyboard.press('ArrowRight');
    await expect(side(page, 'Right')).toBeChecked();
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');
    await expect(side(page, 'Left')).toBeChecked();
    await expect(page.locator('.bb-sim')).not.toHaveAttribute('data-side');
    expect(await vibrateCalls(page)).toEqual([]);

    await chip(page, 'Knock').focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('.bb-timeline__name')).toHaveText('Knock, left stronger');
    await chip(page, 'Doorbell').focus();
    await page.keyboard.press('Space');
    await expect(page.locator('.bb-timeline__name')).toHaveText('Doorbell, left stronger');
    expect(await vibrateCalls(page)).toHaveLength(2);
  });

  test('every interactive element has a visible focus ring and a 44px target', async ({ page }) => {
    await open(page);
    const count = await page.locator(FOCUSABLE).evaluateAll((els) => els.filter((el) => !(el instanceof HTMLInputElement && el.type === 'radio' && !el.checked)).length);
    expect(count).toBe(10);
    for (let i = 0; i < count; i++) {
      await page.keyboard.press('Tab');
      const focus = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement;
        // A radio is visually hidden over its label; the label draws the ring and is the target.
        const shown = el instanceof HTMLInputElement ? (el.closest('label') as HTMLElement) : el;
        const style = getComputedStyle(shown);
        const box = el.getBoundingClientRect();
        const shownBox = shown.getBoundingClientRect();
        return {
          name: shown.textContent?.trim(),
          ring: style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) >= 3 && style.outlineColor !== 'rgba(0, 0, 0, 0)',
          width: Math.min(box.width, shownBox.width),
          height: Math.min(box.height, shownBox.height),
        };
      });
      expect(focus.ring, `"${focus.name}" has no visible focus ring`).toBe(true);
      expect(focus.width, `"${focus.name}" is narrower than 44px`).toBeGreaterThanOrEqual(44);
      expect(focus.height, `"${focus.name}" is shorter than 44px`).toBeGreaterThanOrEqual(44);
    }
  });

  test('the simulator has no focusable element and no tabindex', async ({ page }) => {
    await open(page);
    await expect(page.locator(`.bb-sim :is(${FOCUSABLE})`)).toHaveCount(0);
    await expect(page.locator('.bb-sim [tabindex]')).toHaveCount(0);
    await expect(page.locator('.bb-motor__bar')).toHaveCount(2);
    for (const bar of await page.locator('.bb-motor__bar').all()) await expect(bar).toHaveAttribute('aria-hidden', 'true');
    await expect(page.locator('svg.bb-timeline__lanes')).toHaveAttribute('aria-hidden', 'true');
  });

  test('with motion allowed, the bars follow each segment', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await open(page);
    await choose(page, 'Left', 'Knock');
    expect(await fillWidth(page, 'left')).toBe(`${await level(page, 'left')}%`);
    const duration = await page.locator('[data-motor="left"] .bb-motor__fill').evaluate((el) => getComputedStyle(el).transitionDuration);
    expect(duration).toBe('0.15s');
    await page.clock.runFor(70);
    expect(await level(page, 'left')).toBe(0);
    expect(await fillWidth(page, 'left')).toBe('0%');
  });

  test('reduced motion: no transition, numbers and bars still follow each segment, nothing animates', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await open(page);
    const fill = page.locator('[data-motor="left"] .bb-motor__fill');
    expect(await fill.evaluate((el) => getComputedStyle(el).transitionDuration)).toBe('0s');
    expect(await fill.evaluate((el) => getComputedStyle(el).transitionProperty)).toBe('none');

    await choose(page, 'Left', 'Knock');
    const on = await levels(page);
    expect(on.left).toBeGreaterThan(on.right);
    expect(await fillWidth(page, 'left')).toBe(`${on.left}%`);
    expect(await fillWidth(page, 'right')).toBe(`${on.right}%`);

    // The bar fill follows the same percent as the number (R4.3), without a transition (R6.4).
    await page.clock.runFor(70);
    expect(await levels(page)).toEqual({ left: 0, right: 0 });
    expect(await fillWidth(page, 'left')).toBe('0%');
    await page.clock.runFor(100);
    expect(await levels(page)).toEqual(on);
    expect(await fillWidth(page, 'left')).toBe(`${on.left}%`);

    // At the end both return to 0.
    await page.clock.runFor(70);
    expect(await levels(page)).toEqual({ left: 0, right: 0 });
    expect(await fillWidth(page, 'left')).toBe('0%');
    expect(await fillWidth(page, 'right')).toBe('0%');

    expect(await page.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running').length)).toBe(0);
  });

  test('no console errors, no page errors, no request to another origin, no microphone', async ({ page, baseURL }) => {
    const problems = watch(page, new URL(baseURL!).origin);
    await open(page, 'native');
    for (const s of ['Left', 'Centre', 'Right', 'Unknown']) {
      for (const sound of ['Knock', 'Doorbell', 'Alarm', 'Baby', 'Vehicle', 'Voice']) {
        await choose(page, s, sound);
        await page.clock.runFor(50);
      }
    }
    await page.clock.runFor(5000);
    await page.getByRole('button', { name: 'Night', exact: true }).click();
    await page.getByRole('button', { name: 'Day', exact: true }).click();
    expect(await page.evaluate(() => (window as unknown as { __micAsked: boolean }).__micAsked)).toBe(false);
    await expect(page.locator('.bb-feel__message')).toHaveText('');
    expect(problems, problems.join('\n')).toEqual([]);
  });

  test('the theme control sets data-theme and Night is the default, even with a light OS setting', async ({ browser, baseURL }) => {
    const context = await browser.newContext({ baseURL, colorScheme: 'light' });
    const page = await context.newPage();
    await page.goto('/band.html');
    expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe('night');
    expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe('rgb(14, 11, 20)');
    await expect(page.getByRole('button', { name: 'Night', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: 'Day', exact: true }).click();
    expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe('day');
    expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe('rgb(238, 240, 244)');
    await context.close();
  });
});

test.describe('band simulator screenshots', () => {
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 390, height: 844 },
  ]) {
    for (const theme of ['day', 'night'] as const) {
      test(`renders cleanly at ${viewport.width}px in ${theme}`, async ({ page, baseURL }) => {
        await page.setViewportSize(viewport);
        const problems = watch(page, new URL(baseURL!).origin);
        await open(page);
        await page.getByRole('button', { name: theme === 'day' ? 'Day' : 'Night', exact: true }).click();
        await choose(page, 'Left', 'Knock');
        await page.mouse.move(0, 0);
        await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
        await page.evaluate(() => document.fonts.ready);
        await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running'));

        const { scrollWidth, innerWidth } = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth }));
        expect(scrollWidth, 'page scrolls horizontally').toBeLessThanOrEqual(innerWidth);

        // Every chip and side option is at least 44px; the bars stay inside their cards.
        for (const box of await page.locator('.bb-feel .bb-pill, .bb-sidepick__option').evaluateAll((els) => els.map((el) => el.getBoundingClientRect().toJSON()))) {
          expect(box.height).toBeGreaterThanOrEqual(44);
          expect(box.width).toBeGreaterThanOrEqual(44);
        }
        for (const motor of ['left', 'right']) {
          const inside = await page.locator(`[data-motor="${motor}"]`).evaluate((card) => {
            const c = card.getBoundingClientRect();
            const b = card.querySelector('.bb-motor__bar')!.getBoundingClientRect();
            return b.left >= c.left && b.right <= c.right && b.top >= c.top && b.bottom <= c.bottom;
          });
          expect(inside, `${motor} bar overflows its card`).toBe(true);
        }
        // The two motor cards stay side by side at every width.
        const tops = await page.locator('[data-motor]').evaluateAll((els) => els.map((el) => el.getBoundingClientRect().top));
        expect(tops[0]).toBe(tops[1]);

        await page.screenshot({ path: resolve(SCREENSHOTS, `band-${viewport.width}-${theme}.png`), fullPage: true });
        expect(problems, problems.join('\n')).toEqual([]);
      });
    }
  }

  test('unknown side at 390px in Night', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await open(page);
    await page.getByRole('button', { name: 'Night', exact: true }).click();
    await choose(page, 'Unknown', 'Alarm');
    await page.mouse.move(0, 0);
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running'));
    await page.screenshot({ path: resolve(SCREENSHOTS, 'band-390-night-unknown.png'), fullPage: true });
  });
});
