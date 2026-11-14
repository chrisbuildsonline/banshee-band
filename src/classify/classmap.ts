import { SCORE_COUNT } from './constants';
import type { ClassMapEntry } from './types';

interface Row {
  line: number;
  fields: string[];
}

/** Splits CSV text into rows of fields. Handles quoted commas, doubled quotes, \n and \r\n. */
function readRows(text: string): Row[] {
  const rows: Row[] = [];
  let fields: string[] = [];
  let field = '';
  let quoted = false;
  let line = 1;
  let rowLine = 1;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else {
        if (ch === '\n') line++;
        field += ch;
      }
    } else if (ch === '"' && field === '') {
      quoted = true;
    } else if (ch === ',') {
      fields.push(field);
      field = '';
    } else if (ch === '\n' || (ch === '\r' && text[i + 1] === '\n')) {
      if (ch === '\r') i++;
      fields.push(field);
      rows.push({ line: rowLine, fields });
      fields = [];
      field = '';
      rowLine = ++line;
    } else {
      field += ch;
    }
  }
  // The last row, unless the text ended with a newline.
  if (field !== '' || fields.length > 0) {
    fields.push(field);
    rows.push({ line: rowLine, fields });
  }
  return rows;
}

function fail(line: number, problem: string): never {
  throw new Error(`yamnet_class_map.csv line ${line}: ${problem}`);
}

/** Parses the YAMNet class map CSV (header `index,mid,display_name`, 521 rows). Throws on the first problem. */
export function parseClassMap(csvText: string): ClassMapEntry[] {
  const rows = readRows(csvText);
  const header = rows[0];
  if (!header || header.fields.join(',') !== 'index,mid,display_name' || header.fields.length !== 3) {
    fail(1, 'header must be exactly index,mid,display_name');
  }
  const entries: ClassMapEntry[] = [];
  for (let r = 1; r < rows.length; r++) {
    const { line, fields } = rows[r];
    const index = r - 1;
    if (index >= SCORE_COUNT) fail(line, `expected ${SCORE_COUNT} rows, found more`);
    if (fields.length !== 3) fail(line, `expected 3 fields, found ${fields.length}`);
    const [indexText, mid, name] = fields;
    if (indexText !== String(index)) fail(line, `index must be ${index}`);
    if (mid === '') fail(line, 'mid is empty');
    if (name === '') fail(line, 'display_name is empty');
    entries.push({ index, mid, name });
  }
  if (entries.length !== SCORE_COUNT) {
    fail(rows[rows.length - 1].line + 1, `expected ${SCORE_COUNT} rows, found ${entries.length}`);
  }
  return entries;
}
