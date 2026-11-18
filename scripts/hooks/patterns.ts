// `bun run hooks:patterns [file]`: checks a pattern file (default src/haptics/patterns.json) with the rules of the
// pattern language and checkDistinctiveness. Prints every problem and exits 1 when there is one.
import { readFileSync } from 'node:fs';
import { checkDistinctiveness } from '../../src/haptics/distinct';
import { validatePatternData } from '../../src/haptics/patterns';

/** Every broken rule of raw pattern data: structure and limits, then pairs that are not distinct. Empty when good. */
export function patternProblems(data: unknown): string[] {
  const { patterns, errors } = validatePatternData(data);
  const violations = checkDistinctiveness(patterns).map((v) => `${v.kind}: ${v.detail}`);
  return [...new Set([...errors, ...violations])];
}

if (import.meta.main) {
  const file = process.argv[2] ?? 'src/haptics/patterns.json';
  let problems: string[];
  try {
    problems = patternProblems(JSON.parse(readFileSync(file, 'utf8')));
  } catch (e) {
    problems = [`${file}: ${(e as Error).message}`];
  }
  if (problems.length > 0) {
    console.error(`${file}: ${problems.length} problem(s)\n${problems.join('\n')}`);
    process.exit(1);
  }
  console.log(`${file}: every pattern keeps the limits and is distinct`);
}
