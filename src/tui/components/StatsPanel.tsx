import React from 'react';
import { Box, Text, useStdout } from 'ink';
import { type MboStage, type TuiStats, PIPELINE_STAGE_SEQUENCE, STAGE_COLORS, STAGE_LABELS } from '../types.js';
import { C } from '../colors.js';

// BUG-219: Shorter labels that fit the 35% side panel at 80-col terminals (~24 chars usable)
const SHORT_LABELS: Record<string, string> = {
  classification: 'CLASSIFY',
  context_pinning: 'ASSUMPTIONS',
  planning: 'PLANNING',
  tiebreaker_plan: 'TIE-PLAN',
  code_derivation: 'CODE',
  tiebreaker_code: 'TIE-CODE',
  dry_run: 'DRY RUN',
  implement: 'IMPLEMENT',
  audit_gate: 'AUDIT',
  state_sync: 'SYNC',
  knowledge_update: 'GRAPH',
};

interface Props {
  stage: MboStage;
  stats: TuiStats;
  filesInScope: string[];
  auditPending: boolean;
  activeModel: string;
  stageTokenTotals: Record<string, { model?: string; tokens?: number }>;
}

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'k';
  return String(Math.round(n || 0));
}

function fmtCost(n: number): string {
  return '$' + n.toFixed(4);
}

function getTotals(scope: 'session' | 'lifetime', stats: TuiStats) {
  const data = stats[scope];
  let optimized = 0;
  let notOptimized = 0;
  let costEst = 0;
  let rawCostEst = 0;
  for (const model of Object.values(data.models)) {
    optimized += model.optimized || 0;
    notOptimized += model.notOptimized || 0;
    costEst += model.costEst || 0;
    rawCostEst += model.rawCostEst || 0;
  }
  return { optimized, notOptimized, costEst, rawCostEst };
}

export function StatsPanel({ stage, stats, filesInScope, auditPending, activeModel, stageTokenTotals }: Props) {
  const { stdout } = useStdout();
  const totals = getTotals('session', stats);
  const savings = totals.rawCostEst - totals.costEst;
  const stageIndex = PIPELINE_STAGE_SEQUENCE.indexOf(stage);
  const recentHistory = (stats.session.stageHistory || []).slice(-5).reverse();

  return (
    <Box flexDirection="column" borderStyle="single" borderColor={C.purple} paddingX={1} height="100%">
      <Text bold color={C.purple}>PIPELINE</Text>
      <Box flexDirection="column">
        {PIPELINE_STAGE_SEQUENCE.map((entry, index) => {
          const isCurrent = entry === stage;
          const isPast = stageIndex >= 0 && index < stageIndex;
          const snapshot = stageTokenTotals[entry] || {};
          const color = isCurrent ? STAGE_COLORS[entry] : isPast ? C.done : C.purple;
          const prefix = isCurrent ? '▶ ' : isPast ? '✓ ' : '  ';
          const label = SHORT_LABELS[entry] || STAGE_LABELS[entry] || entry;
          const tokenText = snapshot.tokens ? ' ' + fmtTokens(snapshot.tokens) : '';
          return (
            <Text key={entry} color={color} bold={isCurrent} dimColor={!isCurrent && !isPast} wrap="truncate-end">
              {prefix}{label}{tokenText}
            </Text>
          );
        })}
      </Box>

      <Box marginTop={1} flexDirection="column">
        <Text color={C.purple} dimColor wrap="truncate-end">── Model</Text>
        <Text color={C.teal} dimColor wrap="truncate-end">{activeModel || 'unassigned'}</Text>
      </Box>

      <Box marginTop={1} flexDirection="column">
        <Text color={C.purple} dimColor wrap="truncate-end">── Session</Text>
        <Text color="green" wrap="truncate-end">{fmtTokens(totals.optimized)} tok · {fmtCost(totals.costEst)}</Text>
        {savings > 0.0001 ? <Text color="green" dimColor wrap="truncate-end">saved {fmtCost(savings)}</Text> : null}
        <Text color={C.teal} dimColor wrap="truncate-end">cache {stats.session.cache.hits}↑ {stats.session.cache.misses}✗</Text>
      </Box>

      {recentHistory.length > 0 ? (
        <Box marginTop={1} flexDirection="column">
          <Text color={C.purple} dimColor wrap="truncate-end">── History</Text>
          {recentHistory.map((snapshot, index) => (
            <Text key={snapshot.stage + '-' + index} color={C.white} dimColor wrap="truncate-end">
              {SHORT_LABELS[snapshot.stage] || snapshot.stage} · {(snapshot.model || '?').slice(0, 12)} · {fmtTokens(snapshot.tokens)}
            </Text>
          ))}
        </Box>
      ) : null}

      {filesInScope.length > 0 ? (
        <Box marginTop={1} flexDirection="column">
          <Text color={C.purple} dimColor wrap="truncate-end">── Files</Text>
          {filesInScope.slice(0, 6).map((file) => (
            <Text key={file} color={C.white} dimColor wrap="truncate-end">{file.split('/').pop()}</Text>
          ))}
          {filesInScope.length > 6 ? <Text color={C.purple} dimColor>+{filesInScope.length - 6} more</Text> : null}
        </Box>
      ) : null}

      {auditPending ? (
        <Box marginTop={1} flexDirection="column">
          <Text color={C.audit} bold>AUDIT PENDING</Text>
          <Text color={C.audit} dimColor wrap="truncate-end">Type approved or reject.</Text>
        </Box>
      ) : null}

      <Box flexGrow={1} />
      <Text color={C.purple} dimColor wrap="truncate-end">/tm for stats</Text>
    </Box>
  );
}
