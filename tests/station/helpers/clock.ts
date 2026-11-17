/** A clock that returns `values` in order, counts its reads and throws when read more often than the list is long. */
export function scriptedClock(values: readonly number[]): { (): number; readonly calls: number } {
  let i = 0;
  const now = () => {
    if (i >= values.length) throw new Error(`clock read ${i + 1} times, scripted for ${values.length}`);
    return values[i++];
  };
  return Object.defineProperty(now, 'calls', { get: () => i }) as { (): number; readonly calls: number };
}
