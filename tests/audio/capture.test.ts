import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCapture } from '../../src/audio';
import type { CaptureState } from '../../src/audio';

// Node has no AudioContext or AudioWorkletNode, so these tests cover the browser-free parts of the
// state machine and the `unsupported` path (Requirement 10.4).

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('createCapture', () => {
  it('does nothing on creation: no request, no context, idle state', () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const capture = createCapture();
    capture.onMonoFrame(() => {});
    capture.onStereoFrame(() => {});
    capture.onStateChange(() => {});
    expect(capture.state).toEqual({ status: 'idle' });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('reports unsupported when the browser has no AudioContext, and start does not reject', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    for (const source of [{ kind: 'mic' }, { kind: 'clip', id: 'doorbell-01' }] as const) {
      const capture = createCapture();
      const seen: CaptureState[] = [];
      capture.onStateChange((s) => seen.push(s));
      const result = await capture.start(source);
      expect(result.status).toBe('error');
      expect(result).toEqual(capture.state);
      if (result.status === 'error') {
        expect(result.error.code).toBe('unsupported');
        expect(result.error.message.length).toBeGreaterThan(0);
      }
      expect(seen.map((s) => s.status)).toEqual(['starting', 'error']);
    }
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('keeps delivering to other listeners when one throws, and unsubscribes', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const capture = createCapture();
    const a: string[] = [];
    const b: string[] = [];
    capture.onStateChange(() => {
      throw new Error('listener bug');
    });
    const offA = capture.onStateChange((s) => a.push(s.status));
    capture.onStateChange((s) => b.push(s.status));
    await capture.start({ kind: 'mic' });
    offA();
    await capture.stop();
    expect(a).toEqual(['starting', 'error']);
    expect(b).toEqual(['starting', 'error', 'idle']);
    expect(console.error).toHaveBeenCalledWith('Audio capture listener failed: Error');
  });

  it('stop from idle stays idle without a state change', async () => {
    const capture = createCapture();
    const seen: CaptureState[] = [];
    capture.onStateChange((s) => seen.push(s));
    await capture.stop();
    expect(capture.state).toEqual({ status: 'idle' });
    expect(seen).toEqual([]);
  });

  it('rejects an invalid stereo block size', () => {
    expect(() => createCapture({ stereoBlock: 0 })).toThrow(RangeError);
    expect(() => createCapture({ stereoBlock: 1.5 })).toThrow(RangeError);
  });
});
