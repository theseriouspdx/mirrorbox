import React from 'react';
import { Box, Text, useInput } from 'ink';
import { MboStage, TuiStats } from '../types.js';
import { C } from '../colors.js';
import { useScrollableLines, useAvailableRows } from './useScrollableLines.js';

interface Props {
  lines: string[];
  stage: MboStage;
  pipelineRunning: boolean;
  auditPending: boolean;
  stats?: TuiStats;
}

function fmtTok(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000)      return `${(n / 1000).toFixed(1)}k`;
  return String(Math.round(n));
}
function fmtCost(n: number): string { return `$${n.toFixed(4)}`; }

function getSessionTotals(stats: TuiStats) {
  let optimized = 0, rawCostEst = 0, costEst = 0;
  for (const m of Object.values(stats.session.models)) {
    optimized  += m.optimized    || 0;
    costEst    += m.costEst      || 0;
    rawCostEst += m.rawCostEst   || 0;
  }
  return { optimized, costEst, rawCostEst };
}

function getHints(stage: MboStage, running: boolean, auditPending: boolean): string[] {
  if (auditPending) return [
    '⚠  AUDIT GATE — changes are staged and ready.',
    '   Type "approved" to apply  ·  "reject" to roll back.',
  ];
  if (running) return ['Pipeline running… type a hint to steer, or "stop" to abort.'];
  switch (stage) {
    case 'idle': return [
      'Ready. Describe a task, ask a question, or type a command.',
      'Commands: /tasks · /token · status · stop · clear · exit',
    ];
    case 'error': return ['An error occurred. See details above. Type "stop" or retry.'];
    default: return [`Stage: ${stage}`];
  }
}

export function OperatorPanel({ lines, stage, pipelineRunning, auditPending, stats }: Props) {
  const available = useAvailableRows(8);
  const panelRows = Math.max(6, Math.floor(available * 0.25));
  const hasContent = lines.length > 0;
  const sourceLines = hasContent ? lines : getHints(stage, pipelineRunning, auditPending);
  const { visibleLines, canScrollUp, canScrollDown, scrollUp, scrollDown, topLine, total } =
    useScrollableLines(sourceLines, panelRows);

  useInput((_i, key) => {
    if (key.upArrow)   scrollUp(1);
    if (key.downArrow) scrollDown(1);
    if (key.pageUp)    scrollUp(10);
    if (key.pageDown)  scrollDown(10);
  });

  const borderColor = auditPending ? C.audit : C.purple;

  // TM totals for SPEC §30.3 header
  const tm = stats ? getSessionTotals(stats) : null;

  return (
    <Box flexDirection="column" borderStyle="single" borderColor={borderColor} paddingX={1} flexGrow={1}>
      <Box justifyContent="space-between">
        <Text bold color={borderColor}>  OPERATOR</Text>
        <Box gap={2}>
          {/* SPEC §30.3 — TM totals: green actual / red counterfactual */}
          {tm && (
            <>
              <Text color="green">TM {fmtTok(tm.optimized)} · {fmtCost(tm.costEst)}</Text>
              {tm.rawCostEst > 0 && (
                <Text color="red" dimColor>raw {fmtCost(tm.rawCostEst)}</Text>
              )}
            </>
          )}
          {total > panelRows && (
            <Text color={borderColor} dimColor>
              {canScrollUp ? '↑ ' : '  '}{topLine + 1}–{Math.min(topLine + panelRows, total)}/{total}{canScrollDown ? ' ↓' : '  '}
            </Text>
          )}
        </Box>
      </Box>
      <Box flexDirection="column">
        {visibleLines.map((line, i) => (
          <Text key={topLine + i} color={hasContent ? C.white : borderColor} dimColor={!hasContent} wrap="wrap">
            {line || ' '}
          </Text>
        ))}
      </Box>
    </Box>
  );
}
