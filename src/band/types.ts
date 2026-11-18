import type { HapticCommand } from '../haptics';

/**
 * One way to play a `HapticCommand`: the band simulator on screen or the phone's own vibration motor.
 * `haptics` never knows which output is active. The Bluetooth wristband is the third kind, `band`.
 * An output never changes the command it receives.
 */
export interface HapticOutput {
  /** Which output this is, for naming it in text. */
  kind: 'simulator' | 'phone' | 'band';
  /** Whether this output can play on this device right now. */
  available(): boolean;
  /** Plays the command, replacing whatever this output was playing. */
  play(command: HapticCommand): void;
  /** Stops the current command, if any. */
  stop(): void;
}

/** Where the Bluetooth link is: no Web Bluetooth here, not connected, opening the chooser or connecting, or connected. */
export type BandState = 'unsupported' | 'idle' | 'connecting' | 'connected';

/** Why the link is idle, when it did not end there on purpose: the chooser was closed, connecting failed, or the band dropped. */
export type BandProblem = 'cancelled' | 'failed' | 'lost';

/** The wristband over Web Bluetooth: its output, its state and the connect and disconnect actions. */
export interface BandLink {
  /** Plays on the band while connected (kind `band`); does nothing otherwise. */
  readonly output: HapticOutput;
  /** The current state. */
  state(): BandState;
  /** Why the link is idle, or null. */
  problem(): BandProblem | null;
  /** The band's name while connected, else null. */
  deviceName(): string | null;
  /** Opens the browser's chooser and connects. Call it in a click handler. Never rejects. */
  connect(): Promise<void>;
  /** Disconnects, or stops a connect that is under way. */
  disconnect(): void;
  /** Calls `listener` after every change of state or problem; returns the function that removes it. */
  subscribe(listener: () => void): () => void;
}
