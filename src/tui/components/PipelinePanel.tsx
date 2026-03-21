import React from 'react';
import { Box, Text, useInput } from 'ink';
import { type PipelineEntry, ROLE_COLORS, PIPELINE_STAGE_SEQUENCE, STAGE_LABELS, type MboStage, type TuiStats } from '../types.js';
import { C } from '../colors.js';
import { useScrollableLines, useAvailableRows } from './useScrollableLines.js';

interface Props {
  entries: PipelineEntry[];
  isActive: boolean;
  currentStage: MboStage;
  stats: TuiStats;
  stageTokenTotals: Record<string, { model?: string; tokens?: number }>;
}

interface StageAnchor {
  stage: MboStage;
  line: number;
}

function entriesToLines(entries: PipelineEntry[]): { lines: string[]; stageAnchors: StageAnchor[] } {
  const lines: string[] = [];
  const stageAnchors: StageAnchor[] = [];
  let lastStage: string | null = null;

  for (const entry of entries) {
    const stage = entry.stage || 'idle';
    if (stage !== lastStage) {
      stageAnchors.push({ stage, line: lines.length });
      lines.push('══ ' + (STAGE_LABELS[stage] || stage.toUpperCase()) + ' ' + '═'.repeat(Math.max(0, 48 - String(stage).length)));
      lastStage = stage;
    }
    lines.push('── [' + entry.role.toUpperCase() + ']' + (entry.model ? ' · ' + entry.model : ''));
    const chunkLines = String(entry.text || '').split('\n');
    for (const line of chunkLines) lines.push(line);
    lines.push('');
  }

  return { lines, stageAnchors };
}

function getRoleColor(line: string): string {
  const match = line.match(/^── \[([^\]]+)\]/);
  if (!match) return C.white;
  const key = match[1].toLowerCase().replace(/\s+/g, '-');
  return ROLE_COLORS[key] ?? ROLE_COLORS.default;
}

function formatTokens(tokens: number): string {
  if (tokens >= 1_000_000) return (tokens / 1_000_000).toFixed(1) + 'M';
  if (tokens >= 1_000) return (tokens / 1_000).toFixed(1) + 'k';
  return String(Math.round(tokens || 0));
}

export function PipelinePanel({ entries, isActive, currentStage, stats, stageTokenTotals }: Props) {
  const available = useAvailableRows(10);
  const { lines, stageAnchors } = entriesToLines(entries);
  const { visibleLines, canScrollUp, canScrollDown, scrollUp, scrollDown, scrollTo, topLine, total } =
    useScrollableLines(lines, available);
  const currentAnchorIndex = Math.max(0, stageAnchors.findIndex((anchor) => anchor.stage === currentStage));
  const pipelineRoleTokens = ['architecturePlanner', 'componentPlanner', 'reviewer', 'tiebreaker'].reduce((sum, role) => {
    return sum + (stats.session.roles?.[role]?.tokens || 0);
  }, 0);

  useInput((input, key) => {
    if (!isActive) return;
    if (key.upArrow) scrollUp(1);
    if (key.downArrow) scrollDown(1);
    if (key.pageUp) scrollUp(10);
    if (key.pageDown) scrollDown(10);
    if ((input === '[' || input === 'h') && stageAnchors.length > 0) {
      const nextIndex = Math.max(0, currentAnchorIndex - 1);
      scrollTo(stageAnchors[nextIndex].line);
    }
    if ((input === ']' || input === 'l') && stageAnchors.length > 0) {
      const nextIndex = Math.min(stageAnchors.length - 1, currentAnchorIndex + 1);
      scrollTo(stageAnchors[nextIndex].line);
    }
  });

  const borderColor = isActive ? C.teal : C.purple;

  return (
    <Box flexDirection="column" borderStyle="single" borderColor={borderColor} paddingX={1} flexGrow={1}>
      <Box justifyContent="space-between">
        <Text bold color={borderColor}>{isActive ? '▶ ' : '  '}PIPELINE</Text>
        <Box gap={2}>
          <Text color={C.teal}>TM {formatTokens(pipelineRoleTokens)} tok</Text>
          {total > available ? (
            <Text color={borderColor} dimColor>
              {canScrollUp ? '↑ ' : '  '}
              {topLine + 1}-{Math.min(topLine + available, total)}/{total}
              {canScrollDown ? ' ↓' : '  '}
            </Text>
          ) : null}
        </Box>
      </Box>

      <Box marginBottom={1} gap={1} flexWrap="wrap">
        {PIPELINE_STAGE_SEQUENCE.map((stage) => {
          const isCurrent = stage === currentStage;
          const snapshot = stageTokenTotals[stage] || {};
          const tokenText = snapshot.tokens ? ' · ' + formatTokens(snapshot.tokens) : '';
          return (
            <Box key={stage} borderStyle="single" borderColor={isCurrent ? C.teal : C.purple} paddingX={1}>
              <Text color={isCurrent ? C.white : C.gray} bold={isCurrent}>
                {isCurrent ? '▶ ' : ''}
                {STAGE_LABELS[stage]}
                {tokenText}
              </Text>
            </Box>
          );
        })}
      </Box>

      {entries.length === 0 ? (
        <Text color={borderColor} dimColor>Waiting for planning and review output...</Text>
      ) : (
        <Box flexDirection="column" flexGrow={1}>
          {visibleLines.map((line, index) => {
            const isStageHeader = line.startsWith('══ ');
            const isRoleHeader = line.startsWith('── [');
            const color = isStageHeader ? C.teal : isRoleHeader ? getRoleColor(line) : C.white;
            return (
              <Text key={topLine + index} color={color} bold={isStageHeader || isRoleHeader} dimColor={line === ''} wrap="wrap">
                {line || ' '}
              </Text>
            );
          })}
        </Box>
      )}
    </Box>
  );
}
