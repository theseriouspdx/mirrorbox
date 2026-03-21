import React from 'react';
import { Box, Text } from 'ink';
import { MboStage, TuiStats, STAGE_LABELS, STAGE_COLORS } from '../types.js';
import { C } from '../colors.js';

interface Props {
  stage: MboStage;
  stats: TuiStats;
  filesInScope: string[];
  auditPending: boolean;
  activeModel: string;
}

const PIPELINE_STAGES: MboStage[] = [
  'classification', 'context_pinning', 'planning', 'tiebreaker_plan',
  'code_derivation', 'tiebreaker_code', 'dry_run', 'implement',
  'audit_gate', 'state_sync', 'knowledge_update',
];

const SHORT_LABELS: Record<MboStage, string> = {
  idle:             'IDLE',
  classification:   'CLASSIFY',
  context_pinning:  'ASSUMPTIONS',
  planning:         'PLAN',
  tiebreaker_plan:  'TIEBREAK-P',
  code_derivation:  'CODE',
  tiebreaker_code:  'TIEBREAK-C',
  dry_run:          'DRY RUN',
  implement:        'IMPLEMENT',
  audit_gate:       'AUDIT',
  state_sync:       'SYNC',
  knowledge_update: 'GRAPH',
  error:            'ERROR',
};

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(Math.round(n));
}

function fmtCost(n: number): string { return `$${n.toFixed(4)}`; }

function getTotals(scope: 'session' | 'lifetime', stats: TuiStats) {
  const data = stats[scope];
  let optimized = 0, notOptimized = 0, costEst = 0, rawCostEst = 0;
  for (const m of Object.values(data.models)) {
    optimized    += m.optimized    || 0;
    notOptimized += m.notOptimized || 0;
    costEst      += m.costEst      || 0;
    rawCostEst   += m.rawCostEst   || 0;
  }
  return { optimized, notOptimized, costEst, rawCostEst };
}

export function StatsPanel({ stage, stats, filesInScope, auditPending, activeModel }: Props) {
  const sTotal = getTotals('session', stats);
  const savings = sTotal.rawCostEst - sTotal.costEst;
  const stageIdx = PIPELINE_STAGES.indexOf(stage);

  return (
    <Box flexDirection="column" borderStyle="single" borderColor={C.purple} paddingX={1} height="100%">
      {/* Pipeline stage stepper */}
      <Text bold color={C.purple}>  PIPELINE</Text>
      <Box flexDirection="column" marginTop={0}>
        {PIPELINE_STAGES.map((s, i) => {
          const isCurrent = s === stage;
          const isPast    = stageIdx >= 0 && i < stageIdx;
          const color     = isCurrent ? STAGE_COLORS[s] : isPast ? C.done : C.purple;
          const prefix    = isCurrent ? '▶ ' : isPast ? '✓ ' : '  ';
          return (
            <Text key={s} color={color} bold={isCurrent} dimColor={!isCurrent && !isPast}>
              {prefix}{SHORT_LABELS[s]}
            </Text>
          );
        })}
      </Box>

      {/* Active model */}
      {activeModel && (
        <Box marginTop={1} flexDirection="column">
          <Text color={C.purple} dimColor>── Model</Text>
          <Text color={C.teal} dimColor>  {activeModel}</Text>
        </Box>
      )}

      {/* Tokenmiser — Session (SPEC §30.3) */}
      <Box marginTop={1} flexDirection="column">
        <Text color={C.purple} dimColor>── Session TM</Text>
        <Text color="green">  {fmtTokens(sTotal.optimized)} tok · {fmtCost(sTotal.costEst)}</Text>
        {sTotal.rawCostEst > 0 && <Text color="red" dimColor>  raw {fmtCost(sTotal.rawCostEst)}</Text>}
        {savings > 0.0001 && <Text color="green" dimColor>  saved {fmtCost(savings)}</Text>}
        {stats.session.cache.hits > 0 && (
          <Text color={C.teal} dimColor>  cache {stats.session.cache.hits}↑ {stats.session.cache.misses}✗</Text>
        )}
      </Box>

      {/* Files in scope */}
      {filesInScope.length > 0 && (
        <Box marginTop={1} flexDirection="column">
          <Text color={C.purple} dimColor>── Files in scope</Text>
          {filesInScope.slice(0, 6).map((f) => (
            <Text key={f} color={C.white} dimColor>  {f.split('/').pop()}</Text>
          ))}
          {filesInScope.length > 6 && <Text color={C.purple} dimColor>  +{filesInScope.length - 6} more</Text>}
        </Box>
      )}

      {/* Audit gate callout */}
      {auditPending && (
        <Box marginTop={1} flexDirection="column">
          <Text color={C.audit} bold>⚠  AUDIT PENDING</Text>
          <Text color={C.audit} dimColor>  Tab 1 → "approved" / "reject"</Text>
        </Box>
      )}

      <Box flexGrow={1} />
      <Text color={C.purple} dimColor>  [/token] full stats</Text>
    </Box>
  );
}
