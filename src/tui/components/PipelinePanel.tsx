import React from 'react';
import { Box, Text, useInput, useStdout } from 'ink';
import { createRequire } from 'module';
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

/** Word-wrap a single line to fit within maxWidth, breaking at word boundaries. */
function wordWrap(text: string, maxWidth: number): string[] {
  if (!text || text.length <= maxWidth) return [text];
  const words = text.split(/(\s+)/); // preserve whitespace tokens
  const result: string[] = [];
  let current = '';
  for (const word of words) {
    if (current.length + word.length <= maxWidth) {
      current += word;
    } else if (current.length === 0) {
      // Single word longer than maxWidth — hard break
      for (let i = 0; i < word.length; i += maxWidth) {
        result.push(word.slice(i, i + maxWidth));
      }
    } else {
      result.push(current);
      current = word.trimStart(); // new line starts without leading whitespace
    }
  }
  if (current) result.push(current);
  return result.length > 0 ? result : [''];
}

function entriesToLines(entries: PipelineEntry[], maxWidth: number): { lines: string[]; stageAnchors: StageAnchor[] } {
  const lines: string[] = [];
  const stageAnchors: StageAnchor[] = [];
  let lastStage: string | null = null;
  // Account for border (2) + paddingX (2) = 4 chars consumed by the panel chrome
  const wrapWidth = Math.max(40, maxWidth - 4);

  for (const entry of entries) {
    const stage = entry.stage || 'idle';
    if (stage !== lastStage) {
      stageAnchors.push({ stage, line: lines.length });
      lines.push('══ ' + (STAGE_LABELS[stage] || stage.toUpperCase()) + ' ' + '═'.repeat(Math.max(0, 48 - String(stage).length)));
      lastStage = stage;
    }
    lines.push('── [' + entry.role.toUpperCase() + ']' + (entry.model ? ' · ' + entry.model : ''));
    const chunkLines = String(entry.text || '').split('\n');
    for (const raw of chunkLines) {
      for (const wrapped of wordWrap(raw, wrapWidth)) lines.push(wrapped);
    }
    lines.push('');
  }

  return { lines, stageAnchors };
}

function fmtCost(n: number): string {
  return '$' + n.toFixed(4);
}

function fmtTokens(tokens: number): string {
  if (tokens >= 1_000_000) return (tokens / 1_000_000).toFixed(1) + 'M';
  if (tokens >= 1_000) return (tokens / 1_000).toFixed(1) + 'k';
  return String(Math.round(tokens || 0));
}

// BUG-228: Compact savings bar with truncation
function SessionSavingsBar({ stats }: { stats: TuiStats }) {
  try {
    const _require = createRequire(import.meta.url);
    const db = _require('../../state/db-manager.js');
    const rollup = db.getCostRollup();
    const totalTok = Object.values(stats.session.models).reduce((s: number, m: any) => s + (m.optimized || 0), 0);
    if (rollup.totalCalls === 0) return null;
    return (
      <Box marginBottom={1} paddingX={1}>
        <Text color="green" bold wrap="truncate-end">
          SAVED {fmtCost(rollup.routingSavings)} · Actual {fmtCost(rollup.actualCost)} · {fmtTokens(totalTok)} tok
        </Text>
      </Box>
    );
  } catch {
    return null;
  }
}

function getRoleColor(line: string): string {
  const match = line.match(/^── \[([^\]]+)\]/);
  if (!match) return C.white;
  const key = match[1].toLowerCase().replace(/\s+/g, '-');
  return ROLE_COLORS[key] ?? ROLE_COLORS.default;
}

export function PipelinePanel({ entries, isActive, currentStage, stats, stageTokenTotals }: Props) {
  const { stdout } = useStdout();
  const cols = stdout?.columns ?? 120;
  // BUG-244: Reserve rows for ALL UI chrome outside the pipeline content area:
  // StatusBar(2) + TabBar(1) + InputBar(3) + PipelinePanel border+header(3) + SavingsBar(2) + buffer(1) = 12
  const available = useAvailableRows(12);
  const { lines, stageAnchors } = entriesToLines(entries, cols);
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
          <Text color={C.teal}>pipeline: {fmtTokens(pipelineRoleTokens)} tok</Text>
          {total > available ? (
            <Text color={borderColor} dimColor>
              {canScrollUp ? '↑ ' : '  '}
              {topLine + 1}-{Math.min(topLine + available, total)}/{total}
              {canScrollDown ? ' ↓' : '  '}
            </Text>
          ) : null}
        </Box>
      </Box>

      {/* BUG-227: Removed redundant stage boxes — stage progress is in StatsPanel */}

      <SessionSavingsBar stats={stats} />

      {entries.length === 0 ? (
        <Text color={borderColor} dimColor>Waiting for planning and review output...</Text>
      ) : (
        <Box flexDirection="column" flexGrow={1}>
          {visibleLines.map((line, index) => {
            const isStageHeader = line.startsWith('══ ');
            const isRoleHeader = line.startsWith('── [');
            const color = isStageHeader ? C.teal : isRoleHeader ? getRoleColor(line) : C.white;
            return (
              <Text key={topLine + index} color={color} bold={isStageHeader || isRoleHeader} dimColor={line === ''}>
                {line || ' '}
              </Text>
            );
          })}
        </Box>
      )}
    </Box>
  );
}
