import React from 'react';
import { Box, Text, useInput } from 'ink';
import { MboStage } from '../types.js';
import { C } from '../colors.js';
import { useScrollableLines, useAvailableRows } from './useScrollableLines.js';

interface Props {
  lines: string[];
  stage: MboStage;
  isActive: boolean;
}

function getLineColor(line: string): string {
  if (line.startsWith('[DRY RUN]') || line.startsWith('[PASS]')) return 'green';
  if (line.startsWith('[FAIL]')    || line.startsWith('[ERROR]')) return C.error;
  if (line.startsWith('[IMPLEMENT]') || line.startsWith('[APPLY]')) return C.teal;
  if (line.startsWith('[WARNING]') || line.startsWith('[WARN]'))    return C.audit;
  if (line.startsWith('──') || line.startsWith('==='))              return C.purple;
  if (line.startsWith('+'))                                          return 'green';
  if (line.startsWith('-') && !line.startsWith('---'))               return C.error;
  return C.white;
}

export function ExecutorPanel({ lines, stage, isActive }: Props) {
  const available = useAvailableRows(10);
  const { visibleLines, canScrollUp, canScrollDown, scrollUp, scrollDown, topLine, total } =
    useScrollableLines(lines, available);

  useInput((_i, key) => {
    if (!isActive) return;
    if (key.upArrow)   scrollUp(1);
    if (key.downArrow) scrollDown(1);
    if (key.pageUp)    scrollUp(10);
    if (key.pageDown)  scrollDown(10);
  });

  const isLive      = ['dry_run', 'implement', 'state_sync', 'knowledge_update'].includes(stage);
  const borderColor = isActive ? C.teal : isLive ? C.pink : C.purple;

  return (
    <Box flexDirection="column" borderStyle="single" borderColor={borderColor} paddingX={1} flexGrow={1}>
      <Box justifyContent="space-between">
        <Text bold color={borderColor}>{isActive ? '▶ ' : '  '}EXECUTOR — Dry Run · Implement</Text>
        {total > available && (
          <Text color={borderColor} dimColor>
            {canScrollUp ? '↑ ' : '  '}{topLine + 1}–{Math.min(topLine + available, total)}/{total}{canScrollDown ? ' ↓' : '  '}
          </Text>
        )}
      </Box>
      {lines.length === 0 ? (
        <Text color={borderColor} dimColor>  Waiting for execution output…</Text>
      ) : (
        <Box flexDirection="column" flexGrow={1}>
          {visibleLines.map((line, i) => (
            <Text key={topLine + i} color={getLineColor(line)} wrap="wrap">
              {line || ' '}
            </Text>
          ))}
        </Box>
      )}
    </Box>
  );
}
