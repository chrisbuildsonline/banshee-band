// `bun run hooks:spec-tests [root]`: every "### Requirement N" of .kiro/specs/*/requirements.md must be listed on a
// `_Requirements:` line of a top-level task of its tasks.md that names a test file (tests/... .test.ts or
// e2e/... .spec.ts) that exists, or be a known gap in scripts/hooks/spec-gaps.json (with the reason). Prints each
// new gap, and each known gap that is gone, and exits 1 when there is one.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const KNOWN_FILE = 'scripts/hooks/spec-gaps.json';
const TEST_FILE = /\b(?:tests|e2e)\/[\w./-]+\.(?:test|spec)\.ts\b/g;
const REQ_LINE = /_Requirements:([^_]*)_/;

/** The number and title of every `### Requirement N: Title` heading. */
export function requirementList(md: string): { n: number; title: string }[] {
  return [...md.matchAll(/^### Requirement (\d+):\s*(.*)$/gm)].map((m) => ({ n: Number(m[1]), title: m[2].trim() }));
}

/** The requirement numbers of a `_Requirements:` list: `1.1-1.3, 3.2` gives 1 and 3; `2.4-3.1` gives 2 and 3. */
function numbersOf(list: string): number[] {
  const out: number[] = [];
  for (const part of list.split(',')) {
    const [from, to = from] = part.split('-').map((s) => parseInt(s.trim(), 10));
    if (Number.isNaN(from)) continue;
    for (let n = from; n <= (Number.isNaN(to) ? from : to); n++) out.push(n);
  }
  return out;
}

/**
 * Requirement number to the existing test files named by the tasks that list it. A task is one top-level
 * `- [ ] N.` item with its sub-tasks, up to the next top-level item or heading.
 */
export function testedRequirements(md: string, exists: (p: string) => boolean): Map<number, string[]> {
  const map = new Map<number, string[]>();
  const tasks: string[][] = [[]];
  for (const line of md.split('\n')) {
    if (/^(- \[[ xX]\] |#)/.test(line)) tasks.push([]);
    tasks[tasks.length - 1].push(line);
  }
  for (const lines of tasks) {
    const text = lines.join('\n');
    const files = [...new Set(text.match(TEST_FILE) ?? [])].filter(exists);
    if (files.length === 0) continue;
    const numbers = lines.flatMap((l) => {
      const req = REQ_LINE.exec(l);
      return req ? numbersOf(req[1]) : [];
    });
    for (const n of numbers) {
      const seen = map.get(n) ?? [];
      map.set(n, [...seen, ...files.filter((f) => !seen.includes(f))]);
    }
  }
  return map;
}

/**
 * One line per requirement that no task with an existing test file lists, unless `known` has it (key `spec#N`,
 * value the reason), and one line per `known` entry that is no longer a gap. Empty when the rule holds.
 */
export function specGaps(
  specs: { name: string; requirements: string; tasks: string }[],
  exists: (p: string) => boolean,
  known: Record<string, string> = {},
): string[] {
  const out: string[] = [];
  const all = new Set<string>();
  const gaps = new Set<string>();
  for (const s of specs) {
    const tested = testedRequirements(s.tasks, exists);
    for (const r of requirementList(s.requirements)) {
      const key = `${s.name}#${r.n}`;
      all.add(key);
      if (tested.has(r.n)) continue;
      gaps.add(key);
      if (!(key in known)) out.push(`${s.name}: Requirement ${r.n} (${r.title}) has no task that names an existing test file`);
    }
  }
  for (const key of Object.keys(known)) {
    if (!all.has(key)) out.push(`${key} is listed in spec-gaps.json but is no longer a requirement: remove it`);
    else if (!gaps.has(key)) out.push(`${key} is listed in spec-gaps.json but now has a test: remove it`);
  }
  return out;
}

if (import.meta.main) {
  const root = process.argv[2] ?? process.cwd();
  const dir = join(root, '.kiro/specs');
  const read = (p: string) => (existsSync(p) ? readFileSync(p, 'utf8') : '');
  const specs = readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => ({ name: d.name, requirements: read(join(dir, d.name, 'requirements.md')), tasks: read(join(dir, d.name, 'tasks.md')) }));
  const knownFile = join(root, KNOWN_FILE);
  const known: Record<string, string> = existsSync(knownFile) ? JSON.parse(readFileSync(knownFile, 'utf8')) : {};
  const problems = specGaps(specs, (p) => existsSync(join(root, p)), known);
  const total = specs.reduce((n, s) => n + requirementList(s.requirements).length, 0);
  if (problems.length > 0) {
    console.error(`${problems.length} problem(s) in ${total} requirements of ${specs.length} specs:\n${problems.join('\n')}`);
    process.exit(1);
  }
  const k = Object.keys(known).length;
  console.log(`${total - k} of ${total} requirements of ${specs.length} specs name an existing test; ${k} known gaps in ${KNOWN_FILE}`);
}
