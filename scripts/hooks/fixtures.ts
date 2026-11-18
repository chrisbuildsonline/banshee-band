// `bun run hooks:fixtures [script...]`: regenerates the fixtures that come from the clips by running the existing
// package scripts in order (default FIXTURE_STEPS). Stops at the first failing script and exits with its code.
import { spawnSync } from 'node:child_process';

/** The fixture scripts: tests/classify/clip-results.json, tests/bearing/accuracy.json and docs/bearing.md, the sound log. */
export const FIXTURE_STEPS = ['classify:report', 'bearing:report', 'log:seed'];

/** Runs each step in order; returns 0, or the code of the first step that fails (1 when it has none). */
export function runSteps(steps: readonly string[], run: (step: string) => number | null): number {
  for (const step of steps) {
    const code = run(step);
    if (code !== 0) return code ?? 1;
  }
  return 0;
}

if (import.meta.main) {
  const steps = process.argv.length > 2 ? process.argv.slice(2) : FIXTURE_STEPS;
  const code = runSteps(steps, (step) => {
    console.log(`> bun run ${step}`);
    return spawnSync('bun', ['run', step], { stdio: 'inherit' }).status;
  });
  if (code !== 0) console.error(`fixtures: a step failed with exit code ${code}`);
  process.exit(code);
}
