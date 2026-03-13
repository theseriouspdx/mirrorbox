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
const { findProjectRoot } = require('../src/utils/root');
const { isSelfRunDisallowed, selfRunGuardMessage } = require('../src/cli/startup-checks');

const PACKAGE_ROOT = path.resolve(__dirname, '..');
const INVOCATION_CWD = process.cwd();
const PROJECT_ROOT = process.env.MBO_PROJECT_ROOT || findProjectRoot(INVOCATION_CWD);
const entry = path.join(__dirname, '..', 'src', 'index.js');

function runSetupCommand() {
  require('../src/cli/setup').runSetup().catch(err => { console.error(err); process.exit(1); });
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
  reapStaleHelpers(PACKAGE_ROOT);
  if (isSelfRunDisallowed(INVOCATION_CWD, PACKAGE_ROOT)) {
    process.stderr.write(selfRunGuardMessage(PACKAGE_ROOT));
    process.exit(2);
  }
  const child = spawn(process.execPath, [entry, ...process.argv.slice(2)], {
    stdio: 'inherit',
    env: { ...process.env, MBO_PROJECT_ROOT: PROJECT_ROOT },
    cwd: PROJECT_ROOT,
  });
  child.on('exit', (code) => process.exit(code ?? 0));
}
