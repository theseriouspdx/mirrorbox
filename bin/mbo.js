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

function runSetupCommand() {
  const setup = require('../src/cli/setup');
  Promise.resolve()
    .then(async () => {
      const hasConfig = setup.validateConfig();
      if (!hasConfig) {
        await setup.runSetup();
      }
      setup.persistInstallMetadata(setup.CONFIG_PATH, PACKAGE_ROOT, { force: true });
    })
    .then(() => setup.installMCPDaemon(PROJECT_ROOT))
    .then(() => {
      process.stdout.write('[MBO] MCP daemon ready. Port written to .dev/run/mcp.json\n');
    })
    .catch(err => { console.error(err); process.exit(1); });
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
    let force = false;
    try {
      const raw = fs.existsSync(setup.CONFIG_PATH)
        ? fs.readFileSync(setup.CONFIG_PATH, 'utf8')
        : '';
      const cfg = raw ? JSON.parse(raw) : {};
      const existing = typeof cfg.controllerRoot === 'string' ? path.resolve(cfg.controllerRoot) : null;
      const pkgRoot = path.resolve(PACKAGE_ROOT);
      const invCwd = path.resolve(INVOCATION_CWD);
      // Self-heal stale config when controllerRoot drifted away from the actual controller.
      force = !existing || (invCwd === pkgRoot && existing !== pkgRoot) || (existing === invCwd && existing !== pkgRoot);
    } catch {
      force = true;
    }
    setup.persistInstallMetadata(setup.CONFIG_PATH, PACKAGE_ROOT, { force });
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
  const getPort = () => {
    try {
      let m = null;
      for (const mp of [devManifestPath, userManifestPath]) {
        if (fs.existsSync(mp)) { m = JSON.parse(fs.readFileSync(mp, 'utf8')); break; }
      }
      // If symlink manifest's pid is dead, scan dir for a live pid-specific manifest.
      if (m && m.pid) {
        let pidAlive = false;
        try { process.kill(m.pid, 0); pidAlive = true; } catch (_) {}
        if (!pidAlive) {
          m = null;
          const runDir = path.dirname(devManifestPath);
          if (fs.existsSync(runDir)) {
            for (const f of fs.readdirSync(runDir)) {
              if (!f.startsWith('mcp-') || f === 'mcp.json' || !f.endsWith('.json')) continue;
              try {
                const c = JSON.parse(fs.readFileSync(path.join(runDir, f), 'utf8'));
                if (c.project_id !== projectId) continue;
                try { process.kill(c.pid, 0); } catch (_) { continue; }
                m = c;
                break;
              } catch (_) {}
            }
          }
        }
      }
      if (m && m.project_id === projectId && m.port) return m.port;
    } catch (_) {}
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
      return /completed_with_warnings/.test(out);
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

  const normalizeScope = (value) => {
    if (!value || value === '.' || value === '/' || value === 'src') return 'src';
    return value;
  };

  const parseActiveScope = (statusText) => {
    const m = String(statusText || '').match(/\[SESSION\]\s+Active:\s+([^\s]+)/);
    return m ? m[1] : null;
  };

  const printStatusAndGetScope = () => {
    const status = spawnSync('python3', [handshakePath, '--status'], {
      env: process.env,
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
      env: process.env,
    });
    if ((revoke.status ?? 1) !== 0) {
      process.exit(revoke.status ?? 1);
    }
    printStatusAndGetScope();
    process.exit(0);
  }

  const auth = spawnSync('python3', [handshakePath, scope, ...passthroughFlags], {
    stdio: 'inherit',
    env: process.env,
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
  try {
    table = execSync('ps -axo pid=,etimes=,command=', { encoding: 'utf8' });
  } catch {
    return;
  }

  const pids = [];
  for (const line of table.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const match = trimmed.match(/^(\d+)\s+(\d+)\s+(.*)$/);
    if (!match) continue;
    const pid = parseInt(match[1], 10);
    const etimes = parseInt(match[2], 10);
    const cmd = match[3];
    if (!Number.isFinite(pid) || pid === process.pid) continue;
    if (protectedPids.has(pid)) continue;
    if (needles.some((needle) => cmd.includes(needle))) {
      // Only reap clearly stale helpers, never fresh active ones.
      if (!Number.isFinite(etimes) || etimes * 1000 < graceMs) continue;

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

if (process.argv[2] === 'setup') {
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
    process.stderr.write(selfRunGuardMessage(PACKAGE_ROOT));
    process.exit(2);
  }
  const { initProject } = require('../src/cli/init-project');
  initProject(INVOCATION_CWD);
} else {
  persistInstallMetadataBestEffort();
  reapStaleHelpers(PACKAGE_ROOT);
  if (isSelfRunDisallowed(INVOCATION_CWD, PACKAGE_ROOT)) {
    process.stderr.write(selfRunGuardMessage(PACKAGE_ROOT));
    process.exit(2);
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
