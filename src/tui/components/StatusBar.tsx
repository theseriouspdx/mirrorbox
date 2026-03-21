import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import { MboStage, STAGE_LABELS, STAGE_COLORS, ActiveTab, TuiStats } from '../types.js';
import { C } from '../colors.js';

interface Props {
  stage: MboStage;
  activeModel: string;
  currentTask: string | null;
  activeTab: ActiveTab;
  stageStartTime: number;
  version: string;
  pipelineRunning: boolean;
  stats?: TuiStats;
}

function formatElapsed(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s}s`;
}

export function StatusBar({ stage, activeModel, currentTask, activeTab, stageStartTime, version, pipelineRunning, stats }: Props) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const update = () => setElapsed(Math.floor((Date.now() - stageStartTime) / 1000));
    update();
    const t = setInterval(update, 1000);
    return () => clearInterval(t);
  }, [stageStartTime]);

  const stageLabel = STAGE_LABELS[stage] ?? stage.toUpperCase();
  const stageColor = STAGE_COLORS[stage] ?? C.white;
  const TAB_NAMES: Record<ActiveTab, string> = { 1: 'OPERATOR', 2: 'PIPELINE', 3: 'EXECUTOR', 4: 'SYSTEM' };

  return (
    <Box borderStyle="single" borderBottom borderTop={false} borderLeft={false} borderRight={false} paddingX={1} justifyContent="space-between">
      <Box gap={1}>
        <Text bold color={C.white}>MBO</Text>
        <Text color={C.white} dimColor>│</Text>
        <Text bold color={stageColor}>{stageLabel}</Text>
        {pipelineRunning && <Text color={stageColor} dimColor>●</Text>}
      </Box>
      <Box gap={1}>
        <Text color={C.teal} bold>[{TAB_NAMES[activeTab]}]</Text>
        {currentTask ? (
          <Text color={C.white} dimColor>{currentTask.length > 30 ? currentTask.slice(0, 27) + '…' : currentTask}</Text>
        ) : (
          <Text color={C.white} dimColor>no active task</Text>
        )}
      </Box>
      <Box gap={2} flexShrink={0}>
        {activeModel ? <Text color={C.teal} dimColor>{activeModel}</Text> : null}
        <Text color={C.white} dimColor>v{version}</Text>
        <Text color={C.white} dimColor>{formatElapsed(elapsed)}</Text>
      </Box>
    </Box>
  );
}
