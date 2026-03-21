import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import { type MboStage, STAGE_LABELS, STAGE_COLORS, type ActiveTab } from '../types.js';
import { C } from '../colors.js';

interface Props {
  stage: MboStage;
  activeModel: string;
  activeAction: string;
  currentTask: string | null;
  activeTab: ActiveTab;
  stageStartTime: number;
  version: string;
  pipelineRunning: boolean;
  stageTokens: number;
}

function formatElapsed(seconds: number): string {
  if (seconds < 60) return seconds + 's';
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return minutes + 'm ' + secs + 's';
}

function formatTokens(tokens: number): string {
  if (tokens >= 1_000_000) return (tokens / 1_000_000).toFixed(1) + 'M';
  if (tokens >= 1_000) return (tokens / 1_000).toFixed(1) + 'k';
  return String(Math.round(tokens || 0));
}

function truncate(value: string | null | undefined, max: number): string {
  const text = String(value || '');
  if (text.length <= max) return text;
  return text.slice(0, max - 1) + '…';
}

export function StatusBar({
  stage,
  activeModel,
  activeAction,
  currentTask,
  activeTab,
  stageStartTime,
  version,
  pipelineRunning,
  stageTokens,
}: Props) {
  const [elapsed, setElapsed] = useState(0);
  const [pulseFrame, setPulseFrame] = useState(0);

  useEffect(() => {
    const update = () => setElapsed(Math.floor((Date.now() - stageStartTime) / 1000));
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [stageStartTime]);

  useEffect(() => {
    if (!pipelineRunning) {
      setPulseFrame(0);
      return;
    }
    const timer = setInterval(() => setPulseFrame((value) => (value + 1) % 3), 220);
    return () => clearInterval(timer);
  }, [pipelineRunning]);

  const stageLabel = STAGE_LABELS[stage] ?? stage.toUpperCase();
  const stageColor = STAGE_COLORS[stage] ?? C.white;
  const tabNames: Record<ActiveTab, string> = { 1: 'OPERATOR', 2: 'PIPELINE', 3: 'EXECUTOR', 4: 'SYSTEM' };
  const pulse = pipelineRunning ? ['·  ', '·· ', '···'][pulseFrame] : '   ';

  return (
    <Box borderStyle="single" borderBottom borderTop={false} borderLeft={false} borderRight={false} paddingX={1} justifyContent="space-between">
      <Box gap={1} flexShrink={1}>
        <Text bold color={C.white}>MBO</Text>
        <Text color={C.white} dimColor>│</Text>
        <Text bold color={stageColor}>{stageLabel}</Text>
        <Text color={pipelineRunning ? C.pink : C.gray}>{pulse}</Text>
        <Text color={C.white} dimColor>{truncate(activeAction, 34) || 'Ready'}</Text>
      </Box>
      <Box gap={1} flexShrink={1}>
        <Text color={C.teal} bold>[{tabNames[activeTab]}]</Text>
        <Text color={C.white} dimColor>{truncate(currentTask || 'no active task', 34)}</Text>
      </Box>
      <Box gap={2} flexShrink={0}>
        <Text color={C.teal} dimColor>{truncate(activeModel || 'unassigned', 22)}</Text>
        <Text color={C.white} dimColor>{formatTokens(stageTokens)} tok</Text>
        <Text color={C.white} dimColor>v{version}</Text>
        <Text color={C.white} dimColor>{formatElapsed(elapsed)}</Text>
      </Box>
    </Box>
  );
}
