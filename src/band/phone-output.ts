import type { HapticCommand } from '../haptics';
import type { HapticOutput } from './types';

/** The part of `navigator` the phone output uses. */
interface VibrateHost {
  vibrate?: unknown;
}

/** True when every segment of the command has both levels at 0, as the engine builds it for intensity 0. */
function isSilent(command: HapticCommand): boolean {
  return command.segments.every((s) => s.left === 0 && s.right === 0);
}

/**
 * Creates the phone output: it plays `command.vibrate`, the rhythm, on `navigator.vibrate`. The phone has
 * one motor and no strength control, so side and level are not encoded; the rhythm alone names the class.
 * `nav` is for tests; without it `globalThis.navigator` is looked up at each call. `vibrate` is called as
 * a method of the navigator (a detached call throws in browsers), its return value is ignored (a browser
 * may refuse a call without user activation), and an error it throws is swallowed without logging.
 *
 * Decision (design.md, "Phone output"): a command whose levels are all 0 does not vibrate. The engine
 * builds such a command when the user set the strength to 0, and a phone that cannot set a strength
 * would otherwise buzz at full strength against that choice.
 */
export function createPhoneOutput(nav?: VibrateHost): HapticOutput {
  function host(): (VibrateHost & { vibrate: (pattern: number | readonly number[]) => unknown }) | null {
    const n = nav ?? (globalThis as { navigator?: VibrateHost }).navigator;
    return n && typeof n.vibrate === 'function' ? (n as VibrateHost & { vibrate: (pattern: number | readonly number[]) => unknown }) : null;
  }

  return {
    kind: 'phone',
    available: () => host() !== null,
    play(command) {
      const n = host();
      if (n === null || isSilent(command)) return;
      try {
        n.vibrate(command.vibrate);
      } catch {
        // The browser refused; the simulator and the text still show the alert.
      }
    },
    stop() {
      const n = host();
      if (n === null) return;
      try {
        n.vibrate(0);
      } catch {
        // Nothing to undo.
      }
    },
  };
}
