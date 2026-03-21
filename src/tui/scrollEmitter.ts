/**
 * scrollEmitter — Tiny event bus for mouse scroll events.
 * MouseFilterStream parses SGR mouse sequences from stdin and emits here.
 * Panels subscribe in a useEffect to update their local topLine state.
 * Using a module-level emitter avoids lifting scroll state to the root
 * (which would cause full Ink tree re-renders on every scroll tick).
 */

import { EventEmitter } from 'events';

export type ScrollDirection = 'up' | 'down';

const emitter = new EventEmitter();
// Up to ~10 components might subscribe simultaneously (panels + sub-components)
emitter.setMaxListeners(20);

/**
 * Emit a scroll event. Called by MouseFilterStream when an SGR mouse scroll sequence is detected.
 * @param direction - 'up' or 'down'
 * @param lines - Number of lines to scroll (default 3 for natural mouse wheel feel)
 */
export function emitScroll(direction: ScrollDirection, lines = 3): void {
  emitter.emit('scroll', direction, lines);
}

/**
 * Subscribe to scroll events. Each panel calls this in a useEffect.
 * @param handler - Called with direction and line count on each scroll event.
 * @returns Cleanup function — call it in the useEffect return to unsubscribe.
 */
export function onScroll(
  handler: (direction: ScrollDirection, lines: number) => void,
): () => void {
  emitter.on('scroll', handler);
  return () => emitter.off('scroll', handler);
}
