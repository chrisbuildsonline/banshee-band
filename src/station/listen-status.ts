import type { CaptureState } from '../audio';
import type { ListenState } from './types';

/** Glyph shapes of the Listen status pill; each state differs in shape, not only in tint. */
export type ListenGlyph = 'circle' | 'dot' | 'square' | 'cross';

/** Word, glyph and tint of every shown Listen state (`idle` hides the pill). */
export const LISTEN_STATES: Readonly<Record<Exclude<ListenState, 'idle'>, { word: string; glyph: ListenGlyph; tint: 'neutral' | 'accent' | 'strong' }>> = Object.freeze({
  starting: { word: 'Starting', glyph: 'circle', tint: 'neutral' },
  listening: { word: 'Listening', glyph: 'dot', tint: 'accent' },
  stopped: { word: 'Stopped', glyph: 'square', tint: 'neutral' },
  blocked: { word: 'Mic blocked', glyph: 'cross', tint: 'strong' },
  problem: { word: 'Problem', glyph: 'cross', tint: 'strong' },
});

/**
 * The Listen state for a capture state. `started` says whether a live run was ever started, so `idle` before
 * the first Start hides the pill and after it reads "Stopped". An error gives "Mic blocked" for a denied
 * permission and "Problem" otherwise, with the capture's own plain message. Pure.
 */
export function listenStateFor(state: CaptureState, started: boolean): { state: ListenState; message: string | null } {
  switch (state.status) {
    case 'idle':
      return { state: started ? 'stopped' : 'idle', message: null };
    case 'ended':
      return { state: 'stopped', message: null };
    case 'starting':
      return { state: 'starting', message: null };
    case 'listening':
      return { state: 'listening', message: null };
    case 'error':
      return { state: state.error.code === 'permission-denied' ? 'blocked' : 'problem', message: state.error.message };
  }
}
