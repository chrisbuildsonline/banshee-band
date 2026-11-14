// The shared Web Audio graph: source -> stereo input stage -> Tap -> muted gain -> destination.
import { CaptureFailure, captureError } from './errors';
import type { TapBlockMessage, TapFlushedMessage } from './tap.worklet';
// Worklet URL: the `?worker&url` form works with Vite 8 in dev (served as an ES module) and in the
// build (bundled to its own file under assets/). Same code path in both.
import tapUrl from './tap.worklet.ts?worker&url';

export interface GraphHandlers {
  onBlock(left: ArrayBuffer, right: ArrayBuffer, startSample: number): void;
  onFlushed(): void;
}

export interface Graph {
  /** Connect the source here. Two channels, explicit, speakers up-mix. */
  readonly input: AudioNode;
  /** Asks the Tap for its partly filled block, followed by a `flushed` message. */
  flush(): void;
  /** Disconnects every node and stops message handling. Idempotent. Does not close the context. */
  release(): void;
}

const running = (ctx: AudioContext) => ctx.state === 'running';

/** Resumes the context, retrying once. Fails with `unknown` if it still does not run. */
export async function resumeContext(ctx: AudioContext): Promise<void> {
  for (let attempt = 0; attempt < 2 && !running(ctx); attempt++) {
    try {
      await ctx.resume();
    } catch {
      // checked below
    }
  }
  if (!running(ctx)) throw new CaptureFailure(captureError('unknown'));
}

export async function buildGraph(ctx: AudioContext, block: number, handlers: GraphHandlers): Promise<Graph> {
  try {
    await ctx.audioWorklet.addModule(tapUrl);
  } catch {
    throw new CaptureFailure(captureError('worklet-failed'));
  }
  const input = new GainNode(ctx, { channelCount: 2, channelCountMode: 'explicit', channelInterpretation: 'speakers', gain: 1 });
  const tap = new AudioWorkletNode(ctx, 'banshee-tap', {
    numberOfInputs: 1,
    numberOfOutputs: 1,
    channelCount: 2,
    channelCountMode: 'explicit',
    channelInterpretation: 'speakers',
    outputChannelCount: [2],
    processorOptions: { block },
  });
  // Zero gain keeps the speakers silent while the destination keeps pulling audio through the Tap.
  const mute = new GainNode(ctx, { gain: 0 });
  tap.port.onmessage = (event: MessageEvent<TapBlockMessage | TapFlushedMessage>) => {
    const data = event.data;
    if (data.type === 'block') handlers.onBlock(data.left, data.right, data.startSample);
    else if (data.type === 'flushed') handlers.onFlushed();
  };
  input.connect(tap);
  tap.connect(mute);
  mute.connect(ctx.destination);

  let released = false;
  return {
    input,
    flush() {
      if (!released) tap.port.postMessage({ type: 'flush' });
    },
    release() {
      if (released) return;
      released = true;
      tap.port.onmessage = null;
      input.disconnect();
      tap.disconnect();
      mute.disconnect();
    },
  };
}
