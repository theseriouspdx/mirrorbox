import { Transform, TransformCallback } from 'stream';
import { emitScroll } from './scrollEmitter.js';

/**
 * MouseFilterStream — Transform stream that sits between stdin and Ink.
 *
 * Problem: Ink enables raw terminal mode, which causes macOS dictation and
 * mouse tracking sequences to be passed directly to stdin. Dictation injects
 * multi-byte escape sequences that confuse Ink's input handling, crashing
 * the host terminal (BUG-185). Mouse button-press events from terminal mouse
 * tracking clear text selections immediately (BUG-186).
 *
 * Fix: This stream intercepts all SGR mouse sequences (ESC[<Ps;Px;PyM/m)
 * before they reach Ink. Scroll events (Ps=64/65) are forwarded to the
 * scrollEmitter bus so panels can react. All other mouse events are silently
 * dropped — they never reach Ink, so native terminal selection works normally.
 * Non-mouse input (keyboard, dictation text) passes through unchanged.
 */
export class MouseFilterStream extends Transform {
  private buffer = '';

  _transform(chunk: Buffer, _encoding: string, callback: TransformCallback) {
    this.buffer += chunk.toString();

    // Regex to match complete SGR mouse sequences (ESC[<Ps;Px;PyM or m)
    const sgrRe = /\x1b\[<(\d+);(\d+);(\d+)([Mm])/g;
    let match;
    let lastIndex = 0;
    let cleanOutput = '';

    // Process all complete mouse sequences
    while ((match = sgrRe.exec(this.buffer)) !== null) {
      // Keep any standard keyboard input that came before the mouse event
      cleanOutput += this.buffer.slice(lastIndex, match.index);

      const ps = parseInt(match[1], 10);
      if (ps === 64) emitScroll('up', 3);
      if (ps === 65) emitScroll('down', 3);
      // All other mouse events (clicks, moves) are dropped — never reach Ink

      lastIndex = sgrRe.lastIndex;
    }

    // Handle remaining characters in the buffer
    const remaining = this.buffer.slice(lastIndex);
    const partialEscIndex = remaining.lastIndexOf('\x1b');

    // If a chunk cuts off right in the middle of an escape sequence...
    if (partialEscIndex !== -1 && !remaining.slice(partialEscIndex).match(/[a-zA-Z~]/)) {
      // Push safe text, hold the partial sequence in the buffer for the next chunk
      cleanOutput += remaining.slice(0, partialEscIndex);
      this.buffer = remaining.slice(partialEscIndex);
    } else {
      // No partial sequence; push everything and clear buffer
      cleanOutput += remaining;
      this.buffer = '';
    }

    // Only forward data to Ink if there are actual keystrokes left
    if (cleanOutput) {
      this.push(cleanOutput);
    }

    callback();
  }
}
