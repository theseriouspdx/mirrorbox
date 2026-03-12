// Sovereign Loop v1.0-09
const readline = require('readline');
const fs   = require('fs');
const os   = require('os');
const path = require('path');
const { Operator } = require('./auth/operator');
const relay = require('./relay/relay-listener');

async function main() {
  const configPath = path.join(os.homedir(), '.mbo', 'config.json');
  if (!fs.existsSync(configPath)) {
    await require('./cli/setup').runSetup();
  }

  const operator = new Operator('runtime');
  await operator.startMCP();

  // §24.7: Start Relay listener for Subject → Mirror telemetry
  relay.start();

  console.log("MBO Engine v0.1.0 initialized. [ctrl+f to focus sandbox]");

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
