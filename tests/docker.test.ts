import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const dockerfile = readFileSync('Dockerfile', 'utf8');
const scripts = JSON.parse(readFileSync('package.json', 'utf8')).scripts as Record<string, string>;
const readme = readFileSync('README.md', 'utf8');

/** The Dockerfile split into stages: the `FROM` line and every line up to the next `FROM`. */
const stages = dockerfile
  .split(/^(?=FROM )/m)
  .filter((s) => s.startsWith('FROM '))
  .map((body) => ({ name: /^FROM \S+(?: AS (\S+))?/.exec(body)?.[1] ?? '', body }));

describe('Dockerfile', () => {
  it('serves the built app from the default (last) stage on 0.0.0.0, port 4173 or $PORT', () => {
    const last = stages.at(-1)!;
    expect(last.name).not.toBe('test');
    expect(last.body).toMatch(/^RUN bun run build$/m);
    expect(last.body).toMatch(/^ENV PORT=4173$/m);
    expect(last.body).toMatch(/^EXPOSE 4173$/m);
    const cmd = /^CMD (.+)$/m.exec(last.body)?.[1] ?? '';
    expect(cmd).toContain('vite preview');
    expect(cmd).toContain('--host 0.0.0.0');
    expect(cmd).toContain('--port ${PORT:-4173}');
    expect(cmd).toContain('--strictPort');
  });

  it('keeps the whole gate in a stage named test that prints a verdict', () => {
    const test = stages.find((s) => s.name === 'test');
    expect(test).toBeDefined();
    const cmd = /^CMD (.+)$/m.exec(test!.body)?.[1] ?? '';
    for (const step of ['bun run typecheck', 'bun run build', 'bun run test', 'bun run e2e']) expect(cmd, step).toContain(step);
    expect(cmd).toMatch(/gate passed/i);
    expect(cmd).toMatch(/gate failed/i);
  });
});

describe('docker scripts and README', () => {
  it('builds the test target for docker:test and the default target for docker:serve', () => {
    expect(scripts['docker:test']).toContain('--target test');
    expect(scripts['docker:serve']).toMatch(/docker build -t banshee-band \. && docker run --rm -p 4173:4173 banshee-band/);
  });

  it('shows how to serve the app and how to run the tests in Docker', () => {
    const section = readme.split('### Run in Docker')[1]?.split(/\n## /)[0] ?? '';
    expect(section).toContain('docker build -t banshee-band . && docker run --rm -p 4173:4173 banshee-band');
    expect(section).toContain('http://localhost:4173');
    expect(section).toContain('--target test');
    expect(section).toContain('bun run docker:serve');
    expect(section).toContain('bun run docker:test');
  });
});
