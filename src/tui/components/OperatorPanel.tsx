import React, { useEffect, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { type MboStage, type TuiStats, OPERATOR_PANEL_ROLES } from '../types.js';
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
      'Commands: stop, /tasks, /docs, /token, /setup',
    ];
  }
  if (stage === 'error') {
    return ['Pipeline error. Review the latest output above, then retry or stop.'];
  }
  return [
    'Ready. Describe a task, ask a question, or run a command.',
    'Commands: /tasks, /docs, /newtask, /token, status, clear, exit',
  ];
}

function trimLine(value: string, max = 88): string {
  if (value.length <= max) return value;
  return value.slice(0, max - 1) + '…';
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
}: Props) {
  const available = useAvailableRows(9);
  const panelRows = Math.max(8, Math.floor(available * 0.34));
  const hasContent = lines.length > 0;
  const sourceLines = hasContent ? lines : getHints(stage, pipelineRunning, auditPending);
  const { visibleLines, canScrollUp, canScrollDown, scrollUp, scrollDown, topLine, total } =
    useScrollableLines(sourceLines, panelRows);
  const totals = getRoleTotals(stats);
  const [pulse, setPulse] = useState(0);

  useEffect(() => {
    if (!pipelineRunning) {
      setPulse(0);
      return;
    }
    const timer = setInterval(() => setPulse((value) => (value + 1) % 3), 240);
    return () => clearInterval(timer);
  }, [pipelineRunning]);

  useInput((_input, key) => {
    if (!isActive) return;
    if (key.upArrow) scrollUp(1);
    if (key.downArrow) scrollDown(1);
    if (key.pageUp) scrollUp(10);
    if (key.pageDown) scrollDown(10);
  });

  const borderColor = auditPending ? C.audit : isActive ? C.teal : C.purple;
  const shimmer = pipelineRunning ? ['·  ', '·· ', '···'][pulse] : '   ';

  return (
    <Box flexDirection="column" borderStyle="single" borderColor={borderColor} paddingX={1} flexGrow={1}>
      <Box justifyContent="space-between">
        <Text bold color={borderColor}>{isActive ? '▶ ' : '  '}OPERATOR</Text>
        <Box gap={2}>
          <Text color={C.teal}>TM {fmtTok(totals.tokens)} · {fmtCost(totals.costEst)}</Text>
          {totals.rawCostEst > 0 ? <Text color={C.error} dimColor>raw {fmtCost(totals.rawCostEst)}</Text> : null}
          {total > panelRows ? (
            <Text color={borderColor} dimColor>
              {canScrollUp ? '↑ ' : '  '}
              {topLine + 1}-{Math.min(topLine + panelRows, total)}/{total}
              {canScrollDown ? ' ↓' : '  '}
            </Text>
          ) : null}
        </Box>
      </Box>

      <Box marginBottom={1} justifyContent="space-between">
        <Text color={pipelineRunning ? C.pink : C.gray}>{shimmer} {trimLine(activeAction || 'Ready for the next instruction', 42)}</Text>
        <Text color={C.gray} dimColor>{trimLine(activeModel || 'no model selected', 22)}</Text>
      </Box>

      <Box flexDirection="column" flexGrow={1}>
        {visibleLines.map((line, index) => (
          <Text key={topLine + index} color={hasContent ? C.white : borderColor} dimColor={!hasContent} wrap="wrap">
            {line || ' '}
          </Text>
        ))}
      </Box>
    </Box>
  );
}
