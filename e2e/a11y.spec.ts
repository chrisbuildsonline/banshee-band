import { resolve } from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import type { Locator, Page } from '@playwright/test';
import { expect, test } from './fixtures';

// A fake microphone that plays the knock clip, for Start listening by keyboard (as e2e/live.spec.ts).
const KNOCK_WAV = resolve(import.meta.dirname, '../public/clips/knock-01.wav');
test.use({
  launchOptions: {
    args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', `--use-file-for-fake-audio-capture=${KNOCK_WAV}`],
  },
});

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

/** What has the focus: `role:name`, whether it shows a focus ring, is shown and enabled, and is inside an open dialog. */
type Stop = { id: string; ring: boolean; usable: boolean; inDialog: boolean };

async function focusStop(page: Page): Promise<Stop | null> {
  return page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el || el === document.body) return null;
    const implicit: Record<string, string> = { a: 'link', button: 'button', radio: 'radio', checkbox: 'checkbox', range: 'slider', h2: 'heading' };
    const role = el.getAttribute('role') ?? implicit[el instanceof HTMLInputElement ? el.type : el.tagName.toLowerCase()] ?? el.tagName.toLowerCase();
    const text = (node: Element | null | undefined) => node?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
    const labelled = el.getAttribute('aria-labelledby');
    const name =
      el.getAttribute('aria-label') ??
      (labelled ? labelled.split(' ').map((id) => text(document.getElementById(id))).join(' ') : el instanceof HTMLInputElement ? text(el.labels?.[0]) : text(el));
    // A focus ring (requirements.md): an outline that is drawn, or a box shadow.
    const cs = getComputedStyle(el);
    const ring = (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0) || cs.boxShadow !== 'none';
    const usable = el.checkVisibility() && !el.hasAttribute('disabled') && el.getAttribute('aria-hidden') !== 'true';
    return { id: `${role}:${name}`, ring, usable, inDialog: Boolean(el.closest('dialog[open]')) };
  });
}

/** Presses `key` up to `times` times; every stop must be inside the open dialog, shown, enabled and ringed. */
async function expectTrapped(page: Page, key: 'Tab' | 'Shift+Tab', times: number, label: string): Promise<string[]> {
  const seen: string[] = [];
  for (let i = 0; i < times; i++) {
    await page.keyboard.press(key);
    const stop = await focusStop(page);
    const where = stop ? { id: stop.id, inDialog: stop.inDialog, ring: stop.ring, usable: stop.usable } : { id: 'body (the focus left the dialog)' };
    expect(where, `${label}: ${key} ${i + 1}, after ${seen.join(', ')}`).toEqual({ id: where.id, inDialog: true, ring: true, usable: true });
    seen.push(stop!.id);
  }
  return seen;
}

const listenPill = (page: Page) => page.locator('[data-card="listen"] [role="status"]');

test.describe('keyboard', () => {
  test('Tab reaches every station control once, in reading order, each with a focus ring', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await expect(chip(page, 'Voice')).toBeVisible();
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    const stops: Stop[] = [];
    for (let i = 0; i < 40; i++) {
      await page.keyboard.press('Tab');
      const stop = await focusStop(page);
      if (!stop || stop.id === stops[0]?.id) break;
      stops.push(stop);
    }
    expect(stops.map((s) => s.id)).toEqual([
      'link:Banshee Band',
      'link:Band simulator',
      'button:Settings',
      'button:Day',
      'button:Night',
      'button:Start listening',
      'radio:Centre',
      'button:Doorbell',
      'button:Knock',
      'button:Alarm',
      'button:Baby',
      'button:Vehicle',
      'button:Voice',
      'link:Styleguide',
    ]);
    expect(stops.filter((s) => !s.ring).map((s) => s.id), 'stops without a focus ring').toEqual([]);
    expect(stops.filter((s) => !s.usable).map((s) => s.id), 'hidden or disabled stops').toEqual([]);
  });

  test('the Settings sheet keeps the focus, Escape closes it and the focus is back on the Settings pill', async ({ page }) => {
    await page.goto('/');
    await settingsButton(page).click();
    await expect(settingsSheet(page)).toBeVisible();
    const forward = await expectTrapped(page, 'Tab', 24, 'Settings, Tab');
    expect(forward).toContain('button:Done');
    expect(forward).toContain('switch:Knock');
    await expectTrapped(page, 'Shift+Tab', 24, 'Settings, Shift+Tab');
    await page.keyboard.press('Escape');
    await expect(settingsSheet(page)).toBeHidden();
    await expect(settingsButton(page)).toBeFocused();
  });

  test('the intro keeps the focus on each step, Escape closes it and the focus is back on the Settings pill', async ({ page }) => {
    await page.goto('/');
    await settingsButton(page).click();
    await settingsSheet(page).getByRole('button', { name: 'Show intro again' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toHaveAccessibleName('Welcome to Banshee Band');
    for (const [step, next] of [
      ['Welcome to Banshee Band', 'Next'],
      ['Turn on the microphone', 'Not now'],
      ['Where should alerts buzz?', null],
    ] as const) {
      await expect(dialog).toHaveAccessibleName(step);
      await expectTrapped(page, 'Tab', 10, `intro "${step}", Tab`);
      await expectTrapped(page, 'Shift+Tab', 10, `intro "${step}", Shift+Tab`);
      if (next) {
        const button: Locator = dialog.getByRole('button', { name: next });
        await button.focus();
        await page.keyboard.press('Enter');
      }
    }
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(settingsButton(page)).toBeFocused();
  });

  test('Start listening by Tab, then Enter, Stop, then Space: the Listen pill reads Listening', async ({ page }) => {
    test.setTimeout(MODEL_TIMEOUT + 60_000);
    await page.goto('/');
    await expect(chip(page, 'Voice')).toBeVisible();
    const start = page.getByRole('button', { name: 'Start listening' });
    for (let i = 0; i < 10 && !(await start.evaluate((el) => el === document.activeElement)); i++) await page.keyboard.press('Tab');
    await expect(start).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(listenPill(page)).toHaveText('Listening', { timeout: MODEL_TIMEOUT });
    const stop = page.getByRole('button', { name: 'Stop', exact: true });
    await expect(stop).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(listenPill(page)).toHaveText('Stopped');
    await expect(start).toBeFocused();
    await page.keyboard.press('Space');
    await expect(listenPill(page)).toHaveText('Listening', { timeout: MODEL_TIMEOUT });
    await stop.click();
  });

  test('in Settings, Space flips a switch and the arrow keys move the slider with its value text', async ({ page }) => {
    await page.goto('/');
    await settingsButton(page).click();
    const toggle = settingsSheet(page).getByRole('switch', { name: 'Knock', exact: true });
    // The switch is a native checkbox with role="switch": its checked state is the switch's aria-checked (an
    // explicit attribute would be redundant), and toBeChecked reads that accessible state.
    await toggle.focus();
    await expect(toggle).toBeChecked();
    await page.keyboard.press('Space');
    await expect(toggle).not.toBeChecked();
    await page.keyboard.press('Space');
    await expect(toggle).toBeChecked();

    const slider = settingsSheet(page).getByRole('slider', { name: 'Knock Alerts from' });
    const shown = settingsSheet(page).locator('.bb-settings-tile[data-class="knock"] .bb-settings-tile__value');
    const read = async () => ({ value: await slider.inputValue(), text: await slider.getAttribute('aria-valuetext'), shown: (await shown.textContent())?.trim() });
    await slider.focus();
    const before = await read();
    expect(before).toEqual({ value: '-50', text: '−50 dB', shown: '−50 dB' });
    await page.keyboard.press('ArrowRight');
    expect(await read()).toEqual({ value: '-49', text: '−49 dB', shown: '−49 dB' });
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');
    expect(await read()).toEqual({ value: '-51', text: '−51 dB', shown: '−51 dB' });
  });
});

/**
 * The elements under `selectors` (each with its descendants) whose computed style still moves: a transition
 * longer than 0s, or a named animation longer than 0s. Each comma-separated part counts.
 */
async function stillMoving(page: Page, selectors: string[]): Promise<string[]> {
  return page.evaluate((list) => {
    const moving: string[] = [];
    const longer = (value: string) => value.split(',').some((part) => parseFloat(part) > 0);
    for (const selector of list) {
      const root = document.querySelector(selector);
      if (!root) {
        moving.push(`${selector}: not found`);
        continue;
      }
      for (const el of [root, ...root.querySelectorAll('*')]) {
        const cs = getComputedStyle(el);
        const animated = cs.animationName.split(',').some((n) => n.trim() !== 'none') && longer(cs.animationDuration);
        if (animated || longer(cs.transitionDuration)) {
          const tag = `${el.tagName.toLowerCase()}${el.className && typeof el.className === 'string' ? `.${el.className.trim().split(/\s+/).join('.')}` : ''}`;
          moving.push(`${selector} ${el === root ? '' : tag}: animation ${cs.animationName} ${cs.animationDuration}, transition ${cs.transitionDuration}`);
        }
      }
    }
    return moving;
  }, selectors);
}

test.describe('reduced motion', () => {
  test('with a ghost on screen, nothing on the station, the pills, Settings or the intro moves', async ({ page }) => {
    test.setTimeout(MODEL_TIMEOUT + 60_000);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await runChip(page, 'Knock', 1);
    await expect(page.locator('.bb-ghost-field__items li[data-class]').first()).toBeAttached();
    await page.getByRole('button', { name: 'Start listening' }).click();
    await expect(listenPill(page)).toHaveText('Listening', { timeout: MODEL_TIMEOUT });
    expect(await stillMoving(page, ['.bb-ghost-field', '#station-status [role="status"]', '[data-card="listen"] [role="status"]'])).toEqual([]);
    await page.getByRole('button', { name: 'Stop', exact: true }).click();

    await settingsButton(page).click();
    await expect(settingsSheet(page)).toBeVisible();
    expect(await stillMoving(page, ['dialog[open]'])).toEqual([]);
    await settingsSheet(page).getByRole('button', { name: 'Show intro again' }).click();
    const intro = page.getByRole('dialog', { name: 'Welcome to Banshee Band' });
    await expect(intro).toBeVisible();
    expect(await stillMoving(page, ['dialog[open]', 'dialog[open] .bb-intro__step:not([hidden])'])).toEqual([]);
  });

  test('the check itself sees the motion when motion is allowed', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto('/');
    await settingsButton(page).click();
    await expect(settingsSheet(page)).toBeVisible();
    expect(await stillMoving(page, ['dialog[open]'])).not.toEqual([]);
  });
});

test.describe('announcements', () => {
  const latest = (page: Page) => page.locator('#latest-alert');
  /** The live regions that speak in normal use, by purpose (Requirement 4.4). */
  const SPEAKING: Record<string, Record<string, string>> = {
    '/': {
      'Latest alert': '#latest-alert',
      'header status pill': '#station-status [role="status"]',
      'Listen status pill': '[data-card="listen"] [role="status"]',
      'Try a sound message': '.bb-station-try__message',
    },
    '/band.html': {
      'band simulator live line': '.bb-sim__live',
      'Wristband status line': '#band-connect [role="status"]',
    },
  };
  /** The live regions that speak only when something fails (empty in normal use, by design). */
  const PROBLEMS_ONLY: Record<string, Record<string, string>> = {
    '/': { 'Listen problem message': '.bb-station-listen__message' },
    '/band.html': { 'pattern problem message': '.bb-feel__message' },
  };

  /**
   * Every live region on the page, each named by the purpose it matches; one that matches none is listed as
   * "unknown" with its markup, so a new region is a deliberate change to these lists and never an unlabelled duplicate.
   */
  const regionPurposes = (page: Page, path: string) =>
    page.evaluate(
      (known) =>
        [...document.querySelectorAll<HTMLElement>('[aria-live], [role="status"], [role="alert"]')].map(
          (el) => Object.entries(known).find(([, selector]) => el.matches(selector))?.[0] ?? `unknown: ${el.outerHTML.slice(0, 120)}`,
        ),
      { ...SPEAKING[path], ...PROBLEMS_ONLY[path] },
    );

  async function expectRegionsSpeak(page: Page, path: string): Promise<void> {
    expect((await regionPurposes(page, path)).sort()).toEqual(Object.keys({ ...SPEAKING[path], ...PROBLEMS_ONLY[path] }).sort());
    for (const [purpose, selector] of Object.entries(SPEAKING[path])) await expect(page.locator(selector), `${purpose} has words`).toHaveText(/\S/);
  }

  test('a new sound is announced once, politely, with its class, side and urgency in words', async ({ page }) => {
    test.setTimeout(MODEL_TIMEOUT + 60_000);
    await page.goto('/');
    await expect(latest(page)).toHaveAttribute('aria-live', 'polite');
    await page.getByLabel('Left', { exact: true }).check();
    await runChip(page, 'Knock', 1);
    const row = rows(page).first();
    const words = [
      await row.locator('.bb-station-row__name').innerText(),
      (await row.locator('.bb-station-row__side').innerText()).replace(/ side$/i, ''),
      await row.locator('.bb-status').innerText(),
    ];
    expect(words.slice(0, 2)).toEqual(['Knock', 'Left']);
    const said = (await latest(page).innerText()).toLowerCase();
    for (const word of words) expect(said, `the Latest alert "${said}" says "${word}"`).toContain(word.toLowerCase());
    // Once: the Latest alert is the only live region that speaks the event.
    const speaking = page.locator('[aria-live], [role="status"], [role="alert"]').filter({ hasText: 'Knock' });
    expect(await speaking.evaluateAll((els) => els.map((el) => el.outerHTML.slice(0, 120)))).toEqual([await latest(page).evaluate((el) => el.outerHTML.slice(0, 120))]);

    // Nothing interrupts: no assertive region and no role="alert" on the station.
    await expect(page.locator('[aria-live="assertive"], [role="alert"]')).toHaveCount(0);
    // Every live region in use speaks words: the Listen pill appears with Start listening, and the Try a sound
    // message speaks when a sound is off (here Doorbell, turned off in Settings).
    await page.getByRole('button', { name: 'Start listening' }).click();
    await expect(listenPill(page)).toHaveText('Listening', { timeout: MODEL_TIMEOUT });
    await page.getByRole('button', { name: 'Stop', exact: true }).click();
    await settingsButton(page).click();
    await settingsSheet(page).getByRole('switch', { name: 'Doorbell', exact: true }).uncheck();
    await page.keyboard.press('Escape');
    await chip(page, 'Doorbell').click();
    await expectRegionsSpeak(page, '/');
  });

  test('band.html: no assertive region, and every live region in use speaks words', async ({ page }) => {
    await page.goto('/band.html');
    await page.getByRole('group', { name: 'Sound' }).getByRole('button', { name: 'Knock', exact: true }).click();
    await expect(page.locator('[aria-live="assertive"], [role="alert"]')).toHaveCount(0);
    await expectRegionsSpeak(page, '/band.html');
  });
});
