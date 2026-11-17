// `bun run haptics:mutate`: applies each mutant to its file in src/haptics/, runs `vitest run tests/haptics`
// and reports killed (tests fail) or survived (tests pass). Restores the files in `finally` and on
// SIGINT/SIGTERM. Exits 1 on a survivor, on a `find` text that does not occur exactly once, or when the
// unmutated tests fail. Refuses to start when src/haptics/ has uncommitted changes, unless --force.
import { spawn, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const SRC = (name: string) => fileURLToPath(new URL(`../../src/haptics/${name}`, import.meta.url));

interface Mutant {
  name: string;
  file: string;
  find: string;
  replace: string;
}

const MUTANTS: Mutant[] = [
  { name: 'no-confidence-check', file: 'side.ts', find: "  if (bearingConfidence < UNCERTAIN_CONFIDENCE) return 'unknown';\n", replace: '' },
  { name: 'swap-weights', file: 'constants.ts', find: 'alarm: 6, baby: 5, vehicle: 4,', replace: 'alarm: 4, baby: 5, vehicle: 6,' },
  { name: 'shrink-min-gap', file: 'constants.ts', find: 'export const MIN_GAP_MS = 80;', replace: 'export const MIN_GAP_MS = 10;' },
  {
    name: 'copy-pattern',
    file: 'patterns.json',
    find: '{ "class": "vehicle", "pulses": [{ "onMs": 80, "gapMs": 100 }, { "onMs": 400, "gapMs": 0 }] }',
    replace: '{ "class": "vehicle", "pulses": [{ "onMs": 70, "gapMs": 100 }, { "onMs": 70, "gapMs": 0 }] }',
  },
];

const originals = new Map<string, string>(MUTANTS.map((m) => [m.file, readFileSync(SRC(m.file), 'utf8')]));
const restoreAll = () => {
  for (const [file, text] of originals) writeFileSync(SRC(file), text);
};

function fail(message: string): never {
  console.error(`haptics:mutate: ${message}`);
  process.exit(1);
}

const dirty = spawnSync('git', ['status', '--porcelain', '--', 'src/haptics'], { cwd: ROOT, encoding: 'utf8' });
if (dirty.status !== 0) fail(`git status failed: ${dirty.stderr}`);
if (dirty.stdout.trim() && !process.argv.includes('--force')) {
  fail(`src/haptics/ has uncommitted changes; commit or stash them, or pass --force\n${dirty.stdout}`);
}
for (const m of MUTANTS) {
  const count = originals.get(m.file)!.split(m.find).length - 1;
  if (count !== 1) fail(`mutant ${m.name}: find text occurs ${count} times in ${m.file} (need exactly 1): ${m.find}`);
}

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => {
    restoreAll();
    process.exit(130);
  });
}

/** Runs the haptics tests; returns the exit code and the test files that failed. */
function runTests(): Promise<{ code: number; failed: string[] }> {
  return new Promise((resolve) => {
    const child = spawn('bunx', ['vitest', 'run', 'tests/haptics'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (out += d));
    child.on('close', (code) => {
      const files = [...out.replace(/\x1b\[[0-9;]*m/g, '').matchAll(/FAIL\s+tests\/haptics\/(\S+\.test\.ts)/g)].map((m) => m[1]);
      resolve({ code: code ?? 1, failed: [...new Set(files)].sort() });
    });
  });
}

const baseline = await runTests();
if (baseline.code !== 0) fail(`the unmutated tests fail (${baseline.failed.join(', ')}); fix them first`);

const rows: string[] = [];
let survivors = 0;
for (const m of MUTANTS) {
  let result: { code: number; failed: string[] };
  try {
    writeFileSync(SRC(m.file), originals.get(m.file)!.replace(m.find, m.replace));
    result = await runTests();
  } finally {
    restoreAll();
  }
  const killed = result.code !== 0;
  if (!killed) survivors++;
  rows.push(`| \`${m.name}\` | \`${m.file}\` | ${killed ? 'killed' : 'survived'} | ${result.failed.join(', ') || '-'} |`);
  console.error(`${m.name}: ${killed ? 'killed' : 'SURVIVED'}`);
}

console.log(['| Mutant | File | Result | Failing test files |', '|---|---|---|---|', ...rows].join('\n'));
console.log(`\n${MUTANTS.length - survivors} of ${MUTANTS.length} killed`);
process.exit(survivors > 0 ? 1 : 0);
