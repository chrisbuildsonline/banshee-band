import { resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';

// The wristband over Web Bluetooth, with a mocked navigator.bluetooth: no hardware. The mock records every
// requestDevice call and every frame written to the command characteristic.

const SCREENSHOTS = resolve(import.meta.dirname, 'screenshots');
const MODEL_TIMEOUT = 120_000;
const WEBGL_READPIXELS = /GL Driver Message \(OpenGL, Performance, GL_CLOSE_PATH_NV, High\): GPU stall due to ReadPixels/;
const SERVICE = 'b5e0b5e0-0001-4b1d-8a6e-0c0ffee0b0ba';
const UNSUPPORTED = 'This browser has no Bluetooth link (Safari and Firefox do not have Web Bluetooth). Alerts use the phone or the screen. Chrome or Edge can connect the band.';

type BandMock = { writes: number[][]; requests: unknown[]; mode: 'ok' | 'cancel'; lose(): void };

/** Installs the fake `navigator.bluetooth` before any page script runs. */
async function mockBluetooth(page: Page, mode: BandMock['mode'] = 'ok'): Promise<void> {
  await page.addInitScript((startMode) => {
    const listeners = new Set<() => void>();
    const mock = { writes: [] as number[][], requests: [] as unknown[], mode: startMode, lose: () => listeners.forEach((l) => l()) };
    (window as unknown as { __band: typeof mock }).__band = mock;
    const characteristic = {
      writeValueWithResponse: async (data: Uint8Array) => {
        mock.writes.push(Array.from(data));
      },
    };
    const gatt = {
      connect: async () => gatt,
      disconnect: () => undefined,
      getPrimaryService: async () => ({ getCharacteristic: async () => characteristic }),
    };
    const device = {
      name: 'Banshee Band',
      gatt,
      addEventListener: (_t: string, l: () => void) => listeners.add(l),
      removeEventListener: (_t: string, l: () => void) => listeners.delete(l),
    };
    const bluetooth = {
      requestDevice: async (options: unknown) => {
        mock.requests.push(options);
        if (mock.mode === 'cancel') throw new DOMException('User cancelled the requestDevice() chooser.', 'NotFoundError');
        return device;
      },
    };
    Object.defineProperty(Navigator.prototype, 'bluetooth', { configurable: true, get: () => bluetooth });
  }, mode);
}

/** Removes Web Bluetooth, as in Safari and Firefox. */
async function noBluetooth(page: Page): Promise<void> {
  await page.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, 'bluetooth', { configurable: true, get: () => undefined });
  });
}

const band = (page: Page) => page.evaluate(() => (window as unknown as { __band: BandMock }).__band);

/** CRC-8, polynomial 0x07, as firmware/README.md documents it. */
function crc8(bytes: number[]): number {
  let crc = 0;
  for (const b of bytes) {
    crc ^= b;
    for (let i = 0; i < 8; i++) crc = crc & 0x80 ? ((crc << 1) ^ 0x07) & 0xff : (crc << 1) & 0xff;
  }
  return crc;
}

function watch(page: Page): string[] {
  const problems: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'warning' && WEBGL_READPIXELS.test(msg.text())) return;
    if (msg.type() === 'error' || msg.type() === 'warning') problems.push(`console ${msg.type()}: ${msg.text()}`);
  });
  page.on('pageerror', (error) => problems.push(`page error: ${error.message}`));
  return problems;
}

const sheet = (page: Page) => page.getByRole('dialog', { name: 'Settings' });
const radio = (page: Page, name: string) => sheet(page).getByRole('radio', { name, exact: true });
const connectRow = (page: Page) => page.locator('.bb-connect');
const connectStatus = (page: Page) => connectRow(page).getByRole('status');
const headerPill = (page: Page) => page.locator('#station-status [role="status"]');
const stage = (page: Page, name: string) => page.locator(`[data-card="pipeline"] section[data-stage="${name}"]`);
const rows = (page: Page) => page.getByRole('list', { name: 'Recent sounds' }).getByRole('listitem');

async function openSheet(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(sheet(page)).toBeVisible();
}

test.describe('wristband link', () => {
  test('connect from Settings, buzz a knock on the band, then lose it', async ({ page }) => {
    test.setTimeout(MODEL_TIMEOUT + 60_000);
    const problems = watch(page);
    await mockBluetooth(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await expect(headerPill(page)).toHaveText('Phone vibration fallback');

    await openSheet(page);
    await expect(radio(page, 'Wristband')).toBeEnabled();
    await expect(radio(page, 'Wristband')).toHaveAccessibleDescription('The band buzzes the pattern, stronger on the side it came from.');
    await expect(connectStatus(page)).toHaveText('No band connected.');
    await sheet(page).getByRole('button', { name: 'Connect band' }).click();
    await expect(connectStatus(page)).toHaveText('Connected to Banshee Band.');
    await expect(radio(page, 'Wristband')).toBeChecked();
    await expect(sheet(page).getByRole('button', { name: 'Disconnect' })).toBeVisible();
    await expect(headerPill(page)).toHaveText('Band connected');
    expect((await band(page)).requests).toEqual([{ filters: [{ services: [SERVICE] }] }]);
    await connectRow(page).scrollIntoViewIfNeeded();
    await page.screenshot({ path: resolve(SCREENSHOTS, 'band-link-1440-day.png') });

    // A knock from Try a sound: the band gets one PLAY frame for a knock, with a valid CRC.
    await sheet(page).getByRole('button', { name: 'Done' }).click();
    await page.locator('[data-card="try"]').getByRole('button', { name: 'Knock', exact: true }).click();
    await expect(rows(page)).toHaveCount(1, { timeout: MODEL_TIMEOUT });
    await expect(stage(page, 'band')).toContainText('Wristband');
    await expect(stage(page, 'band')).toContainText('Band simulator');
    await expect.poll(async () => (await band(page)).writes.length).toBeGreaterThan(0);
    const frame = (await band(page)).writes.at(-1)!;
    expect(frame.slice(0, 3)).toEqual([0x01, 0x01, 0x01]);
    expect(frame).toHaveLength(6 + 4 * frame[4]);
    expect(frame.at(-1)).toBe(crc8(frame.slice(0, -1)));

    // The band drops: the screen takes over at once and the sheet says so.
    await page.evaluate(() => (window as unknown as { __band: BandMock }).__band.lose());
    await expect(headerPill(page)).toHaveText('Band not connected');
    await openSheet(page);
    await expect(connectStatus(page)).toHaveText('The band disconnected. Alerts use the phone or the screen until it is back.');
    await expect(radio(page, 'Wristband')).toBeChecked();
    await expect(sheet(page).getByRole('button', { name: 'Connect band' })).toBeVisible();
    expect(problems, problems.join('\n')).toEqual([]);
  });

  test('a closed chooser says no band was chosen and changes nothing', async ({ page }) => {
    const problems = watch(page);
    await mockBluetooth(page, 'cancel');
    await page.goto('/');
    await openSheet(page);
    await sheet(page).getByRole('button', { name: 'Connect band' }).click();
    await expect(connectStatus(page)).toHaveText('No band was chosen.');
    await expect(radio(page, 'Phone vibration')).toBeChecked();
    await expect(headerPill(page)).toHaveText('Phone vibration fallback');
    expect(problems, problems.join('\n')).toEqual([]);
  });

  test('without Web Bluetooth the Wristband is disabled and the honest line shows', async ({ page }) => {
    const problems = watch(page);
    await noBluetooth(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await page.getByRole('button', { name: 'Night', exact: true }).click();
    await openSheet(page);
    await expect(radio(page, 'Wristband')).toBeDisabled();
    await expect(radio(page, 'Wristband')).toHaveAccessibleDescription('This browser has no Bluetooth. Use Chrome or Edge to connect the band.');
    // The caption says it once; the sheet has no connect row and no button.
    await expect(connectRow(page)).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Connect band' })).toHaveCount(0);

    // The band page says it in full, with the fallback in use.
    await page.goto('/band.html');
    await expect(connectStatus(page)).toHaveText(UNSUPPORTED);
    await expect(page.getByRole('button', { name: 'Connect band' })).toHaveCount(0);
    await connectRow(page).scrollIntoViewIfNeeded();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    await page.screenshot({ path: resolve(SCREENSHOTS, 'band-link-390-night.png') });
    expect(problems, problems.join('\n')).toEqual([]);
  });

  test('band.html connects by keyboard and plays a pattern on the band', async ({ page }) => {
    const problems = watch(page);
    await mockBluetooth(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/band.html');
    await expect(page.locator('.bb-lede')).not.toContainText('No band is connected');
    await expect(connectStatus(page)).toHaveText('No band connected.');
    const connect = page.getByRole('button', { name: 'Connect band' });
    await expect(connect).toHaveClass(/bb-pill--primary/);
    await connect.focus();
    await page.keyboard.press('Enter');
    await expect(connectStatus(page)).toHaveText('Connected to Banshee Band.');
    await page.locator('#sound-chips [data-sound="alarm"]').click();
    await expect.poll(async () => (await band(page)).writes.length).toBe(1);
    const frame = (await band(page)).writes[0];
    expect(frame.slice(0, 5)).toEqual([0x01, 0x01, 0x03, 0x02, 23]);
    expect(frame).toHaveLength(98);
    expect(frame.at(-1)).toBe(crc8(frame.slice(0, -1)));

    await page.getByRole('button', { name: 'Night', exact: true }).click();
    await page.screenshot({ path: resolve(SCREENSHOTS, 'band-link-1440-night.png') });

    await page.getByRole('button', { name: 'Disconnect' }).click();
    await expect(connectStatus(page)).toHaveText('No band connected.');
    await page.locator('#sound-chips [data-sound="knock"]').click();
    expect((await band(page)).writes).toHaveLength(1);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('button', { name: 'Day', exact: true }).click();
    await connect.scrollIntoViewIfNeeded();
    const box = await connect.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    await page.screenshot({ path: resolve(SCREENSHOTS, 'band-link-390-day.png') });
    expect(problems, problems.join('\n')).toEqual([]);
  });
});
