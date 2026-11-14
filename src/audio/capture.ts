// createCapture: the state machine that ties the sources, the graph and the mono pipeline together.
// Nothing here runs at import time or in createCapture(); all browser work starts inside start().
import { fetchClip, loadManifest } from './clips';
import { STEREO_BLOCK } from './constants';
import { CaptureFailure, LOST_AUDIO_MESSAGE, MIC_STOPPED_MESSAGE, captureError } from './errors';
import { buildGraph, resumeContext, type Graph } from './graph';
import { describeMic, openMic } from './mic';
import { createMonoPipeline, type MonoPipeline } from './pipeline';
import type { Capture, CaptureError, CaptureOptions, CaptureSource, CaptureState, MonoFrame, StereoFrame } from './types';

/** Everything one start attempt creates. Released exactly once. */
interface Session {
  source: CaptureSource;
  stream?: MediaStream;
  ctx?: AudioContext;
  graph?: Graph;
  node?: AudioNode;
  pipeline?: MonoPipeline;
  nextStart: number;
  released: boolean;
}

type Listener<T> = (value: T) => void;

function errorName(thrown: unknown): string {
  try {
    const name = (thrown as { name?: unknown } | null)?.name;
    return typeof name === 'string' ? name : typeof thrown;
  } catch {
    return 'unknown';
  }
}

/** Programming errors still throw from start(); browser and network failures become an error state. */
function isProgrammingError(thrown: unknown): boolean {
  return thrown instanceof TypeError || thrown instanceof RangeError || thrown instanceof ReferenceError || thrown instanceof SyntaxError;
}

async function release(s: Session): Promise<void> {
  if (s.released) return;
  s.released = true;
  for (const track of s.stream?.getTracks() ?? []) {
    track.onended = null;
    track.stop();
  }
  if (s.node instanceof AudioBufferSourceNode) {
    s.node.onended = null;
    try {
      s.node.stop();
    } catch {
      // never started
    }
  }
  s.node?.disconnect();
  s.graph?.release();
  s.pipeline?.reset();
  if (s.ctx && s.ctx.state !== 'closed') {
    try {
      await s.ctx.close();
    } catch {
      // already closing
    }
  }
}

export function createCapture(options: CaptureOptions = {}): Capture {
  const stereoBlock = options.stereoBlock ?? STEREO_BLOCK;
  if (!Number.isInteger(stereoBlock) || stereoBlock <= 0) throw new RangeError(`stereoBlock must be a positive integer, got ${stereoBlock}`);

  let state: CaptureState = { status: 'idle' };
  let session: Session | null = null;
  let generation = 0;
  const monoListeners: Listener<MonoFrame>[] = [];
  const stereoListeners: Listener<StereoFrame>[] = [];
  const stateListeners: Listener<CaptureState>[] = [];

  function deliver<T>(listeners: Listener<T>[], value: T): void {
    for (const listener of listeners.slice()) {
      try {
        listener(value);
      } catch (thrown) {
        console.error(`Audio capture listener failed: ${errorName(thrown)}`);
      }
    }
  }

  function subscribe<T>(listeners: Listener<T>[], listener: Listener<T>): () => void {
    listeners.push(listener);
    return () => {
      const i = listeners.indexOf(listener);
      if (i >= 0) listeners.splice(i, 1);
    };
  }

  function setState(next: CaptureState): void {
    state = next;
    deliver(stateListeners, next);
  }

  /** Ends the live session `s` with an error (lost audio, microphone stopped). */
  function fail(s: Session, error: CaptureError): void {
    if (session !== s || s.released) return;
    session = null;
    void release(s);
    setState({ status: 'error', error });
  }

  function onBlock(s: Session, leftBuffer: ArrayBuffer, rightBuffer: ArrayBuffer, startSample: number): void {
    if (s.released || !s.ctx || !s.pipeline) return;
    if (startSample !== s.nextStart) {
      fail(s, captureError('unknown', LOST_AUDIO_MESSAGE));
      return;
    }
    const left = new Float32Array(leftBuffer);
    const right = new Float32Array(rightBuffer);
    s.nextStart += left.length;
    const sampleRate = s.ctx.sampleRate;
    // The pipeline reads the arrays before any listener can keep or transfer them.
    const monoFrames = s.pipeline.push(left, right);
    deliver(stereoListeners, { left, right, sampleRate, startSample, startSec: startSample / sampleRate });
    for (const frame of monoFrames) {
      if (s.released) return;
      deliver(monoListeners, frame);
    }
  }

  function onFlushed(s: Session): void {
    if (s.released || !s.pipeline) return;
    for (const frame of s.pipeline.flush()) {
      if (s.released) return;
      deliver(monoListeners, frame);
    }
    if (session !== s || s.released) return;
    session = null;
    setState({ status: 'ended', source: s.source });
    void release(s);
  }

  async function stop(): Promise<void> {
    generation++;
    const s = session;
    session = null;
    if (s) await release(s);
    if (state.status !== 'idle') setState({ status: 'idle' });
  }

  async function start(source: CaptureSource): Promise<CaptureState> {
    if (session || state.status === 'starting') await stop();
    const gen = ++generation;
    const current = () => gen === generation;
    const s: Session = { source, nextStart: 0, released: false };
    setState({ status: 'starting', source });

    try {
      if (typeof AudioContext === 'undefined' || typeof AudioWorkletNode === 'undefined') {
        throw new CaptureFailure(captureError('unsupported'));
      }
      // Fail early, before any context exists, for a missing microphone or a bad clip id.
      let clipBytes: ArrayBuffer | undefined;
      if (source.kind === 'mic') s.stream = await openMic();
      else clipBytes = await fetchClip(source.id);
      if (!current()) return await abandon(s);

      s.ctx = new AudioContext({ latencyHint: 'interactive' });
      await resumeContext(s.ctx);
      if (!current()) return await abandon(s);

      let buffer: AudioBuffer | undefined;
      if (clipBytes) {
        try {
          buffer = await s.ctx.decodeAudioData(clipBytes);
        } catch {
          throw new CaptureFailure(captureError('clip-load-failed'));
        }
        if (!current()) return await abandon(s);
      }

      s.pipeline = createMonoPipeline(s.ctx.sampleRate);
      s.graph = await buildGraph(s.ctx, stereoBlock, {
        onBlock: (l, r, startSample) => onBlock(s, l, r, startSample),
        onFlushed: () => onFlushed(s),
      });
      if (!current()) return await abandon(s);

      // From here to `listening` there is no await, so no Tap message is handled in between.
      let channels: 1 | 2 = 2;
      let rawProcessing = true;
      if (s.stream) {
        ({ channels, rawProcessing } = describeMic(s.stream));
        s.node = s.ctx.createMediaStreamSource(s.stream);
        s.node.connect(s.graph.input);
        for (const track of s.stream.getAudioTracks()) track.onended = () => fail(s, captureError('device-busy', MIC_STOPPED_MESSAGE));
      } else if (buffer) {
        channels = buffer.numberOfChannels === 1 ? 1 : 2;
        const node = new AudioBufferSourceNode(s.ctx, { buffer });
        node.onended = () => {
          if (session === s) s.graph?.flush();
        };
        node.connect(s.graph.input);
        node.start();
        s.node = node;
      }
      session = s;
      setState({ status: 'listening', source, sampleRate: s.ctx.sampleRate, channels, rawProcessing });
      return state;
    } catch (thrown) {
      await release(s);
      if (!current()) return state;
      const error = thrown instanceof CaptureFailure ? thrown.error : captureError('unknown');
      setState({ status: 'error', error });
      if (isProgrammingError(thrown)) throw thrown;
      return state;
    }
  }

  /** A newer start() or stop() took over while this attempt was waiting. */
  async function abandon(s: Session): Promise<CaptureState> {
    await release(s);
    return state;
  }

  return {
    get state() {
      return state;
    },
    start,
    stop,
    onMonoFrame: (listener) => subscribe(monoListeners, listener),
    onStereoFrame: (listener) => subscribe(stereoListeners, listener),
    onStateChange: (listener) => subscribe(stateListeners, listener),
    listClips: () => loadManifest(),
  };
}
