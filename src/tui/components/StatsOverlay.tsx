import React from 'react';
import { Box, Text } from 'ink';
import { createRequire } from 'module';
import { TuiStats } from '../types.js';
import { C } from '../colors.js';

interface Props {
  stats: TuiStats;
  onClose: () => void;
}

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(Math.round(n));
}

function fmtCost(n: number, p = 6): string {
  return `$${n.toFixed(p)}`;
}

function pct(a: number, b: number): string {
  if (!b) return '—';
  return `${((1 - a / b) * 100).toFixed(1)}%`;
}

function getTotals(scope: 'session' | 'lifetime', stats: TuiStats) {
  const data = stats[scope];
  let optimized = 0;
  let notOptimized = 0;
  let costEst = 0;
  let rawCostEst = 0;
  for (const m of Object.values(data.models)) {
    optimized += m.optimized || 0;
    notOptimized += m.notOptimized || 0;
    costEst += m.costEst || 0;
    rawCostEst += m.rawCostEst || 0;
  }
  return { optimized, notOptimized, costEst, rawCostEst, toolTokens: data.toolTokens || 0 };
}

function rollupTotals(rollup: any, toolTokens: number, fallback: ReturnType<typeof getTotals>) {
  if (!rollup || !Array.isArray(rollup.byModel) || rollup.byModel.length === 0) {
    return fallback;
  }
  return {
    optimized: rollup.byModel.reduce((sum: number, row: any) => sum + (row.totalInput || 0) + (row.totalOutput || 0), 0),
    notOptimized: rollup.byModel.reduce((sum: number, row: any) => sum + (row.rawTokens || 0), 0),
    costEst: rollup.actualCost || 0,
    rawCostEst: rollup.rawCost || rollup.counterfactualCost || 0,
    toolTokens,
  };
}

const SEP = '─'.repeat(64);
const ROW = (label: string, val: string, color: string = C.white) => (
  <Box key={label}>
    <Text color={C.white} dimColor>{`  ${label.padEnd(28)}`}</Text>
    <Text color={color}>{val}</Text>
  </Box>
);

export function StatsOverlay({ stats, onClose }: Props) {
  const sessionFallback = getTotals('session', stats);
  const lifetimeFallback = getTotals('lifetime', stats);
  const sessionCount = Math.max(0, stats.sessions || 0);

  let sessionRollup: any = null;
  let lifetimeRollup: any = null;
  try {
    const _require = createRequire(import.meta.url);
    const statsManager = _require('../../state/stats-manager.js');
    sessionRollup = statsManager.getRoutingSavings('session');
    lifetimeRollup = statsManager.getRoutingSavings('lifetime');
  } catch { /* db unavailable — fall back gracefully */ }

  const s = rollupTotals(sessionRollup, stats.session.toolTokens || 0, sessionFallback);
  const l = rollupTotals(lifetimeRollup, stats.lifetime.toolTokens || 0, lifetimeFallback);
  const lSavings = l.rawCostEst - l.costEst;
  const co2 = ((Math.max(0, l.notOptimized - l.optimized)) / 1000) * 0.1;
  const sessionByModel = sessionRollup && Array.isArray(sessionRollup.byModel) && sessionRollup.byModel.length > 0
    ? sessionRollup.byModel.map((row: any) => ({
        model: row.model,
        tokens: (row.totalInput || 0) + (row.totalOutput || 0),
        cost: row.actualCost || 0,
      }))
    : Object.entries(stats.session.models).map(([model, data]) => ({
        model,
        tokens: data.optimized || 0,
        cost: data.costEst || 0,
      }));

  return (
    <Box flexDirection="column" paddingX={2} paddingY={1} borderStyle="double" borderColor={C.teal} flexGrow={1}>
      <Box justifyContent="space-between">
        <Text bold color={C.teal}>TOKENMISER — Session + Project</Text>
        <Text color={C.teal} dimColor>[SHIFT+T] or [/tm] to close</Text>
      </Box>
      <Text color={C.teal} dimColor>{SEP}</Text>

      <Text bold color={C.white}>SESSION — Routing Savings</Text>
      <Text color={C.gray} dimColor>  smart model routing saved cost vs. always using the most expensive model</Text>
      {sessionRollup && sessionRollup.totalCalls > 0 ? (
        <>
          {ROW('actual cost (smart routing)', fmtCost(sessionRollup.actualCost, 4), 'green')}
          {ROW('raw baseline cost', fmtCost(sessionRollup.rawCost || sessionRollup.counterfactualCost, 4), C.error)}
          {ROW('without routing', fmtCost(sessionRollup.counterfactualCost, 4), C.error)}
          {ROW('routing savings', `${fmtCost(sessionRollup.routingSavings, 4)} (${pct(sessionRollup.actualCost, sessionRollup.counterfactualCost)} off)`, 'green')}
        </>
      ) : ROW('(no model calls yet)', '', C.purple)}
      {ROW('token compression est.', fmtTokens(s.notOptimized) + ' → ' + fmtTokens(s.optimized), C.gray)}
      {ROW('cache hits / misses', `${stats.session.cache.hits} / ${stats.session.cache.misses}`, C.teal)}
      {ROW('tool context tokens', fmtTokens(s.toolTokens), C.white)}
      <Text color={C.teal} dimColor>{SEP}</Text>

      <Text bold color={C.white}>PROJECT ({sessionCount} sessions recorded)</Text>
      {ROW('tokens (smart-routed)', fmtTokens(l.optimized), 'green')}
      {ROW('cost (smart-routed)', fmtCost(l.costEst, 4), 'green')}
      {ROW('compression savings est.', `${fmtCost(lSavings, 4)} (${pct(l.costEst, l.rawCostEst)} off)`, 'green')}
      {ROW('largest session delta', fmtCost(stats.largestSessionDelta, 4), C.pink)}
      {ROW('CO₂ avoided (est.)', `${co2.toFixed(4)}g`, 'green')}
      <Text color={C.teal} dimColor>{SEP}</Text>

      <Text bold color={C.white}>BY ROLE — Session</Text>
      <Text color={C.gray} dimColor>  matches what each panel shows (operator / pipeline / executor)</Text>
      {Object.entries(stats.session.roles || {}).length === 0
        ? ROW('(no data yet)', '', C.purple)
        : Object.entries(stats.session.roles || {}).map(([role, data]) =>
            ROW(role, `${fmtTokens(data.tokens)} tok · ${fmtCost(data.costEst, 4)}`, C.teal)
          )}
      <Text color={C.teal} dimColor>{SEP}</Text>

      <Text bold color={C.white}>BY MODEL — Session</Text>
      {sessionByModel.length === 0
        ? ROW('(no data yet)', '', C.purple)
        : sessionByModel.map((row: any) =>
            ROW(row.model, `${fmtTokens(row.tokens)} tok · ${fmtCost(row.cost, 4)}`, C.teal)
          )}
      <Text color={C.teal} dimColor>{SEP}</Text>
      <Text color={C.white} dimColor>  Last updated: {stats.lastUpdate ? new Date(stats.lastUpdate).toLocaleTimeString() : '—'}</Text>
    </Box>
  );
}
