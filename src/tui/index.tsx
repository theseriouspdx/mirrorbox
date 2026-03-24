#!/usr/bin/env tsx
import React from 'react';
import { render } from 'ink';
import { createRequire } from 'module';
import path from 'path';
import fs from 'fs';
import { App } from './App.js';

const require = createRequire(import.meta.url);

const MBO_ROOT = path.resolve(import.meta.dirname, '../..');
const pkg = require(path.join(MBO_ROOT, 'package.json'));
const { findProjectRoot } = require(path.join(MBO_ROOT, 'src/utils/root'));
const PROJECT_ROOT = process.env.MBO_PROJECT_ROOT || findProjectRoot(process.cwd()) || process.cwd();
process.env.MBO_PROJECT_ROOT = PROJECT_ROOT;

const { isSelfRunDisallowed, selfRunGuardMessage } = require(path.join(MBO_ROOT, 'src/cli/startup-checks'));
if (isSelfRunDisallowed(process.cwd(), MBO_ROOT)) {
  process.stderr.write(selfRunGuardMessage(MBO_ROOT));
  process.exit(1);
}

const { validateConfig, runSetup, installMCPDaemon } = require(path.join(MBO_ROOT, 'src/cli/setup'));
const { detectProviders } = require(path.join(MBO_ROOT, 'src/cli/detect-providers'));
const { checkOnboarding } = require(path.join(MBO_ROOT, 'src/cli/onboarding'));
const { initProject } = require(path.join(MBO_ROOT, 'src/cli/init-project'));
const { Operator } = require(path.join(MBO_ROOT, 'src/auth/operator'));
const relay = require(path.join(MBO_ROOT, 'src/relay/relay-listener'));
const statsManager = require(path.join(MBO_ROOT, 'src/state/stats-manager'));
const eventStore = require(path.join(MBO_ROOT, 'src/state/event-store'));
const { fetchPricing } = require(path.join(MBO_ROOT, 'src/utils/pricing'));
const { startSessionLog } = require(path.join(MBO_ROOT, 'src/utils/session-log'));

async function main() {
  if (!validateConfig()) {
    process.stderr.write('[MBO TUI] Global config missing. Run "mbo setup" first.\n');
    process.exit(10);
  }

  const providers = await detectProviders();
  const hasProvider = !!(providers.claudeCLI || providers.geminiCLI || providers.codexCLI || providers.openrouterKey || providers.anthropicKey);
  if (!hasProvider) {
    process.stderr.write('[MBO TUI] No model providers detected. Run "mbo setup".\n');
    process.exit(11);
  }

  initProject(PROJECT_ROOT);

  const localConfigPath = path.join(PROJECT_ROOT, '.mbo', 'config.json');
  if (!fs.existsSync(localConfigPath)) {
    process.stderr.write('[MBO TUI] Missing local config at ' + localConfigPath + '. Run "mbo setup" from this project.\n');
    process.exit(13);
  }

  await checkOnboarding(PROJECT_ROOT);
  await fetchPricing();
  statsManager.startSession({ runId: eventStore.RUN_ID });
  const sessionLog = startSessionLog({ projectRoot: PROJECT_ROOT, runId: eventStore.RUN_ID, mode: 'tui' });
  sessionLog.writeMeta('tui initialized');

  try {
    await installMCPDaemon(PROJECT_ROOT);
  } catch (err: any) {
    process.stderr.write('[MBO TUI] Warning: MCP daemon start failed: ' + (err?.message || String(err)) + '\n');
    process.stderr.write('[MBO TUI] Graph features may be unavailable. Continuing...\n');
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }

  const operator = new Operator('runtime');
  try {
    await operator.startMCP();
  } catch (err: any) {
    process.stderr.write('[MBO TUI] Warning: operator MCP connect failed: ' + (err?.message || String(err)) + '\n');
  }
  relay.start();

  let pendingSetup = false;
  let cleanedUp = false;

  const cleanup = async () => {
    if (cleanedUp) return;
    cleanedUp = true;
    try { relay.stop(); } catch {}
    try { await operator.shutdown(); } catch {}
    sessionLog.writeMeta('tui cleanup');
    sessionLog.close();
    process.stdout.write('\x1b[?25h');
  };

  process.on('exit', cleanup);
  process.on('SIGINT', () => { cleanup().then(() => process.exit(0)); });
  process.on('SIGTERM', () => { cleanup().then(() => process.exit(0)); });

  const MIN_COLS = 80;
  const MIN_ROWS = 24;
  if (process.stdout.isTTY) {
    const cols = process.stdout.columns || 0;
    const rows = process.stdout.rows || 0;
    if (cols < MIN_COLS || rows < MIN_ROWS) {
      process.stdout.write(`\x1b[8;${Math.max(rows, MIN_ROWS)};${Math.max(cols, MIN_COLS)}t`);
      await new Promise((res) => setTimeout(res, 100));
    }
  }

  const { waitUntilExit, unmount } = render(
    <App
      operator={operator}
      statsManager={statsManager}
      pkg={pkg}
      projectRoot={PROJECT_ROOT}
      onSetupRequest={() => {
        pendingSetup = true;
        unmount();
      }}
    />,
    { stdin: process.stdin, exitOnCtrlC: false }
  );

  await waitUntilExit();
  await cleanup();

  if (pendingSetup) {
    await runSetup();
    return;
  }

  process.exit(0);
}

main().catch((err) => {
  process.stderr.write('[MBO TUI] Fatal: ' + (err?.message || err) + '\n');
  process.exit(1);
});
