import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { createRequire } from 'module';
import { C } from '../colors.js';
const require = createRequire(import.meta.url);

interface Task {
  id: string;
  type: string;
  title: string;
  status: string;
  owner: string;
  updated: string;
}

interface Props {
  projectRoot: string;
  onClose: () => void;
}

function parseTasks(projectRoot: string): { active: Task[]; recent: Task[] } {
  const fs   = require('fs');
  const path = require('path');
  const file = path.join(projectRoot, '.dev', 'governance', 'projecttracking.md');
  if (!fs.existsSync(file)) return { active: [], recent: [] };

  const text: string = fs.readFileSync(file, 'utf8');
  const active: Task[] = [];
  const recent: Task[] = [];

  let section: 'active' | 'recent' | null = null;

  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (/^##\s+Active Tasks/i.test(line))   { section = 'active';  continue; }
    if (/^##\s+Recently/i.test(line))        { section = 'recent';  continue; }
    if (/^##/.test(line))                    { section = null;       continue; }
    if (!section || !line.startsWith('|'))   continue;
    // Skip separator rows
    if (/^\|[-\s|]+\|$/.test(line))         continue;
    // Skip header row
    if (/Task ID.*Type.*Title/i.test(line))  continue;

    const cols = line.split('|').map(c => c.trim()).filter(Boolean);
    if (cols.length < 5) continue;

    const task: Task = {
      id:      cols[0] || '',
      type:    cols[1] || '',
      title:   cols[2] || '',
      status:  cols[3] || '',
      owner:   cols[4] || '',
      updated: cols[6] || '',
    };
    if (!task.id) continue;

    if (section === 'active') active.push(task);
    else                       recent.push(task);
  }

  return { active, recent };
}

function statusColor(status: string): string {
  const s = status.toUpperCase();
  if (s === 'IN_PROGRESS')  return C.pink;
  if (s === 'READY')        return C.teal;
  if (s === 'COMPLETED')    return C.done;
  if (s === 'DEFERRED')     return C.gray;
  if (s === 'BLOCKED')      return C.error;
  return C.white;
}

function typeColor(type: string): string {
  const t = type.toLowerCase();
  if (t === 'bug')  return C.error;
  if (t === 'docs') return C.teal;
  return C.purple;
}

const SEP = '─'.repeat(70);

export function TasksOverlay({ projectRoot, onClose }: Props) {
  const [showRecent, setShowRecent] = useState(false);
  const { active, recent } = parseTasks(projectRoot);

  useInput((_i, key) => {
    if (key.escape || (_i === 'q'))        onClose();
    if (_i === 'r' || _i === 'R')          setShowRecent(v => !v);
  });

  const tasks = showRecent ? recent : active;
  const title = showRecent ? 'Recently Completed' : 'Active Tasks';

  return (
    <Box flexDirection="column" paddingX={2} paddingY={1} borderStyle="double" borderColor={C.teal} flexGrow={1}>
      {/* Header */}
      <Box justifyContent="space-between">
        <Text bold color={C.teal}>TASK LEDGER — {title}</Text>
        <Text color={C.teal} dimColor>[q/Esc] close  [r] toggle recent</Text>
      </Box>
      <Text color={C.teal} dimColor>{SEP}</Text>

      {/* Column headers */}
      <Box gap={1}>
        <Text color={C.gray} bold>{'ID'.padEnd(12)}</Text>
        <Text color={C.gray} bold>{'TYPE'.padEnd(6)}</Text>
        <Text color={C.gray} bold>{'STATUS'.padEnd(12)}</Text>
        <Text color={C.gray} bold>{'OWNER'.padEnd(10)}</Text>
        <Text color={C.gray} bold>TITLE</Text>
      </Box>
      <Text color={C.purple} dimColor>{'─'.repeat(12)} {'─'.repeat(6)} {'─'.repeat(12)} {'─'.repeat(10)} {'─'.repeat(30)}</Text>

      {/* Task rows */}
      {tasks.length === 0 ? (
        <Text color={C.gray} dimColor>  (no tasks)</Text>
      ) : (
        tasks.map(t => (
          <Box key={t.id} gap={1}>
            <Text color={C.teal}>{t.id.padEnd(12).slice(0, 12)}</Text>
            <Text color={typeColor(t.type)}>{t.type.padEnd(6).slice(0, 6)}</Text>
            <Text color={statusColor(t.status)} bold={t.status === 'IN_PROGRESS'}>
              {t.status.padEnd(12).slice(0, 12)}
            </Text>
            <Text color={C.purple}>{(t.owner || '—').padEnd(10).slice(0, 10)}</Text>
            <Text color={C.white} wrap="truncate-end">
              {t.title.length > 50 ? t.title.slice(0, 47) + '…' : t.title}
            </Text>
          </Box>
        ))
      )}

      <Text color={C.teal} dimColor>{SEP}</Text>
      <Text color={C.gray} dimColor>
        {active.length} active  ·  {recent.length} recently completed
        {!showRecent && active.length > 0 && `  ·  next: ${active[0]?.id}`}
      </Text>
    </Box>
  );
}
