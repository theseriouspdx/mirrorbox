import { useState, useEffect, useRef } from 'react';
import { useStdout } from 'ink';

/**
 * Shared scroll state for any vertically scrollable panel.
 * Auto-scrolls to bottom when new lines arrive (unless user has scrolled up).
 */
export function useScrollableLines(lines: string[], visibleCount: number) {
  const maxTop = Math.max(0, lines.length - visibleCount);
  const [topLine, setTopLine] = useState(maxTop);
  const maxTopRef = useRef(maxTop);
  maxTopRef.current = maxTop;
  const userScrolledRef = useRef(false);

  // Auto-scroll logic (BUG-183):
  // If the user hasn't explicitly scrolled up, always track the new bottom.
  useEffect(() => {
    if (!userScrolledRef.current) {
      setTopLine(maxTop);
    }
  }, [lines.length, maxTop]);

  const scrollUp = (n = 1) => {
    setTopLine((t) => {
      const next = Math.max(0, t - n);
      if (next < maxTopRef.current) userScrolledRef.current = true;
      return next;
    });
  };

  const scrollDown = (n = 1) => {
    setTopLine((t) => {
      const next = Math.min(maxTopRef.current, t + n);
      // Re-engage auto-scroll if we hit the bottom
      if (next >= maxTopRef.current) userScrolledRef.current = false;
      return next;
    });
  };

  const visibleLines = lines.slice(topLine, topLine + visibleCount);
  const canScrollUp = topLine > 0;
  const canScrollDown = topLine < maxTop;

  return { topLine, visibleLines, canScrollUp, canScrollDown, scrollUp, scrollDown, total: lines.length };
}

/** Compute how many content rows are available given terminal height and reserved rows. */
export function useAvailableRows(reservedRows: number): number {
  const { stdout } = useStdout();
  return Math.max(4, (stdout?.rows ?? 40) - reservedRows);
}
