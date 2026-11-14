// Recorded clips: the manifest and the WAV bytes. Same-origin GET requests only.
import { CaptureFailure, captureError } from './errors';
import type { ClipInfo } from './types';

const SAFE_FILE = /^[\w-]+(?:\.[\w-]+)*\.wav$/;

function clipsBase(): string {
  return `${import.meta.env.BASE_URL}clips/`;
}

/** Manifest entries as `ClipInfo`. Entries that are not well formed are dropped, not thrown on. Pure. */
export function parseManifest(data: unknown): ClipInfo[] {
  if (!Array.isArray(data)) return [];
  const clips: ClipInfo[] = [];
  for (const entry of data as unknown[]) {
    if (typeof entry !== 'object' || entry === null) continue;
    const { file, class: cls, label, durationSec } = entry as Record<string, unknown>;
    if (typeof file !== 'string' || !SAFE_FILE.test(file)) continue;
    if (typeof cls !== 'string' || typeof label !== 'string') continue;
    if (typeof durationSec !== 'number' || !Number.isFinite(durationSec) || durationSec <= 0) continue;
    clips.push({ id: file.replace(/\.wav$/, ''), file, class: cls, label, durationSec });
  }
  return clips;
}

async function get(url: string): Promise<Response> {
  const response = await fetch(url, { credentials: 'omit' });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response;
}

/** Reads `/clips/manifest.json`. Rejects if it cannot be fetched or parsed. */
export async function loadManifest(): Promise<ClipInfo[]> {
  return parseManifest(await (await get(`${clipsBase()}manifest.json`)).json());
}

/** Finds the clip and fetches its bytes. Throws `CaptureFailure` with `clip-not-found` or `clip-load-failed`. */
export async function fetchClip(id: string): Promise<ArrayBuffer> {
  let clips: ClipInfo[];
  try {
    clips = await loadManifest();
  } catch {
    throw new CaptureFailure(captureError('clip-load-failed'));
  }
  const clip = clips.find((c) => c.id === id);
  if (!clip) throw new CaptureFailure(captureError('clip-not-found'));
  try {
    return await (await get(`${clipsBase()}${clip.file}`)).arrayBuffer();
  } catch {
    throw new CaptureFailure(captureError('clip-load-failed'));
  }
}
