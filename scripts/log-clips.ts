// `bun run log:seed`: replays every clip of public/clips/manifest.json from the left, the centre and the right through
// the real pipeline (mcp/replay.ts) and appends each event to the sound log (BANSHEE_LOG or .banshee/events.jsonl).
import '../mcp/vite-shim';
import { randomUUID } from 'node:crypto';
import { appendRecord, logPath } from '../mcp/log';

const { listClips, replayClip } = await import('../mcp/replay');
const LOG = logPath(process.env, process.cwd());
const SIDES = ['left', 'centre', 'right'] as const;

let written = 0;
for (const clip of listClips()) {
  for (const side of SIDES) {
    const outcome = await replayClip(clip.id, side);
    if (!outcome.ok) {
      console.error(`${clip.id} ${side}: ${outcome.code}`);
      process.exitCode = 1;
      continue;
    }
    const { event, decision } = outcome.replay;
    const saved = appendRecord(LOG, { ...event, id: randomUUID(), clip: clip.id, side });
    if (!saved.ok) {
      console.error(`${clip.id} ${side}: not written (${saved.errors.join('; ')})`);
      process.exitCode = 1;
      continue;
    }
    written++;
    const deg = event.bearingDeg === null ? null : Math.abs(event.bearingDeg) < 0.05 ? 0 : event.bearingDeg;
    const bearing = deg === null ? 'no bearing' : `${deg.toFixed(1)}° ${event.bearingSource}`;
    const outcomeText = decision.action === 'play' ? `play ${decision.pattern}, ${decision.side}` : `drop (${decision.reason})`;
    console.log(`${clip.id.padEnd(16)} ${side.padEnd(6)} ${event.class.padEnd(8)} ${event.confidence.toFixed(2)}  ${bearing.padEnd(20)} ${outcomeText}`);
  }
}
console.log(`wrote ${written} events to ${LOG}`);
