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
  { num: 1, label: 'OPER',     liveStages: ['idle', 'classification', 'error'] },
  { num: 2, label: 'PIPELINE', liveStages: ['context_pinning', 'planning', 'tiebreaker_plan', 'code_derivation', 'tiebreaker_code'] },
  { num: 3, label: 'EXEC',     liveStages: ['dry_run', 'implement', 'state_sync', 'knowledge_update'] },
  { num: 4, label: 'SYS',      liveStages: [] },
];

// BUG-225: Compact hints that fit alongside tabs on a single line
const HINTS = '[Tab] cycle · [/tasks] · [/tm] · [/bugs] · [Ctrl+C] exit';

export function TabBar({ activeTab, stage, auditPending }: Props) {
  return (
    <Box paddingX={1} gap={1}>
      {TABS.map((tab) => {
        const isViewing = activeTab === tab.num;
        const isLive    = tab.liveStages.includes(stage);
        const isAudit   = tab.num === 1 && auditPending;
        const labelColor  = isViewing ? C.white : isLive || isAudit ? C.pink : C.purple;

        return (
          <Box key={tab.num} flexShrink={0}>
            <Text color={C.gray} dimColor>{tab.num}:</Text>
            <Text color={labelColor} bold={isViewing}>
              {(isLive || isAudit) ? '▶' : ' '}
              {isAudit ? 'AUDIT⚠' : tab.label}
            </Text>
          </Box>
        );
      })}
      <Box flexGrow={1}>
        <Text color={C.gray} dimColor wrap="truncate-end"> {HINTS}</Text>
      </Box>
    </Box>
  );
}
