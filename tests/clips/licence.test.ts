import { describe, expect, it } from 'vitest';
import { parseLicence } from './licence';

const block = `File: knock-01.wav
Source: https://freesound.org/people/someone/sounds/1/
Author: someone
Licence: CC0 1.0 Universal
Licence URL: https://creativecommons.org/publicdomain/zero/1.0/
Changes: converted to 16 kHz mono 16-bit PCM
Retrieved: 2026-11-14`;

const header = `Sound clips in this folder.
Every clip below is CC0 or public domain. Each entry records the state when the clip was added.`;

describe('parseLicence', () => {
  it('reads one block after a header', () => {
    expect(parseLicence(`${header}\n\n${block}\n`)).toEqual([
      { file: 'knock-01.wav', source: 'https://freesound.org/people/someone/sounds/1/', author: 'someone', licence: 'CC0 1.0 Universal' },
    ]);
  });

  it('reads two blocks separated by several blank lines, with CRLF and trailing spaces', () => {
    const second = block.replace('knock-01.wav', 'doorbell-01.wav').replace('Author: someone', 'Author: Another Person  ');
    const entries = parseLicence(`${header}\r\n\r\n${block}\r\n\r\n  \r\n\r\n${second.replace(/\n/g, '\r\n')}\r\n`);
    expect(entries.map((e) => [e.file, e.author])).toEqual([
      ['knock-01.wav', 'someone'],
      ['doorbell-01.wav', 'Another Person'],
    ]);
  });

  it('ignores keys it does not know', () => {
    expect(parseLicence(`${block}\nNote: recorded indoors`)).toHaveLength(1);
  });

  it('rejects a block without an author', () => {
    expect(() => parseLicence(block.replace(/^Author:.*\n/m, ''))).toThrow('knock-01.wav: missing Author');
  });

  it('rejects a block with an empty author', () => {
    expect(() => parseLicence(block.replace(/^Author:.*$/m, 'Author:   '))).toThrow('knock-01.wav: missing Author');
  });

  it('rejects a block without a source', () => {
    expect(() => parseLicence(block.replace(/^Source:.*\n/m, ''))).toThrow('knock-01.wav: missing Source');
  });

  it('rejects a block without a file name', () => {
    expect(() => parseLicence(block.replace(/^File:.*\n/m, ''))).toThrow('(no File): missing File');
  });

  it('returns no entries for text without blocks', () => {
    expect(parseLicence(header)).toEqual([]);
  });
});
