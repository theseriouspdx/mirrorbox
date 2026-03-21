import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Box, useApp, useInput, useStdout } from 'ink';
import { createRequire } from 'module';

import { StatusBar }     from './components/StatusBar.js';
import { TabBar }        from './components/TabBar.js';
import { OperatorPanel } from './components/OperatorPanel.js';
import { PipelinePanel } from './components/PipelinePanel.js';
import { ExecutorPanel } from './components/ExecutorPanel.js';
import { SystemPanel }   from './components/SystemPanel.js';
import { StatsPanel }    from './components/StatsPanel.js';
import { StatsOverlay }  from './components/StatsOverlay.js';
import { TasksOverlay }  from './components/TasksOverlay.js';
import { InputBar }      from './components/InputBar.js';

import {
  MboStage, ActiveTab, PipelineEntry, TuiStats, AppProps,
  PIPELINE_ROLES, EXECUTOR_ROLES,
} from './types.js';

const require = createRequire(import.meta.url);

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatResult(result: any): string {
  if (!result || typeof result !== 'object') return String(result || '');
  const status = String(result.status || '').toLowerCase();
  if (status === 'sandbox_intercept') return result.message || 'Input sent to sandbox.';
  if (result.needsClarification && result.question) return `Clarification needed: ${result.question}`;
  if (status === 'ready' && result.prompt) return result.prompt;
  if (status === 'ready_for_planning') return 'Task classified. Type "go" to proceed.';
  if (status === 'plan_agreed') return 'Planning complete. Ready for code derivation.';
  if (status === 'code_agreed') return 'Code derivation complete. Running dry run.';
  if (status === 'pass') return '✓ Dry run passed.';
  if (status === 'audit_pending') return result.prompt || '⚠  Audit ready — "approved" or "reject".';
  if (status === 'blocked') return result.reason || result.prompt || '⚠  Task blocked.';
  if (status === 'aborted') return result.reason || 'Operation aborted.';
  if (status === 'error') return result.reason || 'Pipeline failed.';
  if (status === 'shutdown_complete') return 'Session shutdown complete.';
  if (typeof result.prompt === 'string' && result.prompt.trim()) return result.prompt;
  if (typeof result.reason === 'string' && result.reason.trim()) return result.reason;
  return 'Operator update received.';
}

function loadStats(statsManager: any): TuiStats {
  try { return JSON.parse(JSON.stringify(statsManager.stats)); }
  catch { return { session: { models: {}, cache: { hits: 0, misses: 0 }, toolTokens: 0 }, lifetime: { models: {}, cache: { hits: 0, misses: 0 }, toolTokens: 0 }, sessions: 0, largestSessionDelta: 0, lastUpdate: '' }; }
}

let entryCounter = 0;
function newId(): string { return `e${++entryCounter}`; }

// ── App Component ─────────────────────────────────────────────────────────────

export function App({ operator, statsManager, pkg, projectRoot }: AppProps) {
  const { exit } = useApp();
  const { stdout } = useStdout();

  // ── Pipeline state (polled from operator.stateSummary) ──────────────────────
  const [stage, setStage]               = useState<MboStage>('idle');
  const [activeModel, setActiveModel]   = useState('');
  const [currentTask, setCurrentTask]   = useState<string | null>(null);
  const [filesInScope, setFilesInScope] = useState<string[]>([]);
  const [auditPending, setAuditPending] = useState(false);
  const [stageStartTime, setStageStartTime] = useState(Date.now());
  const prevStageRef = useRef<MboStage>('idle');

  // ── UI state ────────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab]         = useState<ActiveTab>(1);
  const [statsOverlay, setStatsOverlay]   = useState(false);
  const [tasksVisible, setTasksVisible]   = useState(false);
  const [pipelineRunning, setPipelineRunning] = useState(false);
  const [stats, setStats]                 = useState<TuiStats>(() => loadStats(statsManager));

  // ── Panel content ───────────────────────────────────────────────────────────
  const [operatorLines, setOperatorLines]   = useState<string[]>([]);
  const [pipelineEntries, setPipelineEntries] = useState<PipelineEntry[]>([]);
  const [executorLines, setExecutorLines]   = useState<string[]>([]);

  // ── Resize tracking ─────────────────────────────────────────────────────────
  const [, setResizeTick] = useState(0);
  useEffect(() => {
    const onResize = () => setResizeTick((n) => n + 1);
    process.stdout.on('resize', onResize);
    return () => { process.stdout.off('resize', onResize); };
  }, []);

  // ── Poll operator.stateSummary every 200ms ──────────────────────────────────
  useEffect(() => {
    const id = setInterval(() => {
      try {
        const s = operator.stateSummary;
        const newStage = (s.currentStage || 'idle') as MboStage;
        if (newStage !== prevStageRef.current) {
          prevStageRef.current = newStage;
          setStage(newStage);
          setStageStartTime(Date.now());
          if (['context_pinning','planning','tiebreaker_plan','code_derivation','tiebreaker_code'].includes(newStage)) {
            setActiveTab(2);
          } else if (['dry_run','implement','state_sync','knowledge_update'].includes(newStage)) {
            setActiveTab(3);
          } else if (newStage === 'audit_gate') {
            setActiveTab(1);
          }
        }
        setActiveModel(s.activeModel || '');
        setCurrentTask(s.currentTask || null);
        setFilesInScope(Array.isArray(s.filesInScope) ? s.filesInScope : []);
        setAuditPending(!!s.pendingAudit);
        setStats(loadStats(statsManager));
      } catch { /* operator not yet ready */ }
    }, 200);
    return () => clearInterval(id);
  }, [operator, statsManager]);

  // ── Wire operator.onChunk → panel routing ────────────────────────────────────
  useEffect(() => {
    operator.onChunk = ({ role, chunk }: { role: string; chunk: string; sequence?: number }) => {
      const r = (role || '').toLowerCase().replace(/\s+/g, '-');
      if (EXECUTOR_ROLES.has(r)) {
        const newLines = chunk.split('\n');
        setExecutorLines((prev) => {
          const updated = [...prev];
          if (prev.length > 0 && !chunk.startsWith('\n')) {
            updated[updated.length - 1] = (updated[updated.length - 1] || '') + newLines[0];
            return [...updated, ...newLines.slice(1)];
          }
          return [...updated, ...newLines];
        });
      } else {
        setPipelineEntries((prev) => {
          if (prev.length > 0 && prev[prev.length - 1].role.toLowerCase() === r) {
            const updated = [...prev];
            updated[updated.length - 1] = { ...updated[updated.length - 1], text: updated[updated.length - 1].text + chunk };
            return updated;
          }
          return [...prev, { id: newId(), role, text: chunk }];
        });
      }
    };
  }, [operator]);

  // ── Content helpers ──────────────────────────────────────────────────────────
  const appendOperator = useCallback((text: string) => {
    setOperatorLines((prev) => [...prev, ...text.split('\n')]);
  }, []);

  // ── Keyboard navigation ──────────────────────────────────────────────────────
  useInput((input, key) => {
    if (key.ctrl && input === 'c') { exit(); return; }
    if (key.escape) { setStatsOverlay(false); setTasksVisible(false); return; }
    if (key.shift && input === 'T') { setStatsOverlay((v) => !v); return; }
    if (key.tab && !statsOverlay && !tasksVisible) {
      setActiveTab((t) => ((t % 4) + 1) as ActiveTab);
      return;
    }
  });

  // ── Input submission ──────────────────────────────────────────────────────────
  const handleInput = useCallback(async (text: string) => {
    const lower = text.toLowerCase().trim();

    // Navigation shortcuts
    if (lower === '1') { setActiveTab(1); return; }
    if (lower === '2') { setActiveTab(2); return; }
    if (lower === '3') { setActiveTab(3); return; }
    if (lower === '4') { setActiveTab(4); return; }
    if (lower === 'exit' || lower === 'quit') { await operator.shutdown(); exit(); return; }
    if (lower === 'stats' || lower === '/token' || lower === 'token') { setStatsOverlay(true); return; }
    if (lower === 'tasks' || lower === '/tasks') { setTasksVisible(true); return; }
    if (lower === 'clear') {
      setOperatorLines([]); setPipelineEntries([]); setExecutorLines([]);
      return;
    }

    appendOperator(`❯ ${text}`);

    setPipelineRunning(true);
    try {
      const result = await operator.processMessage(text);
      if (result && result.status !== 'started') {
        const formatted = formatResult(result);
        if (formatted) appendOperator(formatted);
      }
    } catch (err: any) {
      appendOperator(`[ERROR] ${err?.message || String(err)}`);
    } finally {
      setPipelineRunning(false);
    }
  }, [operator, appendOperator, exit]);

  // ── Render ────────────────────────────────────────────────────────────────────

  const termRows = stdout?.rows ?? 40;

  // Full-screen overlays
  if (statsOverlay) {
    return (
      <Box flexDirection="column" height={termRows}>
        <StatsOverlay stats={stats} onClose={() => setStatsOverlay(false)} />
      </Box>
    );
  }

  if (tasksVisible) {
    return (
      <Box flexDirection="column" height={termRows}>
        <TasksOverlay
          projectRoot={projectRoot}
          onClose={() => setTasksVisible(false)}
          onActivate={(taskId) => {
            appendOperator(`❯ activate ${taskId}`);
            handleInput(`activate ${taskId}`);
          }}
        />
      </Box>
    );
  }

  return (
    <Box flexDirection="column" height={termRows}>
      {/* Top: status bar */}
      <StatusBar
        stage={stage}
        activeModel={activeModel}
        currentTask={currentTask}
        activeTab={activeTab}
        stageStartTime={stageStartTime}
        version={pkg.version}
        pipelineRunning={pipelineRunning}
        stats={stats}
      />

      {/* Tab bar */}
      <TabBar activeTab={activeTab} stage={stage} auditPending={auditPending} />

      {/* Main content area: main panel (65%) + stats side panel (35%) */}
      <Box flexGrow={1} flexDirection="row">
        <Box width="65%" flexDirection="column">
          {activeTab === 1 && (
            <OperatorPanel
              lines={operatorLines}
              stage={stage}
              pipelineRunning={pipelineRunning}
              auditPending={auditPending}
              stats={stats}
            />
          )}
          {activeTab === 2 && (
            <PipelinePanel entries={pipelineEntries} isActive={activeTab === 2} />
          )}
          {activeTab === 3 && (
            <ExecutorPanel lines={executorLines} stage={stage} isActive={activeTab === 3} />
          )}
          {activeTab === 4 && (
            <SystemPanel projectRoot={projectRoot} isActive={activeTab === 4} />
          )}
        </Box>

        {/* Side panel — always visible */}
        <Box width="35%" marginLeft={1}>
          <StatsPanel
            stage={stage}
            stats={stats}
            filesInScope={filesInScope}
            auditPending={auditPending}
            activeModel={activeModel}
          />
        </Box>
      </Box>

      {/* Input bar — no duplicate OperatorPanel here */}
      <InputBar
        onSubmit={handleInput}
        stage={stage}
        pipelineRunning={pipelineRunning}
        auditPending={auditPending}
      />
    </Box>
  );
}
