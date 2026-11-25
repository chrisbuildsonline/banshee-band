import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/** README.md and every Markdown file under docs/: what a judge reads. */
const docs = ['README.md', ...readdirSync('docs', { recursive: true, encoding: 'utf8' }).filter((f) => f.endsWith('.md')).map((f) => `docs/${f}`)];
const devpost = existsSync('docs/devpost.md') ? readFileSync('docs/devpost.md', 'utf8') : '';
const specCount = readdirSync('.kiro/specs').length;

describe('write-up', () => {
  it('leaves no "[fill in" placeholder in the README or docs/', () => {
    expect(docs).toContain('docs/devpost.md');
    for (const file of docs) expect(readFileSync(file, 'utf8'), file).not.toMatch(/\[fill in/i);
  });

  it('the Devpost text has every section, and claims only what the code does', () => {
    for (const h of ['Inspiration', 'What it does', 'How we built it', 'Challenges', 'Accomplishments', 'What we learned', "What's next"]) {
      expect(devpost, h).toContain(`## ${h}`);
    }
    expect(devpost).not.toMatch(/WebGL (layer|for (the )?ghosts)|canvas and WebGL/i);
    expect(devpost).toMatch(/2D canvas|canvas 2D/i);
    expect(devpost).not.toMatch(/\bfive specs\b/i);
    expect(devpost).toContain(`${specCount} specs`);
    expect(devpost).toMatch(/never (been )?compiled/i);
    expect(devpost).toMatch(/not a safety device/i);
  });

  it('quotes the measured numbers the README gives', () => {
    const readme = readFileSync('README.md', 'utf8');
    for (const n of ['0.7778', '814 ms', '70 ms', '244', '0.23°']) {
      expect(readme, `README ${n}`).toContain(n);
      expect(devpost, `devpost ${n}`).toContain(n);
    }
    const unit = /\*\*Tests\*\*: (\d+) Vitest/.exec(readme)?.[1];
    const e2e = /, and (\d+) Playwright/.exec(readme)?.[1];
    expect(unit).toBeDefined();
    expect(devpost).toContain(`${unit} unit and property tests`);
    expect(devpost).toContain(`${e2e} Playwright`);
  });
});
