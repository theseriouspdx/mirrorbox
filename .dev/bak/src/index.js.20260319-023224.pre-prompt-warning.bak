// Sovereign Loop v1.0-09
const readline = require('readline');
const fs   = require('fs');
const os   = require('os');
const path = require('path');
const { findProjectRoot } = require('./utils/root');
const { validateConfig, runSetup } = require('./cli/setup');
const { initProject } = require('./cli/init-project');
const { detectProviders } = require('./cli/detect-providers');
const { checkOnboarding } = require('./cli/onboarding');
const { fetchPricing } = require('./utils/pricing');
const dashboard = require('./cli/tokenmiser-dashboard');
const statsManager = require('./state/stats-manager');
const pkg = require('../package.json');

// §28.1 & 28.7: Step 1: Authoritative Root Resolution
const resolvedRoot = process.env.MBO_PROJECT_ROOT || findProjectRoot();
if (!resolvedRoot) {
  process.stderr.write('ERROR: Could not resolve MBO project root (no .mbo directory or .git found in parents).\n');
  process.exit(1);
}
const PROJECT_ROOT = path.resolve(resolvedRoot);
process.env.MBO_PROJECT_ROOT = PROJECT_ROOT;

const { Operator } = require('./auth/operator');
const relay = require('./relay/relay-listener');

function formatOperatorResult(result) {
  if (!result || typeof result !== 'object') {
    return String(result || 'No response.');
  }

  const status = String(result.status || '').toLowerCase();

  if (status === 'sandbox_intercept') return result.message || 'Input sent to sandbox.';
  if (result.needsClarification && result.question) return `Clarification needed: ${result.question}`;
  if (status === 'spec_refinement_updated') return result.prompt || 'Spec refinement updated. Type "go" to run autonomous DID.';
  if (status === 'ready' && result.prompt) return result.prompt;
  if (status === 'ready_for_planning') return 'Task classified and routing complete. Type "go" to proceed.';
  if (status === 'plan_agreed') return 'Planning complete. Ready for code derivation.';
  if (status === 'code_agreed') return 'Code derivation complete. Running dry run and verification.';
  if (status === 'pass') return 'Dry run passed.';
  if (status === 'audit_pending') return result.prompt || 'Audit package ready. Respond "approved" or "reject".';
  if (status === 'blocked') return result.reason || result.prompt || 'Task is blocked by spec refinement assumptions.\n[RECOMMENDED ACTION]: Decompose the task or resolve the listed blockers.';
  if (status === 'aborted') return result.reason || 'Operation aborted.\n[RECOMMENDED ACTION]: You can retry with a different task or refine the current one.';
  if (status === 'error') return result.reason || 'Pipeline failed.\n[RECOMMENDED ACTION]: Check .dev/logs/mcp-stderr.log or retry the task with a hint.';
  if (status === 'shutdown_complete') return 'Session shutdown complete.';

  const stage = String(result.stage || '').toLowerCase();
  if (stage === 'classification') return 'Classifying request and determining routing.';
  if (stage === 'context_pinning') return 'Spec refinement complete. Assumptions reviewed.';
  if (stage === 'planning') return 'Planning in progress.';
  if (stage === 'tiebreaker_plan') return 'Resolving planning conflict via tiebreaker.';
  if (stage === 'code_derivation') return 'Code derivation in progress.';
  if (stage === 'dry_run') return 'Running dry run checks.';
  if (stage === 'implement') return 'Applying implementation changes.';
  if (stage === 'audit_gate') return 'Audit gate reached. Awaiting approval decision.';
  if (stage === 'state_sync') return 'State sync in progress.';
  if (stage === 'knowledge_update') return 'Updating knowledge graph context.';

  if (typeof result.prompt === 'string' && result.prompt.trim()) return result.prompt;
  if (typeof result.reason === 'string' && result.reason.trim()) return result.reason;

  return 'Operator update received.';
}
async function main() {
  const SAFE_EXIT_COMMANDS = new Set(['end session', 'exit', 'quit']);

  // §28.5 Step 2 & 28.8: Validate machine config + non-TTY guard
  if (!validateConfig()) {
    if (!process.stdout.isTTY) {
      process.stderr.write('ERROR: Non-TTY launch with missing/corrupt ~/.mbo/config.json\n');
      process.stderr.write('Run `mbo setup` in an interactive shell first.\n');
      process.exit(1);
    }
    await runSetup();
  }

  // §28.5 Step 3: Detect providers/credentials
  const providers = await detectProviders();
  if (!providers.claudeCLI && !providers.geminiCLI && !providers.codexCLI && !providers.openrouterKey && !providers.anthropicKey) {
    process.stderr.write('ERROR: No model providers or API keys detected. Run "mbo setup" or set environment variables.\n');
    process.exit(1);
  }

  // §28.5 Step 4: Initialize .mbo/ scaffolding and .gitignore
  initProject(PROJECT_ROOT);

  // §28.5 Step 5 & 6: Run/check onboarding and version re-onboard
  const needsOnboarding = await checkOnboarding(PROJECT_ROOT);
  if (needsOnboarding && !process.stdout.isTTY) {
    process.stderr.write('ERROR: Non-TTY launch requires onboarding but no onboarding.json found.\n');
    process.exit(1);
  }

  // §28.5 Step 7: Start operator
  const operator = new Operator('runtime');
  await operator.startMCP();

  // §24.7: Start Relay listener for Subject → Mirror telemetry
  relay.start();

  // Task 1.1-H09: Fetch pricing and increment session counter
  await fetchPricing();
  if (typeof statsManager.stats.sessions !== 'number') statsManager.stats.sessions = 0;
  statsManager.stats.sessions++;
  statsManager.save();

  // Task 1.1-VERSIONING-GRANULAR: Dynamic UTC versioning
  const now = new Date();
  const yyyymmdd = now.getUTCFullYear().toString() +
    String(now.getUTCMonth() + 1).padStart(2, '0') +
    String(now.getUTCDate()).padStart(2, '0');
  const hhmm = String(now.getUTCHours()).padStart(2, '0') +
    String(now.getUTCMinutes()).padStart(2, '0');
  const fullVersion = `${pkg.version}-${yyyymmdd}.${hhmm}`;

  console.log(`MBO Engine v${fullVersion} initialized. [ctrl+f to focus sandbox, SHIFT+T for stats]`);

  readline.emitKeypressEvents(process.stdin);
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true,
    prompt: `MBO v${fullVersion}> `
  });

  rl.prompt();

  // Section 33: Agent Output Streaming
  let lastStreamingRole = null;
  operator.onChunk = ({ role, chunk, sequence }) => {
    if (role !== lastStreamingRole) {
      process.stdout.write(`\n\x1b[1m\x1b[35m[${role}]\x1b[0m `);
      lastStreamingRole = role;
    }
    process.stdout.write(chunk);
  };

  process.stdin.on('keypress', (str, key) => {
    // SHIFT+T (toggle stats overlay)
    if (key.shift && key.name === 't') {
      dashboard.toggleOverlay(rl);
      return;
    }
    // ctrl+f (focus sandbox)
    if (key.ctrl && key.name === 'f') {
      const state = operator.toggleSandboxFocus();
      process.stdout.write(`\n[SYSTEM] Sandbox focus: ${state ? 'ENABLED' : 'DISABLED'}\n`);
      rl.prompt();
    }
    // ctrl+c (exit)
    if (key.ctrl && key.name === 'c') {
      rl.close();
    }
  });

  // §34.4: Proactive write helper.
  const write = (msg) => {
    process.stdout.write('\n' + String(msg) + '\n');
    rl.prompt(true);
  };

  // Runtime continuity: emit periodic alive/progress updates during long model work.
  const aliveFrames = ['|', '/', '-', '\\'];
  let aliveTick = 0;
  const aliveTimer = setInterval(() => {
    if (!operator._pipelineRunning) return;
    const stage = operator.stateSummary.currentStage || 'working';
    const task = operator.stateSummary.currentTask || 'processing request';
    const frame = aliveFrames[aliveTick % aliveFrames.length];
    aliveTick += 1;
    process.stdout.write(`\r[ALIVE ${frame}] ${stage}: ${String(task).slice(0, 88)}    `);
  }, 1200);

  let _auditRunning = false;
  let _spinnerTimer = null;
  let _spinnerFrame = 0;
  let _lastSpinnerText = '';
  const _spinnerGlyphs = ['|', '/', '-', '\\'];

  const stageLabel = () => {
    const s = String(operator.stateSummary.currentStage || 'working').toLowerCase();
    if (s === 'classification') return 'classifying request';
    if (s === 'context_pinning') return 'checking assumptions';
    if (s === 'planning') return 'deriving plan';
    if (s === 'tiebreaker_plan') return 'resolving plan conflict';
    if (s === 'code_derivation') return 'deriving code';
    if (s === 'tiebreaker_code') return 'resolving code conflict';
    if (s === 'dry_run') return 'running dry run';
    if (s === 'implement') return 'applying changes';
    if (s === 'audit_gate') return 'awaiting audit decision';
    if (s === 'state_sync') return 'syncing state';
    if (s === 'knowledge_update') return 'updating graph';
    return 'working';
  };

  const startSpinner = () => {
    if (_spinnerTimer) return;
    _spinnerFrame = 0;
    _spinnerTimer = setInterval(() => {
      if (!operator._pipelineRunning) return;
      const glyph = _spinnerGlyphs[_spinnerFrame % _spinnerGlyphs.length];
      _spinnerFrame += 1;
      const text = `[OPERATOR] ${glyph} ${stageLabel()}...`;
      _lastSpinnerText = text;
      process.stdout.write(`\r${text}`);
    }, 220);
  };

  const stopSpinner = () => {
    if (_spinnerTimer) {
      clearInterval(_spinnerTimer);
      _spinnerTimer = null;
    }
    if (_lastSpinnerText) {
      process.stdout.write('\r' + ' '.repeat(_lastSpinnerText.length) + '\r');
      _lastSpinnerText = '';
    }
  };

  rl.on('line', (line) => {
    const trimmed = line.trim();
    if (!trimmed && !operator.sandboxFocus) {
      rl.prompt();
      return;
    }

    // Reset streaming state for new task
    lastStreamingRole = null;

    // §34.2: Status, stop, and session continuity — bypass pipeline guard.
    const lower = trimmed.toLowerCase();
    if (lower === 'status' || lower === "what's going on?") {
      write(operator.getStatus());
      return;
    }
    if (lower === 'history' || lower === 'what were we working on last time') {
      write(`Last Task: ${operator.stateSummary.progressSummary || 'none'}`);
      return;
    }
    if (lower === 'stop' || lower === 'abort' || lower === "stop what you're doing") {
      operator.requestAbort();
      write('[OPERATOR] Abort requested. Hard-killing active model tasks...');
      return;
    }

    // Steering Integration: Catch input when pipeline is running
    if (operator._pipelineRunning) {
      operator.userHintBuffer.push(trimmed);
      write('[OPERATOR] User hint captured. It will be injected into the next iteration.');
      return;
    }

    // §6A Audit Gate: resolve pending audit before processing new input
    if (operator.stateSummary && operator.stateSummary.pendingAudit) {
      if (_auditRunning) {
        write('[AUDIT] Audit operation already in progress — please wait.');
        return;
      }
      if (trimmed === 'approved') {
        const ctx = operator.stateSummary.pendingAuditContext || {};
        _auditRunning = true;
        operator.runStage8(ctx.classification || {}, ctx.routing || {})
          .then(() => {
            operator.stateSummary.pendingAudit = null;
            operator.stateSummary.pendingAuditContext = null;
            _auditRunning = false;
            write('[AUDIT] Approved. State synced. Intelligence graph updated.');
          })
          .catch(err => {
            _auditRunning = false;
            write(`[AUDIT ERROR] ${err.message}`);
          });
      } else if (trimmed === 'reject') {
        const files = operator.stateSummary.pendingAudit.modifiedFiles || [];
        _auditRunning = true;
        operator.runStage7Rollback(files)
          .then(() => {
            operator.stateSummary.pendingAudit = null;
            _auditRunning = false;
            write('[AUDIT] Rejected. Rolled back. Type "go" to retry.');
          })
          .catch(err => {
            _auditRunning = false;
            write(`[AUDIT ERROR] ${err.message}`);
          });
      } else {
        write('[AUDIT] Pending audit — respond "approved" or "reject".');
      }
      return;
    }

    // §34: Fire pipeline as background task — input loop remains unblocked.
    operator._pipelineRunning = true;
    startSpinner();

    operator.processMessage(trimmed)
      .then(result => {
        stopSpinner();
        operator._pipelineRunning = false;
        if (result && result.status !== 'started') {
          if (lastStreamingRole) process.stdout.write('\n');
          write(dashboard.renderHeader() + '\n' + formatOperatorResult(result));
        }
      })
      .catch(err => {
        stopSpinner();
        operator._pipelineRunning = false;
        write(`[OPERATOR] I hit an error and kept session control.\nIssue: ${err.message}\n[RECOMMENDED ACTION]: Fix the issue above, then type 'go' to continue.`);
      });

    if (SAFE_EXIT_COMMANDS.has(lower)) {
      stopSpinner();
    }
  });

  rl.on('close', async () => {
    clearInterval(aliveTimer);
    await operator.shutdown();
    relay.stop();
    process.exit(0);
  });
}

main().catch(console.error);
