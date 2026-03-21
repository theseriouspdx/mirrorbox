import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import { type MboStage, STAGE_LABELS, STAGE_COLORS, type ActiveTab } from '../types.js';
import { C } from '../colors.js';

interface Props {
  stage: MboStage;
  activeAction: string;
  currentTask: string | null;
  activeTab: ActiveTab;
  stageStartTime: number;
  version: string;
  pipelineRunning: boolean;
}

function formatElapsed(seconds: number): string {
  if (seconds < 60) return seconds + 's';
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return minutes + 'm ' + secs + 's';
}

function truncate(value: string | null | undefined, max: number): string {
  const text = String(value || '');
  if (text.length <= max) return text;
  return text.slice(0, max - 1) + '…';
}

export function StatusBar({
  stage,
  activeAction,
  currentTask,
  activeTab,
  stageStartTime,
  version,
  pipelineRunning,
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
    if (!pipelineRunning) { setPulseFrame(0); return; }
    const timer = setInterval(() => setPulseFrame((v) => (v + 1) % 3), 220);
    return () => clearInterval(timer);
  }, [pipelineRunning]);

  const stageLabel = STAGE_LABELS[stage] ?? stage.toUpperCase();
  const stageColor = STAGE_COLORS[stage] ?? C.white;
  const tabLabel = ({ 1: 'OPERATOR', 2: 'PIPELINE', 3: 'EXECUTOR', 4: 'SYSTEM' } as const)[activeTab];
  const pulse = pipelineRunning ? ['·  ', '·· ', '···'][pulseFrame] : '';

  return (
    <Box
      flexDirection="column"
      borderStyle="single"
      borderBottom
      borderTop={false}
      borderLeft={false}
      borderRight={false}
      paddingX={1}
    >
      {/* Row 1: title | action | version */}
      <Box justifyContent="space-between">
        <Text bold color={C.white}>MIRROR BOX ORCHESTRATOR</Text>
        <Text color={C.white} dimColor wrap="truncate">
          {truncate(activeAction || 'Ready for the next instruction', 36)}
        </Text>
        <Text color={C.white} dimColor>v{version}</Text>
      </Box>

      {/* Row 2: stage + tab | task | timer */}
      <Box justifyContent="space-between">
        <Box gap={1}>
          <Text bold color={stageColor}>{stageLabel}</Text>
          {pulse ? <Text color={C.pink}>{pulse}</Text> : null}
          <Text color={C.teal} bold>[{tabLabel}]</Text>
        </Box>
        <Text color={C.white} dimColor wrap="truncate">
          {truncate(currentTask || 'no active task', 34)}
        </Text>
        <Text bold color={C.white}>{formatElapsed(elapsed)}</Text>
      </Box>
    </Box>
  );
}
