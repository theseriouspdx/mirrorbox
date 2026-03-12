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

async function main() {
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
  statsManager.stats.sessions++;
  statsManager.save();

  console.log("MBO Engine v0.1.0 initialized. [ctrl+f to focus sandbox, SHIFT+T for stats]");

  readline.emitKeypressEvents(process.stdin);
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
  }

  const rl = readline.createInterface({ 
    input: process.stdin, 
    output: process.stdout, 
    terminal: true,
    prompt: 'MBO> '
  });

  rl.prompt();

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
      process.exit();
    }
  });

  rl.on('line', async (line) => {
    const trimmed = line.trim();
    if (!trimmed && !operator.sandboxFocus) {
      rl.prompt();
      return;
    }

    // §6A Audit Gate: resolve pending audit before processing new input
    if (operator.stateSummary && operator.stateSummary.pendingAudit) {
      if (trimmed === 'approved') {
        const ctx = operator.stateSummary.pendingAuditContext || {};
        await operator.runStage8(ctx.classification || {}, ctx.routing || {});
        operator.stateSummary.pendingAudit = null;
        operator.stateSummary.pendingAuditContext = null;
        process.stdout.write('[AUDIT] Approved. State synced.\n');
      } else if (trimmed === 'reject') {
        const files = operator.stateSummary.pendingAudit.modifiedFiles || [];
        await operator.runStage7Rollback(files);
        operator.stateSummary.pendingAudit = null;
        process.stdout.write('[AUDIT] Rejected. Rolled back. Re-entering Stage 3.\n');
      } else {
        process.stdout.write('[AUDIT] Pending audit — respond "approved" or "reject".\n');
      }
      rl.prompt();
      return;
    }

    const result = await operator.processMessage(trimmed);
    process.stdout.write(dashboard.renderHeader());
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    rl.prompt();
  });

  rl.on('close', async () => {
    await operator.shutdown();
    relay.stop();
    process.exit(0);
  });
}

main().catch(console.error);
