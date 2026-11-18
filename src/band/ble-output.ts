import { BAND_COMMAND_UUID, BAND_SERVICE_UUID, encodePlay, encodeStop } from './protocol';
import type { BandLink, BandProblem, BandState, HapticOutput } from './types';

/** The parts of a GATT characteristic the link uses. */
export interface CharacteristicLike {
  writeValueWithResponse(data: Uint8Array): Promise<unknown>;
}

/** The parts of a GATT server the link uses. */
export interface GattServerLike {
  connect(): Promise<GattServerLike>;
  disconnect(): void;
  getPrimaryService(uuid: string): Promise<{ getCharacteristic(uuid: string): Promise<CharacteristicLike> }>;
}

/** The parts of a Bluetooth device the link uses. */
export interface DeviceLike {
  name?: string | null;
  gatt?: GattServerLike | null;
  addEventListener(type: 'gattserverdisconnected', listener: () => void): void;
  removeEventListener(type: 'gattserverdisconnected', listener: () => void): void;
}

/** The parts of `navigator.bluetooth` the link uses, so no Web Bluetooth type package is needed. */
export interface BluetoothLike {
  requestDevice(options: { filters: { services: string[] }[] }): Promise<DeviceLike>;
}

const isNotFound = (e: unknown) => typeof e === 'object' && e !== null && (e as { name?: unknown }).name === 'NotFoundError';

/**
 * Creates the link to the wristband over Web Bluetooth. `host` is for tests; without it `globalThis.navigator` is
 * read once, here. Without `navigator.bluetooth` (Safari, Firefox, an insecure page) the state is `unsupported`
 * for good and `connect` does nothing. The output writes one frame at a time: while a write is in flight only the
 * newest frame waits, because a new command replaces what plays. Write errors are swallowed; the simulator and the
 * text still show every alert.
 */
export function createBandLink(host?: { bluetooth?: BluetoothLike }): BandLink {
  const source = host ?? (globalThis as { navigator?: { bluetooth?: BluetoothLike } }).navigator;
  const bluetooth = source?.bluetooth;
  const supported = typeof bluetooth?.requestDevice === 'function';

  let state: BandState = supported ? 'idle' : 'unsupported';
  let problem: BandProblem | null = null;
  let device: DeviceLike | null = null;
  let characteristic: CharacteristicLike | null = null;
  /** Bumped by every connect and disconnect, so a stale attempt knows to give up. */
  let attempt = 0;
  let inFlight = false;
  let waiting: Uint8Array | null = null;
  const listeners = new Set<() => void>();

  function set(next: BandState, why: BandProblem | null): void {
    state = next;
    problem = why;
    for (const l of [...listeners]) l();
  }

  function forget(): void {
    device?.removeEventListener('gattserverdisconnected', onLost);
    device = null;
    characteristic = null;
    waiting = null;
  }

  function onLost(): void {
    if (state !== 'connected') return;
    forget();
    set('idle', 'lost');
  }

  function send(frame: Uint8Array): void {
    const c = characteristic;
    if (state !== 'connected' || c === null) return;
    if (inFlight) {
      waiting = frame;
      return;
    }
    inFlight = true;
    let write: Promise<unknown>;
    try {
      write = Promise.resolve(c.writeValueWithResponse(frame));
    } catch (e) {
      write = Promise.reject(e);
    }
    write
      .catch(() => undefined)
      .then(() => {
        inFlight = false;
        const next = waiting;
        waiting = null;
        if (next) send(next);
      });
  }

  const output: HapticOutput = {
    kind: 'band',
    available: () => state === 'connected',
    play(command) {
      if (state !== 'connected') return;
      let frame: Uint8Array;
      try {
        frame = encodePlay(command);
      } catch {
        return;
      }
      send(frame);
    },
    stop() {
      if (state === 'connected') send(encodeStop());
    },
  };

  async function connect(): Promise<void> {
    if (state !== 'idle' || bluetooth === undefined) return;
    const mine = ++attempt;
    let request: Promise<DeviceLike>;
    try {
      // First, with nothing awaited before it: the chooser needs the click's user activation.
      request = Promise.resolve(bluetooth.requestDevice({ filters: [{ services: [BAND_SERVICE_UUID] }] }));
    } catch (e) {
      request = Promise.reject(e);
    }
    set('connecting', null);
    try {
      const d = await request;
      if (mine !== attempt) return;
      if (!d.gatt) throw new Error('the band has no GATT server');
      device = d;
      d.addEventListener('gattserverdisconnected', onLost);
      const server = await d.gatt.connect();
      const service = await server.getPrimaryService(BAND_SERVICE_UUID);
      const c = await service.getCharacteristic(BAND_COMMAND_UUID);
      if (mine !== attempt) {
        d.gatt.disconnect();
        return;
      }
      characteristic = c;
      set('connected', null);
    } catch (e) {
      if (mine !== attempt) return;
      const d = device;
      forget();
      try {
        d?.gatt?.disconnect();
      } catch {
        // Nothing left to close.
      }
      set('idle', isNotFound(e) ? 'cancelled' : 'failed');
    }
  }

  function disconnect(): void {
    if (state !== 'connecting' && state !== 'connected') return;
    attempt++;
    const d = device;
    forget();
    try {
      d?.gatt?.disconnect();
    } catch {
      // Already gone.
    }
    set('idle', null);
  }

  return {
    output,
    state: () => state,
    problem: () => problem,
    deviceName: () => (state === 'connected' ? device?.name || null : null),
    connect,
    disconnect,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
