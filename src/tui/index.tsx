#!/usr/bin/env tsx
/**
 * MBO TUI — Entry point
 * Initialises the MBO Operator, wires the relay listener, then mounts the Ink app.
 * Mirrors the startup sequence in src/index.js but renders via Ink instead of readline.
 */
import React from 'react';
import { render } from 'ink';
import { createRequire } from 'module';
import path from 'path';
import fs from 'fs';
import { App } from './App.js';

const require = createRequire(import.meta.url);

// ── Resolve MBO root and project root ─────────────────────────────────────────
const MBO_ROOT      = path.resolve(import.meta.dirname, '../..');
const pkg           = require(path.join(MBO_ROOT, 'package.json'));
const { findProjectRoot } = require(path.join(MBO_ROOT, 'src/utils/root'));
const PROJECT_ROOT  = process.env.MBO_PROJECT_ROOT || findProjectRoot(process.cwd()) || process.cwd();
process.env.MBO_PROJECT_ROOT = PROJECT_ROOT;

// ── Guard: don't run from the MBO controller repo itself ──────────────────────
const { isSelfRunDisallowed, selfRunGuardMessage } = require(path.join(MBO_ROOT, 'src/cli/startup-checks'));
if (isSelfRunDisallowed(process.cwd(), MBO_ROOT)) {
  process.stderr.write(selfRunGuardMessage(MBO_ROOT));
  process.exit(1);
}

// ── Imports ───────────────────────────────────────────────────────────────────
const { validateConfig, runSetup, installMCPDaemon } = require(path.join(MBO_ROOT, 'src/cli/setup'));
const { detectProviders }  = require(path.join(MBO_ROOT, 'src/cli/detect-providers'));
const { checkOnboarding }  = require(path.join(MBO_ROOT, 'src/cli/onboarding'));
const { initProject }      = require(path.join(MBO_ROOT, 'src/cli/init-project'));
const { Operator }         = require(path.join(MBO_ROOT, 'src/auth/operator'));
const relay                = require(path.join(MBO_ROOT, 'src/relay/relay-listener'));
const statsManager         = require(path.join(MBO_ROOT, 'src/state/stats-manager'));
const { fetchPricing }     = require(path.join(MBO_ROOT, 'src/utils/pricing'));

async function main() {
  // ── Pre-flight ────────────────────────────────────────────────────────────
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
    process.stderr.write(`[MBO TUI] Missing local config at ${localConfigPath}. Run "mbo setup" from this project.\n`);
    process.exit(13);
  }

  await checkOnboarding(PROJECT_ROOT);
  await fetchPricing();
  statsManager.stats.sessions = (statsManager.stats.sessions || 0) + 1;
  statsManager.save();

  // ── Start MCP daemon (same as normal mbo startup) ─────────────────────────
  try {
    await installMCPDaemon(PROJECT_ROOT);
  } catch (err: any) {
    process.stderr.write(`[MBO TUI] Warning: MCP daemon start failed: ${err?.message}\n`);
    process.stderr.write('[MBO TUI] Graph features may be unavailable. Continuing...\n');
    await new Promise(r => setTimeout(r, 1500)); // brief pause so user sees warning
  }

  // ── Boot operator ─────────────────────────────────────────────────────────
  const operator = new Operator('runtime');
  try {
    await operator.startMCP();
  } catch (err: any) {
    process.stderr.write(`[MBO TUI] Warning: operator MCP connect failed: ${err?.message}\n`);
    // Continue — operator can still function for non-graph tasks
  }
  relay.start();

  // ── Terminal cleanup on exit ──────────────────────────────────────────────
  const cleanup = async () => {
    try { relay.stop(); } catch { /* ignore */ }
    try { await operator.shutdown(); } catch { /* ignore */ }
    // Restore cursor and normal mode — Ink should do this but belt-and-suspenders
    process.stdout.write('\x1b[?25h');   // show cursor
    process.stdout.write('\x1b[?1002l'); // disable mouse
  };
  process.on('exit',    cleanup);
  process.on('SIGINT',  () => { cleanup().then(() => process.exit(0)); });
  process.on('SIGTERM', () => { cleanup().then(() => process.exit(0)); });

  // ── Mount Ink app ─────────────────────────────────────────────────────────
  const { waitUntilExit } = render(
    <App
      operator={operator}
      statsManager={statsManager}
      pkg={pkg}
      projectRoot={PROJECT_ROOT}
    />,
    {
      exitOnCtrlC: false, // We handle Ctrl+C ourselves via useInput
    }
  );

  await waitUntilExit();
  await cleanup();
  process.exit(0);
}

main().catch((err) => {
  process.stderr.write(`[MBO TUI] Fatal: ${err?.message || err}\n`);
  process.exit(1);
});
