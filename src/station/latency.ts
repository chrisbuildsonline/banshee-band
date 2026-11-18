/**
 * Onset to output in ms: `outputMs - onsetMs` when both are finite numbers and the output is not before the
 * onset (0 is allowed). Null for a missing, non-finite or non-number value or an output before the onset.
 * Never throws; does not round. Pure.
 */
export function latencyMs(onsetMs: unknown, outputMs: unknown): number | null {
  if (typeof onsetMs !== 'number' || typeof outputMs !== 'number') return null;
  if (!Number.isFinite(onsetMs) || !Number.isFinite(outputMs)) return null;
  return outputMs >= onsetMs ? outputMs - onsetMs : null;
}
