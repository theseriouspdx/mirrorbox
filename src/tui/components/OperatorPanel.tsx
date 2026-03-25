import React, { useEffect, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import chalk from 'chalk';
import { type MboStage, type TuiStats, OPERATOR_PANEL_ROLES } from '../types.js';

const STAGE_SHORT: Record<string, string> = {
  idle: 'idle',
  onboarding: 'onboard',
  classification: 'classify',
  context_pinning: 'context',
  planning: 'plan',
  tiebreaker_plan: 'tie-plan',
  code_derivation: 'code',
  tiebreaker_code: 'tie-code',
  dry_run: 'dry-run',
  implement: 'impl',
  audit_gate: 'audit',
  state_sync: 'sync',
  knowledge_update: 'graph',
  error: 'error',
};
import { C } from '../colors.js';
import { useScrollableLines, useAvailableRows } from './useScrollableLines.js';

interface Props {
  lines: string[];
  stage: MboStage;
  pipelineRunning: boolean;
  auditPending: boolean;
  stats?: TuiStats;
  activeAction: string;
  activeModel: string;
  isActive: boolean;
  // Arrow-key task selection in startup list
  taskCount?: number;
  selectedTaskIdx?: number;
  onTaskSelect?: (idx: number) => void;
  onTaskActivate?: (idx: number) => void;
}

function fmtTok(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'k';
  return String(Math.round(n));
}

function fmtCost(n: number): string {
  return '$' + n.toFixed(4);
}

function getRoleTotals(stats?: TuiStats) {
  return OPERATOR_PANEL_ROLES.reduce((acc, role) => {
    const bucket = stats?.session.roles?.[role];
    if (!bucket) return acc;
    acc.tokens += bucket.tokens || 0;
    acc.costEst += bucket.costEst || 0;
    acc.rawCostEst += bucket.rawCostEst || 0;
    acc.calls += bucket.calls || 0;
    return acc;
  }, { tokens: 0, costEst: 0, rawCostEst: 0, calls: 0 });
}

function getHints(stage: MboStage, running: boolean, auditPending: boolean): string[] {
  if (auditPending) {
    return [
      'AUDIT GATE',
      'Type "approved" to sync state or "reject" to roll back.',
    ];
  }
  if (running) {
    return [
      'Pipeline running. Type a hint to steer the next iteration.',
      'Commands: stop, /tasks, /docs, /tm, /bugs, /setup',
    ];
  }
  if (stage === 'error') {
    return ['Pipeline error. Review the latest output above, then retry or stop.'];
  }
  return [
    'Ready. Describe a task, ask a question, or run a command.',
    'Commands: /tasks, /docs, /newtask, /tm, /bugs, status, clear, exit',
  ];
}

function trimLine(value: string, max = 88): string {
  if (value.length <= max) return value;
  return value.slice(0, max - 1) + '…';
}

// BUG-231: Shimmer effect — a bright highlight that sweeps across the last line of text
// Mimics the streaming text shimmer in Claude Code and Gemini
const SHIMMER_COLORS = [
  chalk.gray,         // dim
  chalk.white,        // bright
  chalk.magentaBright,// pink highlight (MBO accent)
  chalk.white,        // bright
  chalk.gray,         // dim
];

function shimmerLine(text: string, frame: number): string {
  if (!text || text.length === 0) return '';
  const windowSize = 6; // chars wide for the bright sweep
  const pos = frame % (text.length + windowSize + 4);
  let result = '';
  for (let i = 0; i < text.length; i++) {
    const dist = i - (pos - windowSize);
    if (dist >= 0 && dist < SHIMMER_COLORS.length) {
      result += SHIMMER_COLORS[dist](text[i]);
    } else {
      result += chalk.gray(text[i]);
    }
  }
  return result;
}

export function OperatorPanel({
  lines,
  stage,
  pipelineRunning,
  auditPending,
  stats,
  activeAction,
  activeModel,
  isActive,
  taskCount = 0,
  selectedTaskIdx = -1,
  onTaskSelect,
  onTaskActivate,
}: Props) {
  // BUG-229: Use all available height minus header (2 lines) — not 34%
  const available = useAvailableRows(3);
  const panelRows = Math.max(8, available);
  const hasContent = lines.length > 0;
  // BUG-231: When pipeline running with no output yet, show a "thinking" line that shimmers
  const thinkingLine = pipelineRunning && !hasContent ? 'Thinking…' : null;
  const sourceLines = hasContent
    ? lines
    : thinkingLine
      ? [thinkingLine, ...getHints(stage, pipelineRunning, auditPending)]
      : getHints(stage, pipelineRunning, auditPending);
  const { visibleLines, canScrollUp, canScrollDown, scrollUp, scrollDown, topLine, total } =
    useScrollableLines(sourceLines, panelRows);
  const totals = getRoleTotals(stats);
  const [pulse, setPulse] = useState(0);

  useEffect(() => {
    if (!pipelineRunning) {
      setPulse(0);
      return;
    }
    // Fast tick for shimmer sweep animation
    const timer = setInterval(() => setPulse((v) => v + 1), 80);
    return () => clearInterval(timer);
  }, [pipelineRunning]);

  // BUG-233: Arrow-key task selection — find which source lines are task items (start with ▸)
  const taskLineIndices: number[] = [];
  for (let i = 0; i < sourceLines.length; i++) {
    if (sourceLines[i]?.trimStart().startsWith('▸')) taskLineIndices.push(i);
  }
  const hasTaskSelection = taskCount > 0 && taskLineIndices.length > 0;

  useInput((input, key) => {
    if (!isActive) return;
    // When tasks are available, up/down navigate task selection; PageUp/PageDown still scroll
    if (hasTaskSelection && key.upArrow) {
      const next = selectedTaskIdx <= 0 ? taskCount - 1 : selectedTaskIdx - 1;
      onTaskSelect?.(next);
      return;
    }
    if (hasTaskSelection && key.downArrow) {
      const next = selectedTaskIdx >= taskCount - 1 ? 0 : selectedTaskIdx + 1;
      onTaskSelect?.(next);
      return;
    }
    if (hasTaskSelection && key.return && selectedTaskIdx >= 0) {
      onTaskActivate?.(selectedTaskIdx);
      return;
    }
    if (key.upArrow) scrollUp(1);
    if (key.downArrow) scrollDown(1);
    if (key.pageUp) scrollUp(10);
    if (key.pageDown) scrollDown(10);
  });

  const borderColor = auditPending ? C.audit : isActive ? C.teal : C.purple;
  const dotPulse = pipelineRunning ? ['·  ', '·· ', '···'][pulse % 3] : '   ';

  return (
    <Box flexDirection="column" borderStyle="single" borderColor={borderColor} paddingX={1} flexGrow={1}>
      <Box justifyContent="space-between">
        <Text bold color={borderColor}>{isActive ? '▶ ' : '  '}OPERATOR</Text>
        <Box gap={2}>
          <Text color={C.teal} wrap="truncate-end">operator: {fmtTok(totals.tokens)} tok · {fmtCost(totals.costEst)}</Text>
          {total > panelRows ? (
            <Text color={borderColor} dimColor>
              {canScrollUp ? '↑ ' : '  '}
              {topLine + 1}-{Math.min(topLine + panelRows, total)}/{total}
              {canScrollDown ? ' ↓' : '  '}
            </Text>
          ) : null}
        </Box>
      </Box>

      <Box marginBottom={0} justifyContent="space-between">
        <Text color={pipelineRunning ? C.pink : C.gray}>{dotPulse} {trimLine(activeAction || 'Ready for the next instruction', 42)}</Text>
        <Text color={C.gray} dimColor wrap="truncate-end">{trimLine(activeModel || 'no model selected', 22)}</Text>
      </Box>

      <Box flexDirection="column" flexGrow={1}>
        {visibleLines.map((line, index) => {
          const sourceIndex = topLine + index;
          const isLastVisible = index === visibleLines.length - 1;
          // BUG-231: Shimmer the last content line, or the "Thinking…" line when no output yet
          const isThinkingLine = thinkingLine && sourceIndex === 0;
          if (pipelineRunning && line && (isThinkingLine || (isLastVisible && !canScrollDown && hasContent))) {
            return (
              <Text key={sourceIndex}>{shimmerLine(line, pulse)}</Text>
            );
          }
          // BUG-233: Highlight selected task line with inverse/bold
          const taskIdx = taskLineIndices.indexOf(sourceIndex);
          if (hasTaskSelection && taskIdx >= 0 && taskIdx === selectedTaskIdx) {
            return (
              <Text key={sourceIndex} bold color={C.teal} wrap="wrap">
                {(line || '').replace('▸', '▶')}
              </Text>
            );
          }
          return (
            <Text key={sourceIndex} color={hasContent ? C.white : borderColor} dimColor={!hasContent} wrap="wrap">
              {line || ' '}
            </Text>
          );
        })}
      </Box>
    </Box>
  );
}
