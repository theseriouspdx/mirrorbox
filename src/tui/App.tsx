import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Box, useApp, useInput, useStdout } from 'ink';
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
import { parseTaskLedger } from './governance.js';

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
  if (status === 'blocked') return result.reason || result.prompt || 'Task blocked.';
  if (status === 'aborted') return result.reason || 'Operation aborted.';
  if (status === 'error') return result.reason || 'Pipeline failed.';
  if (status === 'onboarding_active' || status === 'onboarding_complete') return result.prompt || 'Onboarding update received.';
  if (status === 'shutdown_complete') return 'Session shutdown complete.';
  if (typeof result.prompt === 'string' && result.prompt.trim()) return result.prompt;
  if (typeof result.reason === 'string' && result.reason.trim()) return result.reason;
  return 'Operator update received.';
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

export function App({ operator, statsManager, pkg, projectRoot, onSetupRequest }: AppProps) {
  const { exit } = useApp();
  const { stdout } = useStdout();

  const [stage, setStage] = useState<MboStage>('idle');
  const [activeModel, setActiveModel] = useState('');
  const [activeAction, setActiveAction] = useState('Ready for the next instruction');
  const [currentTask, setCurrentTask] = useState<string | null>(null);
  const [filesInScope, setFilesInScope] = useState<string[]>([]);
  const [auditPending, setAuditPending] = useState(false);
  const [stageStartTime, setStageStartTime] = useState(Date.now());
  const [stageTokenTotals, setStageTokenTotals] = useState<StageUsageMap>({});
  const prevStageRef = useRef<MboStage>('idle');

  const [activeTab, setActiveTab] = useState<ActiveTab>(1);
  const [statsOverlay, setStatsOverlay] = useState(false);
  const [overlayMode, setOverlayMode] = useState<OverlayMode>(null);
  const [exitPending, setExitPending] = useState(false);
  const exitPendingRef = useRef(false);
  const exitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [overlayDraftSeed, setOverlayDraftSeed] = useState<{ title?: string } | null>(null);
  const [commandMenuOpen, setCommandMenuOpen] = useState(false);
  const [pipelineRunning, setPipelineRunning] = useState(false);
  const [stats, setStats] = useState<TuiStats>(() => loadStats(statsManager));

  const [operatorLines, setOperatorLines] = useState<string[]>([]);
  const [pipelineEntries, setPipelineEntries] = useState<PipelineEntry[]>([]);
  const [executorLines, setExecutorLines] = useState<string[]>([]);

  const [, setResizeTick] = useState(0);
  useEffect(() => {
    const onResize = () => setResizeTick((n) => n + 1);
    process.stdout.on('resize', onResize);
    return () => { process.stdout.off('resize', onResize); };
  }, []);

  // Enable SGR mouse tracking so scroll wheel events reach MouseFilterStream (BUG-185/186)
  useEffect(() => {
    process.stdout.write('\x1b[?1002h\x1b[?1006h');
    const disable = () => process.stdout.write('\x1b[?1002l\x1b[?1006l');
    process.on('exit', disable);
    process.on('SIGINT', disable);
    return () => {
      disable();
      process.off('exit', disable);
      process.off('SIGINT', disable);
    };
  }, []);

  // Startup task surface — on mount, show top active tasks from projecttracking.md (BUG-189)
  useEffect(() => {
    try {
      const ledger = parseTaskLedger(projectRoot);
      if (ledger.active.length > 0) {
        const top = ledger.active.slice(0, 3);
        const lines = ['─── Active Tasks ───────────────────────────────'];
        for (const t of top) {
          lines.push(`  [${t.status}] ${t.id}  ${t.title.slice(0, 60)}${t.title.length > 60 ? '…' : ''}`);
        }
        if (ledger.active.length > 3) lines.push(`  … and ${ledger.active.length - 3} more — type /tasks to view all`);
        lines.push('────────────────────────────────────────────────');
        lines.forEach(appendOperator);
      }
    } catch {
      // governance not available — silent, not a fatal error
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const appendOperator = useCallback((text: string) => {
    const nextLines = String(text || '').split('\n');
    setOperatorLines((prev) => [...prev, ...nextLines]);
  }, []);

  const activateTask = useCallback(async ({ taskId, title, prompt }: TaskActivationPayload) => {
    setOverlayMode(null);
    setOverlayDraftSeed(null);
    setActiveTab(1);
    appendOperator(`[TASK] Activated ${taskId}: ${title}`);
    setPipelineRunning(true);

    try {
      const result = await operator.processMessage(prompt);
      if (result && result.status !== 'started') {
        const formatted = formatResult(result);
        if (formatted) appendOperator(formatted);
      }
    } catch (err: any) {
      appendOperator('[ERROR] ' + (err?.message || String(err)));
    } finally {
      setPipelineRunning(false);
    }
  }, [appendOperator, operator]);

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

    if (!trimmed) return;

    if (lower === '1') {
      setActiveTab(1);
      return;
    }
    if (lower === '2') {
      setActiveTab(2);
      return;
    }
    if (lower === '3') {
      setActiveTab(3);
      return;
    }
    if (lower === '4') {
      setActiveTab(4);
      return;
    }
    if (lower === 'exit' || lower === 'quit') {
      await operator.shutdown();
      exit();
      return;
    }
    if (lower === 'stats') {
      setStatsOverlay(true);
      return;
    }
    if (lower === '/token' || lower === 'token' || lower === '/tm' || lower === 'tm') {
      try {
        const _require = createRequire(import.meta.url);
        const tmDashboard = _require('../cli/tokenmiser-dashboard.js');
        const output = tmDashboard.renderTmCommand();
        output.split('\n').forEach((line: string) => appendOperator(line));
      } catch (err: any) {
        appendOperator('[TM ERROR] ' + (err?.message || String(err)));
      }
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
        const ledger = parseTaskLedger(projectRoot);
        const next = ledger.active[0];
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
    if (lower === 'approved') {
        appendOperator('❯ approved');
        setPipelineRunning(true);
        try {
          const ctx = operator.stateSummary.pendingAuditContext || {};
          await operator.runStage8(ctx.classification || {}, ctx.routing || {});
          operator.stateSummary.pendingAudit = null;
          operator.stateSummary.pendingAuditContext = null;
          appendOperator('Audit approved. State synced. Intelligence graph updated.');
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

    if (pipelineRunning || operator._pipelineRunning) {
      operator.userHintBuffer = Array.isArray(operator.userHintBuffer) ? operator.userHintBuffer : [];
      operator.userHintBuffer.push(trimmed);
      appendOperator('[HINT] ' + trimmed);
      return;
    }

    appendOperator('❯ ' + trimmed);
    setPipelineRunning(true);

    try {
      const result = await operator.processMessage(trimmed);
      if (result && result.status !== 'started') {
        const formatted = formatResult(result);
        if (formatted) appendOperator(formatted);
      }
    } catch (err: any) {
      appendOperator('[ERROR] ' + (err?.message || String(err)));
    } finally {
      setPipelineRunning(false);
    }
  }, [appendOperator, exit, onSetupRequest, operator, pipelineRunning]);

  const termRows = stdout?.rows ?? 40;
  const currentStageUsage = stageTokenTotals[stage] || { model: activeModel, tokens: 0 };

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
          onClose={() => {
            setOverlayMode(null);
            setOverlayDraftSeed(null);
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

      <TabBar activeTab={activeTab} stage={stage} auditPending={auditPending} />

      <Box flexGrow={1} flexDirection="row">
        <Box width="65%" flexDirection="column">
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

        <Box width="35%" marginLeft={1}>
          <StatsPanel
            stage={stage}
            stats={stats}
            filesInScope={filesInScope}
            auditPending={auditPending}
            activeModel={String(currentStageUsage.model || activeModel || '')}
            stageTokenTotals={stageTokenTotals}
          />
        </Box>
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
