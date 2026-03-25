import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Box, Text, useApp, useInput, useStdout } from 'ink';
import { createRequire } from 'module';

import { StatusBar } from './components/StatusBar.js';
import { TabBar } from './components/TabBar.js';
import { OperatorPanel } from './components/OperatorPanel.js';
import { PipelinePanel } from './components/PipelinePanel.js';
import { ExecutorPanel } from './components/ExecutorPanel.js';
import { SystemPanel } from './components/SystemPanel.js';
import { StatsPanel } from './components/StatsPanel.js';
import { StatsOverlay } from './components/StatsOverlay.js';
import { TasksOverlay, type TaskActivationPayload } from './components/TasksOverlay.js';
import { InputBar } from './components/InputBar.js';
import { findTaskById, parseTaskLedger, readGovernanceSummary } from './governance.js';

import {
  type MboStage,
  type ActiveTab,
  type PipelineEntry,
  type TuiStats,
  type AppProps,
  EXECUTOR_ROLES,
} from './types.js';

function formatResult(result: any): string {
  if (!result || typeof result !== 'object') return String(result || '');
  const status = String(result.status || '').toLowerCase();
  if (status === 'sandbox_intercept') return result.message || 'Input sent to sandbox.';
  if (result.needsClarification && result.question) return 'Clarification needed: ' + result.question;
  if (status === 'ready' && result.prompt) return result.prompt;
  if (status === 'ready_for_planning') return 'Task classified. Type "go" to proceed.';
  if (status === 'plan_agreed') return 'Planning complete. Ready for code derivation.';
  if (status === 'code_agreed') return 'Code derivation complete. Running dry run.';
  if (status === 'pass') return 'Validation passed.';
  if (status === 'audit_pending') return result.prompt || 'Audit package ready. Type "approved" or "reject".';
  if (status === 'smoke_test_pending') return result.prompt || '[SMOKE TEST] Verify the change. Type: pass  /  fail <reason>  /  partial <notes>';
  if (status === 'complete') return result.message || 'Task complete.';
  if (status === 'partial') return result.message || 'Task marked partial.';
  if (status === 'retry') return result.message || 'Smoke test failed. Type \'go\' to retry from planning.';
  if (status === 'abort') return result.message || 'Task aborted after max smoke test failures.';
  if (status === 'blocked') return result.reason || result.prompt || 'Task blocked.';
  if (status === 'aborted') return result.reason || 'Operation aborted.';
  if (status === 'error') {
    const r = result.reason;
    if (!r) return 'Pipeline failed.';
    // BUG-238: Guard against raw JSON leaking into the TUI (e.g. DB error with serialised context).
    if (typeof r === 'string' && r.trimStart().startsWith('{')) return 'Pipeline error — check .mbo/logs/ for details.';
    return r;
  }
  if (status === 'onboarding_active' || status === 'onboarding_complete') return result.prompt || 'Onboarding update received.';
  if (status === 'shutdown_complete') return 'Session shutdown complete.';
  if (typeof result.prompt === 'string' && result.prompt.trim()) return result.prompt;
  if (typeof result.reason === 'string' && result.reason.trim()) return result.reason;
  return 'Operator update received.';
}

function isClarificationNeeded(text: string): boolean {
  const lower = String(text || '').trim().toLowerCase();
  // Detect requests for clarification or expressions of confusion
  const patterns = [
    /i\s*do\s*n't\s*know/,
    /i\s*dont\s*know/,
    /what does that mean/,
    /what do you mean/,
    /i\s*'?m\s*confused/,
    /i am confused/,
    /i don't understand/,
    /i don't get it/,
    /can you explain that/,
    /what was that asking for/,
    /^\?+$/,  // Just question marks
    /^huh[\?!]*$/,  // huh or huh? or huh!
    /^what[\?!]*$/,  // what or what? or what!
    /^help[\?!]*$/,  // help or help? or help!
    /^unclear$/,
    /^not clear$/,
    /^\.{2,}$/,  // Multiple dots
    /run next task/,  // Ambiguous command when there's a clarification pending
  ];
  return patterns.some(p => p.test(lower));
}

function detectClarificationFollowup(userInput: string, lastClarification: string | null): { isClarificationResponse: boolean; wrappedPrompt: string } | null {
  if (!lastClarification) return null;
  if (!isClarificationNeeded(userInput)) return null;

  const wrappedPrompt = `The user is responding to this previous clarification I gave them: "${lastClarification}". Their response: "${userInput}". Please explain in plain language with concrete examples what I was asking for and what they should type next.`;
  return { isClarificationResponse: true, wrappedPrompt };
}

function loadStats(statsManager: any): TuiStats {
  try {
    return JSON.parse(JSON.stringify(statsManager.stats));
  } catch {
    return {
      session: { models: {}, roles: {}, cache: { hits: 0, misses: 0 }, toolTokens: 0, stageHistory: [] },
      lifetime: { models: {}, roles: {}, cache: { hits: 0, misses: 0 }, toolTokens: 0 },
      sessions: 0,
      largestSessionDelta: 0,
      lastUpdate: '',
    };
  }
}

let entryCounter = 0;
function newId(): string {
  entryCounter += 1;
  return 'e' + entryCounter;
}

type OverlayMode = 'tasks' | 'docs' | 'create' | null;
type StageUsageMap = Record<string, { model?: string; tokens?: number }>;

// BUG-221: Minimum terminal size for usable TUI layout
const MIN_COLS = 100;
const MIN_ROWS = 30;
// Right stats panel fixed width (chars) — enough for stage labels + token stats
const STATS_PANEL_WIDTH = 30;

const BUG_AUDIT_COMMANDS = new Set([
  '/bugs',
  'bugs',
  'bugs list',
  'bug list',
  'examine the codebase',
  'examine the codebase and return a result',
]);

function isBugAuditCommand(value: string): boolean {
  const normalized = String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
  return BUG_AUDIT_COMMANDS.has(normalized);
}

function extractTaskId(value: string): string | null {
  const trimmed = String(value || '').trim();
  // Full-string anchors prevent matching within longer freeform text (§3.3)
  // PRINCIPLE 7: Accept with or without 'v' prefix — user shouldn't need to know exact syntax
  const vMatch = trimmed.match(/^v?0(?:\.\d+)+$/i);
  if (vMatch) {
    const raw = vMatch[0];
    // Normalize: ensure 'v' prefix
    return raw.startsWith('v') || raw.startsWith('V') ? raw : 'v' + raw;
  }
  // Also accept bare lane.suffix like "13.02" or ".13.02" → "v0.13.02"
  const bareMatch = trimmed.match(/^\.?(\d{1,2})\.(\d{2,3})$/);
  if (bareMatch) return 'v0.' + bareMatch[1] + '.' + bareMatch[2];
  const bugMatch = trimmed.match(/^BUG-?\d+$/i);
  if (bugMatch) return bugMatch[0].toUpperCase().replace('BUG', 'BUG-').replace('BUG--', 'BUG-');
  return null;
}

// BUG-221: Extract BUG-### from task title/description for display
function extractBugNumber(text: string): string | null {
  const match = String(text || '').match(/\bBUG-(\d+)\b/i);
  return match ? match[0] : null;
}

export function App({ operator, statsManager, pkg, projectRoot, onSetupRequest }: AppProps) {
  const { exit } = useApp();
  const { stdout } = useStdout();

  const [stage, setStage] = useState<MboStage>('idle');
  const [activeModel, setActiveModel] = useState('');
  const [activeAction, setActiveAction] = useState('Ready for the next instruction');
  const [currentTask, setCurrentTask] = useState<string | null>(null);
  const [filesInScope, setFilesInScope] = useState<string[]>([]);
  const [auditPending, setAuditPending] = useState(false);
  const [smokePending, setSmokePending] = useState(false);
  const [stageStartTime, setStageStartTime] = useState(Date.now());
  const [stageTokenTotals, setStageTokenTotals] = useState<StageUsageMap>({});
  const prevStageRef = useRef<MboStage>('idle');

  const [activeTab, setActiveTab] = useState<ActiveTab>(1);
  const [statsOverlay, setStatsOverlay] = useState(false);
  const [overlayMode, setOverlayMode] = useState<OverlayMode>(null);
  const [overlayInitialTaskId, setOverlayInitialTaskId] = useState<string | null>(null);
  const [exitPending, setExitPending] = useState(false);
  const exitPendingRef = useRef(false);
  const exitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [overlayDraftSeed, setOverlayDraftSeed] = useState<{ title?: string } | null>(null);
  const [commandMenuOpen, setCommandMenuOpen] = useState(false);
  const [pipelineRunning, setPipelineRunning] = useState(false);
  // BUG-241/242: tracks when the operator is paused at the approval gate.
  const [waitingForApproval, setWaitingForApproval] = useState(false);
  const [stats, setStats] = useState<TuiStats>(() => loadStats(statsManager));

  const [operatorLines, setOperatorLines] = useState<string[]>([]);
  const [pipelineEntries, setPipelineEntries] = useState<PipelineEntry[]>([]);
  const [executorLines, setExecutorLines] = useState<string[]>([]);
  const [lastClarificationMessage, setLastClarificationMessage] = useState<string | null>(null);

  // BUG-221: Numbered task shortcuts displayed on startup (index 0→'1', 1→'2', etc.)
  const startupTasksRef = useRef<Array<{ id: string; title: string }>>([]);
  const [selectedTaskIdx, setSelectedTaskIdx] = useState(-1);

  const appendOperator = useCallback((text: string) => {
    const nextLines = String(text || '').split('\n');
    setOperatorLines((prev) => [...prev, ...nextLines]);
  }, []);

  const [, setResizeTick] = useState(0);
  useEffect(() => {
    const onResize = () => setResizeTick((n) => n + 1);
    process.stdout.on('resize', onResize);
    return () => { process.stdout.off('resize', onResize); };
  }, []);

  // Startup task surface — on mount, show top active tasks from projecttracking.md (BUG-189)
  useEffect(() => {
    try {
      const summary = readGovernanceSummary(projectRoot);
      const ledger = parseTaskLedger(projectRoot);
      const lines: string[] = [];

      if (!summary.taskRowCount) {
        appendOperator('Governance ledger missing. Use /newtask, /docs, or onboarding to create source docs.');
        return;
      }

      lines.push('─── Projecttracking ───────────────────────────');
      if (summary.nextTask) {
        const nextTask = ledger.active.find((task) => task.id === summary.nextTask);
        if (nextTask) lines.push(`  Next Task: ${summary.nextTask}  ${nextTask.title.slice(0, 52)}${nextTask.title.length > 52 ? '…' : ''}`);
        else lines.push(`  Next Task: ${summary.nextTask}`);
      }

      if (ledger.active.length > 0) {
        // BUG-221: Show task IDs prominently — type the ID to activate directly
        const top = ledger.active.slice(0, 5);
        startupTasksRef.current = top.map((t) => ({ id: t.id, title: t.title }));
        for (const t of top) {
          const bug = t.type === 'bug' ? extractBugNumber(t.title) || extractBugNumber(t.acceptance || '') : null;
          const bugTag = bug ? ` (${bug})` : '';
          lines.push(`  ▸ ${t.id}${bugTag}  ${t.title.slice(0, 55)}${t.title.length > 55 ? '…' : ''}`);
        }
        if (ledger.active.length > 5) lines.push(`  … and ${ledger.active.length - 5} more — /tasks to view all`);
        lines.push('  Type a task ID (e.g. v0.13.02) to activate. /tasks for full list.');
      } else {
        lines.push('  No active tasks in the selected governance ledger.');
      }
      lines.push(`  Ledger: ${summary.governanceDir}`);
      lines.push('────────────────────────────────────────────────');
      lines.forEach(appendOperator);
    } catch {
      // governance not available — silent, not a fatal error
    }
  }, [appendOperator, projectRoot]);

  useEffect(() => {
    const id = setInterval(() => {
      try {
        const summary = operator.stateSummary || {};
        const newStage = (summary.currentStage || 'idle') as MboStage;
        if (newStage !== prevStageRef.current) {
          prevStageRef.current = newStage;
          setStage(newStage);
          setStageStartTime(Date.now());
          if (['context_pinning', 'planning', 'tiebreaker_plan', 'code_derivation', 'tiebreaker_code'].includes(newStage)) {
            setActiveTab(2);
          } else if (['dry_run', 'implement', 'state_sync', 'knowledge_update'].includes(newStage)) {
            setActiveTab(3);
          } else if (newStage === 'audit_gate') {
            setActiveTab(1);
          }
        }

        setActiveModel(summary.activeModel || '');
        setActiveAction(summary.activeAction || 'Ready for the next instruction');
        setCurrentTask(summary.currentTask || null);
        setFilesInScope(Array.isArray(summary.filesInScope) ? summary.filesInScope : []);
        setAuditPending(Boolean(summary.pendingAudit));
        setStageTokenTotals(summary.stageTokenTotals && typeof summary.stageTokenTotals === 'object' ? summary.stageTokenTotals : {});
        setStats(loadStats(statsManager));
      } catch {
        // operator not yet ready
      }
    }, 200);

    return () => clearInterval(id);
  }, [operator, statsManager]);

  useEffect(() => {
    operator.onChunk = ({ role, chunk, stage: chunkStage, model }: { role: string; chunk: string; sequence?: number; stage?: MboStage; model?: string }) => {
      const normalizedRole = String(role || '').toLowerCase().replace(/\s+/g, '-');
      if (EXECUTOR_ROLES.has(normalizedRole)) {
        const newLines = String(chunk || '').split('\n');
        setExecutorLines((prev) => {
          const updated = [...prev];
          if (prev.length > 0 && !String(chunk || '').startsWith('\n')) {
            updated[updated.length - 1] = String(updated[updated.length - 1] || '') + newLines[0];
            return [...updated, ...newLines.slice(1)];
          }
          return [...updated, ...newLines];
        });
        return;
      }

      setPipelineEntries((prev) => {
        const nextStage = chunkStage || stage;
        if (prev.length > 0) {
          const last = prev[prev.length - 1];
          const sameRole = String(last.role || '').toLowerCase() === normalizedRole;
          const sameStage = String(last.stage || 'idle') === String(nextStage || 'idle');
          const sameModel = String(last.model || '') === String(model || '');
          if (sameRole && sameStage && sameModel) {
            const updated = [...prev];
            updated[updated.length - 1] = {
              ...updated[updated.length - 1],
              text: String(updated[updated.length - 1].text || '') + String(chunk || ''),
            };
            return updated;
          }
        }

        return [...prev, { id: newId(), role, text: String(chunk || ''), stage: nextStage, model }];
      });
    };

    return () => {
      if (operator.onChunk) operator.onChunk = null;
    };
  }, [operator, stage]);

  const activateTask = useCallback(async ({ taskId, title, activationInput }: TaskActivationPayload) => {
    if (pipelineRunning || operator._pipelineRunning) {
      appendOperator('[TASK] Cannot activate while a pipeline is running.');
      return;
    }
    // Hard error if operator doesn't support activateTask — DO NOT fall back to processMessage (§3.2)
    if (typeof operator.activateTask !== 'function') {
      appendOperator('[ERROR] Operator does not support activateTask(). Update to v0.14.10+.');
      return;
    }

    setOverlayMode(null);
    setOverlayDraftSeed(null);
    setOverlayInitialTaskId(null);
    setActiveTab(1);
    setLastClarificationMessage(null);
    appendOperator(`[TASK] Activated ${taskId}: ${title}`);
    setPipelineRunning(true);

    try {
      const result = await operator.activateTask(taskId, activationInput);
      if (result?.needsClarification && result.question) {
        setLastClarificationMessage(result.question);
      } else {
        setLastClarificationMessage(null);
      }
      if (result && result.status === 'started' && result.needsApproval) {
        // DID plan convergence complete — waiting for human approval
        appendOperator('');
        appendOperator('════════════════════════════════════════════════');
        appendOperator('  PLAN READY — Review the plan above.');
        appendOperator('  Type "go" to execute, or type feedback to refine.');
        appendOperator('════════════════════════════════════════════════');
        setWaitingForApproval(true);
      } else if (result && result.status !== 'started') {
        const formatted = formatResult(result);
        if (formatted) appendOperator(formatted);
      }
    } catch (err: any) {
      appendOperator('[ERROR] ' + (err?.message || String(err)));
    } finally {
      setPipelineRunning(false);
    }
  }, [appendOperator, operator, pipelineRunning]);

  useInput((input, key) => {
    if (key.ctrl && input === 'c') {
      // BUG-185: double-press Ctrl+C for clean exit confirmation
      if (exitPendingRef.current) {
        // Second press — exit immediately
        if (exitTimerRef.current) clearTimeout(exitTimerRef.current);
        exit();
        return;
      }
      // First press — arm the confirmation and show hint
      exitPendingRef.current = true;
      setExitPending(true);
      exitTimerRef.current = setTimeout(() => {
        exitPendingRef.current = false;
        setExitPending(false);
      }, 2000);
      return;
    }
    if (key.escape) {
      setStatsOverlay(false);
      setOverlayMode(null);
      return;
    }
    if (key.shift && input === 'T') {
      setStatsOverlay((value) => !value);
      return;
    }
    if (key.tab && !statsOverlay && !overlayMode && !commandMenuOpen) {
      setActiveTab((value) => ((value % 4) + 1) as ActiveTab);
    }
  });

  const handleInput = useCallback(async (text: string) => {
    const trimmed = String(text || '').trim();
    const lower = trimmed.toLowerCase();

    // Empty submit with arrow-selected task → activate via overlay preflight
    if (!trimmed) {
      if (selectedTaskIdx >= 0 && selectedTaskIdx < startupTasksRef.current.length) {
        const selected = startupTasksRef.current[selectedTaskIdx];
        const found = findTaskById(projectRoot, selected.id);
        if (found.task && found.section === 'active') {
          setOverlayMode('tasks');
          setOverlayInitialTaskId(selected.id);
          setSelectedTaskIdx(-1);
        }
      }
      return;
    }

    // PRINCIPLE 7: Digits 1-5 activate startup tasks when tasks exist.
    // Tab switching uses [Tab] key (useInput handler), not digit submission.
    // This resolves the BUG-221 conflict where digits 1-4 were consumed by tab switching
    // before reaching the task activation handler.
    if (lower === 'exit' || lower === 'quit') {
      await operator.shutdown();
      exit();
      return;
    }
    if (lower === 'stats') {
      setStatsOverlay(true);
      return;
    }
    if (isBugAuditCommand(lower)) {
      setPipelineRunning(true);
      appendOperator('[BUG AUDIT] Running deterministic local audit...');
      try {
        const _require = createRequire(import.meta.url);
        const { runBugAudit } = _require('../cli/bug-audit.js');
        const result = runBugAudit({ projectRoot });
        appendOperator(`[BUG AUDIT] ${result.summaryLine}`);
        appendOperator(`[BUG AUDIT] bugs.md → ${result.bugsReportPath}`);
        appendOperator(`[BUG AUDIT] bugsresolved.md → ${result.resolvedReportPath}`);
        if (result.findings.length > 0) {
          result.findings.slice(0, 5).forEach((finding: any) => {
            appendOperator(`[BUG AUDIT] [${finding.severity}] ${finding.title} — ${finding.details}`);
          });
        }
      } catch (err: any) {
        appendOperator('[BUG AUDIT ERROR] ' + (err?.message || String(err)));
      } finally {
        setPipelineRunning(false);
      }
      return;
    }
    if (lower === '/token' || lower === 'token' || lower === '/tm' || lower === 'tm') {
      setStatsOverlay(true);
      return;
    }
    if (lower === 'tasks' || lower === '/tasks') {
      setOverlayMode('tasks');
      return;
    }
    if (lower === 'docs' || lower === '/docs') {
      setOverlayMode('docs');
      return;
    }
    if (lower === 'newtask' || lower === '/newtask') {
      setOverlayDraftSeed(null);
      setOverlayMode('create');
      return;
    }
    if (lower.startsWith('/newtask ') || lower.startsWith('newtask ')) {
      const description = trimmed.replace(/^\/?newtask\s+/i, '').trim();
      setOverlayDraftSeed(description ? { title: description } : null);
      setOverlayMode('create');
      return;
    }
    if (lower.startsWith('add task ') || lower.startsWith('create task ')) {
      const description = trimmed.replace(/^(add|create) task\s+/i, '').trim();
      setOverlayDraftSeed(description ? { title: description } : null);
      setOverlayMode('create');
      return;
    }
    if (lower === 'clear') {
      setOperatorLines([]);
      setPipelineEntries([]);
      setExecutorLines([]);
      return;
    }
    if (lower === 'status' || lower === "what's going on?") {
      appendOperator(operator.getStatus());
      return;
    }
    if (lower === 'history' || lower === 'what were we working on last time') {
      appendOperator('Last Task: ' + (operator.stateSummary?.progressSummary || 'none'));
      return;
    }
    if (lower === 'stop' || lower === 'abort' || lower === "stop what you're doing") {
      operator.requestAbort();
      setPipelineRunning(false);
      // BUG-243: Switch to Operator tab so the abort confirmation is visible
      // (user is often on the Pipeline tab when they type 'stop').
      setActiveTab(1 as ActiveTab);
      appendOperator('[OPERATOR] Abort requested. Active model work will stop at the next abort boundary.');
      return;
    }
    if (lower === '/setup' || lower === 'setup') {
      appendOperator('Launching setup wizard...');
      if (typeof onSetupRequest === 'function') onSetupRequest();
      exit();
      return;
    }
    if (lower === '/onboarding' || lower === 'onboarding') {
      // Follow-up interview against existing profile — not a cold-start re-interview (BUG-189)
      appendOperator('Starting follow-up onboarding interview against existing profile…');
      setPipelineRunning(true);
      try {
        const result = await operator.runOnboarding({ reOnboard: true });
        appendOperator(formatResult(result));
      } catch (err: any) {
        appendOperator('[ONBOARDING ERROR] ' + (err?.message || String(err)));
      } finally {
        setPipelineRunning(false);
      }
      return;
    }
    if (lower === '/projecttracking' || lower === '/tasks next' || lower === 'next task') {
      try {
        const summary = readGovernanceSummary(projectRoot);
        const ledger = parseTaskLedger(projectRoot);
        const next = ledger.active[0];
        if (summary.nextTask) appendOperator(`Next Task header: ${summary.nextTask}`);
        if (next) {
          appendOperator(`Next task: [${next.status}] ${next.id} — ${next.title}`);
          if (next.acceptance) appendOperator(`Acceptance: ${next.acceptance.slice(0, 120)}${next.acceptance.length > 120 ? '…' : ''}`);
        } else {
          appendOperator('No active tasks found in projecttracking.md.');
        }
      } catch (err: any) {
        appendOperator('[PROJECTTRACKING ERROR] ' + (err?.message || String(err)));
      }
      return;
    }
    // BUG-221: Numbered shortcut — single digit activates startup task list item via overlay preflight
    if (/^[1-5]$/.test(trimmed)) {
      const idx = parseInt(trimmed, 10) - 1;
      const shortcut = startupTasksRef.current[idx];
      if (shortcut) {
        const found = findTaskById(projectRoot, shortcut.id);
        if (found.task && found.section === 'active') {
          setOverlayMode('tasks');
          setOverlayInitialTaskId(shortcut.id);
          return;
        }
      }
      appendOperator(`[TASK] No task at position ${trimmed}. Type /tasks to browse.`);
      return;
    }

    // BUG-210 / SPEC 37.3B: Route "run next task" through overlay preflight dialogue
    if (/^(run|start|do|activate|execute)\s+(the\s+)?(next|first|top)\s+task$/i.test(trimmed)) {
      try {
        const ledger = parseTaskLedger(projectRoot);
        const next = ledger.active[0];
        if (next) {
          setOverlayMode('tasks');
          setOverlayInitialTaskId(next.id);
        } else {
          appendOperator('No active tasks found in projecttracking.md.');
        }
      } catch (err: any) {
        appendOperator('[TASK ERROR] ' + (err?.message || String(err)));
      }
      return;
    }

    // SPEC 37.3B: Explicit taskId input routes through overlay preflight
    const explicitTaskId = extractTaskId(trimmed);
    if (explicitTaskId) {
      const found = findTaskById(projectRoot, explicitTaskId);
      if (found.task && found.section === 'active') {
        setOverlayMode('tasks');
        setOverlayInitialTaskId(explicitTaskId);
        return;
      }
      if (found.task && found.section === 'recent') {
        appendOperator(`[TASK] ${found.task.id} is already ${found.task.status}. Choose an active task or reopen it explicitly.`);
        return;
      }
      appendOperator(`[TASK] No task with id ${explicitTaskId} was found in projecttracking.md.`);
      return;
    }

    // Stage 10: smoke test gate — handle pass / fail / partial verdicts.
    if (smokePending || operator.stateSummary?.pendingSmoke) {
      if (lower === 'pass' || lower.startsWith('fail') || lower.startsWith('partial')) {
        appendOperator('❯ ' + trimmed);
        setPipelineRunning(true);
        try {
          const verdict = await operator.handleSmokeVerdict(trimmed);
          setSmokePending(false);
          if (verdict.status === 'complete' || verdict.status === 'partial') {
            appendOperator(verdict.message || 'Smoke test complete.');
          } else if (verdict.status === 'retry') {
            appendOperator(verdict.message || "Smoke test failed. Type 'go' to retry from planning.");
          } else if (verdict.status === 'abort') {
            appendOperator(verdict.message || 'Task aborted after max smoke test failures.');
          } else if (verdict.status === 'smoke_test_pending') {
            // Unrecognised input — re-surface prompt
            setSmokePending(true);
            appendOperator(verdict.prompt || '[SMOKE TEST] Type: pass  /  fail <reason>  /  partial <notes>');
          }
        } catch (err: any) {
          appendOperator('[SMOKE TEST ERROR] ' + (err?.message || String(err)));
        } finally {
          setPipelineRunning(false);
        }
        return;
      }
      appendOperator('[SMOKE TEST] Verify the change works as intended, then type: pass  /  fail <reason>  /  partial <notes>');
      return;
    }

    if (auditPending || operator.stateSummary?.pendingAudit) {
      if (lower === 'approved') {
        appendOperator('❯ approved');
        setPipelineRunning(true);
        try {
          const ctx = operator.stateSummary.pendingAuditContext || {};
          await operator.runStage8(ctx.classification || {}, ctx.routing || {});
          operator.stateSummary.pendingAudit = null;
          operator.stateSummary.pendingAuditContext = null;
          appendOperator('State synced. Intelligence graph updated.');
          // Stage 10: smoke test gate — human verifies before task is marked complete.
          const smokeResult = await operator.runStage10(
            ctx.classification || {},
            ctx.modifiedFiles || []
          );
          setSmokePending(true);
          appendOperator(smokeResult.prompt || '[SMOKE TEST] Type: pass  /  fail <reason>  /  partial <notes>');
        } catch (err: any) {
          appendOperator('[AUDIT ERROR] ' + (err?.message || String(err)));
        } finally {
          setPipelineRunning(false);
        }
        return;
      }

      if (lower === 'reject') {
        appendOperator('❯ reject');
        setPipelineRunning(true);
        try {
          const files = operator.stateSummary.pendingAuditContext?.modifiedFiles || [];
          await operator.runStage7Rollback(files);
          operator.stateSummary.pendingAudit = null;
          operator.stateSummary.pendingAuditContext = null;
          appendOperator('Audit rejected. Changes were rolled back.');
        } catch (err: any) {
          appendOperator('[AUDIT ERROR] ' + (err?.message || String(err)));
        } finally {
          setPipelineRunning(false);
        }
        return;
      }

      appendOperator('Audit pending. Respond with "approved" or "reject".');
      return;
    }

    // BUG-236: 'go' must always reach operator.processMessage for plan approval,
    // even when _pipelineRunning is true (activateTask leaves it set after needsApproval).
    // BUG-243: 'stop'/'abort' must never be swallowed as hints — handled above, but
    // this exemption is a safety belt in case ordering ever shifts.
    if ((pipelineRunning || operator._pipelineRunning) && lower !== 'go' && lower !== 'stop' && lower !== 'abort') {
      operator.userHintBuffer = Array.isArray(operator.userHintBuffer) ? operator.userHintBuffer : [];
      operator.userHintBuffer.push(trimmed);
      appendOperator('[HINT] ' + trimmed);
      return;
    }

    appendOperator('❯ ' + trimmed);
    setPipelineRunning(true);

    try {
      // BUG-210: Check if this is a follow-up to a pending clarification
      const clarificationCheck = detectClarificationFollowup(trimmed, lastClarificationMessage);
      const messageToProcess = clarificationCheck ? clarificationCheck.wrappedPrompt : trimmed;

      // BUG-242: Route 'go' directly to handleApproval when at the approval gate.
      // processMessage already does this internally via pendingDecision check, but
      // routing here explicitly prevents any edge case where pendingDecision is stale.
      let result: any;
      if (lower === 'go' && (waitingForApproval || operator.stateSummary?.pendingDecision)) {
        setWaitingForApproval(false);
        result = await operator.handleApproval('go');
      } else {
        result = await operator.processMessage(messageToProcess);
      }

      // Track clarifications from the result so TUI can detect follow-ups
      if (result && result.needsClarification && result.question) {
        setLastClarificationMessage(result.question);
      } else if (result && result.status === 'ready') {
        // Clear clarification once answered successfully
        setLastClarificationMessage(null);
      } else if (result && result.status !== 'started') {
        // Other successful responses clear the pending clarification
        if (!clarificationCheck) {
          setLastClarificationMessage(null);
        }
      }

      if (result && result.status !== 'started') {
        const formatted = formatResult(result);
        if (formatted) appendOperator(formatted);
      }

      // Show approval gate when processMessage returns with pendingDecision set
      if (operator.stateSummary?.pendingDecision && result?.status !== 'error' && result?.status !== 'blocked') {
        appendOperator('');
        appendOperator('════════════════════════════════════════════════');
        appendOperator('  PLAN READY — Review the plan above.');
        appendOperator('  Type "go" to execute, or type feedback to refine.');
        appendOperator('════════════════════════════════════════════════');
        setWaitingForApproval(true);
      }
    } catch (err: any) {
      setWaitingForApproval(false);
      appendOperator('[ERROR] ' + (err?.message || String(err)));
    } finally {
      setPipelineRunning(false);
    }
  }, [appendOperator, exit, onSetupRequest, operator, pipelineRunning, waitingForApproval, lastClarificationMessage, selectedTaskIdx]);

  const termRows = stdout?.rows ?? 40;
  const termCols = stdout?.columns ?? 120;
  const currentStageUsage = stageTokenTotals[stage] || { model: activeModel, tokens: 0 };

  // BUG-222: Auto-resize terminal if too small (xterm escape sequence)
  // MUST be before any conditional returns to satisfy React hooks ordering rules.
  useEffect(() => {
    const cols = stdout?.columns ?? 120;
    const rows = stdout?.rows ?? 40;
    if (cols < MIN_COLS || rows < MIN_ROWS) {
      const newCols = Math.max(cols, MIN_COLS);
      const newRows = Math.max(rows, MIN_ROWS);
      process.stdout.write(`\x1b[8;${newRows};${newCols}t`);
    }
  }, [stdout?.columns, stdout?.rows]);

  // SPEC 37.3B §3.7: Two-tier graceful degradation
  // Tier 2: ultra-minimal (input bar + operator output only)
  // Tier 1: collapse stats panel, amber banner
  // Tier 0: normal full UI
  const tier: 0 | 1 | 2 = (termCols < 72 || termRows < 20) ? 2 : termCols < MIN_COLS ? 1 : 0;

  // BUG-222: Fixed-width right panel; hide if terminal too narrow (Tier 0 only)
  const showStatsPanel = tier === 0;
  const statsPanelWidth = Math.min(STATS_PANEL_WIDTH, Math.floor(termCols * 0.3));

  // SPEC 37.3B §3.7 Tier 2: Minimal UI — input bar + operator output only.
  // Critical: InputBar MUST remain functional so user can respond to `go` gates.
  if (tier === 2) {
    return (
      <Box flexDirection="column" height={termRows}>
        <Text color="yellow" bold>⚠ Terminal too small ({termCols}×{termRows}) — minimal mode</Text>
        <Box flexGrow={1} flexDirection="column">
          <OperatorPanel
            lines={operatorLines}
            stage={stage}
            pipelineRunning={pipelineRunning}
            auditPending={auditPending}
            stats={stats}
            activeAction={activeAction}
            activeModel={String(currentStageUsage.model || activeModel || '')}
            isActive={true}
            taskCount={startupTasksRef.current.length}
            selectedTaskIdx={selectedTaskIdx}
            onTaskSelect={setSelectedTaskIdx}
            onTaskActivate={(idx) => {
              const task = startupTasksRef.current[idx];
              if (task) handleInput(task.id);
            }}
          />
        </Box>
        <InputBar
          onSubmit={handleInput}
          stage={stage}
          pipelineRunning={pipelineRunning}
          auditPending={auditPending}
          onCommandMenuChange={setCommandMenuOpen}
        />
      </Box>
    );
  }

  if (statsOverlay) {
    return (
      <Box flexDirection="column" height={termRows}>
        <StatsOverlay stats={stats} onClose={() => setStatsOverlay(false)} />
      </Box>
    );
  }

  if (overlayMode) {
    return (
      <Box flexDirection="column" height={termRows}>
        <TasksOverlay
          projectRoot={projectRoot}
          initialView={overlayMode}
          initialDraft={overlayDraftSeed || undefined}
          initialTaskId={overlayInitialTaskId || undefined}
          onClose={() => {
            setOverlayMode(null);
            setOverlayDraftSeed(null);
            setOverlayInitialTaskId(null);
          }}
          onActivate={activateTask}
        />
      </Box>
    );
  }

  return (
    <Box flexDirection="column" height={termRows}>
      <StatusBar
        stage={stage}
        activeAction={activeAction}
        currentTask={currentTask}
        activeTab={activeTab}
        stageStartTime={stageStartTime}
        version={pkg.version}
        pipelineRunning={pipelineRunning}
        exitPending={exitPending}
      />

      {tier === 1 && <Text color="yellow">⚠ Terminal narrow — stats hidden.</Text>}

      <TabBar activeTab={activeTab} stage={stage} auditPending={auditPending} />

      <Box flexGrow={1} flexDirection="row">
        {/* BUG-222: Left panel takes all remaining space; right panel is fixed-width */}
        <Box flexGrow={1} flexDirection="column">
          {activeTab === 1 && (
            <OperatorPanel
              lines={operatorLines}
              stage={stage}
              pipelineRunning={pipelineRunning}
              auditPending={auditPending}
              stats={stats}
              activeAction={activeAction}
              activeModel={String(currentStageUsage.model || activeModel || '')}
              isActive={activeTab === 1}
              taskCount={startupTasksRef.current.length}
              selectedTaskIdx={selectedTaskIdx}
              onTaskSelect={setSelectedTaskIdx}
              onTaskActivate={(idx) => {
                const task = startupTasksRef.current[idx];
                if (task) handleInput(task.id);
              }}
            />
          )}
          {activeTab === 2 && (
            <PipelinePanel
              entries={pipelineEntries}
              isActive={activeTab === 2}
              currentStage={stage}
              stats={stats}
              stageTokenTotals={stageTokenTotals}
            />
          )}
          {activeTab === 3 && (
            <ExecutorPanel
              lines={executorLines}
              stage={stage}
              isActive={activeTab === 3}
              stats={stats}
              activeAction={activeAction}
              activeModel={String(currentStageUsage.model || activeModel || '')}
            />
          )}
          {activeTab === 4 && <SystemPanel projectRoot={projectRoot} isActive={activeTab === 4} />}
        </Box>

        {showStatsPanel && (
          <Box width={statsPanelWidth} marginLeft={1} flexShrink={0}>
            <StatsPanel
              stage={stage}
              stats={stats}
              filesInScope={filesInScope}
              auditPending={auditPending}
              activeModel={String(currentStageUsage.model || activeModel || '')}
              stageTokenTotals={stageTokenTotals}
            />
          </Box>
        )}
      </Box>

      <InputBar
        onSubmit={handleInput}
        stage={stage}
        pipelineRunning={pipelineRunning}
        auditPending={auditPending}
        onCommandMenuChange={setCommandMenuOpen}
      />
    </Box>
  );
}
