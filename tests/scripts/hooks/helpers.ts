import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

/** The repo root. */
export const ROOT = fileURLToPath(new URL('../../../', import.meta.url));

/** Runs `bun <script> ...args` from the repo root and returns its exit code and output. */
export function runScript(script: string, args: string[] = []): { code: number | null; out: string } {
  const r = spawnSync('bun', [script, ...args], { cwd: ROOT, encoding: 'utf8', timeout: 60_000 });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
}
