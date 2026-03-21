import React from 'react';
import { Box, Text, useInput } from 'ink';
import { PipelineEntry, ROLE_COLORS } from '../types.js';
import { C } from '../colors.js';
import { useScrollableLines, useAvailableRows } from './useScrollableLines.js';

interface Props {
  entries: PipelineEntry[];
  isActive: boolean;
}

function entriesToLines(entries: PipelineEntry[]): string[] {
  const out: string[] = [];
  for (const entry of entries) {
    out.push(`── [${entry.role.toUpperCase()}] ${'─'.repeat(Math.max(0, 40 - entry.role.length))}`);
    const chunkLines = entry.text.split('\n');
    for (const l of chunkLines) out.push(l);
    out.push('');
  }
  return out;
}

function getRoleColor(line: string, entries: PipelineEntry[]): string {
  for (const entry of entries) {
    const header = `── [${entry.role.toUpperCase()}]`;
    if (line.startsWith(header)) {
      return ROLE_COLORS[entry.role.toLowerCase()] ?? ROLE_COLORS.default;
    }
  }
  return C.white;
}

export function PipelinePanel({ entries, isActive }: Props) {
  const available = useAvailableRows(10);
  const lines = entriesToLines(entries);
  const { visibleLines, canScrollUp, canScrollDown, scrollUp, scrollDown, topLine, total } =
    useScrollableLines(lines, available);

  useInput((_i, key) => {
    if (!isActive) return;
    if (key.upArrow)   scrollUp(1);
    if (key.downArrow) scrollDown(1);
    if (key.pageUp)    scrollUp(10);
    if (key.pageDown)  scrollDown(10);
  });

  const borderColor = isActive ? C.teal : C.purple;

  return (
    <Box flexDirection="column" borderStyle="single" borderColor={borderColor} paddingX={1} flexGrow={1}>
      <Box justifyContent="space-between">
        <Text bold color={borderColor}>{isActive ? '▶ ' : '  '}PIPELINE — Agent Streams</Text>
        {total > available && (
          <Text color={borderColor} dimColor>
            {canScrollUp ? '↑ ' : '  '}{topLine + 1}–{Math.min(topLine + available, total)}/{total}{canScrollDown ? ' ↓' : '  '}
          </Text>
        )}
      </Box>
      {entries.length === 0 ? (
        <Text color={borderColor} dimColor>  Waiting for agent output… (PLANNER · REVIEWER · TIEBREAKER)</Text>
      ) : (
        <Box flexDirection="column" flexGrow={1}>
          {visibleLines.map((line, i) => {
            const isHeader = line.startsWith('── [');
            const roleColor = isHeader ? getRoleColor(line, entries) : C.white;
            return (
              <Text key={topLine + i} color={isHeader ? roleColor : C.white} bold={isHeader} dimColor={line === ''} wrap="wrap">
                {line || ' '}
              </Text>
            );
          })}
        </Box>
      )}
    </Box>
  );
}
