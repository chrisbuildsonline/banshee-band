import { describe, expect, it } from 'vitest';
import { parseContrastTable, parseCssTokens, parseHueTable, parseTokenTable } from './design-parse';

const tokenDoc = (rows: string) => `# Doc

## Colour

Some text.

## Token reference

| Token | Day | Night | Purpose |
|---|---|---|---|
${rows}

## After
`;

describe('parseTokenTable', () => {
  it('reads a valid table', () => {
    const md = tokenDoc(
      [
        '| `--bb-color-canvas` | `#EEF0F4` | `#0D0B12` | Page background |',
        '| `--bb-font-family` | `ui-sans-serif, system-ui, sans-serif` | `same` | Font stack |',
      ].join('\n'),
    );
    expect(parseTokenTable(md)).toEqual([
      { name: '--bb-color-canvas', day: '#EEF0F4', night: '#0D0B12', purpose: 'Page background', themeIndependent: false },
      {
        name: '--bb-font-family',
        day: 'ui-sans-serif, system-ui, sans-serif',
        night: 'ui-sans-serif, system-ui, sans-serif',
        purpose: 'Font stack',
        themeIndependent: true,
      },
    ]);
  });

  it('treats an identical Day and Night value as theme-independent', () => {
    const [token] = parseTokenTable(tokenDoc('| `--bb-space-1` | `4px` | `4px` | Space |'));
    expect(token.themeIndependent).toBe(true);
  });

  it('throws when the table is missing', () => {
    expect(() => parseTokenTable('# Doc\n\n## Colour\n')).toThrow('Token reference table not found');
  });

  it('throws on a row with the wrong column count', () => {
    const md = tokenDoc('| `--bb-color-canvas` | `#EEF0F4` | Page background |');
    expect(() => parseTokenTable(md)).toThrow('Row 1: expected 4 columns');
  });

  it('throws when a Night cell is empty instead of a value or same', () => {
    const md = tokenDoc('| `--bb-color-canvas` | `#EEF0F4` |  | Page background |');
    expect(() => parseTokenTable(md)).toThrow(/Row 1: --bb-color-canvas has no Night value/);
  });

  it('throws when a token name is not a --bb- name in backticks', () => {
    const md = tokenDoc('| canvas | `#EEF0F4` | `#000000` | Page background |');
    expect(() => parseTokenTable(md)).toThrow(/Row 1: token name/);
  });

  it('returns no tokens for an empty table', () => {
    expect(parseTokenTable(tokenDoc(''))).toEqual([]);
  });
});

describe('parseHueTable', () => {
  it('reads the Hue column from the colour section', () => {
    const md = `## Colour

| Token | Hue | Role |
|---|---|---|
| \`--bb-color-canvas\` | neutral | Page |
| \`--bb-color-accent\` | accent | Links |

## Shape
`;
    expect(parseHueTable(md)).toEqual({ '--bb-color-canvas': 'neutral', '--bb-color-accent': 'accent' });
  });

  it('throws when the colour section has no table', () => {
    expect(() => parseHueTable('## Colour\n\nNo table.\n\n## Shape\n')).toThrow('Colour table not found');
  });
});

describe('parseContrastTable', () => {
  it('reads foreground, background, theme, ratio and threshold', () => {
    const md = `## Contrast table

| Pair | Foreground | Background | Theme | Ratio | Threshold |
|---|---|---|---|---|---|
| Body text | \`--bb-color-text\` | \`--bb-color-canvas\` | Day | 15.2 | 4.5 |
`;
    expect(parseContrastTable(md)).toEqual([
      {
        pair: 'Body text',
        foreground: '--bb-color-text',
        background: '--bb-color-canvas',
        theme: 'day',
        ratio: 15.2,
        threshold: 4.5,
      },
    ]);
  });

  it('throws on an unknown theme', () => {
    const md = `## Contrast table

| Pair | Foreground | Background | Theme | Ratio | Threshold |
|---|---|---|---|---|---|
| Body | \`--bb-a\` | \`--bb-b\` | Dusk | 5 | 4.5 |
`;
    expect(() => parseContrastTable(md)).toThrow(/Row 1: theme/);
  });
});

describe('parseCssTokens', () => {
  const css = `/* comment with { braces } */
:root {
  --bb-color-canvas: #EEF0F4;
  --bb-shadow-soft: 0 1px 2px rgba(0, 0, 0, 0.1), 0 8px 24px rgba(0, 0, 0, 0.08);
  color-scheme: light;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="day"]) {
    --bb-color-canvas: #0D0B12;
  }
}
:root[data-theme="night"] {
  --bb-color-canvas: #0D0B12;
}
@media (prefers-reduced-motion: reduce) {
  :root {
    --bb-motion-fast: 0s;
  }
}
`;

  it('splits Day, Night attribute, Night media and reduced-motion blocks', () => {
    const blocks = parseCssTokens(css);
    expect(blocks.day).toEqual({
      '--bb-color-canvas': '#EEF0F4',
      '--bb-shadow-soft': '0 1px 2px rgba(0, 0, 0, 0.1), 0 8px 24px rgba(0, 0, 0, 0.08)',
    });
    expect(blocks.nightAttribute).toEqual({ '--bb-color-canvas': '#0D0B12' });
    expect(blocks.nightMedia).toEqual({ '--bb-color-canvas': '#0D0B12' });
    expect(blocks.reducedMotion).toEqual({ '--bb-motion-fast': '0s' });
  });

  it('returns empty blocks when a block is absent', () => {
    const blocks = parseCssTokens(':root { --bb-a: 1px; }');
    expect(blocks.day).toEqual({ '--bb-a': '1px' });
    expect(blocks.nightAttribute).toEqual({});
    expect(blocks.nightMedia).toEqual({});
    expect(blocks.reducedMotion).toEqual({});
  });

  it('throws on unbalanced braces', () => {
    expect(() => parseCssTokens(':root { --bb-a: 1px;')).toThrow(/unbalanced/);
  });
});
