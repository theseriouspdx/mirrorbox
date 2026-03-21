import React, { useState } from 'react';
import { Box, Text } from 'ink';
import TextInput from 'ink-text-input';
import { MboStage } from '../types.js';
import { C } from '../colors.js';

interface Props {
  onSubmit: (value: string) => void;
  stage: MboStage;
  pipelineRunning: boolean;
  auditPending: boolean;
}

function getPrefix(stage: MboStage, auditPending: boolean, pipelineRunning: boolean): string {
  if (stage === 'audit_gate' || auditPending) return 'AUDIT ❯ ';
  if (pipelineRunning) return 'RUNNING ❯ ';
  return 'MBO ❯ ';
}

function getPlaceholder(stage: MboStage, auditPending: boolean, pipelineRunning: boolean): string {
  if (stage === 'audit_gate' || auditPending) return 'Type "approved" to apply changes, "reject" to roll back…';
  if (pipelineRunning) return 'Pipeline running — type a hint to steer, or "stop" to abort…';
  return 'Describe a task, ask a question, or /tasks · /token · status · exit…';
}

function getPrefixColor(stage: MboStage, auditPending: boolean, pipelineRunning: boolean): string {
  if (stage === 'audit_gate' || auditPending) return C.audit;
  if (pipelineRunning) return C.pink;
  return C.teal;
}

export function InputBar({ onSubmit, stage, pipelineRunning, auditPending }: Props) {
  const [value, setValue] = useState('');
  const borderColor   = (stage === 'audit_gate' || auditPending) ? C.audit : pipelineRunning ? C.pink : C.white;
  const prefix        = getPrefix(stage, auditPending, pipelineRunning);
  const prefixColor   = getPrefixColor(stage, auditPending, pipelineRunning);
  const placeholder   = getPlaceholder(stage, auditPending, pipelineRunning);

  const handleSubmit = (val: string) => {
    const trimmed = val.trim();
    if (!trimmed) return;
    setValue('');
    onSubmit(trimmed);
  };

  return (
    <Box borderStyle="single" borderColor={borderColor} paddingX={1}>
      <Text bold color={prefixColor}>{prefix}</Text>
      <TextInput
        value={value}
        onChange={setValue}
        onSubmit={handleSubmit}
        placeholder={placeholder}
      />
    </Box>
  );
}
