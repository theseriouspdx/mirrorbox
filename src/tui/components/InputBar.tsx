import React, { useEffect, useMemo, useState } from 'react';
import { Box, Text } from 'ink';
import { MboTextInput } from './MboTextInput.js';
import { type MboStage } from '../types.js';
import { C } from '../colors.js';

interface Props {
  onSubmit: (value: string) => void;
  stage: MboStage;
  pipelineRunning: boolean;
  auditPending: boolean;
  onCommandMenuChange?: (open: boolean) => void;
}

const COMMANDS = [
  '/tasks',
  '/docs',
  '/newtask',
  '/setup',
  '/tm',
  '/bugs',
  'status',
  'clear',
  'exit',
  'stop',
];

function getPrefix(stage: MboStage, auditPending: boolean, pipelineRunning: boolean): string {
  if (stage === 'audit_gate' || auditPending) return 'AUDIT ❯ ';
  if (pipelineRunning) return 'RUNNING ❯ ';
  return 'MBO ❯ ';
}

function getPlaceholder(stage: MboStage, auditPending: boolean, pipelineRunning: boolean): string {
  if (stage === 'audit_gate' || auditPending) return 'Type "approved" to apply changes or "reject" to roll back...';
  if (pipelineRunning) return 'Pipeline running. Type a hint to steer, or "stop" to abort...';
  return 'Describe a task, ask a question, or use /tasks, /docs, /newtask, /tm, /bugs, /setup...';
}

function getPrefixColor(stage: MboStage, auditPending: boolean, pipelineRunning: boolean): string {
  if (stage === 'audit_gate' || auditPending) return C.audit;
  if (pipelineRunning) return C.pink;
  return C.teal;
}

export function InputBar({ onSubmit, stage, pipelineRunning, auditPending, onCommandMenuChange }: Props) {
  const [value, setValue] = useState('');
  const borderColor = stage === 'audit_gate' || auditPending ? C.audit : pipelineRunning ? C.pink : C.white;
  const prefix = getPrefix(stage, auditPending, pipelineRunning);
  const prefixColor = getPrefixColor(stage, auditPending, pipelineRunning);
  const placeholder = getPlaceholder(stage, auditPending, pipelineRunning);

  const suggestions = useMemo(() => {
    const trimmed = value.trim();
    if (!trimmed.startsWith('/')) return [];
    return COMMANDS.filter((command) => command.startsWith(trimmed.toLowerCase())).slice(0, 5);
  }, [value]);

  useEffect(() => {
    if (typeof onCommandMenuChange === 'function') {
      onCommandMenuChange(suggestions.length > 0);
    }
  }, [onCommandMenuChange, suggestions.length]);

  const handleSubmit = (submitted: string) => {
    const trimmed = submitted.trim();
    if (!trimmed) return;

    if (trimmed.startsWith('/') && suggestions.length > 0 && suggestions[0] !== trimmed) {
      setValue(suggestions[0] + ' ');
      return;
    }

    setValue('');
    onSubmit(trimmed);
  };

  return (
    <Box flexDirection="column">
      {suggestions.length > 0 ? (
        <Box borderStyle="single" borderBottom={false} borderColor={C.purple} paddingX={1} flexDirection="column">
          <Text color={C.purple} dimColor>COMMANDS</Text>
          {suggestions.map((command, index) => (
            <Text key={command} color={index === 0 ? C.teal : C.white} dimColor={index !== 0}>
              {index === 0 ? '↵ ' : '  '}
              {command}
            </Text>
          ))}
        </Box>
      ) : null}
      <Box borderStyle="single" borderColor={borderColor} paddingX={1}>
        <Text bold color={prefixColor}>{prefix}</Text>
        <MboTextInput value={value} onChange={setValue} onSubmit={handleSubmit} placeholder={placeholder} />
      </Box>
    </Box>
  );
}
