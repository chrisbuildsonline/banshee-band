// Text parsers for design/DESIGN.md and src/ui/tokens.css. Pure functions, no DOM.

export interface TokenRow {
  name: string;
  day: string;
  night: string;
  purpose: string;
  themeIndependent: boolean;
}

export interface ContrastRow {
  pair: string;
  foreground: string;
  background: string;
  theme: 'day' | 'night';
  ratio: number;
  threshold: number;
}

export type Declarations = Record<string, string>;

export interface CssTokenBlocks {
  day: Declarations;
  nightAttribute: Declarations;
  nightMedia: Declarations;
  reducedMotion: Declarations;
}

const TOKEN_NAME = /^`(--bb-[a-z0-9-]+)`$/;

/** Lines of the section under `## <heading>`, up to the next level-1 or level-2 heading. */
function section(markdown: string, heading: string): string[] | null {
  const lines = markdown.split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === `## ${heading}`);
  if (start === -1) return null;
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => /^#{1,2}\s/.test(line));
  return end === -1 ? rest : rest.slice(0, end);
}

function splitRow(line: string): string[] {
  return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((cell) => cell.trim());
}

/** First pipe table in the lines whose header satisfies `accept`: header cells plus data rows. */
function firstTable(lines: string[], accept: (header: string[]) => boolean): { header: string[]; rows: string[][] } | null {
  for (let i = 0; i < lines.length - 1; i++) {
    if (!lines[i].trim().startsWith('|') || !/^\s*\|[\s|:-]+\|\s*$/.test(lines[i + 1])) continue;
    const header = splitRow(lines[i]);
    if (!accept(header)) continue;
    const rows: string[][] = [];
    for (let j = i + 2; j < lines.length && lines[j].trim().startsWith('|'); j++) rows.push(splitRow(lines[j]));
    return { header, rows };
  }
  return null;
}

function unwrap(cell: string): string | null {
  const match = /^`(.*)`$/.exec(cell);
  return match ? match[1] : null;
}

export function parseTokenTable(markdown: string): TokenRow[] {
  const lines = section(markdown, 'Token reference');
  const table = lines && firstTable(lines, (h) => h[0] === 'Token');
  if (!table) throw new Error('Token reference table not found');

  return table.rows.map((cells, index) => {
    const row = index + 1;
    if (cells.length !== 4) throw new Error(`Row ${row}: expected 4 columns, got ${cells.length}`);
    const [nameCell, dayCell, nightCell, purpose] = cells;
    const name = TOKEN_NAME.exec(nameCell)?.[1];
    if (!name) throw new Error(`Row ${row}: token name must be a --bb- name in backticks, got "${nameCell}"`);
    const day = unwrap(dayCell);
    if (day === null || day === '') throw new Error(`Row ${row}: ${name} Day value must be in backticks`);
    if (nightCell === 'same' || nightCell === '`same`') return { name, day, night: day, purpose, themeIndependent: true };
    const night = unwrap(nightCell);
    if (night === null || night === '') throw new Error(`Row ${row}: ${name} has no Night value (use a value in backticks or same)`);
    return { name, day, night, purpose, themeIndependent: night === day };
  });
}

export function parseHueTable(markdown: string): Record<string, string> {
  const lines = section(markdown, 'Colour');
  const table = lines && firstTable(lines, (h) => h.includes('Token') && h.includes('Hue'));
  if (!table) throw new Error('Colour table not found');
  const tokenColumn = table.header.indexOf('Token');
  const hueColumn = table.header.indexOf('Hue');
  const hues: Record<string, string> = {};
  table.rows.forEach((cells, index) => {
    const name = TOKEN_NAME.exec(cells[tokenColumn] ?? '')?.[1];
    if (!name) throw new Error(`Colour row ${index + 1}: token name must be a --bb- name in backticks`);
    hues[name] = (cells[hueColumn] ?? '').toLowerCase();
  });
  return hues;
}

export function parseContrastTable(markdown: string): ContrastRow[] {
  const lines = section(markdown, 'Contrast table');
  const table = lines && firstTable(lines, (h) => h[0] === 'Pair');
  if (!table) throw new Error('Contrast table not found');

  return table.rows.map((cells, index) => {
    const row = index + 1;
    if (cells.length !== 6) throw new Error(`Row ${row}: expected 6 columns, got ${cells.length}`);
    const [pair, fg, bg, themeCell, ratioCell, thresholdCell] = cells;
    const foreground = TOKEN_NAME.exec(fg)?.[1];
    const background = TOKEN_NAME.exec(bg)?.[1];
    if (!foreground || !background) throw new Error(`Row ${row}: foreground and background must be --bb- names in backticks`);
    const theme = themeCell.toLowerCase();
    if (theme !== 'day' && theme !== 'night') throw new Error(`Row ${row}: theme must be Day or Night, got "${themeCell}"`);
    const ratio = Number(ratioCell);
    const threshold = Number(thresholdCell);
    if (!Number.isFinite(ratio) || !Number.isFinite(threshold)) throw new Error(`Row ${row}: ratio and threshold must be numbers`);
    return { pair, foreground, background, theme, ratio, threshold };
  });
}

interface CssRule {
  media: string | null;
  selector: string;
  declarations: Declarations;
}

/** Top-level `prelude { body }` pairs, matched by braces. */
function blocks(css: string): { prelude: string; body: string }[] {
  const found: { prelude: string; body: string }[] = [];
  let depth = 0;
  let preludeStart = 0;
  let bodyStart = 0;
  for (let i = 0; i < css.length; i++) {
    if (css[i] === '{') {
      if (depth === 0) bodyStart = i + 1;
      depth++;
    } else if (css[i] === '}') {
      depth--;
      if (depth < 0) throw new Error('CSS has unbalanced braces');
      if (depth === 0) {
        const prelude = css.slice(preludeStart, bodyStart - 1);
        found.push({ prelude: prelude.slice(prelude.lastIndexOf(';') + 1).trim(), body: css.slice(bodyStart, i) });
        preludeStart = i + 1;
      }
    }
  }
  if (depth !== 0) throw new Error('CSS has unbalanced braces');
  return found;
}

function customProperties(body: string): Declarations {
  const declarations: Declarations = {};
  for (const part of body.split(';')) {
    const colon = part.indexOf(':');
    if (colon === -1) continue;
    const property = part.slice(0, colon).trim();
    if (property.startsWith('--')) declarations[property] = part.slice(colon + 1).trim().replace(/\s+/g, ' ');
  }
  return declarations;
}

function rules(css: string, media: string | null = null): CssRule[] {
  return blocks(css).flatMap(({ prelude, body }) =>
    prelude.startsWith('@media')
      ? rules(body, prelude)
      : [{ media, selector: prelude, declarations: customProperties(body) }],
  );
}

const squash = (text: string) => text.replace(/\s+/g, '').replace(/'/g, '"');

export function parseCssTokens(css: string): CssTokenBlocks {
  const result: CssTokenBlocks = { day: {}, nightAttribute: {}, nightMedia: {}, reducedMotion: {} };
  for (const rule of rules(css.replace(/\/\*[\s\S]*?\*\//g, ''))) {
    const selector = squash(rule.selector);
    const media = rule.media === null ? null : squash(rule.media);
    let target: Declarations | null = null;
    if (media === null && selector === ':root') target = result.day;
    else if (media === null && selector === ':root[data-theme="night"]') target = result.nightAttribute;
    else if (media?.includes('prefers-color-scheme:dark') && selector === ':root:not([data-theme="day"])') target = result.nightMedia;
    else if (media?.includes('prefers-reduced-motion:reduce') && selector === ':root') target = result.reducedMotion;
    if (target) Object.assign(target, rule.declarations);
  }
  return result;
}
