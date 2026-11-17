import type { HapticCommand } from '../haptics';

/**
 * One way to play a `HapticCommand`: the band simulator on screen or the phone's own vibration motor.
 * `haptics` never knows which output is active. The Bluetooth band adds its own `kind` in a later feature.
 * An output never changes the command it receives.
 */
export interface HapticOutput {
  /** Which output this is, for naming it in text. */
  kind: 'simulator' | 'phone';
  /** Whether this output can play on this device right now. */
  available(): boolean;
  /** Plays the command, replacing whatever this output was playing. */
  play(command: HapticCommand): void;
  /** Stops the current command, if any. */
  stop(): void;
}
