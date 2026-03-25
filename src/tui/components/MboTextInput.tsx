/**
 * BUG-223: Custom text input replacing ink-text-input.
 *
 * Architecture: Uses ink's useInput for ALL key handling except forward delete.
 * Forward delete (\x1b[3~) requires a narrow stdin listener because ink maps
 * both Mac backspace (\x7f) and real forward-delete to key.delete.
 *
 * This avoids the stdin conflict where both useInput and stdin.on('data')
 * fire for every keypress.
 */
import React, { useState, useEffect, useCallback } from 'react';
import { Text, useInput, useStdin } from 'ink';
import chalk from 'chalk';

interface Props {
  value: string;
  onChange: (value: string) => void;
  onSubmit?: (value: string) => void;
  placeholder?: string;
  focus?: boolean;
}

export function MboTextInput({ value, onChange, onSubmit, placeholder = '', focus = true }: Props) {
  const { stdin } = useStdin();
  const [cursor, setCursor] = useState(value.length);
  // Track whether the last raw keypress was \x1b[3~ (real forward delete)
  const [pendingForwardDelete, setPendingForwardDelete] = useState(false);

  // Keep cursor in bounds when value changes externally (e.g. cleared on submit)
  useEffect(() => {
    setCursor((prev) => Math.min(prev, value.length));
  }, [value]);

  // Narrow stdin listener: ONLY detects \x1b[3~ (forward delete escape sequence)
  // Sets a flag that the useInput handler reads on the next key.delete event.
  useEffect(() => {
    if (!focus || !stdin) return;
    const onData = (data: Buffer) => {
      const s = String(data);
      if (s === '\x1b[3~') {
        setPendingForwardDelete(true);
      }
    };
    stdin.on('data', onData);
    return () => { stdin.off('data', onData); };
  }, [focus, stdin]);

  useInput((input, key) => {
    if (!focus) return;

    // Submit
    if (key.return) {
      onSubmit?.(value);
      return;
    }

    // Navigation — left/right only. Up/down handled by parent panels.
    if (key.leftArrow) {
      setCursor((c) => Math.max(0, c - 1));
      return;
    }
    if (key.rightArrow) {
      setCursor((c) => Math.min(value.length, c + 1));
      return;
    }

    // Backspace (key.backspace) — standard backward delete
    if (key.backspace) {
      if (cursor > 0) {
        const next = value.slice(0, cursor - 1) + value.slice(cursor);
        onChange(next);
        setCursor(cursor - 1);
      }
      return;
    }

    // key.delete fires for BOTH Mac backspace (\x7f) and real forward delete (\x1b[3~).
    // We use the pendingForwardDelete flag to distinguish:
    if (key.delete) {
      if (pendingForwardDelete) {
        // Real forward delete — remove character AFTER cursor
        setPendingForwardDelete(false);
        if (cursor < value.length) {
          const next = value.slice(0, cursor) + value.slice(cursor + 1);
          onChange(next);
        }
      } else {
        // Mac backspace (\x7f mapped to key.delete by ink) — backward delete
        if (cursor > 0) {
          const next = value.slice(0, cursor - 1) + value.slice(cursor);
          onChange(next);
          setCursor(cursor - 1);
        }
      }
      return;
    }

    // Ctrl+A — Home
    if (key.ctrl && input === 'a') {
      setCursor(0);
      return;
    }
    // Ctrl+E — End
    if (key.ctrl && input === 'e') {
      setCursor(value.length);
      return;
    }
    // Ctrl+K — kill to end of line
    if (key.ctrl && input === 'k') {
      onChange(value.slice(0, cursor));
      return;
    }
    // Ctrl+U — kill to start of line
    if (key.ctrl && input === 'u') {
      onChange(value.slice(cursor));
      setCursor(0);
      return;
    }
    // Ctrl+W — kill word backward
    if (key.ctrl && input === 'w') {
      const before = value.slice(0, cursor);
      const trimmed = before.replace(/\S+\s*$/, '');
      onChange(trimmed + value.slice(cursor));
      setCursor(trimmed.length);
      return;
    }

    // Ignore other control sequences, tabs, arrows handled by parent
    if (key.ctrl || key.meta || key.escape || key.tab || key.upArrow || key.downArrow) return;

    // Regular character input — insert at cursor position
    if (input) {
      const next = value.slice(0, cursor) + input + value.slice(cursor);
      onChange(next);
      setCursor(cursor + input.length);
    }
  }, { isActive: focus });

  // Render
  if (!value && !focus) {
    return <Text color="gray">{placeholder}</Text>;
  }

  if (!value) {
    if (placeholder) {
      return <Text>{chalk.inverse(placeholder[0])}{chalk.gray(placeholder.slice(1))}</Text>;
    }
    return <Text>{chalk.inverse(' ')}</Text>;
  }

  // Build rendered string with cursor highlight
  let rendered = '';
  for (let i = 0; i < value.length; i++) {
    if (i === cursor) {
      rendered += chalk.inverse(value[i]);
    } else {
      rendered += value[i];
    }
  }
  if (cursor === value.length) {
    rendered += chalk.inverse(' ');
  }

  return <Text>{rendered}</Text>;
}
