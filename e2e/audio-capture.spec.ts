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
