export interface LicenceEntry {
  file: string;
  source: string;
  author: string;
  licence: string;
}

const REQUIRED = { File: 'file', Source: 'source', Author: 'author', Licence: 'licence' } as const;

/**
 * Parses public/clips/LICENSE.txt: paragraphs separated by blank lines. A paragraph with any of the
 * keys File, Source, Author or Licence is an entry and must have all four; other paragraphs are prose.
 */
export function parseLicence(text: string): LicenceEntry[] {
  const entries: LicenceEntry[] = [];
  for (const paragraph of text.split(/\r?\n[ \t]*\r?\n/)) {
    const fields = new Map<string, string>();
    for (const line of paragraph.split(/\r?\n/)) {
      const match = /^([A-Za-z ]+):(.*)$/.exec(line);
      if (match) fields.set(match[1], match[2].trim());
    }
    if (!Object.keys(REQUIRED).some((key) => fields.has(key))) continue;
    const name = fields.get('File') || '(no File)';
    const entry = {} as LicenceEntry;
    for (const [key, prop] of Object.entries(REQUIRED)) {
      const value = fields.get(key);
      if (!value) throw new Error(`${name}: missing ${key}`);
      entry[prop] = value;
    }
    entries.push(entry);
  }
  return entries;
}
