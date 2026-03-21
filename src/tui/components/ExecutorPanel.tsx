import React, { useEffect, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { type MboStage, type TuiStats, EXECUTOR_PANEL_ROLES } from '../types.js';
import { C } from '../colors.js';
import { useScrollableLines, useAvailableRows } from './useScrollableLines.js';

interface Props {
  lines: string[];
  stage: MboStage;
  isActive: boolean;
  stats: TuiStats;
  activeAction: string;
  activeModel: string;
  stageTokens: number;
}

function getLineColor(line: string): string {
  if (line.startsWith('[DRY RUN]') || line.startsWith('[PASS]')) return 'green';
  if (line.startsWith('[FAIL]') || line.startsWith('[ERROR]')) return C.error;
  if (line.startsWith('[IMPLEMENT]') || line.startsWith('[APPLY]')) return C.teal;
  if (line.startsWith('[WARNING]') || line.startsWith('[WARN]')) return C.audit;
  if (line.startsWith('──') || line.startsWith('===')) return C.purple;
  if (line.startsWith('+')) return 'green';
  if (line.startsWith('-') && !line.startsWith('---')) return C.error;
  return C.white;
}

function formatTokens(tokens: number): string {
  if (tokens >= 1_000_000) return (tokens / 1_000_000).toFixed(1) + 'M';
  if (tokens >= 1_000) return (tokens / 1_000).toFixed(1) + 'k';
  return String(Math.round(tokens || 0));
}

function getExecutorTokens(stats: TuiStats): number {
  return EXECUTOR_PANEL_ROLES.reduce((sum, role) => sum + (stats.session.roles?.[role]?.tokens || 0), 0);
}

export function ExecutorPanel({ lines, stage, isActive, stats, activeAction, activeModel, stageTokens }: Props) {
  const available = useAvailableRows(10);
  const { visibleLines, canScrollUp, canScrollDown, scrollUp, scrollDown, topLine, total } =
    useScrollableLines(lines, available);
  const executorTokens = getExecutorTokens(stats) + (stats.session.toolTokens || 0);
  const [pulse, setPulse] = useState(0);

  useEffect(() => {
    const live = ['dry_run', 'implement', 'state_sync', 'knowledge_update'].includes(stage);
    if (!live) {
      setPulse(0);
      return;
    }
    const timer = setInterval(() => setPulse((value) => (value + 1) % 3), 240);
    return () => clearInterval(timer);
  }, [stage]);

  useInput((_input, key) => {
    if (!isActive) return;
    if (key.upArrow) scrollUp(1);
    if (key.downArrow) scrollDown(1);
    if (key.pageUp) scrollUp(10);
    if (key.pageDown) scrollDown(10);
  });

  const isLive = ['dry_run', 'implement', 'state_sync', 'knowledge_update'].includes(stage);
  const borderColor = isActive ? C.teal : isLive ? C.pink : C.purple;
  const shimmer = isLive ? ['·  ', '·· ', '···'][pulse] : '   ';

  return (
    <Box flexDirection="column" borderStyle="single" borderColor={borderColor} paddingX={1} flexGrow={1}>
      <Box justifyContent="space-between">
        <Text bold color={borderColor}>{isActive ? '▶ ' : '  '}EXECUTOR</Text>
        <Box gap={2}>
          <Text color={C.teal}>TM {formatTokens(executorTokens)} tok</Text>
          <Text color={C.gray} dimColor>{formatTokens(stageTokens)} stage</Text>
          {total > available ? (
            <Text color={borderColor} dimColor>
              {canScrollUp ? '↑ ' : '  '}
              {topLine + 1}-{Math.min(topLine + available, total)}/{total}
              {canScrollDown ? ' ↓' : '  '}
            </Text>
          ) : null}
        </Box>
      </Box>

      <Box marginBottom={1} justifyContent="space-between">
        <Text color={isLive ? C.pink : C.gray}>{shimmer} {activeAction || 'Waiting for execution work'}</Text>
        <Text color={C.gray} dimColor>{activeModel || 'local executor'}</Text>
      </Box>

      {lines.length === 0 ? (
        <Text color={borderColor} dimColor>Waiting for execution output...</Text>
      ) : (
        <Box flexDirection="column" flexGrow={1}>
          {visibleLines.map((line, index) => (
            <Text key={topLine + index} color={getLineColor(line)} wrap="wrap">
              {line || ' '}
            </Text>
          ))}
        </Box>
      )}
    </Box>
  );
}
