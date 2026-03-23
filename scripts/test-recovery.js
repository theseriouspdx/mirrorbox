'use strict';

const stateManager = require('../src/state/state-manager');
const eventStore = require('../src/state/event-store');
const assert = require('assert');
const os = require('os');
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(process.env.MBO_PROJECT_ROOT || process.cwd(), '.mbo', 'mirrorbox.db');

// ── Rule 1: Environment Assertions ───────────────────────────────────────────
const ENV_CHECKS = [
  { label: 'Platform is macOS', ok: os.platform() === 'darwin', detail: `got ${os.platform()}` },
  { label: 'Running as johnserious', ok: os.userInfo().username === 'johnserious', detail: `got ${os.userInfo().username}` },
  { label: 'MirrorBox DB exists', ok: fs.existsSync(DB_PATH), detail: `not found at ${DB_PATH}` }
];
let envFailed = false;
console.log('── Environment checks ──────────────────────────────────────────');
for (const check of ENV_CHECKS) {
  console.log((check.ok ? 'PASS' : 'FAIL') + '  ' + check.label + (check.ok ? '' : ' — ' + check.detail));
  if (!check.ok) envFailed = true;
}
if (envFailed) { console.log('\nEnvironment checks failed — aborting.\n'); process.exit(2); }
console.log('── Environment OK — proceeding with recovery test ────────────────\n');

const results = [];

function testRecovery() {
  console.log('--- Testing State Recovery ---');

  // 1. Snapshot is last event -> recover returns it
  console.log('Step 1: Snapshot as last event...');
  stateManager.snapshot({
    currentTask: 'test-recovery',
    currentStage: 'STATE',
    activeModel: 'ORCHESTRATOR',
    filesInScope: [],
    recoveryAttempts: 0,
    progressSummary: 'Test snapshot for recovery hardening'
  }, 'mirror');
  
  let recovered = stateManager.recover();
  assert.strictEqual(recovered.ok !== false, true, 'Should recover successfully');
  assert.strictEqual(recovered.currentTask, 'test-recovery', 'Task should match snapshot');
  results.push({ label: 'Snapshot recovery', status: 'PASS' });

  // 2. Non-snapshot is last event
  // Add a non-STATE event
  console.log('Step 2: Non-snapshot as last event...');
  eventStore.append('PLANNING', 'TEST_ACTOR', { payload: 'not a snapshot' }, 'mirror');
  
  // Recover should still find the last snapshot because of WHERE stage = 'STATE'
  recovered = stateManager.recover();
  assert.strictEqual(recovered.ok !== false, true, 'Should still find the last snapshot even if other events happened');
  assert.strictEqual(recovered.currentTask, 'test-recovery');
  results.push({ label: 'Post-event recovery', status: 'PASS' });

  // ── Rule 5: Live Output Table ──────────────────────────────────────────────
  console.log('\n── Recovery Summary Table ──────────────────────────────────────');
  console.log('| Step                 | Status       | Task Recovered         |');
  console.log('| -------------------- | ------------ | ---------------------- |');
  for (const res of results) {
    console.log(`| ${res.label.padEnd(20)} | ${res.status.padEnd(12)} | ${recovered.currentTask.padEnd(22)} |`);
  }
  console.log('────────────────────────────────────────────────────────────────\n');

  console.log(`\nResults: ${results.length} passed, 0 failed`);
  console.log('PASS: All recovery tests passed.');
}

try {
  testRecovery();
  process.exit(0);
} catch (err) {
  console.error('\nFAIL: ' + err.message);
  process.exit(1);
}
