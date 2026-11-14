import { expect, test, type Page } from '@playwright/test';
import type { HarnessFrames, MonoMeta, StereoMeta } from '../src/audio/harness';
import type { CaptureState } from '../src/audio/types';

test.use({
  launchOptions: {
    args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
  },
});

const HARNESS = '/capture-harness.html';
const WAIT = { timeout: 10_000 };
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';

/** Wraps getUserMedia to record each call's constraints and the streams it returns. */
async function recordGetUserMedia(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as { __gum: { calls: unknown[]; streams: MediaStream[] } };
    w.__gum = { calls: [], streams: [] };
    const devices = navigator.mediaDevices;
    const original = devices.getUserMedia.bind(devices);
    devices.getUserMedia = async (constraints?: MediaStreamConstraints) => {
      w.__gum.calls.push(JSON.parse(JSON.stringify(constraints ?? null)));
      const stream = await original(constraints);
      w.__gum.streams.push(stream);
      return stream;
    };
  });
}

const frames = (page: Page) => page.evaluate(() => window.__frames as HarnessFrames);
const state = (page: Page) => page.evaluate(() => window.__states.at(-1) as CaptureState | undefined);
const status = async (page: Page) => (await state(page))?.status;

async function waitForFrames(page: Page, mono: number, stereo: number): Promise<void> {
  await expect
    .poll(async () => {
      const f = await frames(page);
      return f.monoCount >= mono && f.stereoCount >= stereo;
    }, WAIT)
    .toBe(true);
}

function checkStereo(stereo: StereoMeta[]): void {
  expect(stereo.length).toBeGreaterThan(1);
  for (const [i, f] of stereo.entries()) {
    expect(f.leftLength, `stereo frame ${i}`).toBeGreaterThan(0);
    expect(f.rightLength, `stereo frame ${i}`).toBe(f.leftLength);
    expect(f.startSec, `stereo frame ${i}`).toBeCloseTo(f.startSample / f.sampleRate, 9);
    if (i > 0) expect(f.startSample - stereo[i - 1].startSample, `stereo frame ${i} step`).toBe(stereo[i - 1].leftLength);
  }
}

function checkMono(mono: MonoMeta[]): void {
  expect(mono.length).toBeGreaterThan(0);
  for (const [i, f] of mono.entries()) {
    expect(f.length, `mono frame ${i}`).toBe(15600);
    expect(f.sampleRate, `mono frame ${i}`).toBe(16000);
    expect(f.index, `mono frame ${i}`).toBe(i);
    if (i > 0) expect(f.startSec - mono[i - 1].startSec, `mono frame ${i} spacing`).toBeCloseTo(0.4875, 9);
  }
}

test('microphone path delivers stereo and mono frames with raw constraints, and stop ends the track', async ({ page }) => {
  await recordGetUserMedia(page);
  await page.goto(HARNESS);
  await page.getByRole('button', { name: 'Start microphone' }).click();
  await expect.poll(() => status(page), WAIT).toBe('listening');
  await waitForFrames(page, 2, 40);

  const listening = (await state(page)) as Extract<CaptureState, { status: 'listening' }>;
  expect(listening.source).toEqual({ kind: 'mic' });
  expect(listening.sampleRate).toBeGreaterThan(0);
  expect([1, 2]).toContain(listening.channels);
  expect(typeof listening.rawProcessing).toBe('boolean');

  const calls = await page.evaluate(() => (window as unknown as { __gum: { calls: unknown[] } }).__gum.calls);
  expect(calls).toHaveLength(1);
  expect(calls[0]).toMatchObject({
    audio: { channelCount: 2, echoCancellation: false, noiseSuppression: false, autoGainControl: false },
  });
  expect((calls[0] as { video?: unknown }).video ?? false).toBe(false);

  const f = await frames(page);
  checkStereo(f.stereo);
  expect(f.stereo[0].startSample).toBe(0);
  expect(f.stereo.every((s) => s.sampleRate === listening.sampleRate)).toBe(true);
  checkMono(f.mono);
  expect(f.mono[0].startSample).toBe(0);
  expect(f.mono[1].startSample).toBe(7800);

  await page.getByRole('button', { name: 'Stop' }).click();
  await expect.poll(() => status(page), WAIT).toBe('idle');
  const tracks = await page.evaluate(() =>
    (window as unknown as { __gum: { streams: MediaStream[] } }).__gum.streams.flatMap((s) => s.getTracks().map((t) => t.readyState)),
  );
  expect(tracks.length).toBeGreaterThan(0);
  expect(tracks.every((t) => t === 'ended')).toBe(true);

  const after = await frames(page);
  await page.waitForTimeout(500); // a negative check: nothing may arrive in this time
  const later = await frames(page);
  expect(later.stereoCount).toBe(after.stereoCount);
  expect(later.monoCount).toBe(after.monoCount);
});

const CLIP_WAIT = { timeout: 20_000 };

async function startClip(page: Page, id = 'doorbell-01'): Promise<void> {
  await page.getByLabel('Clip id').fill(id);
  await page.getByRole('button', { name: 'Start clip' }).click();
}

test('clip path delivers the same frames with no microphone request, then ends', async ({ page }) => {
  await recordGetUserMedia(page);
  await page.goto(HARNESS);
  const manifest = await page.evaluate(async () => (await fetch('/clips/manifest.json')).json());
  const durationSec = (manifest as { file: string; durationSec: number }[]).find((c) => c.file === 'doorbell-01.wav')!.durationSec;

  await startClip(page);
  await expect.poll(() => status(page), WAIT).toBe('listening');
  const listening = (await state(page)) as Extract<CaptureState, { status: 'listening' }>;
  expect(listening.source).toEqual({ kind: 'clip', id: 'doorbell-01' });
  expect(listening.rawProcessing).toBe(true);
  expect([1, 2]).toContain(listening.channels);

  await expect.poll(() => status(page), CLIP_WAIT).toBe('ended');
  const states = await page.evaluate(() => window.__states.map((s) => s.status));
  expect(states).toEqual(['starting', 'listening', 'ended']);

  const calls = await page.evaluate(() => (window as unknown as { __gum: { calls: unknown[] } }).__gum.calls);
  expect(calls).toEqual([]);

  const f = await frames(page);
  expect(f.stereoCount).toBe(f.stereo.length); // all kept, so every step can be checked
  checkStereo(f.stereo);
  expect(f.stereo[0].startSample).toBe(0);
  expect(f.stereo.every((s) => s.sampleRate === listening.sampleRate)).toBe(true);
  // `ended` came after the whole clip: the stereo stream covers at least its duration.
  const last = f.stereo.at(-1)!;
  expect((last.startSample + last.leftLength) / last.sampleRate).toBeGreaterThanOrEqual(durationSec - 0.01);
  checkMono(f.mono);

  const expected = Math.floor(Math.floor(durationSec * 16000 - 15600) / 7800) + 1;
  expect(Math.abs(f.monoCount - expected), `mono frames ${f.monoCount}, expected ${expected}`).toBeLessThanOrEqual(1);
  expect(Math.max(...f.mono.map((m) => m.rms))).toBeGreaterThan(0.001);

  // Released: nothing more arrives after `ended`.
  await page.waitForTimeout(500); // a negative check: nothing may arrive in this time
  const later = await frames(page);
  expect(later.monoCount).toBe(f.monoCount);
  expect(later.stereoCount).toBe(f.stereoCount);
});

test('clip and microphone frames have the same shape', async ({ page }) => {
  await recordGetUserMedia(page);
  await page.goto(HARNESS);

  await page.getByRole('button', { name: 'Start microphone' }).click();
  await waitForFrames(page, 1, 2);
  const mic = await frames(page);
  await page.getByRole('button', { name: 'Stop' }).click();
  await expect.poll(() => status(page), WAIT).toBe('idle');

  await startClip(page);
  await waitForFrames(page, 1, 2);
  const clip = await frames(page);
  await page.getByRole('button', { name: 'Stop' }).click();

  expect(clip.mono[0].fields).toBe(mic.mono[0].fields);
  expect(clip.mono[0].fields).toBe('index,sampleRate,samples,startSec');
  expect(clip.stereo[0].fields).toBe(mic.stereo[0].fields);
  expect(clip.stereo[0].fields).toBe('left,right,sampleRate,startSample,startSec');
  expect(clip.mono[0].length).toBe(mic.mono[0].length);
  expect(clip.mono[0].sampleRate).toBe(mic.mono[0].sampleRate);
  expect(clip.stereo[0].leftLength).toBe(mic.stereo[0].leftLength);
  expect(clip.stereo[0].leftLength).toBe(1024);
});

for (const [name, code] of [
  ['NotAllowedError', 'permission-denied'],
  ['NotFoundError', 'no-device'],
  ['NotReadableError', 'device-busy'],
] as const) {
  test(`${name} from getUserMedia gives ${code}, and a clip still starts after it`, async ({ page }) => {
    await page.addInitScript((errorName) => {
      navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException('stubbed failure', errorName));
    }, name);
    await page.goto(HARNESS);
    await page.getByRole('button', { name: 'Start microphone' }).click();
    await expect.poll(() => status(page), WAIT).toBe('error');
    const failed = (await state(page)) as Extract<CaptureState, { status: 'error' }>;
    expect(failed.error.code).toBe(code);
    expect(failed.error.message.length).toBeGreaterThan(0);
    expect(failed.error.message).not.toContain('stubbed failure');
    await expect(page.locator('#status')).toContainText(code);

    await startClip(page);
    await expect.poll(() => status(page), WAIT).toBe('listening');
    await waitForFrames(page, 0, 2);
    await page.getByRole('button', { name: 'Stop' }).click();
    await expect.poll(() => status(page), WAIT).toBe('idle');
  });
}

test('makes no request outside the page, its modules and the clips', async ({ page, baseURL }) => {
  const origin = new URL(baseURL!).origin;
  const requests: string[] = [];
  page.on('request', (request) => requests.push(request.url()));
  const allowed = (url: URL) =>
    url.pathname === HARNESS ||
    url.pathname === '/favicon.svg' ||
    url.pathname === '/clips/manifest.json' ||
    /^\/clips\/[\w-]+(?:\.[\w-]+)*\.wav$/.test(url.pathname) ||
    ['/src/', '/@vite/', '/@id/', '/node_modules/'].some((prefix) => url.pathname.startsWith(prefix));

  await recordGetUserMedia(page);
  await page.goto(HARNESS);
  await page.getByRole('button', { name: 'Start microphone' }).click();
  await waitForFrames(page, 2, 40);
  await page.getByRole('button', { name: 'Stop' }).click();
  await expect.poll(() => status(page), WAIT).toBe('idle');
  await startClip(page);
  await expect.poll(() => status(page), CLIP_WAIT).toBe('ended');

  expect(requests.length).toBeGreaterThan(0);
  const unexpected = requests.filter((raw) => {
    const url = new URL(raw);
    if (url.protocol === 'data:' || url.protocol === 'blob:') return false;
    return url.origin !== origin || !allowed(url);
  });
  expect(unexpected, unexpected.join('\n')).toEqual([]);
  expect(requests.filter((r) => r.includes('/clips/'))).toEqual([`${origin}/clips/manifest.json`, `${origin}/clips/doorbell-01.wav`]);
});

test('harness controls are reachable by keyboard with visible focus and labels', async ({ page }) => {
  await recordGetUserMedia(page);
  await page.goto(HARNESS);
  const names = ['Start microphone', 'Clip id', 'Start clip', 'Stop'];
  expect(await page.locator(FOCUSABLE).count()).toBe(names.length);

  for (const name of names) {
    await page.keyboard.press('Tab');
    const focus = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement;
      const style = getComputedStyle(el);
      const label = el.id ? document.querySelector(`label[for="${el.id}"]`)?.textContent : null;
      return {
        name: (el instanceof HTMLInputElement ? label : el.textContent)?.trim() ?? '',
        ring: style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0,
      };
    });
    expect(focus.name).toBe(name);
    expect(focus.ring, `${name} has no visible focus ring`).toBe(true);
  }

  // Enter on Stop (focused last) keeps the page idle; Space on Start microphone starts listening.
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'Start microphone' }).focus();
  await page.keyboard.press('Space');
  await expect.poll(() => status(page), WAIT).toBe('listening');
  await page.getByRole('button', { name: 'Stop' }).focus();
  await page.keyboard.press('Enter');
  await expect.poll(() => status(page), WAIT).toBe('idle');
});
