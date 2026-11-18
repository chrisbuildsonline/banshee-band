import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { requirementList, specGaps, testedRequirements } from '../../../scripts/hooks/spec-tests';
import { runScript } from './helpers';

const REQS = [
  '# Requirements: Demo',
  '## Requirements',
  '### Requirement 1: First thing',
  'WHEN a THE system SHALL b.',
  '### Requirement 2: Second thing',
  '### Requirement 3: Third thing',
  '## Out of scope',
].join('\n');

const TASKS = [
  '# Tasks',
  '- [x] 1. Do one',
  '  - [x] 1.1 Write `tests/demo/one.test.ts` first.',
  '    - _Requirements: 1.1-1.3, 3.2_',
  '  - [ ] 1.2 Write the docs (no test).',
  '    - _Requirements: 2.1_',
  '- [x] 2. Browser',
  '  - [x] 2.1 Write `e2e/demo.spec.ts` and `tests/demo/missing.test.ts`.',
  '    - _Requirements: 2.4-3.1_',
].join('\n');

const exists = (p: string) => p === 'tests/demo/one.test.ts' || p === 'e2e/demo.spec.ts';

describe('requirementList', () => {
  it('reads the number and title of every "### Requirement N:" heading', () => {
    expect(requirementList(REQS)).toEqual([
      { n: 1, title: 'First thing' },
      { n: 2, title: 'Second thing' },
      { n: 3, title: 'Third thing' },
    ]);
  });
});

describe('testedRequirements', () => {
  it('maps each requirement listed in a top-level task (and its sub-tasks) to the existing test files that task names', () => {
    const map = testedRequirements(TASKS, exists);
    expect(map.get(1)).toEqual(['tests/demo/one.test.ts']);
    expect(map.get(2)).toEqual(['tests/demo/one.test.ts', 'e2e/demo.spec.ts']);
    expect(map.get(3)).toEqual(['tests/demo/one.test.ts', 'e2e/demo.spec.ts']);
  });

  it('ignores a task that names no test file, and a test file that does not exist', () => {
    const map = testedRequirements('- [x] 1. Docs\n  - _Requirements: 4.1_\n- [x] 2. `tests/x/gone.test.ts`\n  - _Requirements: 5.1_', exists);
    expect(map.has(4)).toBe(false);
    expect(map.has(5)).toBe(false);
  });

  it('does not count a test file of the next top-level task', () => {
    const map = testedRequirements('- [x] 1. Docs\n  - _Requirements: 4.1_\n- [x] 2. `tests/demo/one.test.ts`\n  - _Requirements: 5.1_', exists);
    expect(map.has(4)).toBe(false);
    expect(map.get(5)).toEqual(['tests/demo/one.test.ts']);
  });
});

describe('specGaps', () => {
  it('is empty when every requirement has a test', () => {
    expect(specGaps([{ name: 'demo', requirements: REQS, tasks: TASKS }], exists)).toEqual([]);
  });

  it('names each requirement with no test', () => {
    const tasks = '- [x] 1. `tests/demo/one.test.ts`\n  - _Requirements: 1.1_';
    expect(specGaps([{ name: 'demo', requirements: REQS, tasks }], exists)).toEqual([
      'demo: Requirement 2 (Second thing) has no task that names an existing test file',
      'demo: Requirement 3 (Third thing) has no task that names an existing test file',
    ]);
  });

  it('lets a known gap through, by its "spec#N" key', () => {
    const tasks = '- [x] 1. `tests/demo/one.test.ts`\n  - _Requirements: 1.1, 2.1_';
    expect(specGaps([{ name: 'demo', requirements: REQS, tasks }], exists, { 'demo#3': 'a review step' })).toEqual([]);
  });

  it('flags a known gap that now has a test, and one that no longer exists', () => {
    expect(specGaps([{ name: 'demo', requirements: REQS, tasks: TASKS }], exists, { 'demo#2': 'old', 'gone#1': 'old' })).toEqual([
      'demo#2 is listed in spec-gaps.json but now has a test: remove it',
      'gone#1 is listed in spec-gaps.json but is no longer a requirement: remove it',
    ]);
  });
});

/** A repo root with one spec whose Requirement 2 has no test. */
function gapRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'bb-spec-'));
  mkdirSync(join(root, '.kiro/specs/demo'), { recursive: true });
  mkdirSync(join(root, 'tests/demo'), { recursive: true });
  writeFileSync(join(root, 'tests/demo/one.test.ts'), '');
  writeFileSync(join(root, '.kiro/specs/demo/requirements.md'), '### Requirement 1: One\n### Requirement 2: Two\n');
  writeFileSync(join(root, '.kiro/specs/demo/tasks.md'), '- [x] 1. `tests/demo/one.test.ts`\n  - _Requirements: 1.1_\n');
  return root;
}

describe('bun scripts/hooks/spec-tests.ts', () => {
  it('exits 0 on this repo, with its known gaps listed', () => {
    const r = runScript('scripts/hooks/spec-tests.ts');
    expect(r.code, r.out).toBe(0);
    expect(r.out).toMatch(/known gaps in scripts\/hooks\/spec-gaps\.json/);
  });

  it('exits non-zero and names the gap when a requirement has no test', () => {
    const r = runScript('scripts/hooks/spec-tests.ts', [gapRoot()]);
    expect(r.code).toBe(1);
    expect(r.out).toContain('demo: Requirement 2 (Two) has no task that names an existing test file');
  });
});
