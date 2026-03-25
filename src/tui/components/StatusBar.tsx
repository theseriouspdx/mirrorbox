import React, { useState, useEffect } from 'react';
import { Box, Text, useStdout } from 'ink';
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
  exitPending?: boolean;
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
  exitPending = false,
}: Props) {
  const { stdout } = useStdout();
  const cols = stdout?.columns ?? 120;
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

  // BUG-226: Width-aware truncation — fixed parts first, then allocate remainder
  const versionStr = 'v' + version;
  const timerStr = formatElapsed(elapsed);
  const rightFixedWidth = stageLabel.length + (pulse ? 4 : 0) + tabLabel.length + 2 + timerStr.length + 4; // gaps
  const leftFixedWidth = 22; // "MIRROR BOX ORCHESTRATOR"
  // usable = cols minus border (2) minus paddingX (2) = cols - 4
  const usable = Math.max(40, cols - 4);
  const actionMaxWidth = Math.max(10, usable - leftFixedWidth - versionStr.length - 4);
  const taskMaxWidth = Math.max(10, usable - rightFixedWidth - 4);

  return (
    <Box flexDirection="column" paddingX={1}>
      {/* Row 1: title | action | version */}
      <Box>
        <Box flexGrow={1} flexShrink={0}>
          <Text bold color={C.white} wrap="truncate-end">MBO</Text>
        </Box>
        <Text color={C.white} dimColor wrap="truncate-end">
          {truncate(activeAction || 'Ready for the next instruction', actionMaxWidth)}
        </Text>
        <Text color={C.white} dimColor wrap="truncate-end"> {versionStr}</Text>
      </Box>

      {/* Row 2: task | stage + tab | timer */}
      <Box>
        <Box flexGrow={1}>
          <Text color={C.white} dimColor wrap="truncate-end">
            {exitPending
              ? '⚠ Press Ctrl+C again to exit'
              : truncate(currentTask || 'no active task', taskMaxWidth)}
          </Text>
        </Box>
        <Box gap={1} flexShrink={0}>
          <Text bold color={stageColor}>{stageLabel}</Text>
          {pulse ? <Text color={C.pink}>{pulse}</Text> : null}
          <Text color={C.teal} bold>[{tabLabel}]</Text>
          <Text bold color={C.white}>{timerStr}</Text>
        </Box>
      </Box>
    </Box>
  );
}
