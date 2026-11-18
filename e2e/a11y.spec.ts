import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

/** The first run loads the sound model in the browser, which can take a while. */
const MODEL_TIMEOUT = 120_000;
/** The WCAG 2.0 A and AA and 2.1 AA rules (axe tags). */
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21aa'];
const THEMES = ['day', 'night'] as const;
type Theme = (typeof THEMES)[number];

const themeButton = (page: Page, theme: Theme) => page.getByRole('button', { name: theme === 'day' ? 'Day' : 'Night', exact: true });
const rows = (page: Page) => page.getByRole('list', { name: 'Recent sounds' }).getByRole('listitem');
const settingsButton = (page: Page) => page.getByRole('button', { name: 'Settings', exact: true });
const settingsSheet = (page: Page) => page.getByRole('dialog', { name: 'Settings' });
const chip = (page: Page, name: string) => page.locator('[data-card="try"]').getByRole('button', { name, exact: true });

/** Waits until the page is still: the finite fade-ins have ended and an open dialog is at full opacity. */
async function settle(page: Page): Promise<void> {
  // Endless loops (the styleguide's motion samples) never finish, so only the finite ones are awaited.
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((a) => Number.isFinite(a.effect?.getComputedTiming().endTime ?? 0))
        .map((a) => a.finished.catch(() => undefined)),
    ),
  );
  // A half-faded sheet gives axe a false contrast result.
  await expect.poll(() => page.evaluate(() => [...document.querySelectorAll('dialog[open]')].every((d) => getComputedStyle(d).opacity === '1'))).toBe(true);
}

/**
 * One axe run (WCAG 2.0 A/AA, 2.1 AA, no rule disabled) on the page as it is. Returns one line per violation:
 * rule, impact and the selectors of its nodes. `exclude` is only for a decorative `aria-hidden` element, each
 * named with its reason where it is passed. Items axe could not decide (`incomplete`) are logged, not failed.
 */
async function audit(page: Page, exclude: string[] = []): Promise<{ violations: string[]; unchecked: string[] }> {
  let builder = new AxeBuilder({ page }).withTags(TAGS);
  for (const selector of exclude) builder = builder.exclude(selector);
  const { violations, incomplete } = await builder.analyze();
  for (const item of incomplete) test.info().annotations.push({ type: `axe incomplete: ${item.id}`, description: item.nodes.map((n) => `${n.target.join(' ')}: ${n.any.map((a) => a.message).join('; ')}`).join(' | ') });
  return {
    violations: violations.map((v) => `${v.id} (${v.impact}): ${v.help}\n${v.nodes.map((n) => `  ${n.target.join(' ')}: ${n.failureSummary?.replace(/\n/g, ' ')}`).join('\n')}`),
    unchecked: incomplete.filter((v) => v.id === 'color-contrast').flatMap((v) => v.nodes.map((n) => `${n.target.join(' ')}: ${n.any.map((a) => a.message).join('; ')}`)),
  };
}

/** Settles the page, then expects no violation; the failure message lists each one. */
async function expectNoViolations(page: Page, label: string): Promise<void> {
  await settle(page);
  const { violations, unchecked } = await audit(page);
  expect(violations, `${label}\n${violations.join('\n')}`).toEqual([]);
  // Text axe could not check counts as a gap (an overlap, an image behind it), with two known causes: text on the
  // Night glow, which the second run below checks, and the pipeline dial's single letters L and R (aria-hidden,
  // text-muted on surface, a Contrast table row), which axe finds "too short" to call text.
  expect(unchecked.filter((u) => !/gradient|too short/.test(u)), `${label}: text axe could not check`).toEqual([]);
  // Night's moonrise glow is a gradient, and axe leaves text over a gradient "incomplete" (unchecked). So the
  // page is checked a second time with the glow flattened to its brightest stop (accent-tint), the worst case
  // for the light Night text: if every text passes there, it passes anywhere on the glow.
  if (await page.evaluate(() => getComputedStyle(document.body).backgroundImage !== 'none')) {
    const flat = await page.addStyleTag({ content: '.bb-page { background-image: none !important; background-color: var(--bb-color-accent-tint) !important; }' });
    const second = await audit(page);
    expect(second.violations, `${label}, glow flattened\n${second.violations.join('\n')}`).toEqual([]);
    expect(second.unchecked.filter((u) => !/too short/.test(u)), `${label}, glow flattened: text axe could not check`).toEqual([]);
    await flat.evaluate((node) => (node as Element).remove());
  }
}

/** Picks the theme through the page's own control and waits for `html[data-theme]` to hold it. */
async function setTheme(page: Page, theme: Theme): Promise<void> {
  await themeButton(page, theme).click();
  await expect(themeButton(page, theme)).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
}

async function open(page: Page, path: string, theme: Theme): Promise<void> {
  await page.goto(path);
  await setTheme(page, theme);
}

/** Plays a Try a sound chip and waits for its Recent sounds row (the count after it). */
async function runChip(page: Page, name: string, count: number): Promise<void> {
  await chip(page, name).click();
  await expect(rows(page)).toHaveCount(count, { timeout: MODEL_TIMEOUT });
}

test.describe('axe: no WCAG 2.1 A/AA violations', () => {
  test('the audit itself catches a planted low-contrast text and an unnamed control', async ({ page }) => {
    await page.goto('/');
    await settle(page);
    await page.evaluate(() => {
      const b = document.createElement('button');
      b.append(document.createElementNS('http://www.w3.org/2000/svg', 'svg'));
      const p = document.createElement('p');
      p.textContent = 'faint';
      p.style.cssText = 'color:#ddd;background:#fff';
      document.querySelector('.bb-station-title')!.append(b, p);
    });
    const { violations } = await audit(page);
    expect(violations.map((v) => v.split(' ')[0]).sort()).toEqual(['button-name', 'color-contrast']);
  });

  for (const theme of THEMES) {
    test(`station empty, Settings sheet open (${theme})`, async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await open(page, '/', theme);
      await expect(chip(page, 'Voice')).toBeVisible();
      await expect(page.locator('[data-card="listen"]').getByRole('button', { name: 'Start listening' })).toBeVisible();
      await expectNoViolations(page, `station empty, ${theme}`);

      await settingsButton(page).click();
      await expect(settingsSheet(page)).toBeVisible();
      await expectNoViolations(page, `Settings sheet, ${theme}`);
    });

    test(`station with events, ghosts and the pipeline card (${theme})`, async ({ page }) => {
      test.setTimeout(MODEL_TIMEOUT + 60_000);
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await open(page, '/', theme);
      await page.getByLabel('Left', { exact: true }).check();
      await runChip(page, 'Alarm', 1);
      await runChip(page, 'Knock', 2);
      await expect(page.locator('#latest-alert')).toContainText('Knock');
      await expect(page.locator('.bb-ghost-field__items li[data-class]').first()).toBeAttached();
      await expect(page.locator('[data-card="pipeline"] section[data-stage]')).toHaveCount(5);
      await expectNoViolations(page, `station with events, ${theme}`);

      // The phone layout (bottom bar, short captions) is its own screen.
      await page.setViewportSize({ width: 390, height: 844 });
      await expectNoViolations(page, `station with events at 390, ${theme}`);
    });

    test.describe(() => {
      test.use({ onboarded: false });
      test(`intro sheet, all three steps (${theme})`, async ({ page }) => {
        await page.setViewportSize({ width: 1440, height: 900 });
        await page.goto('/');
        const welcome = page.getByRole('dialog', { name: 'Welcome to Banshee Band' });
        await expect(welcome).toBeVisible();
        if (theme === 'night') {
          // The open intro makes the page inert, so Night is pressed after it closes and the intro reopens
          // through Show intro again: the same sheet, through the page's own controls.
          await page.keyboard.press('Escape');
          await expect(welcome).toBeHidden();
          await setTheme(page, 'night');
          await settingsButton(page).click();
          await settingsSheet(page).getByRole('button', { name: 'Show intro again' }).click();
          await expect(welcome).toBeVisible();
        }
        await expectNoViolations(page, `intro step 1, ${theme}`);
        await welcome.getByRole('button', { name: 'Next' }).click();
        await expect(page.getByRole('dialog', { name: 'Turn on the microphone' })).toBeVisible();
        await expectNoViolations(page, `intro step 2, ${theme}`);
        await page.getByRole('dialog').getByRole('button', { name: 'Not now' }).click();
        await expect(page.getByRole('dialog', { name: 'Where should alerts buzz?' })).toBeVisible();
        await expectNoViolations(page, `intro step 3, ${theme}`);
      });
    });

    test(`band simulator page (${theme})`, async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await open(page, '/band.html', theme);
      await expectNoViolations(page, `band.html, ${theme}`);
      await page.setViewportSize({ width: 390, height: 844 });
      await expectNoViolations(page, `band.html at 390, ${theme}`);
    });

    test(`styleguide page (${theme})`, async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await open(page, '/styleguide.html', theme);
      await expectNoViolations(page, `styleguide.html, ${theme}`);
    });
  }
});
