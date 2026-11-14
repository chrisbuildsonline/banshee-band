import { describe, expect, it } from 'vitest';
import { CAPTURE_MESSAGES, toCaptureError } from '../../src/audio/errors';

const OK_ENV = { hasMediaDevices: true, isSecureContext: true };
const UNSAFE_WORDS = /protect|safe|guarantee/i;

describe('toCaptureError', () => {
  const table = [
    ['NotAllowedError', 'permission-denied'],
    ['SecurityError', 'permission-denied'],
    ['NotFoundError', 'no-device'],
    ['OverconstrainedError', 'no-device'],
    ['DevicesNotFoundError', 'no-device'],
    ['NotReadableError', 'device-busy'],
    ['AbortError', 'device-busy'],
    ['TrackStartError', 'device-busy'],
    ['TypeError', 'unknown'],
    ['SomethingElse', 'unknown'],
  ] as const;

  for (const [name, code] of table) {
    it(`maps a DOMException named ${name} to ${code}`, () => {
      expect(toCaptureError(new DOMException('detail', name), OK_ENV).code).toBe(code);
    });
    it(`maps a plain object named ${name} to ${code}`, () => {
      expect(toCaptureError({ name }, OK_ENV).code).toBe(code);
    });
  }

  it('maps missing mediaDevices on an insecure page to insecure-context', () => {
    expect(toCaptureError(undefined, { hasMediaDevices: false, isSecureContext: false }).code).toBe('insecure-context');
  });

  it('maps missing mediaDevices on a secure page to unsupported', () => {
    expect(toCaptureError(new DOMException('x', 'NotAllowedError'), { hasMediaDevices: false, isSecureContext: true }).code).toBe('unsupported');
  });

  const hostileName = Object.defineProperty({}, 'name', {
    get() {
      throw new Error('boom');
    },
  });
  const weird: [string, unknown][] = [
    ['undefined', undefined],
    ['null', null],
    ['a string', 'NotAllowedError'],
    ['a number', 42],
    ['an object whose name getter throws', hostileName],
    ['an object with a non-string name', { name: 7 }],
  ];
  for (const [label, value] of weird) {
    it(`maps ${label} to unknown without throwing`, () => {
      expect(toCaptureError(value, OK_ENV).code).toBe('unknown');
    });
  }

  it('never copies the thrown message into the result', () => {
    const result = toCaptureError(new DOMException('Device label: Secret Mic 3000', 'NotReadableError'), OK_ENV);
    expect(result.message).not.toContain('Secret Mic');
  });

  it('has a plain, non-empty message for every code with no safety claims', () => {
    for (const [code, message] of Object.entries(CAPTURE_MESSAGES)) {
      expect(message.length, code).toBeGreaterThan(20);
      expect(message, code).not.toMatch(UNSAFE_WORDS);
    }
    expect(Object.keys(CAPTURE_MESSAGES).sort()).toEqual(
      ['clip-load-failed', 'clip-not-found', 'device-busy', 'insecure-context', 'no-device', 'permission-denied', 'unknown', 'unsupported', 'worklet-failed'],
    );
  });

  it('returns the message that belongs to the code', () => {
    const result = toCaptureError({ name: 'NotAllowedError' }, OK_ENV);
    expect(result.message).toBe(CAPTURE_MESSAGES['permission-denied']);
  });
});
