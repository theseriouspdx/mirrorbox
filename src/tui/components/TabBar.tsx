import React from 'react';
import { Box, Text } from 'ink';
import { MboStage, ActiveTab } from '../types.js';
import { C } from '../colors.js';

interface Props {
  activeTab: ActiveTab;
  stage: MboStage;
  auditPending: boolean;
}

interface TabDef {
  num: ActiveTab;
  label: string;
  liveStages: MboStage[];
}

const TABS: TabDef[] = [
  { num: 1, label: 'OPERATOR',  liveStages: ['idle', 'classification', 'error'] },
  { num: 2, label: 'PIPELINE',  liveStages: ['context_pinning', 'planning', 'tiebreaker_plan', 'code_derivation', 'tiebreaker_code'] },
  { num: 3, label: 'EXECUTOR',  liveStages: ['dry_run', 'implement', 'state_sync', 'knowledge_update'] },
  { num: 4, label: 'SYSTEM',    liveStages: [] },
];

export function TabBar({ activeTab, stage, auditPending }: Props) {
  return (
    <Box flexDirection="row" paddingX={1} gap={1}>
      {TABS.map((tab) => {
        const isViewing = activeTab === tab.num;
        const isLive    = tab.liveStages.includes(stage);
        const isAudit   = tab.num === 1 && auditPending;
        const borderColor = isAudit ? C.audit : isViewing ? C.teal : isLive ? C.pink : C.purple;
        const labelColor  = isViewing ? C.white : isLive || isAudit ? C.pink : C.purple;

        return (
          <Box key={tab.num} borderStyle="single" borderColor={borderColor} paddingX={1} flexShrink={0}>
            <Text color={C.white} dimColor>{tab.num}:</Text>
            <Text color={labelColor} bold={isViewing}>
              {(isLive || isAudit) ? '▶ ' : '  '}
              {isAudit ? 'AUDIT ⚠' : tab.label}
            </Text>
            {isLive && !isViewing && <Text color={C.pink} dimColor> ●</Text>}
          </Box>
        );
      })}
      <Box flexGrow={1} />
      <Text color={C.white} dimColor>[Tab] cycle  [1-4] jump  [/tasks] task list  [/token] stats  [Ctrl+C] exit</Text>
    </Box>
  );
}
