// `bun run bearing:mutate`: applies each mutant to src/bearing/gcc-phat.ts, runs `vitest run tests/bearing`
// and reports killed (tests fail) or survived (tests pass). Restores the source in `finally` and on
// SIGINT/SIGTERM. Exits 1 on a survivor, on a `find` text that does not occur exactly once, or when the
// unmutated tests fail. Refuses to start when src/bearing/ has uncommitted changes, unless --force.
import { spawn, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const FILE = new URL('../../src/bearing/gcc-phat.ts', import.meta.url);
const PHAT = 'const w = 1 / (gMag[k] + floor);';
const INTERP = 'const off = (0.5 * (ym - yp)) / denom;';

const MUTANTS = [
  { name: 'phat-off', find: PHAT, replace: 'const w = 1;' },
  { name: 'phat-weak', find: PHAT, replace: 'const w = 1 / (Math.sqrt(gMag[k] * maxBin) + floor);' },
  { name: 'interp-off', find: INTERP, replace: 'const off = 0;' },
  { name: 'interp-half', find: INTERP, replace: 'const off = (0.25 * (ym - yp)) / denom;' },
  { name: 'sign-flip', find: 'const refined = peakLag + offset;', replace: 'const refined = -(peakLag + offset);' },
];

const original = readFileSync(FILE, 'utf8');
const restore = () => writeFileSync(FILE, original);

function fail(message: string): never {
  console.error(`bearing:mutate: ${message}`);
  process.exit(1);
}

const dirty = spawnSync('git', ['status', '--porcelain', '--', 'src/bearing'], { cwd: ROOT, encoding: 'utf8' });
if (dirty.status !== 0) fail(`git status failed: ${dirty.stderr}`);
if (dirty.stdout.trim() && !process.argv.includes('--force')) {
  fail(`src/bearing/ has uncommitted changes; commit or stash them, or pass --force\n${dirty.stdout}`);
}
for (const m of MUTANTS) {
  const count = original.split(m.find).length - 1;
  if (count !== 1) fail(`mutant ${m.name}: find text occurs ${count} times (need exactly 1): ${m.find}`);
}

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => {
    restore();
    process.exit(130);
  });
}

/** Runs the bearing tests; returns the exit code and the test files that failed. */
function runTests(): Promise<{ code: number; failed: string[] }> {
  return new Promise((resolve) => {
    const child = spawn('bunx', ['vitest', 'run', 'tests/bearing'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (out += d));
    child.on('close', (code) => {
      const files = [...out.replace(/\x1b\[[0-9;]*m/g, '').matchAll(/FAIL\s+tests\/bearing\/(\S+\.test\.ts)/g)].map((m) => m[1]);
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
    writeFileSync(FILE, original.replace(m.find, m.replace));
    result = await runTests();
  } finally {
    restore();
  }
  const killed = result.code !== 0;
  if (!killed) survivors++;
  rows.push(`| \`${m.name}\` | \`${m.replace}\` | ${killed ? 'killed' : 'survived'} | ${result.failed.join(', ') || '-'} |`);
  console.error(`${m.name}: ${killed ? 'killed' : 'SURVIVED'}`);
}

console.log(['| Mutant | Replacement in `gcc-phat.ts` | Result | Failing test files |', '|---|---|---|---|', ...rows].join('\n'));
console.log(`\n${MUTANTS.length - survivors} of ${MUTANTS.length} killed`);
process.exit(survivors > 0 ? 1 : 0);
