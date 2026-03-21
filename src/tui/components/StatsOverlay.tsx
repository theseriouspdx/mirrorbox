import React from 'react';
import { Box, Text } from 'ink';
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
function fmtCost(n: number, p = 6): string { return `$${n.toFixed(p)}`; }
function pct(a: number, b: number): string {
  if (!b) return '—';
  return `${((1 - a / b) * 100).toFixed(1)}%`;
}

function getTotals(scope: 'session' | 'lifetime', stats: TuiStats) {
  const data = stats[scope];
  let optimized = 0, notOptimized = 0, costEst = 0, rawCostEst = 0;
  for (const m of Object.values(data.models)) {
    optimized    += m.optimized    || 0;
    notOptimized += m.notOptimized || 0;
    costEst      += m.costEst      || 0;
    rawCostEst   += m.rawCostEst   || 0;
  }
  return { optimized, notOptimized, costEst, rawCostEst, toolTokens: data.toolTokens || 0 };
}

const SEP = '─'.repeat(64);
const ROW = (label: string, val: string, color: string = C.white) => (
  <Box key={label}>
    <Text color={C.white} dimColor>{`  ${label.padEnd(28)}`}</Text>
    <Text color={color}>{val}</Text>
  </Box>
);

export function StatsOverlay({ stats, onClose }: Props) {
  const s = getTotals('session', stats);
  const l = getTotals('lifetime', stats);
  const sSavings = s.rawCostEst - s.costEst;
  const lSavings = l.rawCostEst - l.costEst;
  const co2 = ((Math.max(0, l.notOptimized - l.optimized)) / 1000) * 0.1;

  return (
    <Box flexDirection="column" paddingX={2} paddingY={1} borderStyle="double" borderColor={C.teal} flexGrow={1}>
      <Box justifyContent="space-between">
        <Text bold color={C.teal}>TOKENMISER — Statistics</Text>
        <Text color={C.teal} dimColor>[SHIFT+T] or [/token] to close</Text>
      </Box>
      <Text color={C.teal} dimColor>{SEP}</Text>

      <Text bold color={C.white}>SESSION</Text>
      <Text color={C.gray} dimColor>  savings = most-expensive-model cost minus actual smart-routed cost</Text>
      {ROW('tokens (smart-routed)',    fmtTokens(s.optimized),                            'green')}
      {ROW('tokens (if single-model)', fmtTokens(s.notOptimized),                        C.error)}
      {ROW('cost (smart-routed)',      fmtCost(s.costEst, 4),                             'green')}
      {ROW('cost (if single-model)',   fmtCost(s.rawCostEst, 4),                          C.error)}
      {ROW('savings vs single-model',  `${fmtCost(sSavings, 4)} (${pct(s.costEst, s.rawCostEst)} off)`, 'green')}
      {ROW('cache hits / misses',      `${stats.session.cache.hits} / ${stats.session.cache.misses}`, C.teal)}
      {ROW('tool context tokens',      fmtTokens(s.toolTokens),                           C.white)}
      <Text color={C.teal} dimColor>{SEP}</Text>

      <Text bold color={C.white}>LIFETIME ({stats.sessions} sessions)</Text>
      {ROW('tokens (smart-routed)',    fmtTokens(l.optimized),                            'green')}
      {ROW('tokens (if single-model)', fmtTokens(l.notOptimized),                        C.error)}
      {ROW('cost (smart-routed)',      fmtCost(l.costEst, 4),                             'green')}
      {ROW('savings vs single-model',  `${fmtCost(lSavings, 4)} (${pct(l.costEst, l.rawCostEst)} off)`, 'green')}
      {ROW('largest session delta',    fmtCost(stats.largestSessionDelta, 4),             C.pink)}
      {ROW('CO₂ avoided (est.)',       `${co2.toFixed(4)}g`,                              'green')}
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
      {Object.entries(stats.session.models).length === 0
        ? ROW('(no data yet)', '', C.purple)
        : Object.entries(stats.session.models).map(([model, data]) =>
            ROW(model, `${fmtTokens(data.optimized)} tok · ${fmtCost(data.costEst, 4)}`, C.teal)
          )}
      <Text color={C.teal} dimColor>{SEP}</Text>
      <Text color={C.white} dimColor>  Last updated: {stats.lastUpdate ? new Date(stats.lastUpdate).toLocaleTimeString() : '—'}</Text>
    </Box>
  );
}
