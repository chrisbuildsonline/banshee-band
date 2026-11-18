import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from './fixtures';

const MODEL_TIMEOUT = 120_000;
/** Chromium's GPU driver note when TF.js WebGL reads scores back (see e2e/station.spec.ts). */
const WEBGL_READPIXELS = /GL Driver Message \(OpenGL, Performance, GL_CLOSE_PATH_NV, High\): GPU stall due to ReadPixels/;

/** The precache list the build injected into dist/sw.js. */
function precacheList(): string[] {
  const sw = readFileSync(resolve(import.meta.dirname, '../dist/sw.js'), 'utf8');
  return [...sw.matchAll(/(\/[\w./-]+\.(?:html|json|js|css|wav|bin|csv|svg|png|webmanifest))/g)].map((m) => m[1]);
}

test('after one online visit the station opens and classifies a clip offline, with every request on the origin', async ({ page, context, baseURL }) => {
  test.setTimeout(MODEL_TIMEOUT * 2);
  const origin = new URL(baseURL!).origin;
  const requests: string[] = [];
  const problems: string[] = [];
  context.on('request', (r) => requests.push(r.url()));
  page.on('console', (msg) => {
    if (msg.type() === 'warning' && WEBGL_READPIXELS.test(msg.text())) return;
    if (msg.type() === 'error') problems.push(`console error: ${msg.text()}`);
  });
  page.on('pageerror', (e) => problems.push(`page error: ${e.message}`));

  // Online: the worker installs, caches everything and says so.
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-offline-ready', 'true', { timeout: MODEL_TIMEOUT });
  await expect(page.locator('[data-offline-note]')).toBeVisible();
  for (const path of ['/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png', '/icons/icon-maskable-512.png']) {
    expect((await page.request.get(path)).status(), path).toBe(200);
  }
  await page.reload();
  expect(await page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);

  // Offline: reload, then Knock still gives a ghost and a row from the cached model.
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Listening station');
  await page.getByRole('button', { name: 'Knock', exact: true }).click();
  const row = page.getByRole('list', { name: 'Recent sounds' }).getByRole('listitem').first();
  await expect(row).toContainText('Knock', { timeout: MODEL_TIMEOUT });
  await expect(page.locator('[data-card="pipeline"] [data-backend]')).toHaveAttribute('data-backend', /^(webgl|cpu)$/);

  await page.goto('/band.html');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await context.setOffline(false);

  const list = new Set(precacheList());
  expect(list.has('/models/yamnet/model.json')).toBe(true);
  const off = requests.filter((u) => new URL(u).origin !== origin);
  expect(off, 'requests that left the origin').toEqual([]);
  const unknown = requests.map((u) => new URL(u).pathname).filter((p) => !list.has(p) && p !== '/sw.js' && p !== '/' && !p.endsWith('.html'));
  expect(unknown, 'requests outside the precache list').toEqual([]);
  expect(problems).toEqual([]);
});
