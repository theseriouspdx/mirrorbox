#!/usr/bin/env node
/**
 * bin/mbo.js — MBO global CLI entrypoint
 * Registered as both 'mbo' and 'mboalpha' in package.json bin field.
 * Delegates to src/index.js. Runs from process.cwd() (the project root).
 *
 * Install: npm install -g .
 * Usage:   mbo (from any project directory)
 */

'use strict';

const path = require('path');
const { spawn, spawnSync, execSync } = require('child_process');
const fs = require('fs');
const crypto = require('crypto');
const { findProjectRoot } = require('../src/utils/root');
const { isSelfRunDisallowed, selfRunGuardMessage } = require('../src/cli/startup-checks');

const PACKAGE_ROOT = path.resolve(__dirname, '..');
const INVOCATION_CWD = process.cwd();
const PROJECT_ROOT = process.env.MBO_PROJECT_ROOT || findProjectRoot(INVOCATION_CWD);
const entry = path.join(__dirname, '..', 'src', 'index.js');
const HOME_CONFIG_DIR = path.join(require('os').homedir(), '.mbo');
const HOME_CONFIG_PATH = path.join(HOME_CONFIG_DIR, 'config.json');

function printSelfRunWarning(packageRoot) {
  const red = '\x1b[31m';
  const reset = '\x1b[0m';
  process.stderr.write(
    `${red}[MBO WARNING] MBO SHOULD NOT BE RUN FROM THE MBO DIRECTORY.\n` +
    `[MBO WARNING] Controller: ${path.resolve(packageRoot)}${reset}\n`
  );
}

function setSelfRunWarningEnv() {
  const root = path.resolve(PACKAGE_ROOT);
  // BUG-154: Only trigger warning if running from a directory named 'MBO' (case-insensitive)
  if (path.basename(root).toLowerCase() !== 'mbo') return;

  const cwd = path.resolve(INVOCATION_CWD);
  const inController = cwd === root || cwd.startsWith(`${root}${path.sep}`);
  if (!inController) return;

  process.env.MBO_SELF_RUN_WARNING = '1';
  process.env.MBO_SELF_RUN_WARNING_CONTROLLER = root;
}

function warningPromptPrefix() {
  if (process.env.MBO_SELF_RUN_WARNING !== '1') return '';
  return '\x1b[31m[MBO WARNING] MBO SHOULD NOT BE RUN FROM THE MBO DIRECTORY.\n[MBO WARNING] Controller: '
    + `${process.env.MBO_SELF_RUN_WARNING_CONTROLLER || path.resolve(PACKAGE_ROOT)}\x1b[0m\n`;
}

function runSetupCommand() {
  const setup = require('../src/cli/setup');
  const { checkOnboarding } = require('../src/cli/onboarding');
  const { detectProviders } = require('../src/cli/detect-providers');
  const warnedPrompt = warningPromptPrefix();
  Promise.resolve()
    .then(async () => {
      // BUG-085 fix (1): Gate on project-local .mbo/config.json, not global ~/.mbo/config.json.
      // This ensures the setup wizard runs for each new project even on machines that
      // previously ran `mbo setup` for a different project.
      const localConfigPath = path.join(PROJECT_ROOT, '.mbo', 'config.json');
      const hasLocalConfig = fs.existsSync(localConfigPath) && (() => {
        try { JSON.parse(fs.readFileSync(localConfigPath, 'utf8')); return true; } catch { return false; }
      })();

      const providers = await detectProviders();
      const hasRuntimeProvider = !!(
        providers.claudeCLI ||
        providers.geminiCLI ||
        providers.codexCLI ||
        providers.openrouterKey ||
        providers.anthropicKey
      );

      if (!hasLocalConfig || !hasRuntimeProvider) {
        await setup.runSetup();
        // BUG-152: installMCPDaemon is now called INSIDE setup.runSetup()
      } else {
        await checkOnboarding(PROJECT_ROOT);
        await setup.installMCPDaemon(PROJECT_ROOT);
      }

      // Keep setup non-blocking in restricted environments where ~/.mbo is not writable.
      try {
        // BUG-145: setup in a target runtime must not overwrite the canonical
        // controllerRoot once it has been established.
        setup.persistInstallMetadata(HOME_CONFIG_PATH, PACKAGE_ROOT, { force: false });
      } catch (err) {
        process.stderr.write(`[MBO] Warning: unable to write ${HOME_CONFIG_PATH}: ${err.message}\n`);
      }
    })
    .catch(err => { console.error(err); process.exit(1); });

  if (warnedPrompt) {
    process.stderr.write(warnedPrompt);
  }
}

function runTeardownCommand() {
  try {
    require('../src/cli/setup').runTeardown();
    process.stdout.write('[MBO] MCP daemon torn down.\n');
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

function persistInstallMetadataBestEffort() {
  try {
    const setup = require('../src/cli/setup');
    // BUG-145: metadata updates here should be non-destructive.
    // Preserve existing controllerRoot and only backfill when absent.
    setup.persistInstallMetadata(setup.CONFIG_PATH, PACKAGE_ROOT, { force: false });
  } catch {}
}

async function runMcpRecoveryCommand() {
  const setup = require('../src/cli/setup');

  const run = (cmd, args, options = {}) => {
    const res = spawnSync(cmd, args, {
      encoding: 'utf8',
      stdio: options.capture ? 'pipe' : 'inherit',
      cwd: options.cwd || PROJECT_ROOT,
      env: { ...process.env, ...(options.env || {}) },
      timeout: options.timeoutMs || 0,
      killSignal: 'SIGKILL',
    });
    return res;
  };

  const runChecked = (label, cmd, args, options = {}) => {
    process.stdout.write(`[MBO MCP] ${label}: start\n`);
    const res = run(cmd, args, options);
    if (res.error && res.error.code === 'ETIMEDOUT') {
      process.stderr.write(`[MBO MCP] ${label}: timeout after ${options.timeoutMs || 0}ms\n`);
      process.exit(1);
    }
    if ((res.status || 1) !== 0) {
      if (typeof options.acceptFailure === 'function' && options.acceptFailure(res)) {
        process.stdout.write(`[MBO MCP] ${label}: warning (accepted)\n`);
        return res;
      }
      process.stderr.write(`[MBO MCP] ${label}: failed\n`);
      if (res.stderr) process.stderr.write(res.stderr);
      if (res.stdout) process.stderr.write(res.stdout);
      process.exit(1);
    }
    process.stdout.write(`[MBO MCP] ${label}: ok\n`);
    return res;
  };

  process.stdout.write('[MBO MCP] Running MCP recovery sequence...\n');

  // BUG-077/BUG-079: derive project_id using same algorithm as mcp-server.js
  // (sha256 of canonical root, 16-char hex prefix) for manifest validation.
  const canonicalRoot = (() => { try { return fs.realpathSync(PROJECT_ROOT); } catch { return path.resolve(PROJECT_ROOT); } })();
  const projectId = crypto.createHash('sha256').update(Buffer.from(canonicalRoot, 'utf8')).digest('hex').slice(0, 16);

  const parseHealthyBody = (res) => {
    const text = String((res && res.stdout) || '').trim();
    return text && text.includes('"status":"ok"') ? text : null;
  };

  // BUG-077: hoisted so it can be used both inside waitForHealth and in the
  // post-timeout fallback block below. Previously defined inside waitForHealth,
  // making the fallback call at the outer scope a latent ReferenceError.
  // BUG-079: added project_id validation + dead-pid fallback scan.
  const devManifestPath = path.join(PROJECT_ROOT, '.dev/run/mcp.json');
  const userManifestPath = path.join(PROJECT_ROOT, '.mbo/run/mcp.json');

  const isPidAlive = (pid) => {
    try { process.kill(pid, 0); return true; } catch (_) { return false; }
  };

  const readManifest = (manifestPath) => {
    try {
      if (!fs.existsSync(manifestPath)) return null;
      return JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    } catch (_) {
      return null;
    }
  };

  const pickLiveManifest = (runDir) => {
    try {
      if (!fs.existsSync(runDir)) return null;
      const files = fs.readdirSync(runDir)
        .filter((f) => f.startsWith(`mcp-${projectId}-`) && f.endsWith('.json'))
        .map((f) => path.join(runDir, f));

      files.sort((a, b) => {
        try { return fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs; } catch (_) { return 0; }
      });

      for (const fp of files) {
        const m = readManifest(fp);
        if (!m || m.project_id !== projectId || !m.port || !m.pid) continue;
        if (!isPidAlive(m.pid)) continue;
        return m;
      }
    } catch (_) {}
    return null;
  };

  const getPort = () => {
    let m = null;
    for (const mp of [devManifestPath, userManifestPath]) {
      m = readManifest(mp);
      if (m) break;
    }

    // Handle dead PID, dangling symlink target, unreadable manifest, or project mismatch.
    if (!m || m.project_id !== projectId || !m.pid || !isPidAlive(m.pid)) {
      m = pickLiveManifest(path.dirname(devManifestPath)) || pickLiveManifest(path.dirname(userManifestPath));
    }

    if (m && m.project_id === projectId && m.port) return m.port;
    return null;
  };

  const waitForHealth = async (timeoutMs = 30000) => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const port = getPort();
      if (!port) {
        await new Promise((r) => setTimeout(r, 500));
        continue;
      }
      const h = run('curl', ['-sS', '-m', '2', `http://127.0.0.1:${port}/health`], { capture: true });
      const healthy = parseHealthyBody(h);
      if (healthy) return healthy;
      await new Promise((r) => setTimeout(r, 500));
    }
    return null;
  };

  // Check if daemon is already healthy before tearing it down.
  // If healthy, skip teardown/setup to preserve the existing port.
  // If unhealthy, do the full tear-down/setup cycle.
  const preHealthPort = getPort();
  const preHealthUrl  = preHealthPort ? `http://127.0.0.1:${preHealthPort}/health` : null;
  const preHealth     = preHealthUrl ? run('curl', ['-sS', '-m', '3', preHealthUrl], { capture: true }) : null;
  const daemonHealthy = preHealth && !!parseHealthyBody(preHealth);

  if (daemonHealthy) {
    process.stdout.write(`[MBO MCP] daemon already healthy on port ${preHealthPort} — skipping teardown/setup\n`);
    // Refresh client configs in case they drifted (e.g. .mcp.json hand-edited or lost).
    const { updateClientConfigs } = require('../src/utils/update-client-configs');
    updateClientConfigs(PROJECT_ROOT, preHealthPort);
  } else {
    // Best-effort teardown to clear stale launchd state.
    try {
      setup.runTeardown();
      process.stdout.write('[MBO MCP] teardown: ok\n');
    } catch (err) {
      process.stdout.write(`[MBO MCP] teardown: skipped (${err.message})\n`);
    }

    try {
      await setup.installMCPDaemon(PROJECT_ROOT);
      process.stdout.write('[MBO MCP] setup: ok\n');
    } catch (err) {
      process.stderr.write(`[MBO MCP] setup failed: ${err.message}\n`);
      process.exit(1);
    }
  }

  const healthBody = await waitForHealth(30000);
  if (!healthBody) {
    const port = getPort();
    const healthUrl = port ? `http://127.0.0.1:${port}/health` : null;
    const health = healthUrl ? run('curl', ['-sS', '-m', '3', healthUrl], { capture: true }) : { stdout: '', stderr: 'No manifest port available' };
    const finalBody = parseHealthyBody(health) || String(health.stdout || '').trim();
    const finalOk = !!parseHealthyBody(health);
    if (finalOk) {
      process.stdout.write(`[MBO MCP] health: ${finalBody}\n`);
    } else {
      process.stderr.write('[MBO MCP] health check failed\n');
      if (health.stderr) process.stderr.write(health.stderr);
      if (health.stdout) process.stderr.write(health.stdout);

      const stderrLog = path.join(PROJECT_ROOT, '.dev', 'logs', 'mcp-stderr.log');
      try {
        if (fs.existsSync(stderrLog)) {
          const tail = run('tail', ['-n', '40', stderrLog], { capture: true });
          if ((tail.status || 1) === 0 && tail.stdout) {
            process.stderr.write('[MBO MCP] tail .dev/logs/mcp-stderr.log:\n');
            process.stderr.write(tail.stdout);
          }
        }
      } catch {}
      process.exit(1);
    }
  } else {
    process.stdout.write(`[MBO MCP] health: ${healthBody}\n`);
  }

  const rescan = runChecked('graph_rescan', process.execPath, [path.join(PACKAGE_ROOT, 'scripts', 'mcp_query.js'), '--diagnose', 'graph_rescan'], {
    capture: true,
    cwd: PROJECT_ROOT,
    timeoutMs: 180000,
    acceptFailure: (res) => {
      const out = `${res.stdout || ''}\n${res.stderr || ''}`;
      return /completed_with_warnings/.test(out) || /"status"\s*:\s*"completed"/.test(out) || /"result"\s*:\s*\{/.test(out);
    },
  });
  process.stdout.write(`[MBO MCP] graph_rescan: ${String(rescan.stdout || '').trim()}\n`);
  const info = runChecked('graph_server_info', process.execPath, [path.join(PACKAGE_ROOT, 'scripts', 'mcp_query.js'), 'graph_server_info'], {
    capture: true,
    cwd: PROJECT_ROOT,
    timeoutMs: 45000,
    acceptFailure: (res) => {
      const out = `${res.stdout || ''}\n${res.stderr || ''}`;
      return /"project_root"\s*:\s*"\/Users\/johnserious\/MBO"/.test(out) || /"result"\s*:\s*\{/.test(out);
    },
  });
  process.stdout.write(`[MBO MCP] graph_server_info: ${String(info.stdout || '').trim()}\n`);

  const init = runChecked('init_state', 'python3', ['bin/init_state.py'], {
    capture: true,
    cwd: PROJECT_ROOT,
    timeoutMs: 45000,
    acceptFailure: (res) => {
      const out = `${res.stdout || ''}\n${res.stderr || ''}`;
      return /Fortress 2\.0 Baselined/.test(out) || /Merkle Root:/.test(out);
    },
  });
  if (init.stdout) process.stdout.write(init.stdout);

  const status = runChecked('handshake_status', 'python3', ['bin/handshake.py', '--status'], {
    capture: true,
    cwd: PROJECT_ROOT,
    timeoutMs: 45000,
    acceptFailure: (res) => {
      const out = `${res.stdout || ''}\n${res.stderr || ''}`;
      return /\[SESSION\]\s+(Active|Expired|None):/.test(out);
    },
  });
  if (status.stdout) process.stdout.write(status.stdout);

  const integ = runChecked('sqlite_integrity_check', 'sqlite3', [path.join(PROJECT_ROOT, '.mbo', 'mirrorbox.db'), 'PRAGMA integrity_check;'], {
    capture: true,
    timeoutMs: 20000,
    acceptFailure: (res) => {
      const out = `${res.stdout || ''}\n${res.stderr || ''}`;
      return /\bok\b/.test(out);
    },
  });
  process.stdout.write(`[MBO MCP] sqlite integrity_check: ${String(integ.stdout || '').trim()}\n`);

  process.stdout.write('[MBO MCP] Recovery complete.\n');
  process.exit(0);
}

function runAuthCommand(argv) {
  // Auth/config operations are allowed from any repo (including controller).
  // Runtime/init remain guarded by isSelfRunDisallowed.
  const args = argv.slice(3);
  const handshakePath = path.join(PACKAGE_ROOT, 'bin', 'handshake.py');
  const authRoot = path.resolve(PROJECT_ROOT || INVOCATION_CWD);
  const authEnv = { ...process.env, MBO_PROJECT_ROOT: authRoot };

  const normalizeScope = (value) => {
    if (!value || value === '.' || value === '/' || value === 'src') return '.';
    return value;
  };

  const parseActiveScope = (statusText) => {
    const m = String(statusText || '').match(/\[SESSION\]\s+Active:\s+([^\s]+)/);
    return m ? m[1] : null;
  };

  const printStatusAndGetScope = () => {
    const status = spawnSync('python3', [handshakePath, '--status'], {
      env: authEnv,
      encoding: 'utf8',
    });
    if (status.stdout) process.stdout.write(status.stdout);
    if (status.stderr) process.stderr.write(status.stderr);
    if ((status.status ?? 1) !== 0) process.exit(status.status ?? 1);
    return parseActiveScope(status.stdout || '');
  };

  if (!fs.existsSync(handshakePath)) {
    process.stderr.write(`[MBO] ERROR: handshake tool missing at ${handshakePath}\n`);
    process.exit(1);
  }

  // `mbo auth` with no scope behaves like status for clarity.
  if (args.length === 0 || args[0] === 'status' || args[0] === '--status') {
    printStatusAndGetScope();
    process.exit(0);
  }

  const scope = args.find(a => !a.startsWith('--'));
  if (!scope) {
    process.stderr.write('Usage: mbo auth <scope> [--force]\n');
    process.exit(1);
  }

  const allowFlags = new Set(['--force']);
  const passthroughFlags = args.filter(a => a.startsWith('--') && allowFlags.has(a));
  const unknownFlags = args.filter(a => a.startsWith('--') && !allowFlags.has(a));
  if (unknownFlags.length > 0) {
    process.stderr.write(`[MBO] ERROR: Unsupported auth option(s): ${unknownFlags.join(' ')}\n`);
    process.stderr.write('Usage: mbo auth <scope> [--force]\n');
    process.exit(1);
  }

  // Print current session state before attempting auth.
  const activeScope = printStatusAndGetScope();
  const requestedScope = normalizeScope(scope);

  // Toggle behavior: running auth again for the same active scope ends the session.
  if (activeScope && activeScope === requestedScope) {
    process.stderr.write(`[MBO] Active session for '${activeScope}' detected; ending session.\n`);
    const revoke = spawnSync('python3', [handshakePath, '--revoke'], {
      stdio: 'inherit',
      env: authEnv,
    });
    if ((revoke.status ?? 1) !== 0) {
      process.exit(revoke.status ?? 1);
    }
    printStatusAndGetScope();
    process.exit(0);
  }

  const auth = spawnSync('python3', [handshakePath, scope, ...passthroughFlags], {
    stdio: 'inherit',
    env: authEnv,
  });

  if ((auth.status ?? 1) !== 0) {
    process.exit(auth.status ?? 1);
  }

  // Print final state after successful auth.
  printStatusAndGetScope();

  process.exit(0);
}

function getSessionScopedPids(packageRoot) {
  const runDir = path.join(packageRoot, '.dev', 'run');
  const files = ['operator.pid', 'claude.pid', 'gemini.pid', 'probe.pid', 'test.pid'];
  const pids = new Set();
  for (const file of files) {
    const full = path.join(runDir, file);
    try {
      if (!fs.existsSync(full)) continue;
      const n = parseInt(fs.readFileSync(full, 'utf8').trim(), 10);
      if (Number.isFinite(n) && n > 1) pids.add(n);
    } catch {}
  }
  return pids;
}

function reapStaleHelpers(packageRoot) {
  const graceMs = parseInt(process.env.MBO_STALE_GRACE_MS || '120000', 10);
  const protectedPids = getSessionScopedPids(packageRoot);

  const needles = [
    `${packageRoot}/scripts/rebuild-mirror.js`,
    `${packageRoot}/scripts/mbo-session-close.sh`,
    `${packageRoot}/src/index.js auth src`,
    `${packageRoot}/node_modules/.bin/typescript-language-server --stdio`,
  ];

  let table = '';
  let parser = null;
  try {
    table = execSync('ps -axo pid=,etimes=,command=', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    });
    parser = (line) => {
      const m = line.match(/^(\d+)\s+(\d+)\s+(.*)$/);
      if (!m) return null;
      return { pid: parseInt(m[1], 10), elapsedMs: parseInt(m[2], 10) * 1000, cmd: m[3] };
    };
  } catch {
    try {
      // macOS/BSD ps fallback: elapsed wall clock in [[dd-]hh:]mm:ss format.
      table = execSync('ps -axo pid=,etime=,command=', { encoding: 'utf8' });
      parser = (line) => {
        const m = line.match(/^(\d+)\s+([^\s]+)\s+(.*)$/);
        if (!m) return null;
        const toMs = (etime) => {
          let days = 0;
          let rest = etime;
          if (etime.includes('-')) {
            const parts = etime.split('-', 2);
            days = parseInt(parts[0], 10) || 0;
            rest = parts[1];
          }
          const segs = rest.split(':').map((v) => parseInt(v, 10) || 0);
          let h = 0, min = 0, s = 0;
          if (segs.length === 3) [h, min, s] = segs;
          else if (segs.length === 2) [min, s] = segs;
          else if (segs.length === 1) s = segs[0];
          return ((((days * 24) + h) * 60 + min) * 60 + s) * 1000;
        };
        return { pid: parseInt(m[1], 10), elapsedMs: toMs(m[2]), cmd: m[3] };
      };
    } catch {
      return;
    }
  }

  const pids = [];
  for (const line of table.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const parsed = parser ? parser(trimmed) : null;
    if (!parsed) continue;
    const { pid, elapsedMs, cmd } = parsed;
    if (!Number.isFinite(pid) || pid === process.pid) continue;
    if (protectedPids.has(pid)) continue;
    if (needles.some((needle) => cmd.includes(needle))) {
      // Only reap clearly stale helpers, never fresh active ones.
      if (!Number.isFinite(elapsedMs) || elapsedMs < graceMs) continue;

      // Extra safety for language server: only reap if no active MBO operator session.
      if (cmd.includes('typescript-language-server')) {
        const operatorAlive = Array.from(protectedPids).some((opPid) => {
          try {
            process.kill(opPid, 0);
            return true;
          } catch {
            return false;
          }
        });
        if (operatorAlive) continue;
      }

      pids.push(pid);
    }
  }

  if (pids.length === 0) return;

  for (const pid of pids) {
    try { process.kill(pid, 'SIGTERM'); } catch {}
  }

  const deadline = Date.now() + 1500;
  while (Date.now() < deadline) {
    const alive = pids.filter((pid) => {
      try {
        process.kill(pid, 0);
        return true;
      } catch {
        return false;
      }
    });
    if (alive.length === 0) break;
  }

  for (const pid of pids) {
    try {
      process.kill(pid, 0);
      process.kill(pid, 'SIGKILL');
    } catch {}
  }

  process.stderr.write(`[MBO] Recovered ${pids.length} stale helper process(es).\n`);
}

// BUG-084: Self-heal missing/incomplete node_modules before any command dispatch.
function ensureNodeModules() {
  const lockFile = path.join(PACKAGE_ROOT, 'node_modules', '.package-lock.json');
  if (fs.existsSync(lockFile)) return;
  process.stdout.write('[MBO] node_modules missing or incomplete — running npm install...\n');
  const result = spawnSync('npm', ['install', '--prefix', PACKAGE_ROOT], { stdio: 'inherit' });
  if ((result.status || 0) !== 0) {
    process.stderr.write('[MBO] npm install failed. Please run `npm install` manually.\n');
    process.exit(1);
  }
}

ensureNodeModules();

if (process.argv[2] === 'setup') {
  if (path.basename(INVOCATION_CWD) === 'MBO') {
    process.stderr.write(selfRunGuardMessage(PACKAGE_ROOT));
    process.exit(1);
  }
  setSelfRunWarningEnv();
  runSetupCommand();
} else if (process.argv[2] === 'teardown') {
  runTeardownCommand();
} else if (process.argv[2] === 'mcp') {
  runMcpRecoveryCommand();
} else if (process.argv[2] === 'auth') {
  // Auth/config operations are global and allowed from any directory.
  runAuthCommand(process.argv);
} else if (process.argv[2] === 'init') {
  if (isSelfRunDisallowed(INVOCATION_CWD, PACKAGE_ROOT)) {
    setSelfRunWarningEnv();
  }
  const { initProject } = require('../src/cli/init-project');
  initProject(INVOCATION_CWD);
} else {
  persistInstallMetadataBestEffort();
  reapStaleHelpers(PACKAGE_ROOT);
  if (isSelfRunDisallowed(INVOCATION_CWD, PACKAGE_ROOT)) {
    // Invariants 1 & 2: Proactively lock src/ in managed projects (including worktrees)
    // to prevent unauthorized writes when no session is active.
    spawnSync('python3', [path.join(PACKAGE_ROOT, 'bin', 'handshake.py'), '--revoke'], {
      env: { ...process.env, MBO_PROJECT_ROOT: PROJECT_ROOT },
    });
    setSelfRunWarningEnv();
  }
  // Task 1.1-H28: Persistent Operator Loop
  function spawnOperator() {
    const child = spawn(process.execPath, [entry, ...process.argv.slice(2)], {
      stdio: 'inherit',
      env: { ...process.env, MBO_PROJECT_ROOT: PROJECT_ROOT },
      cwd: PROJECT_ROOT,
    });
    child.on('exit', (code) => {
      if (code !== 0 && code !== null) {
        process.stderr.write(`[MBO] Operator exited with code ${code}. Respawning...\n`);
        setTimeout(spawnOperator, 1000);
      } else {
        process.exit(0);
      }
    });
  }
  spawnOperator();
}
