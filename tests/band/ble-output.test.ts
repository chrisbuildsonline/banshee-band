import { describe, expect, it, vi } from 'vitest';
import { createBandLink, type BluetoothLike } from '../../src/band/ble-output';
import { bandStatusText } from '../../src/band/labels';
import { BAND_COMMAND_UUID, BAND_SERVICE_UUID, encodePlay, encodeStop } from '../../src/band/protocol';
import type { HapticCommand } from '../../src/haptics';
import { ALARM_CENTRE_HIGH, KNOCK_LEFT_HIGH } from './helpers/commands';

/** A promise with its resolve and reject on the outside. */
function deferred<T = void>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

/** A fake `navigator.bluetooth` with one band: records every call and every written frame. */
function fakeBluetooth(options: { name?: string; requestError?: unknown; connectError?: unknown; writeError?: unknown; manualWrites?: boolean } = {}) {
  const calls: string[] = [];
  const writes: number[][] = [];
  const pendingWrites: { resolve: () => void }[] = [];
  const listeners = new Set<() => void>();
  const characteristic = {
    writeValueWithResponse(data: Uint8Array) {
      calls.push('write');
      writes.push([...data]);
      if (options.writeError) return Promise.reject(options.writeError);
      if (options.manualWrites) {
        const d = deferred();
        pendingWrites.push(d);
        return d.promise;
      }
      return Promise.resolve();
    },
  };
  const server = {
    connect() {
      calls.push('gatt.connect');
      return options.connectError ? Promise.reject(options.connectError) : Promise.resolve(server);
    },
    disconnect() {
      calls.push('gatt.disconnect');
    },
    getPrimaryService(uuid: string) {
      calls.push(`service ${uuid}`);
      return Promise.resolve({
        getCharacteristic(c: string) {
          calls.push(`characteristic ${c}`);
          return Promise.resolve(characteristic);
        },
      });
    },
  };
  const device = {
    name: options.name ?? 'Banshee Band',
    gatt: server,
    addEventListener: (_type: string, l: () => void) => listeners.add(l),
    removeEventListener: (_type: string, l: () => void) => listeners.delete(l),
  };
  const bluetooth: BluetoothLike = {
    requestDevice: vi.fn((filter: unknown) => {
      calls.push(`requestDevice ${JSON.stringify(filter)}`);
      return options.requestError ? Promise.reject(options.requestError) : Promise.resolve(device);
    }),
  };
  return { bluetooth, calls, writes, pendingWrites, lose: () => [...listeners].forEach((l) => l()), listeners };
}

const notFound = Object.assign(new Error('User cancelled the requestDevice() chooser.'), { name: 'NotFoundError' });

async function connected(options: Parameters<typeof fakeBluetooth>[0] = {}) {
  const fake = fakeBluetooth(options);
  const link = createBandLink({ bluetooth: fake.bluetooth });
  await link.connect();
  return { fake, link };
}

describe('createBandLink: support (R3.1, R3.2)', () => {
  it('is unsupported without navigator.bluetooth or requestDevice', async () => {
    for (const host of [{}, { bluetooth: undefined }, { bluetooth: {} as BluetoothLike }, { bluetooth: { requestDevice: 1 } as unknown as BluetoothLike }]) {
      const link = createBandLink(host);
      expect(link.state()).toBe('unsupported');
      await link.connect();
      expect(link.state()).toBe('unsupported');
      expect(link.output.available()).toBe(false);
    }
  });

  it('reads globalThis.navigator once, at creation', () => {
    vi.stubGlobal('navigator', {});
    const link = createBandLink();
    vi.stubGlobal('navigator', fakeBluetooth());
    expect(link.state()).toBe('unsupported');
    vi.unstubAllGlobals();
  });

  it('starts idle with no problem when Bluetooth is there', () => {
    const link = createBandLink({ bluetooth: fakeBluetooth().bluetooth });
    expect(link.state()).toBe('idle');
    expect(link.problem()).toBeNull();
    expect(link.deviceName()).toBeNull();
    expect(link.output.kind).toBe('band');
  });
});

describe('createBandLink: connect (R3.3-R3.5)', () => {
  it('asks for the band service before any await, then connects in order', async () => {
    const fake = fakeBluetooth();
    const link = createBandLink({ bluetooth: fake.bluetooth });
    const done = link.connect();
    expect(fake.calls).toEqual([`requestDevice ${JSON.stringify({ filters: [{ services: [BAND_SERVICE_UUID] }] })}`]);
    expect(link.state()).toBe('connecting');
    await done;
    expect(fake.calls).toEqual([fake.calls[0], 'gatt.connect', `service ${BAND_SERVICE_UUID}`, `characteristic ${BAND_COMMAND_UUID}`]);
    expect(link.state()).toBe('connected');
    expect(link.problem()).toBeNull();
    expect(link.deviceName()).toBe('Banshee Band');
    expect(link.output.available()).toBe(true);
  });

  it('a cancelled chooser gives idle and cancelled, and never rejects', async () => {
    const { link } = await connected({ requestError: notFound });
    expect(link.state()).toBe('idle');
    expect(link.problem()).toBe('cancelled');
  });

  it('any other error gives idle and failed', async () => {
    for (const options of [{ requestError: new Error('no adapter') }, { connectError: new Error('GATT error') }, { requestError: 'odd' }]) {
      const { link } = await connected(options);
      expect(link.state()).toBe('idle');
      expect(link.problem()).toBe('failed');
      expect(link.output.available()).toBe(false);
    }
  });

  it('a requestDevice that throws at once gives failed too', async () => {
    const link = createBandLink({
      bluetooth: {
        requestDevice: () => {
          throw new TypeError('not allowed');
        },
      },
    });
    await link.connect();
    expect([link.state(), link.problem()]).toEqual(['idle', 'failed']);
  });

  it('a lost connection gives idle and lost; a new connect clears the problem', async () => {
    const { fake, link } = await connected();
    fake.lose();
    expect([link.state(), link.problem(), link.deviceName()]).toEqual(['idle', 'lost', null]);
    expect(link.output.available()).toBe(false);
    const again = link.connect();
    expect(link.problem()).toBeNull();
    await again;
    expect(link.state()).toBe('connected');
  });

  it('disconnect writes nothing, calls gatt.disconnect and gives idle with no problem', async () => {
    const { fake, link } = await connected();
    link.disconnect();
    expect(fake.writes).toEqual([]);
    expect(fake.calls.at(-1)).toBe('gatt.disconnect');
    expect([link.state(), link.problem()]).toEqual(['idle', null]);
    fake.lose();
    expect(link.problem()).toBeNull();
  });

  it('a second connect while connecting or connected does nothing', async () => {
    const fake = fakeBluetooth();
    const link = createBandLink({ bluetooth: fake.bluetooth });
    const first = link.connect();
    await link.connect();
    await first;
    await link.connect();
    expect(fake.bluetooth.requestDevice).toHaveBeenCalledTimes(1);
  });

  it('disconnect while connecting cancels the attempt', async () => {
    const fake = fakeBluetooth();
    const link = createBandLink({ bluetooth: fake.bluetooth });
    const pending = link.connect();
    link.disconnect();
    await pending;
    expect(link.state()).toBe('idle');
    expect(link.problem()).toBeNull();
  });

  it('calls listeners after every change, until they unsubscribe', async () => {
    const fake = fakeBluetooth();
    const link = createBandLink({ bluetooth: fake.bluetooth });
    const seen: string[] = [];
    const off = link.subscribe(() => seen.push(`${link.state()}/${link.problem()}`));
    await link.connect();
    fake.lose();
    off();
    await link.connect();
    expect(seen).toEqual(['connecting/null', 'connected/null', 'idle/lost']);
  });
});

describe('createBandLink: output (R3.6-R3.8)', () => {
  it('play writes the encodePlay bytes and stop the STOP frame', async () => {
    const { fake, link } = await connected();
    link.output.play(KNOCK_LEFT_HIGH);
    await flush();
    link.output.stop();
    await flush();
    expect(fake.writes).toEqual([[...encodePlay(KNOCK_LEFT_HIGH)], [...encodeStop()]]);
  });

  it('does nothing when not connected', async () => {
    const fake = fakeBluetooth();
    const link = createBandLink({ bluetooth: fake.bluetooth });
    link.output.play(KNOCK_LEFT_HIGH);
    link.output.stop();
    await flush();
    expect(fake.writes).toEqual([]);
  });

  it('writes one frame at a time and keeps only the newest waiting frame', async () => {
    const { fake, link } = await connected({ manualWrites: true });
    link.output.play(KNOCK_LEFT_HIGH);
    link.output.play(ALARM_CENTRE_HIGH);
    link.output.stop();
    link.output.play({ ...KNOCK_LEFT_HIGH, side: 'right' });
    expect(fake.writes).toHaveLength(1);
    fake.pendingWrites[0].resolve();
    await flush();
    expect(fake.writes).toEqual([[...encodePlay(KNOCK_LEFT_HIGH)], [...encodePlay({ ...KNOCK_LEFT_HIGH, side: 'right' })]]);
    fake.pendingWrites[1].resolve();
    await flush();
    expect(fake.writes).toHaveLength(2);
  });

  it('a failing write and a command that cannot be encoded never throw', async () => {
    const { fake, link } = await connected({ writeError: new Error('GATT operation failed') });
    const bad: HapticCommand = { ...KNOCK_LEFT_HIGH, segments: [] };
    expect(() => link.output.play(bad)).not.toThrow();
    expect(() => link.output.play(KNOCK_LEFT_HIGH)).not.toThrow();
    await flush();
    link.output.play(KNOCK_LEFT_HIGH);
    await flush();
    expect(fake.writes).toHaveLength(2);
    expect(link.state()).toBe('connected');
  });
});

describe('bandStatusText (R4.1)', () => {
  it('says each state in plain words', () => {
    expect(bandStatusText('unsupported', null, null)).toBe(
      'This browser has no Bluetooth link (Safari and Firefox do not have Web Bluetooth). Alerts use the phone or the screen. Chrome or Edge can connect the band.',
    );
    expect(bandStatusText('idle', null, null)).toBe('No band connected.');
    expect(bandStatusText('connecting', null, null)).toBe('Connecting…');
    expect(bandStatusText('connected', null, null)).toBe('Connected to Banshee Band.');
    expect(bandStatusText('connected', null, 'Left wrist')).toBe('Connected to Left wrist.');
    expect(bandStatusText('idle', 'cancelled', null)).toBe('No band was chosen.');
    expect(bandStatusText('idle', 'failed', null)).toBe('Could not connect. Check the band is on and close, then try again.');
    expect(bandStatusText('idle', 'lost', null)).toBe('The band disconnected. Alerts use the phone or the screen until it is back.');
  });
});
