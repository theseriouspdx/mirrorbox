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

  // Auto-scroll to bottom when new content arrives, only if near bottom
  useEffect(() => {
    if (!userScrolledRef.current) {
      setTopLine(maxTop);
    } else {
      setTopLine((prev) => {
        // If still near the bottom (within 3 lines), track it
        if (prev >= maxTop - 3) {
          userScrolledRef.current = false;
          return maxTop;
        }
        return prev;
      });
    }
  }, [lines.length, maxTop]);

  const scrollUp = (n = 1) => {
    userScrolledRef.current = true;
    setTopLine((t) => Math.max(0, t - n));
  };
  const scrollDown = (n = 1) => {
    setTopLine((t) => {
      const next = Math.min(maxTopRef.current, t + n);
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
