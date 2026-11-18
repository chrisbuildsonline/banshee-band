import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  BAND_COMMAND_UUID,
  BAND_NAME,
  BAND_SERVICE_UUID,
  CLASS_CODES,
  CRC_POLYNOMIAL,
  MAX_SEGMENTS,
  OPCODES,
  PROTOCOL_VERSION,
  SIDE_CODES,
  encodePlay,
  encodeStop,
} from '../../src/band/protocol';
import { KNOCK_LEFT_HIGH } from './helpers/commands';

const file = (path: string) => readFileSync(fileURLToPath(new URL(`../../firmware/${path}`, import.meta.url)), 'utf8');
const sketch = file('banshee-band/banshee-band.ino');
const readme = file('README.md');

/** The value of `static const <type> <NAME> = <value>;` in the sketch, as a number or a string. */
function constant(name: string): string | number {
  const m = sketch.match(new RegExp(`static\\s+const\\s+[\\w:*\\s]+?\\b${name}(?:\\[\\])?\\s*=\\s*([^;]+);`));
  if (!m) throw new Error(`no constant ${name} in the sketch`);
  const raw = m[1].trim();
  return raw.startsWith('"') ? raw.slice(1, -1) : Number(raw);
}

describe('firmware matches src/band/protocol.ts (R8.4)', () => {
  it('has the UUIDs and the advertised name', () => {
    expect(constant('SERVICE_UUID')).toBe(BAND_SERVICE_UUID);
    expect(constant('COMMAND_UUID')).toBe(BAND_COMMAND_UUID);
    expect(constant('BAND_NAME')).toBe(BAND_NAME);
  });

  it('has the version, the opcodes, the segment limit and the CRC polynomial', () => {
    expect(constant('PROTOCOL_VERSION')).toBe(PROTOCOL_VERSION);
    expect(constant('OP_PLAY')).toBe(OPCODES.play);
    expect(constant('OP_STOP')).toBe(OPCODES.stop);
    expect(constant('MAX_SEGMENTS')).toBe(MAX_SEGMENTS);
    expect(constant('CRC_POLYNOMIAL')).toBe(CRC_POLYNOMIAL);
  });

  it('accepts the same class and side codes', () => {
    const classes = Object.values(CLASS_CODES);
    expect(constant('CLASS_MIN')).toBe(Math.min(...classes));
    expect(constant('CLASS_MAX')).toBe(Math.max(...classes));
    expect(constant('SIDE_MAX')).toBe(Math.max(...Object.values(SIDE_CODES)));
  });

  it('checks in the same order as decodeFrame', () => {
    const order = ['TOO_SHORT', 'BAD_VERSION', 'BAD_OPCODE', 'BAD_LENGTH', 'BAD_CHECKSUM', 'BAD_CLASS', 'BAD_SIDE', 'BAD_COUNT', 'BAD_DURATION'];
    const parser = sketch.slice(sketch.indexOf('ParseError parseFrame('));
    const at = order.map((e) => parser.indexOf(`return ${e}`));
    expect(at.every((i) => i > 0)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
    for (const e of order) expect(sketch).toContain(`"${e.toLowerCase().replace('_', '-')}"`);
  });

  it('drives the left motor on GPIO 25 and the right on GPIO 26 with 8-bit LEDC', () => {
    expect(constant('LEFT_MOTOR_PIN')).toBe(25);
    expect(constant('RIGHT_MOTOR_PIN')).toBe(26);
    expect(constant('PWM_BITS')).toBe(8);
    expect(sketch).toMatch(/ledcAttach\(/);
    expect(sketch).toMatch(/ledcWrite\(/);
  });
});

describe('firmware/README.md (R8.3)', () => {
  it('shows the worked example frame, a knock on the left, byte for byte', () => {
    const m = readme.match(/<!-- example-frame -->\s*```text\n([0-9A-F ]+)\n```/);
    expect(m).not.toBeNull();
    const bytes = m![1].trim().split(/\s+/).map((h) => parseInt(h, 16));
    expect(bytes).toEqual([...encodePlay(KNOCK_LEFT_HIGH)]);
  });

  it('shows the STOP frame byte for byte', () => {
    const hex = [...encodeStop()].map((b) => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');
    expect(readme).toContain(`\`${hex}\``);
  });

  it('names the parts, the wiring, the board and both UUIDs', () => {
    for (const text of ['ESP32', 'ERM', 'flyback', 'GPIO 25', 'GPIO 26', 'ESP32 Dev Module', 'arduino-cli', BAND_SERVICE_UUID, BAND_COMMAND_UUID, '0x07']) expect(readme).toContain(text);
  });
});
