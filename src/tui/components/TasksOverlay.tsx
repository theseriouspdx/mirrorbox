import React, { useMemo, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import { C } from '../colors.js';
import {
  appendTaskRecord,
  buildTaskActivationPrompt,
  createTaskFromDraft,
  parseTaskLedger,
  readGovernanceDocs,
  summarizeTaskAcceptance,
  summarizeTaskAssumptions,
  type GovernanceDoc,
  type TaskRecord,
} from '../governance.js';
import { useAvailableRows, useScrollableLines } from './useScrollableLines.js';

export interface TaskActivationPayload {
  taskId: string;
  title: string;
  prompt: string;
}

interface Props {
  projectRoot: string;
  onClose: () => void;
  onActivate?: (payload: TaskActivationPayload) => void;
  initialView?: 'tasks' | 'docs' | 'create';
  initialDraft?: Partial<DraftState>;
}

type OverlayMode = 'list' | 'briefing' | 'docs' | 'create' | 'activate';
type CreateStep = 'title' | 'lane' | 'acceptance' | 'owner' | 'confirm';
type ActivateStep = 'context' | 'files' | 'confirm';

interface DraftState {
  title: string;
  lane: string;
  acceptance: string;
  owner: string;
}

interface ActivationState {
  context: string;
  files: string;
}

const SEP = '─'.repeat(78);
const CREATE_STEP_ORDER: CreateStep[] = ['title', 'lane', 'acceptance', 'owner', 'confirm'];
const ACTIVATE_STEP_ORDER: ActivateStep[] = ['context', 'files', 'confirm'];
const DEFAULT_DRAFT: DraftState = {
  title: '',
  lane: '0.3',
  acceptance: '',
  owner: 'unassigned',
};
const DEFAULT_ACTIVATION: ActivationState = {
  context: '',
  files: '',
};

function statusColor(status: string): string {
  const s = status.toUpperCase();
  if (s === 'IN_PROGRESS') return C.pink;
  if (s === 'READY') return C.teal;
  if (s === 'COMPLETED') return C.done;
  if (s === 'DEFERRED') return C.gray;
  if (s === 'BLOCKED') return C.error;
  return C.white;
}

function typeColor(type: string): string {
  const t = type.toLowerCase();
  if (t === 'bug') return C.error;
  if (t === 'docs') return C.teal;
  return C.purple;
}

function taskBriefingLines(task: TaskRecord | null): string[] {
  if (!task) return ['(no task selected)'];
  const assumptions = summarizeTaskAssumptions(task);
  const acceptance = summarizeTaskAcceptance(task);
  const proposedFiles = task.proposedFiles && task.proposedFiles.length > 0
    ? task.proposedFiles
    : ['none identified in SPEC yet'];
  const lines: string[] = [
    'Goal:',
    task.title,
    '',
    'Assumptions:',
    ...assumptions.map((line) => `- ${line}`),
    '',
    'Acceptance:',
    ...acceptance.map((line) => `- ${line}`),
    '',
    'Proposed Files:',
    ...proposedFiles.map((file) => `- ${file}`),
    '',
    'Ledger:',
    `- Status: ${task.status}`,
    `- Type: ${task.type}`,
    `- Owner: ${task.owner || 'unassigned'}`,
    `- Updated: ${task.updated || 'unknown'}`,
  ];

  if (task.specExcerpt) {
    lines.push('', 'SPEC Context:', ...task.specExcerpt.split('\n'));
  }

  if (task.description) {
    lines.push('', 'Linked Description:', task.description);
  }

  if (task.bugAcceptance) {
    lines.push('', 'Linked Bug Acceptance:', task.bugAcceptance);
  }

  return lines;
}

function createPrompt(step: CreateStep, draft: DraftState): string {
  if (step === 'title') return 'Describe the new task in natural language:';
  if (step === 'lane') return `Which version lane should it use? (${draft.lane})`;
  if (step === 'acceptance') return 'What acceptance criteria should be written to projecttracking.md?';
  if (step === 'owner') return `Who should own it? (${draft.owner})`;
  return 'Type yes to write the task, or no to go back:';
}

function createSummaryLines(draft: DraftState): string[] {
  return [
    `Title: ${draft.title || '(missing)'}`,
    `Lane: ${draft.lane || '(missing)'}`,
    `Acceptance: ${draft.acceptance || '(missing)'}`,
    `Owner: ${draft.owner || '(missing)'}`,
  ];
}

function activatePrompt(step: ActivateStep): string {
  if (step === 'context') return 'Add context or correct assumptions before activation (optional):';
  if (step === 'files') return 'Add extra files or paths to inspect (optional, comma-separated):';
  return 'Type yes to activate this task, or no to revise the preflight notes:';
}

function activationSummaryLines(task: TaskRecord | null, activation: ActivationState): string[] {
  if (!task) return ['(no task selected)'];
  return [
    `Task: ${task.id}`,
    `Goal: ${task.title}`,
    `Context / corrections: ${activation.context || '(none)'}`,
    `Extra files: ${activation.files || '(none)'}`,
  ];
}

function parseAdditionalFiles(value: string): string[] {
  return value.split(',').map((item) => item.trim()).filter(Boolean);
}

export function TasksOverlay({ projectRoot, onClose, onActivate, initialView = 'tasks', initialDraft = {} }: Props) {
  const seededDraft: DraftState = {
    ...DEFAULT_DRAFT,
    ...initialDraft,
  };
  const initialCreateStep: CreateStep = seededDraft.title.trim() ? 'lane' : 'title';
  const initialInputValue = initialView === 'create'
    ? (initialCreateStep === 'title' ? seededDraft.title : seededDraft.lane)
    : '';

  const [mode, setMode] = useState<OverlayMode>(initialView === 'docs' ? 'docs' : initialView === 'create' ? 'create' : 'list');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [docIndex, setDocIndex] = useState(0);
  const [draft, setDraft] = useState<DraftState>(seededDraft);
  const [createStep, setCreateStep] = useState<CreateStep>(initialCreateStep);
  const [activateStep, setActivateStep] = useState<ActivateStep>('context');
  const [activation, setActivation] = useState<ActivationState>(DEFAULT_ACTIVATION);
  const [inputValue, setInputValue] = useState(initialInputValue);
  const [createMessage, setCreateMessage] = useState('');
  const [refreshTick, setRefreshTick] = useState(0);

  const ledger = useMemo(() => parseTaskLedger(projectRoot), [projectRoot, refreshTick]);
  const docs = useMemo(() => readGovernanceDocs(projectRoot), [projectRoot, refreshTick]);
  const tasks = ledger.active;
  const selectedTask = tasks[selectedIndex] || ledger.active[0] || null;
  const briefingTask = selectedTaskId
    ? ledger.active.find((task) => task.id === selectedTaskId) || selectedTask
    : selectedTask;
  const title = 'Active Tasks';

  const availableRows = useAvailableRows(8);
  const briefing = taskBriefingLines(briefingTask);
  const briefingScroll = useScrollableLines(briefing, Math.max(8, availableRows - 8));
  const activeDoc: GovernanceDoc = docs[docIndex] || docs[0];
  const docScroll = useScrollableLines(activeDoc?.lines || ['(missing)'], Math.max(8, availableRows - 8));

  useInput((input, key) => {
    if (mode === 'create') {
      if (key.escape) {
        if (createStep === 'title' && !draft.title.trim()) {
          setMode('list');
          setCreateMessage('');
          setInputValue('');
          return;
        }
        const currentIndex = CREATE_STEP_ORDER.indexOf(createStep);
        const prevStep = CREATE_STEP_ORDER[Math.max(0, currentIndex - 1)] || 'title';
        setCreateStep(prevStep);
        setCreateMessage('');
        if (prevStep === 'title') setInputValue(draft.title || '');
        else if (prevStep === 'lane') setInputValue(draft.lane || '');
        else if (prevStep === 'acceptance') setInputValue(draft.acceptance || '');
        else if (prevStep === 'owner') setInputValue(draft.owner || '');
        else setInputValue('yes');
      }
      return;
    }

    if (mode === 'activate') {
      if (key.escape) {
        const currentIndex = ACTIVATE_STEP_ORDER.indexOf(activateStep);
        if (currentIndex === 0) {
          setMode('briefing');
          setInputValue('');
          return;
        }
        const prevStep = ACTIVATE_STEP_ORDER[currentIndex - 1] || 'context';
        setActivateStep(prevStep);
        if (prevStep === 'context') setInputValue(activation.context || '');
        else if (prevStep === 'files') setInputValue(activation.files || '');
        else setInputValue('yes');
      }
      return;
    }

    if (mode === 'docs') {
      if (key.escape || input === 'q') {
        setMode('list');
        return;
      }
      if (key.leftArrow || input === 'h') {
        setDocIndex((value) => (value === 0 ? docs.length - 1 : value - 1));
        return;
      }
      if (key.rightArrow || input === 'l') {
        setDocIndex((value) => (value + 1) % docs.length);
        return;
      }
      if (key.upArrow) docScroll.scrollUp(1);
      if (key.downArrow) docScroll.scrollDown(1);
      if (key.pageUp) docScroll.scrollUp(10);
      if (key.pageDown) docScroll.scrollDown(10);
      if (/^[1-4]$/.test(input)) setDocIndex(Math.min(Number(input) - 1, docs.length - 1));
      return;
    }

    if (mode === 'briefing') {
      if (key.escape || input === 'q') {
        setMode('list');
        return;
      }
      if (key.upArrow) briefingScroll.scrollUp(1);
      if (key.downArrow) briefingScroll.scrollDown(1);
      if (key.pageUp) briefingScroll.scrollUp(10);
      if (key.pageDown) briefingScroll.scrollDown(10);
      if ((input === 'g' || input === 'G' || key.return) && briefingTask) {
        setMode('activate');
        setActivateStep('context');
        setActivation(DEFAULT_ACTIVATION);
        setInputValue('');
      }
      return;
    }

    if (key.escape || input === 'q') {
      onClose();
      return;
    }
    if (input === 'd' || input === 'D') {
      setMode('docs');
      return;
    }
    if (input === 'n' || input === 'N') {
      setMode('create');
      setDraft(DEFAULT_DRAFT);
      setCreateStep('title');
      setInputValue('');
      setCreateMessage('');
      return;
    }
    if (key.upArrow) setSelectedIndex((value) => Math.max(0, value - 1));
    if (key.downArrow) setSelectedIndex((value) => Math.min(tasks.length - 1, value + 1));
    if ((key.return || input === 'g' || input === 'G') && selectedTask) {
      setSelectedTaskId(selectedTask.id);
      setMode('briefing');
    }
  });

  const submitCreateField = (value: string) => {
    const trimmed = value.trim();
    if (createStep === 'title') {
      if (!trimmed) {
        setCreateMessage('Task title is required.');
        return;
      }
      setDraft((current) => ({ ...current, title: trimmed }));
      setCreateStep('lane');
      setInputValue(draft.lane);
      setCreateMessage('');
      return;
    }

    if (createStep === 'lane') {
      const lane = trimmed || draft.lane || '0.3';
      setDraft((current) => ({ ...current, lane }));
      setCreateStep('acceptance');
      setInputValue('');
      setCreateMessage('');
      return;
    }

    if (createStep === 'acceptance') {
      if (!trimmed) {
        setCreateMessage('Acceptance criteria are required.');
        return;
      }
      setDraft((current) => ({ ...current, acceptance: trimmed }));
      setCreateStep('owner');
      setInputValue(draft.owner);
      setCreateMessage('');
      return;
    }

    if (createStep === 'owner') {
      const owner = trimmed || draft.owner || 'unassigned';
      setDraft((current) => ({ ...current, owner }));
      setCreateStep('confirm');
      setInputValue('yes');
      setCreateMessage('');
      return;
    }

    const lower = trimmed.toLowerCase();
    if (lower === 'yes' || lower === 'y') {
      try {
        const task = createTaskFromDraft(projectRoot, draft);
        appendTaskRecord(projectRoot, task);
        setRefreshTick((value) => value + 1);
        setCreateMessage(`Wrote ${task.id} to projecttracking.md.`);
        setMode('list');
        setShowRecent(false);
        setSelectedIndex(0);
        setSelectedTaskId(task.id);
      } catch (error: any) {
        setCreateMessage(error?.message || 'Could not write task.');
      }
      setInputValue('');
      return;
    }

    setCreateStep('owner');
    setInputValue(draft.owner);
    setCreateMessage('Review the owner and confirm again when ready.');
  };

  const submitActivationField = (value: string) => {
    const trimmed = value.trim();
    if (!briefingTask) return;

    if (activateStep === 'context') {
      setActivation((current) => ({ ...current, context: trimmed }));
      setActivateStep('files');
      setInputValue(activation.files || '');
      return;
    }

    if (activateStep === 'files') {
      setActivation((current) => ({ ...current, files: trimmed }));
      setActivateStep('confirm');
      setInputValue('yes');
      return;
    }

    const lower = trimmed.toLowerCase();
    if (lower === 'yes' || lower === 'y') {
      const payload: TaskActivationPayload = {
        taskId: briefingTask.id,
        title: briefingTask.title,
        prompt: buildTaskActivationPrompt(briefingTask, {
          context: activation.context,
          additionalFiles: parseAdditionalFiles(activation.files),
        }),
      };
      if (onActivate) onActivate(payload);
      onClose();
      return;
    }

    setActivateStep('context');
    setInputValue(activation.context || '');
  };

  if (mode === 'create') {
    return (
      <Box flexDirection="column" paddingX={2} paddingY={1} borderStyle="double" borderColor={C.teal} flexGrow={1}>
        <Box justifyContent="space-between">
          <Text bold color={C.teal}>TASK CREATION</Text>
          <Text color={C.teal} dimColor>[Esc] back  [Enter] next</Text>
        </Box>
        <Text color={C.teal} dimColor>{SEP}</Text>
        {createSummaryLines(draft).map((line) => (
          <Text key={line} color={C.white} dimColor={line.includes('(missing)')}>{line}</Text>
        ))}
        <Box marginTop={1} flexDirection="column">
          <Text color={C.purple} bold>{createPrompt(createStep, draft)}</Text>
          {createStep === 'confirm' ? (
            <Text color={C.white}>Type <Text color={C.teal}>yes</Text> to write the task, or <Text color={C.purple}>no</Text> to revise it.</Text>
          ) : null}
        </Box>
        <Box marginTop={1} borderStyle="single" borderColor={C.purple} paddingX={1}>
          <TextInput value={inputValue} onChange={setInputValue} onSubmit={submitCreateField} />
        </Box>
        {createMessage ? <Text color={createMessage.includes('Wrote') ? C.teal : C.audit}>{createMessage}</Text> : null}
      </Box>
    );
  }

  if (mode === 'activate') {
    return (
      <Box flexDirection="column" paddingX={2} paddingY={1} borderStyle="double" borderColor={C.audit} flexGrow={1}>
        <Box justifyContent="space-between">
          <Text bold color={C.audit}>TASK ACTIVATION</Text>
          <Text color={C.audit} dimColor>[Esc] back  [Enter] next</Text>
        </Box>
        <Text color={C.audit} dimColor>{SEP}</Text>
        {activationSummaryLines(briefingTask, activation).map((line) => (
          <Text key={line} color={C.white} dimColor={line.includes('(none)')}>{line}</Text>
        ))}
        <Box marginTop={1} flexDirection="column">
          <Text color={C.purple} bold>{activatePrompt(activateStep)}</Text>
          {activateStep === 'confirm' ? (
            <Text color={C.white}>Type <Text color={C.teal}>yes</Text> to submit the activation brief to the operator, or <Text color={C.purple}>no</Text> to revise it.</Text>
          ) : null}
        </Box>
        <Box marginTop={1} borderStyle="single" borderColor={C.purple} paddingX={1}>
          <TextInput value={inputValue} onChange={setInputValue} onSubmit={submitActivationField} />
        </Box>
      </Box>
    );
  }

  if (mode === 'docs') {
    return (
      <Box flexDirection="column" paddingX={2} paddingY={1} borderStyle="double" borderColor={C.purple} flexGrow={1}>
        <Box justifyContent="space-between">
          <Text bold color={C.purple}>GOVERNANCE DOCS</Text>
          <Text color={C.purple} dimColor>[1-4]/[←→] doc  [↑/↓] scroll  [PgUp/PgDn] jump  [Esc] back</Text>
        </Box>
        <Text color={C.purple} dimColor>{SEP}</Text>
        <Box gap={1}>
          {docs.map((doc, index) => {
            const selected = index === docIndex;
            return (
              <Box key={doc.key} borderStyle="single" borderColor={selected ? C.teal : C.purple} paddingX={1}>
                <Text color={selected ? C.white : C.gray} bold={selected}>{index + 1}: {doc.title}</Text>
              </Box>
            );
          })}
        </Box>
        <Text color={C.gray} dimColor>{activeDoc.path}</Text>
        <Text color={C.purple} dimColor>{SEP}</Text>
        <Box flexDirection="column" flexGrow={1}>
          {docScroll.visibleLines.map((line, index) => (
            <Text key={`${activeDoc.key}-${docScroll.topLine + index}`} color={C.white} wrap="wrap">
              {line || ' '}
            </Text>
          ))}
        </Box>
        <Text color={C.gray} dimColor>
          {docScroll.canScrollUp ? '↑ ' : '  '}
          {docScroll.topLine + 1}-{Math.min(docScroll.topLine + Math.max(8, availableRows - 8), docScroll.total)}/{docScroll.total}
          {docScroll.canScrollDown ? ' ↓' : '  '}
        </Text>
      </Box>
    );
  }

  if (mode === 'briefing') {
    return (
      <Box flexDirection="column" paddingX={2} paddingY={1} borderStyle="double" borderColor={C.purple} flexGrow={1}>
        <Box justifyContent="space-between">
          <Text bold color={C.purple}>TASK BRIEFING — {briefingTask?.id || 'none'}</Text>
          <Text color={C.purple} dimColor>[Esc] back  [Enter]/[g] preflight</Text>
        </Box>
        <Text color={C.purple} dimColor>{SEP}</Text>
        <Box flexDirection="column" flexGrow={1}>
          {briefingScroll.visibleLines.map((line, index) => (
            <Text key={`brief-${briefingScroll.topLine + index}`} color={line.endsWith(':') ? C.teal : C.white} bold={line.endsWith(':')} wrap="wrap">
              {line || ' '}
            </Text>
          ))}
        </Box>
        <Text color={C.gray} dimColor>
          {briefingScroll.canScrollUp ? '↑ ' : '  '}
          {briefingScroll.topLine + 1}-{Math.min(briefingScroll.topLine + Math.max(8, availableRows - 8), briefingScroll.total)}/{briefingScroll.total}
          {briefingScroll.canScrollDown ? ' ↓' : '  '}
        </Text>
      </Box>
    );
  }

  return (
      <Box flexDirection="column" paddingX={2} paddingY={1} borderStyle="double" borderColor={C.teal} flexGrow={1}>
      <Box justifyContent="space-between">
        <Text bold color={C.teal}>TASK LEDGER — {title}</Text>
        <Text color={C.teal} dimColor>[↑/↓] navigate  [Enter] briefing  [d] docs  [n] new  [Esc]/[q] return</Text>
      </Box>
      <Text color={C.teal} dimColor>{SEP}</Text>
      <Box gap={1}>
        <Text color={C.gray} bold>{'ID'.padEnd(12)}</Text>
        <Text color={C.gray} bold>{'TYPE'.padEnd(8)}</Text>
        <Text color={C.gray} bold>{'STATUS'.padEnd(12)}</Text>
        <Text color={C.gray} bold>{'OWNER'.padEnd(12)}</Text>
        <Text color={C.gray} bold>TITLE</Text>
      </Box>
      <Text color={C.purple} dimColor>{'─'.repeat(12)} {'─'.repeat(8)} {'─'.repeat(12)} {'─'.repeat(12)} {'─'.repeat(30)}</Text>
      {tasks.length === 0 ? (
        <Text color={C.gray} dimColor>(no tasks)</Text>
      ) : tasks.map((task, index) => {
        const selected = index === selectedIndex;
        return (
          <Box key={task.id} gap={1}>
            <Text color={selected ? C.white : C.teal} bold={selected}>{selected ? '▶ ' : '  '}{task.id.padEnd(10).slice(0, 10)}</Text>
            <Text color={selected ? C.white : typeColor(task.type)}>{task.type.padEnd(8).slice(0, 8)}</Text>
            <Text color={selected ? C.white : statusColor(task.status)} bold={selected || task.status === 'IN_PROGRESS'}>{task.status.padEnd(12).slice(0, 12)}</Text>
            <Text color={selected ? C.white : C.purple}>{(task.owner || '—').padEnd(12).slice(0, 12)}</Text>
            <Text color={C.white} wrap="truncate-end" bold={selected}>{task.title}</Text>
          </Box>
        );
      })}
      <Text color={C.teal} dimColor>{SEP}</Text>
      {createMessage ? <Text color={C.teal}>{createMessage}</Text> : null}
      <Text color={C.gray} dimColor>{ledger.active.length} active · completed tasks hidden from this view · [Esc] returns to main screen · docs: {docs.length}</Text>
    </Box>
  );
}
