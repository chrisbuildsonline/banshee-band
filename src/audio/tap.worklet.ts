// The Tap: copies raw left and right input samples to the main thread in blocks.
// Runs in the AudioWorkletGlobalScope. Shares no runtime code with the main thread.
// No filtering, gain, resampling or dithering. No logging. No allocation per sample.

const DEFAULT_BLOCK = 1024;
const QUANTUM = 128;

export interface TapBlockMessage {
  type: 'block';
  left: ArrayBuffer;
  right: ArrayBuffer;
  startSample: number;
}

export interface TapFlushedMessage {
  type: 'flushed';
}

class TapProcessor extends AudioWorkletProcessor {
  private readonly block: number;
  private left: Float32Array;
  private right: Float32Array;
  private fill = 0;
  private startSample = 0;
  /** Stands in for a quantum with no input, so stream time never skips. */
  private readonly silence = new Float32Array(QUANTUM);

  constructor(options?: AudioWorkletNodeOptions) {
    super(options);
    const block: unknown = options?.processorOptions?.block;
    this.block = typeof block === 'number' && Number.isInteger(block) && block > 0 ? block : DEFAULT_BLOCK;
    this.left = new Float32Array(this.block);
    this.right = new Float32Array(this.block);
    this.port.onmessage = (event: MessageEvent) => {
      if ((event.data as { type?: unknown } | null)?.type === 'flush') {
        this.post();
        this.port.postMessage({ type: 'flushed' } satisfies TapFlushedMessage);
      }
    };
  }

  process(inputs: Float32Array[][]): boolean {
    const channels = inputs[0];
    const l = channels?.[0] ?? this.silence;
    const r = channels?.[1] ?? l; // the input stage is explicit stereo; this only guards a missing channel
    const n = l.length;
    const left = this.left;
    const right = this.right;
    for (let i = 0; i < n; i++) {
      left[this.fill] = l[i];
      right[this.fill] = r[i];
      if (++this.fill === this.block) {
        this.post();
      }
    }
    return true;
  }

  /** Posts the filled part of the current block with its buffers transferred, then starts a new block. */
  private post(): void {
    const fill = this.fill;
    if (fill === 0) return;
    const left = fill === this.block ? this.left : this.left.slice(0, fill);
    const right = fill === this.block ? this.right : this.right.slice(0, fill);
    const message: TapBlockMessage = { type: 'block', left: left.buffer as ArrayBuffer, right: right.buffer as ArrayBuffer, startSample: this.startSample };
    this.port.postMessage(message, [message.left, message.right]);
    this.startSample += fill;
    this.fill = 0;
    this.left = new Float32Array(this.block);
    this.right = new Float32Array(this.block);
  }
}

registerProcessor('banshee-tap', TapProcessor);
