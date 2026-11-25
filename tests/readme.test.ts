import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SOUND_CLASSES } from '../src/events';

const readme = readFileSync('README.md', 'utf8');
const scripts = Object.keys(JSON.parse(readFileSync('package.json', 'utf8')).scripts as Record<string, string>);
const manifest = JSON.parse(readFileSync('public/clips/manifest.json', 'utf8')) as { file: string }[];
const clipLicence = readFileSync('public/clips/LICENSE.txt', 'utf8');

describe('README', () => {
  it('names the seven sound classes of the event contract', () => {
    expect(SOUND_CLASSES).toHaveLength(7);
    expect(readme).toMatch(/seven sound classes/i);
    expect(readme).not.toMatch(/\b(five|six) (sound )?classes\b/i);
    for (const cls of SOUND_CLASSES) expect(readme, cls).toContain(`\`${cls}\``);
  });

  it('documents every run command, and every command it names exists', () => {
    for (const name of ['dev', 'typecheck', 'test', 'build', 'e2e', 'mcp:banshee-log', 'log:seed']) {
      expect(readme, name).toContain(`bun run ${name}`);
    }
    for (const name of scripts.filter((s) => s.startsWith('hooks:') || s.endsWith(':report'))) {
      expect(readme, name).toContain(`bun run ${name}`);
    }
    const named = [...readme.matchAll(/bun run ([a-z][\w:-]*)/g)].map((m) => m[1]);
    for (const name of named) expect(scripts, name).toContain(name);
  });

  it('credits the model, the class names, TF.js and every clip with its author', () => {
    expect(readme).toContain('YAMNet');
    expect(readme).toMatch(/Apache License,? (Version )?2\.0|Apache 2\.0/);
    expect(readme).toContain('CC BY-SA 4.0');
    expect(readme).toContain('TensorFlow.js');
    expect(readme).toContain('Public Domain in the USA');
    for (const { file } of manifest) {
      expect(readme, file).toContain(file);
      const block = clipLicence.split(/\n\n/).find((b) => b.includes(`File: ${file}`)) ?? '';
      const author = /^Author: ([^;(\n]+)/m.exec(block)?.[1]?.trim() ?? '';
      expect(author, file).not.toBe('');
      expect(readme, `${file} author`).toContain(author);
    }
  });

  it('lists every steering file, spec and hook under .kiro, and every .kiro path it names exists', () => {
    for (const f of readdirSync('.kiro/steering')) expect(readme, f).toContain(f);
    for (const d of readdirSync('.kiro/specs')) expect(readme, d).toContain(d);
    for (const f of readdirSync('.kiro/hooks')) expect(readme, f).toContain(f);
    const paths = [...readme.matchAll(/`(\.kiro\/[^`*]+)`/g)].map((m) => m[1]);
    expect(paths.length).toBeGreaterThan(0);
    for (const p of paths) expect(existsSync(p), p).toBe(true);
  });

  it('shows committed screenshots of the ghost field, band simulator and pipeline, Day and Night, before Quick start', () => {
    const top = readme.split('## Quick start')[0];
    const shots = [...top.matchAll(/!\[[^\]]+\]\((docs\/screenshots\/[\w-]+\.png)\)/g)].map((m) => m[1]);
    for (const view of ['station', 'band', 'pipeline']) {
      for (const theme of ['day', 'night']) expect(shots, `${view} 1440 ${theme}`).toContain(`docs/screenshots/${view}-1440-${theme}.png`);
    }
    expect(shots.some((s) => /-390-/.test(s)), 'one 390 px phone shot').toBe(true);
    for (const shot of shots) {
      expect(existsSync(shot), shot).toBe(true);
      const png = readFileSync(shot);
      expect(png.subarray(1, 4).toString('latin1'), shot).toBe('PNG');
      // The width in the IHDR chunk matches the width in the name.
      expect(png.readUInt32BE(16), shot).toBe(Number(/-(\d+)-/.exec(shot)![1]));
    }
  });

  it('is honest about the firmware, the Kiro IDE and safety, and names the licence', () => {
    expect(readme).toMatch(/never been compiled/i);
    expect(readme).toMatch(/not a safety device/i);
    expect(readme).toMatch(/not (been )?tried (them )?inside the Kiro IDE|not run inside the Kiro IDE/i);
    expect(readme).not.toMatch(/WebGL for ghosts|canvas\/WebGL/i);
    expect(readme).toContain('MIT');
  });
});
