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
  description?: string;
  acceptance?: string;
}

interface Props {
  projectRoot: string;
  onClose: () => void;
  onActivate?: (taskId: string) => void;
}

function parseTasks(projectRoot: string): { active: Task[]; recent: Task[] } {
  const fs   = require('fs');
  const path = require('path');
  const ptFile = path.join(projectRoot, '.dev', 'governance', 'projecttracking.md');
  const bugsFile = path.join(projectRoot, '.dev', 'governance', 'BUGS.md');
  
  const active: Task[] = [];
  const recent: Task[] = [];

  if (!fs.existsSync(ptFile)) return { active, recent };

  const ptText: string = fs.readFileSync(ptFile, 'utf8');
  const bugsText: string = fs.existsSync(bugsFile) ? fs.readFileSync(bugsFile, 'utf8') : '';

  let section: 'active' | 'recent' | null = null;

  for (const raw of ptText.split('\n')) {
    const line = raw.trim();
    if (/^##\s+Active Tasks/i.test(line))   { section = 'active';  continue; }
    if (/^##\s+Recently/i.test(line))        { section = 'recent';  continue; }
    if (/^##/.test(line))                    { section = null;       continue; }
    if (!section || !line.startsWith('|'))   continue;
    if (/^\|[-\s|]+\|$/.test(line))         continue;
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
      acceptance: cols[8] || '',
    };
    if (!task.id) continue;

    // Deep dive for bug descriptions (BUG-180 logic)
    if (task.type.toLowerCase() === 'bug' && bugsText) {
      const bugMatch = task.title.match(/BUG-(\d+)/i);
      if (bugMatch) {
        const bugId = bugMatch[0].toUpperCase();
        const bugSection = bugsText.split('---').find(s => s.includes(bugId));
        if (bugSection) {
          const descMatch = bugSection.match(/-\s+\*\*Description:\*\*\s*([\s\S]*?)(?=\n-|\n#|\n$)/i);
          const accMatch = bugSection.match(/-\s+\*\*Acceptance:\*\*\s*([\s\S]*?)(?=\n-|\n#|\n$)/i);
          if (descMatch) task.description = descMatch[1].trim();
          if (accMatch) task.acceptance = accMatch[1].trim();
        }
      }
    }

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

export function TasksOverlay({ projectRoot, onClose, onActivate }: Props) {
  const [showRecent, setShowRecent] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [briefingTask, setBriefingTask] = useState<Task | null>(null);
  const { active, recent } = parseTasks(projectRoot);

  const tasks = showRecent ? recent : active;
  const title = showRecent ? 'Recently Completed' : 'Active Tasks';

  useInput((_i, key) => {
    if (briefingTask) {
      if (key.escape || _i === 'q') setBriefingTask(null);
      if (_i === 'g' || _i === 'G') {
        if (onActivate) onActivate(briefingTask.id);
        setBriefingTask(null);
        onClose();
      }
      return;
    }

    if (key.escape || (_i === 'q'))        onClose();
    if (_i === 'r' || _i === 'R')          { setShowRecent(v => !v); setSelectedIndex(0); }
    if (key.upArrow)                       setSelectedIndex(v => Math.max(0, v - 1));
    if (key.downArrow)                     setSelectedIndex(v => Math.min(tasks.length - 1, v + 1));
    if (key.return && tasks[selectedIndex]) setBriefingTask(tasks[selectedIndex]);
    if ((_i === 'g' || _i === 'G') && tasks[selectedIndex]) {
      if (onActivate) onActivate(tasks[selectedIndex].id);
      onClose();
    }
  });

  if (briefingTask) {
    return (
      <Box flexDirection="column" paddingX={2} paddingY={1} borderStyle="double" borderColor={C.purple} flexGrow={1}>
        <Box justifyContent="space-between">
          <Text bold color={C.purple}>TASK BRIEFING — {briefingTask.id}</Text>
          <Text color={C.purple} dimColor>[q/Esc] back  [g] ACTIVATE TASK</Text>
        </Box>
        <Text color={C.purple} dimColor>{SEP}</Text>
        <Text bold color={C.white}>{briefingTask.title}</Text>
        
        <Box marginTop={1} flexDirection="column">
          <Text color={C.teal} bold>Description:</Text>
          <Text color={C.white}>{briefingTask.description || '(no description available)'}</Text>
        </Box>
        
        <Box marginTop={1} flexDirection="column">
          <Text color={C.teal} bold>Acceptance Criteria:</Text>
          <Text color={C.white}>{briefingTask.acceptance || '(no acceptance criteria available)'}</Text>
        </Box>

        <Box marginTop={1} flexDirection="column">
          <Text color={C.gray} dimColor>Status: {briefingTask.status} | Type: {briefingTask.type} | Owner: {briefingTask.owner}</Text>
        </Box>

        <Text marginTop={1} color={C.purple} dimColor>{SEP}</Text>
        <Text color={C.gray} dimColor>Press [G] to activate this task and begin work context initialization.</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" paddingX={2} paddingY={1} borderStyle="double" borderColor={C.teal} flexGrow={1}>
      {/* Header */}
      <Box justifyContent="space-between">
        <Text bold color={C.teal}>TASK LEDGER — {title}</Text>
        <Text color={C.teal} dimColor>[↑/↓] navigate  [Enter] briefing  [g] activate  [r] toggle recent  [q] close</Text>
      </Box>
      <Text color={C.teal} dimColor>{SEP}</Text>

      {/* Column headers */}
      <Box gap={1}>
        <Text color={C.gray} bold>{'  ID'.padEnd(14)}</Text>
        <Text color={C.gray} bold>{'TYPE'.padEnd(6)}</Text>
        <Text color={C.gray} bold>{'STATUS'.padEnd(12)}</Text>
        <Text color={C.gray} bold>{'OWNER'.padEnd(10)}</Text>
        <Text color={C.gray} bold>TITLE</Text>
      </Box>
      <Text color={C.purple} dimColor>{'─'.repeat(14)} {'─'.repeat(6)} {'─'.repeat(12)} {'─'.repeat(10)} {'─'.repeat(30)}</Text>

      {/* Task rows */}
      {tasks.length === 0 ? (
        <Text color={C.gray} dimColor>  (no tasks)</Text>
      ) : (
        tasks.map((t, idx) => {
          const isSelected = idx === selectedIndex;
          return (
            <Box key={t.id} gap={1} backgroundColor={isSelected ? '#333333' : undefined}>
              <Text color={isSelected ? C.pink : C.teal} bold={isSelected}>
                {isSelected ? '▶ ' : '  '}{t.id.padEnd(10).slice(0, 10)}
              </Text>
              <Text color={isSelected ? C.white : typeColor(t.type)}>{t.type.padEnd(6).slice(0, 6)}</Text>
              <Text color={isSelected ? C.white : statusColor(t.status)} bold={t.status === 'IN_PROGRESS' || isSelected}>
                {t.status.padEnd(12).slice(0, 12)}
              </Text>
              <Text color={isSelected ? C.white : C.purple}>{(t.owner || '—').padEnd(10).slice(0, 10)}</Text>
              <Text color={isSelected ? C.white : C.white} wrap="truncate-end" bold={isSelected}>
                {t.title.length > 50 ? t.title.slice(0, 47) + '…' : t.title}
              </Text>
            </Box>
          );
        })
      )}

      <Text color={C.teal} dimColor>{SEP}</Text>
      <Text color={C.gray} dimColor>
        {active.length} active  ·  {recent.length} recently completed
        {!showRecent && active.length > 0 && `  ·  selected: ${tasks[selectedIndex]?.id || 'none'}`}
      </Text>
    </Box>
  );
}
